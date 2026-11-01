/* The Worker itself, run against a real SQLite database built from the
   migrations in the repo, the same way D1 builds it. Needs Node 22.13 or
   later, which has SQLite built in.

   Run from the repo root:  node tests/t11_worker.mjs                     */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

process.removeAllListeners('warning');          // SQLite is still marked experimental
const { DatabaseSync } = await import('node:sqlite');

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
/* a section that crashes counts as a failure and the rest still runs */
async function section(title, fn) {
  console.log('\n--- ' + title + ' ---');
  try { await fn(); } catch (e) { fail++; console.log('  FAIL stopped here: ' + e.message); }
}

const pick = list => list.filter(Boolean).find(p => existsSync(p));
const WORKER = pick([process.env.WORKER, 'src/index.js', '../src/index.js', 'index_worker.js']);
const MIGRATIONS = pick([process.env.MIGRATIONS, 'migrations', '../migrations']);
if (!WORKER || !MIGRATIONS) {
  console.error('Run this from the glass-calculator folder: it needs src/index.js and the migrations folder.');
  process.exit(1);
}
console.log('checking ' + WORKER + ' against ' + MIGRATIONS + '/');

/* The Worker uses numbered placeholders (?1, ?2 ...), which D1 supports.
   Node 22.13 to 22.19 cannot fill those in from a plain list of values,
   but every version can when they are handed over by name. */
function params(sql, args) {
  const nums = [...new Set([...sql.matchAll(/\?(\d+)/g)].map(m => +m[1]))];
  if (!nums.length) return args;
  const named = {};
  nums.forEach(n => { named['?' + n] = args[n - 1]; });
  return [named];
}

/* D1, closely enough: prepare, bind, all, first, run and batch. A batch
   runs as one transaction and gives back each statement's rows (for a
   SELECT) or how many rows it changed, the way D1 does. */
function d1(db) {
  const exec = (sql, args) => {
    const st = db.prepare(sql), p = params(sql, args);
    if (/^\s*(select|with)\b/i.test(sql)) return { results: st.all(...p), meta: { changes: 0 } };
    return { results: [], meta: { changes: Number(st.run(...p).changes) } };
  };
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    exec: () => exec(sql, args),
    async all() { return { results: db.prepare(sql).all(...params(sql, args)) }; },
    async first() { return db.prepare(sql).get(...params(sql, args)) ?? null; },
    async run() { return exec(sql, args); }
  });
  return {
    prepare: sql => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map(s => s.exec());
        db.exec('COMMIT'); return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

const db = new DatabaseSync(':memory:');
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const dir = mkdtempSync(join(tmpdir(), 'jobbook-'));
writeFileSync(join(dir, 'worker.mjs'), readFileSync(WORKER, 'utf8'));
const worker = (await import(pathToFileURL(join(dir, 'worker.mjs')).href)).default;
const env = { DB: d1(db), ASSETS: { fetch: async () => new Response('the app') } };

async function call(method, path, body, e = env) {
  const res = await worker.fetch(new Request('https://glass.test' + path, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), e, {});
  const type = res.headers.get('content-type') || '';
  const out = { status: res.status, type, body: type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
  if (res.status >= 500 && !workerError) workerError = (out.body && out.body.error) || 'status ' + res.status;
  return out;
}
let workerError = '', oldWorker = false;
const wait = ms => new Promise(r => setTimeout(r, ms));

await section('one shared price list', async () => {
  let r = await call('GET', '/api/settings');
  oldWorker = !(r.body && r.body._versions);
  ok(r.status === 200 && JSON.stringify(r.body) === '{"_versions":{}}', 'nothing is shared to start with');

  r = await call('PUT', '/api/settings/shop', { value: { prices: { c4mm: 50 } }, base: null });
  ok(r.status === 200 && r.body.version, 'the first machine to save sets the shop list');
  const v1 = r.body.version;

  r = await call('GET', '/api/settings');
  ok(r.body.shop.prices.c4mm === 50 && r.body._versions.shop === v1, 'every machine then reads it, with its version');

  r = await call('PUT', '/api/settings/shop', { value: { prices: { c4mm: 99 } }, base: null });
  ok(r.status === 409, 'a second machine that thinks nothing is shared is refused');
  ok(r.body.current && r.body.current.value.prices.c4mm === 50 && r.body.current.version === v1, 'and is handed the shop list instead');

  await wait(3);
  r = await call('PUT', '/api/settings/shop', { value: { prices: { c4mm: 51 } }, base: v1 });
  ok(r.status === 200 && r.body.version !== v1, 'saving from the current version works');
  const v2 = r.body.version;

  r = await call('PUT', '/api/settings/shop', { value: { prices: { c4mm: 12 } }, base: v1 });
  ok(r.status === 409 && r.body.current.version === v2, 'saving from an out-of-date version is refused');
  r = await call('GET', '/api/settings');
  ok(r.body.shop.prices.c4mm === 51, 'so the newer change is not undone');

  ok((await call('PUT', '/api/settings/Bad Key!', { value: 1, base: null })).status === 400, 'a nonsense key is turned away');
  ok((await call('PUT', '/api/settings/thing', { base: null })).status === 400, 'so is a save with nothing in it');
  ok((await call('PUT', '/api/settings', { shop: { prices: {} } })).status === 404, 'and the old unchecked save no longer exists');
});

await section('events in the diary, kept the same way', async () => {
  const firmans = { id: 'e1', what: 'Collect glass from Firmans', date: '2026-10-30', time: '09:00', mins: 30, remind: true };
  const jack = { id: 'e2', what: 'Jack off work', date: '2026-11-01', time: '08:00', mins: 240, remind: false };
  let r = await call('PUT', '/api/settings/events', { value: { list: [firmans] }, base: null });
  ok(r.status === 200 && r.body.version, 'the first event saves');
  const v1 = r.body.version;
  r = await call('GET', '/api/settings');
  ok(r.body.events.list[0].what === firmans.what && r.body._versions.events === v1, 'every machine reads it, with its version');
  await wait(3);
  r = await call('PUT', '/api/settings/events', { value: { list: [jack] }, base: null });
  ok(r.status === 409 && r.body.current.version === v1 && r.body.current.value.list.length === 1,
     'a machine that had not seen it is refused, and handed the list to add its own to');
  r = await call('PUT', '/api/settings/events', { value: { list: r.body.current.value.list.concat([jack]) }, base: v1 });
  ok(r.status === 200, 'adding on top of the current list goes through');
  r = await call('GET', '/api/settings');
  ok(r.body.events.list.map(e => e.id).join() === 'e1,e2' && r.body.shop.prices.c4mm === 51,
     'so both events are kept, and the price list is left alone');
});

await section('jobs, as before', async () => {
  const job = { id: 'j1', no: 1771, name: 'Brian Okafor', status: 'quote', _total: 58.36, _balance: 58.36, _paid: 0, _net: 48.63,
                items: [{ pid: 'c4mm', w: '1000', h: '1000', q: '1', rate: 48.63 }] };
  let r = await call('PUT', '/api/jobs/j1', Object.assign({ _v: 0 }, job));
  ok(r.status === 200 && r.body.version === 1, 'a new job saves as version 1');
  r = await call('PUT', '/api/jobs/j1', Object.assign({ _v: 0 }, job, { name: 'Somebody else' }));
  ok(r.status === 409, 'a save from an older copy of a job is refused');
  r = await call('PUT', '/api/jobs/j1', Object.assign({ _v: 1 }, job, { status: 'cut' }));
  ok(r.status === 200 && r.body.version === 2, 'a save from the current copy goes through');
  r = await call('GET', '/api/jobs');
  ok(r.body.length === 1 && r.body[0]._v === 2 && r.body[0].status === 'cut', 'and is what everyone loads');
  ok(r.body[0].items[0].rate === 48.63, 'with the locked price inside it');
  const row = db.prepare('SELECT net, paid, total FROM jobs WHERE id=?').get('j1');
  ok(row.net === 48.63 && row.total === 58.36, 'the money columns are filled in');
});

await section('photos, as before', async () => {
  let r = await call('POST', '/api/photos', { id: 'abc', jobId: 'j1', name: 'a.jpg', mime: 'image/jpeg', data: 'AQID' });
  ok(r.status === 200, 'a photo saves');
  r = await call('GET', '/p/abc');
  ok(r.status === 200 && r.type === 'image/jpeg' && Array.from(r.body).join() === '1,2,3', 'and its public link returns the picture');
  r = await call('DELETE', '/api/jobs/j1');
  ok(r.status === 200, 'deleting the job works');
  ok((await call('GET', '/p/abc')).status === 404, 'and takes its photos with it');
});

await section('only what has changed', async () => {
  if (!readdirSync(MIGRATIONS).some(f => /^0004.*\.sql$/.test(f)))
    throw new Error('migrations/0004_job_changes.sql is missing. Copy the migrations folder from the zip');
  const job = (id, no, name, extra = {}) => Object.assign({ id, no, name, status: 'quote', _total: 10, _balance: 10, _paid: 0,
                                                             _net: 8.33, items: [] }, extra);
  let r = await call('GET', '/api/sync');
  ok(r.status === 200 && r.body.all === true && typeof r.body.seq === 'number' && Array.isArray(r.body.jobs),
     'with no number, it sends the whole job book and the newest change number');
  const start = r.body.seq;
  r = await call('GET', '/api/sync?since=' + start);
  ok(r.body.all === false && !r.body.jobs.length && !r.body.gone.length && r.body.seq === start,
     'asked again with that number, nothing has changed, so nothing comes back');
  await call('PUT', '/api/jobs/s1', Object.assign({ _v: 0 }, job('s1', 1801, 'Sync One')));
  await call('PUT', '/api/jobs/s2', Object.assign({ _v: 0 }, job('s2', 1802, 'Sync Two')));
  r = await call('GET', '/api/sync?since=' + start);
  ok(r.body.jobs.map(j => j.id).sort().join() === 's1,s2' && r.body.seq === start + 2 && r.body.jobs.every(j => j._v === 1),
     'two new jobs: just those two come back, with their versions');
  const mid = r.body.seq;
  await call('PUT', '/api/jobs/s1', Object.assign({ _v: 1 }, job('s1', 1801, 'Sync One', { note: 'changed' })));
  r = await call('GET', '/api/sync?since=' + mid);
  ok(r.body.jobs.length === 1 && r.body.jobs[0].note === 'changed' && r.body.jobs[0]._v === 2, 'a change to one job: just that job');
  const v = r.body.seq;
  r = await call('PUT', '/api/jobs/s1', Object.assign({ _v: 1 }, job('s1', 1801, 'Stale')));
  ok(r.status === 409, 'a save from an out-of-date copy is still refused');
  r = await call('GET', '/api/sync?since=' + v);
  ok(!r.body.jobs.length && !r.body.gone.length, 'and is not sent to anyone as a change');
  await call('DELETE', '/api/jobs/s2');
  r = await call('GET', '/api/sync?since=' + v);
  ok(r.body.gone.join() === 's2' && !r.body.jobs.length, 'a deleted job comes back as gone, so every machine drops it');
  await call('PUT', '/api/jobs/s2', Object.assign({ _v: 0 }, job('s2', 1802, 'Sync Two')));
  r = await call('GET', '/api/sync?since=' + v);
  ok(r.body.jobs.map(j => j.id).join() === 's2' && !r.body.gone.length, 'put back with Undo, it is a job again, not gone');
  const plan = db.prepare('EXPLAIN QUERY PLAN SELECT data, version FROM jobs WHERE seq > 5').all().map(x => x.detail).join(' ');
  ok(/idx_jobs_seq/.test(plan), 'the database finds changes by their number, without reading every job');
  r = await call('GET', '/api/jobs');
  ok(r.status === 200 && r.body.some(j => j.id === 's1'), 'loading everything the old way still works, for a machine not reloaded yet');
});

await section('before the database has the change numbers', async () => {
  const old = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql') && f < '0004').sort())
    old.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  const e = { DB: d1(old), ASSETS: env.ASSETS };
  const job = { id: 'o1', no: 1901, name: 'Old Book', status: 'quote', _total: 1, _balance: 1, _paid: 0, _net: 1, items: [] };
  let r = await call('PUT', '/api/jobs/o1', Object.assign({ _v: 0 }, job), e);
  ok(r.status === 200 && r.body.version === 1, 'saving works the old way');
  r = await call('PUT', '/api/jobs/o1', Object.assign({ _v: 0 }, job), e);
  ok(r.status === 409, 'with the same check that nobody else saved it first');
  r = await call('GET', '/api/sync?since=3', undefined, e);
  ok(r.status === 200 && r.body.all === true && r.body.seq === null && r.body.jobs.length === 1,
     'asked for changes, it sends the whole job book, as before');
  r = await call('DELETE', '/api/jobs/o1', undefined, e);
  ok(r.status === 200 && !old.prepare('SELECT id FROM jobs').all().length, 'and deleting works');
});

await section('everything else', async () => {
  const r = await call('GET', '/');
  ok(r.status === 200 && new TextDecoder().decode(r.body) === 'the app', 'anything outside /api/ is the app itself');
  ok((await call('GET', '/api/nothing')).status === 404, 'and an unknown address is a 404');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('Do not deploy yet.');
  if (oldWorker) console.log('src/index.js looks like the old one. Replace it with index_worker.js, renamed to index.js, and run this again.');
  else if (workerError) console.log('The Worker said: ' + workerError);
}
process.exit(fail ? 1 : 0);

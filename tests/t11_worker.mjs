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

/* D1, closely enough: prepare, bind, all, first, run and batch */
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    exec() { return db.prepare(sql).run(...params(sql, args)); },
    async all() { return { results: db.prepare(sql).all(...params(sql, args)) }; },
    async first() { return db.prepare(sql).get(...params(sql, args)) ?? null; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...params(sql, args)).changes) } }; }
  });
  return {
    prepare: sql => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map(s => ({ meta: { changes: Number(s.exec().changes) } }));
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

async function call(method, path, body) {
  const res = await worker.fetch(new Request('https://glass.test' + path, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env, {});
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

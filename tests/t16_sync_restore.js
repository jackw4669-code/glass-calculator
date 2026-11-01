/* Round 11: refreshing with just what has changed, pausing while the app is
   not on screen, changes that cannot be saved coming off the screen, and
   putting a backup back into the job book itself.

   Run from the repo root:  node tests/t16_sync_restore.js              */
const { boot, settle, makeServer, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const refresh = async w => { await w.eval('refreshNow()'); await settle(w, 4); };
const cardOf = (w, id) => { const b = q(w, `#list [data-move="${id}"]`); return b && b.closest('.job'); };
const names = w => qa(w, '#list .job h3').map(h => txt(h).split(' ')[0]).sort().join();
const since = s => s.log.filter(l => /^GET \/api\/sync\?since=/.test(l)).length;
const whole = s => s.log.filter(l => l === 'GET /api/sync' || l === 'GET /api/jobs').length;
const hidden = async (w, yes) => {
  Object.defineProperty(w.document, 'visibilityState', { configurable: true, get: () => yes ? 'hidden' : 'visible' });
  w.document.dispatchEvent(new w.Event('visibilitychange')); await settle(w, 6);
};
const orderPiece = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order',
  supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }, o);
/* choose a backup file, the way the file box does */
async function chooseFile(w, text, name = 'wilsons-glass-backup.json') {
  const inp = $(w, 'expFile');
  $(w, 'expRestore').innerHTML = '';            /* so it waits for this file's answer, not the last one's */
  Object.defineProperty(inp, 'files', { configurable: true, value: [new w.File([text], name, { type: 'application/json' })] });
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  for (let i = 0; i < 40 && !q(w, '#expRestore .rbox, #expRestore .warnbox'); i++) await settle(w, 3);
}
const three = () => [job({ id: 'a', no: 1701, name: 'Alpha' }), job({ id: 'b', no: 1702, name: 'Bravo' }), job({ id: 'c', no: 1703, name: 'Charlie' })];

(async () => {
  console.log('\n--- only what has changed ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    ok(server.log.indexOf('GET /api/sync') >= 0 && server.log.indexOf('GET /api/jobs') < 0 && server.sent === 3,
       'opening the app loads the whole job book once');
    const before = server.sent;
    await refresh(w); await refresh(w); await refresh(w);
    ok(since(server) === 3 && server.sent === before, 'after that, a refresh asks only for changes, and when there are none, nothing comes');

    const b = await boot({ server, seed: [] });
    await click(b.w, q(b.w, '[data-conf="a"]'));
    const sent = server.sent;
    await refresh(w);
    ok(cur(server, 'a').confirmed === true && w.eval("JOBS.find(j=>j.id==='a').confirmed") === true && server.sent === sent + 1,
       'a job changed on another machine shows up, and only that job is sent');
    await refresh(w);
    ok(server.sent === sent + 1, 'and it is not sent again on the next refresh');
    ok(!/Customer confirmed/.test(txt(cardOf(w, 'a').querySelector('.acts'))), 'and the screen is redrawn with it');

    await click(b.w, $(b.w, 'newBtn'));
    await type(b.w, $(b.w, 'fName'), 'Delta');
    await type(b.w, q(b.w, '[data-k="w"]'), '500');
    await type(b.w, q(b.w, '[data-k="h"]'), '400');
    await click(b.w, $(b.w, 'saveJob'));
    await refresh(w);
    ok(names(w) === 'Alpha,Bravo,Charlie,Delta', 'a new job made on another machine appears');

    await click(b.w, q(b.w, '[data-open="b"]'));
    await click(b.w, $(b.w, 'delJob'));
    await refresh(w);
    ok(names(w) === 'Alpha,Charlie,Delta' && !w.eval("JOBS.some(j=>j.id==='b')"), 'a job deleted on another machine goes');
    await click(b.w, q(b.w, '#banner [data-undo]'));
    await refresh(w);
    ok(names(w) === 'Alpha,Bravo,Charlie,Delta', 'and comes back when it is undone there');

    await hidden(w, true);
    const asked = server.log.length;
    w.eval('pollTick()'); await settle(w, 4); w.eval('pollTick()'); await settle(w, 4);
    ok(server.log.length === asked, 'while the app is not on screen, it does not refresh at all');
    await click(b.w, q(b.w, '[data-conf="c"]'));
    await hidden(w, false);
    ok(server.log.length > asked && w.eval("JOBS.find(j=>j.id==='c').confirmed") === true,
       'back on screen, it refreshes straight away and is up to date');

    await click(w, q(w, '[data-open="a"]'));
    const open = server.log.length;
    await refresh(w);
    ok(server.log.length === open, 'with a job open on screen, nothing changes under you');
    await click(w, $(w, 'closeJob'));

    const full = whole(server);
    w.eval('LASTALL=Date.now()-61*60*1000');
    await refresh(w);
    ok(whole(server) === full + 1, 'once an hour it loads the whole job book anyway, in case anything was missed');
    w.eval('SYNCSEQ=SYNCSEQ+1000');
    await refresh(w);
    ok(whole(server) === full + 2 && w.eval('SYNCSEQ') === server.seq,
       'and straight away if the job book\'s count has gone backwards, as after putting it back from a backup');
    b.w.close(); w.close();
  }
  {
    const server = makeServer();
    const a = await boot({ server, seed: three() }), b = await boot({ server, seed: [] });
    await click(a.w, q(a.w, '[data-open="a"]'));
    await type(a.w, $(a.w, 'fNote'), 'from the counter');
    await click(b.w, q(b.w, '[data-open="a"]'));
    await type(b.w, $(b.w, 'fNote'), 'from the van');
    await click(b.w, $(b.w, 'saveJob'));
    await click(a.w, $(a.w, 'saveJob'));
    ok(/changed job 1701 while you had it open/.test(txt($(a.w, 'toast'))) && a.w.eval("JOBS.find(j=>j.id==='a').note") === 'from the van',
       'two machines saving the same job: the second is told, and gets the first one\'s change');
    a.w.close(); b.w.close();
  }
  {
    /* the offline copy on this device could not be written (storage full),
       then the connection went: back online, it must not trust the number */
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    const b = await boot({ server, seed: [] });
    await click(b.w, q(b.w, '[data-conf="a"]'));
    const set = w.storage.set;
    w.storage.set = async (k, v) => { if (k === 'wg:jobs:v4') throw new Error('full'); return set(k, v); };
    await refresh(w);
    const online = w.fetch;
    w.offline(); await refresh(w);
    ok(w.eval("JOBS.find(j=>j.id==='a').confirmed") === false, 'offline, it shows the last copy it managed to keep');
    w.fetch = online; await refresh(w);
    ok(w.eval("JOBS.find(j=>j.id==='a').confirmed") === true, 'back online, it loads the whole job book again, so nothing is missed');
    b.w.close(); w.close();
  }
  {
    const server = makeServer();
    server.oldWorker = true;
    const { w } = await boot({ server, seed: three() });
    ok(names(w) === 'Alpha,Bravo,Charlie' && server.log.indexOf('GET /api/jobs') >= 0, 'with the Worker from before, it loads the old way');
    await refresh(w);
    ok(server.log.filter(l => l === 'GET /api/jobs').length === 2 && w.eval('ONLINE') === true, 'and keeps working');
    w.close();
  }
  {
    const server = makeServer();
    server.noCounter = true;
    const { w } = await boot({ server, seed: three() });
    await refresh(w);
    ok(names(w) === 'Alpha,Bravo,Charlie' && since(server) === 0 && w.eval('SYNCSEQ') === null,
       'before the database change, each refresh loads the whole job book, as it used to');
    w.close();
  }

  console.log('\n--- a change that cannot be saved ---');
  {
    const { w, server } = await boot({ seed: three() });
    w.offline();
    await click(w, q(w, '[data-conf="a"]'));
    ok(/Could not save/.test(txt($(w, 'toast'))) && w.eval("JOBS.find(j=>j.id==='a').confirmed") === false,
       'with no connection, Customer confirmed says it could not save, and the job stays a quote');
    ok(/Customer confirmed/.test(txt(cardOf(w, 'a').querySelector('.acts'))) && cur(server, 'a').status === 'quote',
       'on screen too');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    await click(w, q(w, '[data-conf="a"]'));
    const handle = server.handle;
    server.handle = function (u, o) { if (o && o.method === 'PUT') throw new Error('offline'); return handle.call(this, u, o); };
    await click(w, q(w, '[data-cut="a"]'));
    ok(/Could not save/.test(txt($(w, 'toast'))) && w.eval("JOBS.find(j=>j.id==='a').confirmed") === true
       && w.eval("JOBS.find(j=>j.id==='a').items[0].cut") === false,
       'it goes back to how it was last saved: still confirmed, just not cut');
    w.close();
  }
  {
    const seed = [job({ id: 'p', no: 1710, name: 'Pricey', confirmed: true, status: 'pricing', items: [orderPiece()] })];
    const { w, server } = await boot({ seed });
    server._photoRoute = (u, o) => o && o.method === 'PUT' ? { ok: false, status: 500, json: async () => ({ error: 'down' }) } : null;
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-view="jobs"]'));
    await click(w, cardOf(w, 'p').querySelector('[data-ordj]'));
    ok(/Could not save/.test(txt($(w, 'toast'))) && w.eval("JOBS[0].items[0].ostate") === 'toprice'
       && txt(cardOf(w, 'p').querySelector('.docket .src')) === 'To order', 'if the job book will not take it, Mark as ordered goes back too');
    ok(!q(w, '.undobar'), 'with no Undo for something that did not happen');
    server._photoRoute = null;
    await click(w, cardOf(w, 'p').querySelector('[data-ordj]'));
    ok(cur(server, 'p').items[0].ostate === 'ordered', 'pressed again once it is working, it saves');
    w.close();
  }

  console.log('\n--- putting a backup back ---');
  {
    const server = makeServer();
    server.settings.set('shop', JSON.stringify({ prices: { c4mm: 50 }, adj: 0, suppliers: [{ name: 'Firmans', email: 'orders@firmans.example' }], settings: {} }));
    server.settingsV.set('shop', 'v1');
    const { w: probe } = await boot({ seed: [] }); const today = probe.eval('ymd(new Date())'); probe.close();
    server.settings.set('events', JSON.stringify({ list: [{ id: 'e1', what: 'Van in for its MOT', date: today, time: '', mins: 0 }] }));
    server.settingsV.set('events', 'v1');
    const seed = three();
    seed[1].photos = [{ id: 'ph1', name: 'opening.jpg', w: 800, h: 600, send: true }];
    const { w } = await boot({ server, seed });
    const backup = w.eval('backupJSON()');

    /* after the backup: Bravo deleted, Alpha changed, Delta added with
       Bravo's old number, and the prices and diary changed elsewhere */
    await click(w, q(w, '[data-open="b"]')); await click(w, $(w, 'delJob'));
    await click(w, q(w, '[data-open="a"]')); await type(w, $(w, 'fNote'), 'changed after the backup'); await click(w, $(w, 'saveJob'));
    await server.handle('/api/jobs/d', { method: 'PUT', body: JSON.stringify(job({ id: 'd', no: 1702, name: 'Delta', _v: 0 })) });
    server.settings.set('shop', JSON.stringify({ prices: { c4mm: 70 }, adj: 0, suppliers: [{ name: 'Firmans', email: 'orders@firmans.example' }], settings: {} }));
    server.settingsV.set('shop', 'v2');
    server.settings.set('events', JSON.stringify({ list: [{ id: 'e1', what: 'Van in for its MOT', date: today, time: '', mins: 0 },
                                                          { id: 'e2', what: 'Collect glass', date: today, time: '09:00', mins: 30 }] }));
    server.settingsV.set('events', 'v2');

    await click(w, $(w, 'expBtn'));
    ok(/Nothing changes until you choose what to put back/.test(txt($(w, 'expSheet'))), 'the backup page says nothing happens straight away');
    await chooseFile(w, backup);
    const box = txt(q(w, '#expRestore .rbox'));
    ok(/has 3 jobs\. 1 of them is not in the job book now: 1702 Bravo\./.test(box), 'choosing a backup says what is in it and what is missing now');
    ok(/One of them has a job number now used by another job/.test(box), 'and warns if a missing job\'s number has been used again');
    ok(/The 1 job added since would be deleted/.test(box) && /prices and suppliers and the diary events/.test(box),
       'and what replacing the whole job book would do');
    ok(cur(server, 'a').note === 'changed after the backup' && !server.rows.has('b'), 'nothing has changed yet');

    await click(w, q(w, '[data-restore="missing"]'));
    for (let i = 0; i < 20 && !q(w, '#expRestore .rdone'); i++) await settle(w, 3);
    ok(server.rows.has('b') && cur(server, 'b').name === 'Bravo', 'Put back the missing job puts Bravo back in the job book itself');
    ok(cur(server, 'b').photos.length === 0, 'without its photos, which went when it was deleted');
    ok(cur(server, 'a').note === 'changed after the backup' && server.rows.has('d') && JSON.parse(server.settings.get('shop')).prices.c4mm === 70,
       'and leaves everything else alone');
    ok(/Put back 1 job\. Every machine has it now/.test(txt(q(w, '#expRestore .rdone'))) && /Backup put back/.test(txt($(w, 'toast'))),
       'saying so');
    const other = await boot({ server, seed: [] });
    ok(other.w.eval("JOBS.some(j=>j.id==='b')") === true, 'another machine has it too');
    other.w.close();
    await settle(w, 30);
    ok(w.eval("JOBS.some(j=>j.id==='b')") === true, 'and it does not disappear again ten seconds later');

    await chooseFile(w, backup);
    ok(/Every one of them is still in the job book/.test(txt(q(w, '#expRestore .rbox'))) && q(w, '[data-restore="missing"]').disabled,
       'choosing it again, nothing is missing now');

    await click(w, q(w, '[data-restore="all"]'));
    for (let i = 0; i < 30 && !q(w, '#expRestore .rdone'); i++) await settle(w, 3);
    ok(/changed after the backup/.test($(w, 'expText').value) && /Delta/.test($(w, 'expText').value),
       'replacing the whole job book first saves a copy of it as it is now');
    ok(!cur(server, 'a').note && !server.rows.has('d') && server.rows.has('b') && server.rows.has('c'),
       'then every job goes back to how it was, and the one added since is deleted');
    ok(JSON.parse(server.settings.get('shop')).prices.c4mm === 50, 'the prices go back');
    ok(JSON.parse(server.settings.get('events')).list.map(e => e.id).join() === 'e1', 'and so do the diary events');
    ok(/The job book is back to how it was on/.test(txt(q(w, '#expRestore .rdone'))) && /1 deleted/.test(txt(q(w, '#expRestore .rdone'))),
       'and it says what it did');
    const again = await boot({ server, seed: [] });
    ok(again.w.eval('JOBS.length') === 3 && !again.w.eval("JOBS.some(j=>j.id==='d')") && again.w.eval("PRICES.c4mm") === 50,
       'every machine has the job book as it was');
    again.w.close();
    w.close();
  }
  {
    const { w } = await boot({ seed: three() });
    const backup = w.eval('backupJSON()');
    await click(w, $(w, 'expBtn'));
    await chooseFile(w, 'this is not a backup');
    ok(/not a backup/.test(txt($(w, 'expRestore'))), 'a file that is not a backup is turned away');
    await chooseFile(w, JSON.stringify({ jobs: [] }));
    ok(/no jobs in it/.test(txt($(w, 'expRestore'))), 'and so is one with no jobs in it');
    w.offline();
    await chooseFile(w, backup);
    ok(/cannot be reached, so nothing can be put back/.test(txt($(w, 'expRestore'))) && !q(w, '[data-restore]'),
       'with no connection, it says so and offers nothing');
    w.close();
  }
  {
    /* a backup made before maintenance had its own lines */
    const old = job({ id: 'm', no: 1720, name: 'Old Maint', kind: 'maintenance', items: [],
                      extras: [{ label: 'Re-seal the bay', amount: 180 }] });
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    await click(w, $(w, 'expBtn'));
    await chooseFile(w, JSON.stringify({ app: "Wilson's Glass job book", version: 4, exported: '2026-09-01T10:00:00Z', jobs: [old] }));
    ok(/Tuesday,? 1 September 2026 at 11:00/.test(txt(q(w, '#expRestore .rbox'))), 'it says when the backup was taken');
    await click(w, q(w, '[data-restore="missing"]'));
    for (let i = 0; i < 20 && !q(w, '#expRestore .rdone'); i++) await settle(w, 3);
    const m = cur(server, 'm');
    ok(m.works.length === 1 && m.works[0].desc === 'Re-seal the bay' && !('kind' in m) && Math.abs(m._total - 216) < 0.005,
       'a job from an older backup goes back in the new shape, at the same price');
    w.close();
  }
  {
    /* somebody puts the job back by hand on another machine just as the
       backup is putting it back: theirs is kept */
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    const backup = w.eval('backupJSON()');
    await click(w, q(w, '[data-open="b"]')); await click(w, $(w, 'delJob'));
    await click(w, $(w, 'expBtn'));
    await chooseFile(w, backup);
    server._photoRoute = (u, o) => {
      if (o && o.method === 'PUT' && /\/api\/jobs\/b$/.test(u) && !server.rows.has('b'))
        server.rows.set('b', { data: JSON.stringify(job({ id: 'b', no: 1702, name: 'Bravo', note: 'put back by hand' })), version: 1, seq: 0 });
      return null;
    };
    await click(w, q(w, '[data-restore="missing"]'));
    for (let i = 0; i < 20 && !q(w, '#expRestore .rdone'); i++) await settle(w, 3);
    ok(cur(server, 'b').note === 'put back by hand' && /Put back 0 jobs/.test(txt(q(w, '#expRestore .rdone'))),
       'a job put back on another machine meanwhile is left as they made it');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* Round 17: something changed on one machine shows up on the others
   straight away. A check of the shop's server that never finishes can't
   hold up the rest; the Day view keeps up to date; coming back to the app
   checks at once; and checks happen every 5 seconds, each one small.

   Run from the repo root:  node tests/t21_live_refresh.js
   It takes about 10 seconds, because one part waits for the app's own timer. */
const { boot, settle, makeServer, $, q, qa, click, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const pause = ms => new Promise(r => setTimeout(r, ms));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const syncs = s => s.log.filter(l => /^GET \/api\/sync/.test(l)).length;
const sets = s => s.log.filter(l => l === 'GET /api/settings').length;
const refresh = async (w, n = 8) => { await w.eval('refreshNow()'); await settle(w, n); };
const three = () => [job({ id: 'a', no: 1701, name: 'Alpha' }), job({ id: 'b', no: 1702, name: 'Bravo' }), job({ id: 'c', no: 1703, name: 'Charlie' })];
const cur = (s, id) => JSON.parse(s.rows.get(id).data);

/* another machine, straight into the job book: a diary event, a job change, prices */
let other = 0;
function addEvent(server, what, date) {
  const now = server.settings.has('events') ? JSON.parse(server.settings.get('events')) : { list: [] };
  now.list.push({ id: 'ev' + (++other), what, date, time: '10:00', mins: 60, remind: false });
  server.settings.set('events', JSON.stringify(now));
  server.settingsV.set('events', 'other-' + other);
}
async function changeJob(server, id, change) {
  const row = server.rows.get(id);
  const j = Object.assign(JSON.parse(row.data), change, { _v: row.version });
  return server.handle('https://glass-calculator.test/api/jobs/' + id, { method: 'PUT', body: JSON.stringify(j) });
}
const todayOf = w => w.eval('ymd(new Date())');
const inDiary = (w, what) => txt($(w, 'list')).includes(what);
const name = (w, id) => w.eval(`(JOBS.find(j=>j.id==='${id}')||{}).name`);

(async () => {
  console.log('\n--- every 5 seconds, by itself ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three(), poll: true, tab: 'diary' });
    ok(w._polls.length === 1 && w._polls[0] === 5000, 'the app checks the shop\'s server every 5 seconds (it was 10)');
    addEvent(server, 'Measure at the dental surgery', todayOf(w));
    const t0 = Date.now();
    let seen = false;
    while (!seen && Date.now() - t0 < 7000) { await pause(100); seen = inDiary(w, 'Measure at the dental surgery'); }
    ok(seen && Date.now() - t0 <= 6500, `a diary event added on another machine appears by itself, within the 5 seconds`);
    w.close();
  }

  console.log('\n--- each check is one small request ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three(), tab: 'diary' });
    const s0 = syncs(server), g0 = sets(server);
    await refresh(w); await refresh(w); await refresh(w);
    ok(syncs(server) === s0 + 3 && sets(server) === g0, 'with nothing new, a check asks for the changes and nothing else');
    addEvent(server, 'Van in for service', todayOf(w));
    await refresh(w);
    ok(sets(server) === g0 + 1 && inDiary(w, 'Van in for service'), 'when the diary has changed on another machine, it fetches it, and shows it');
    await refresh(w);
    ok(sets(server) === g0 + 1, 'and not again after that');
    server.settings.set('shop', JSON.stringify({ prices: { c4mm: 77 }, adj: 0, suppliers: [], settings: {} }));
    server.settingsV.set('shop', 'other-prices');
    await refresh(w);
    ok(sets(server) === g0 + 2 && w.eval('PRICES.c4mm') === 77, 'new prices saved on another machine come in the same way');

    server.oldSync = true;
    await refresh(w); await refresh(w);
    ok(sets(server) === g0 + 4, 'with the Worker from before, which does not say what has changed, it fetches them every time, as before');
    addEvent(server, 'Collect from Firmans', todayOf(w));
    await refresh(w);
    ok(inDiary(w, 'Collect from Firmans'), 'and changes still show');
    server.oldSync = false;

    const online = w.fetch;
    w.offline(); await refresh(w);
    ok(w.eval('ONLINE') === false, '(the connection drops)');
    w.fetch = online;
    const g1 = sets(server);
    await refresh(w);
    ok(w.eval('ONLINE') === true && sets(server) === g1 + 1, 'when it comes back, it fetches them again, to be sure');

    /* once an hour, the whole job book comes again */
    w.eval('LASTALL = 0');
    await changeJob(server, 'c', { name: 'Charlie Hourly' });
    await click(w, q(w, '#rail [data-f="all"]'));
    await refresh(w);
    ok(server.log[server.log.length - 1] === 'GET /api/settings' && txt($(w, 'list')).includes('Charlie Hourly'),
       'the hourly reload of the whole job book shows what changed, and brings the settings with it');
    w.close();
  }

  console.log('\n--- a check that never finishes can\'t hold up the rest ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    /* a phone goes to sleep part way through a check: no answer, ever */
    let hang = 'abortable', stuck = null;
    server.extra = (url, opt) => {
      if (!/\/api\/sync/.test(url) || !hang) return null;
      const how = hang; hang = null;
      return new Promise((res, rej) => {
        if (how === 'abortable' && opt && opt.signal) opt.signal.addEventListener('abort', () => rej(new Error('given up')));
        if (how === 'stuck') stuck = res;
      });
    };
    w.eval('SYNC_WAIT = 250');
    w.eval('refreshNow()'); await settle(w, 4);
    ok(w.eval('REFRESHING') > 0, 'a check is waiting for an answer that will not come');
    await changeJob(server, 'a', { name: 'Alpha Changed' });
    await pause(350); await settle(w, 8);
    ok(w.eval('REFRESHING') === 0, 'after its time limit it gives up');
    await refresh(w);
    ok(name(w, 'a') === 'Alpha Changed' && txt($(w, 'list')).includes('Alpha Changed'), 'so the next check goes ahead, and the change shows');

    /* one that ignores its time limit too */
    hang = 'stuck';
    w.eval('STUCK_AFTER = 300');
    w.eval('refreshNow()'); await settle(w, 4);
    const n1 = syncs(server);
    await changeJob(server, 'b', { name: 'Bravo Changed' });
    await refresh(w);
    ok(syncs(server) === n1 && name(w, 'b') === 'Bravo', 'while it is still waiting, the next check holds back');
    await pause(350);
    await refresh(w);
    ok(syncs(server) === n1 + 1 && name(w, 'b') === 'Bravo Changed' && txt($(w, 'list')).includes('Bravo Changed'),
       'but not for long: the one after goes ahead regardless, and the change shows');
    /* the old answer turns up at last, out of date */
    const old = { ...JSON.parse(JSON.stringify(w.eval("JOBS.find(j=>j.id==='b')"))), name: 'Bravo', _v: 1 };
    const sv = {}; server.settings.forEach((v, k) => { sv[k] = server.settingsV.get(k) || 'seed'; });
    stuck({ ok: true, status: 200, json: async () => ({ all: false, seq: w.eval('SYNCSEQ'), jobs: [old], gone: [], settings: sv }) });
    await settle(w, 12);
    ok(name(w, 'b') === 'Bravo Changed' && txt($(w, 'list')).includes('Bravo Changed'), 'and when the stuck one finally answers, its out-of-date answer is ignored');
    ok(w.eval('REFRESHING') === 0, 'leaving nothing waiting');
    /* or the stuck one fails in the end */
    let late = null;
    hang = null; server.extra = (url, opt) => /\/api\/sync/.test(url) && !late ? new Promise((res, rej) => { late = rej; }) : null;
    w.eval('refreshNow()'); await settle(w, 4);
    await pause(350); await refresh(w);
    late(new Error('the signal went'));
    await settle(w, 12);
    ok(w.eval('ONLINE') === true && name(w, 'b') === 'Bravo Changed', 'and when a stuck one fails in the end, that does not put the app offline');
    server.extra = (url, opt) => {
      if (!/\/api\/sync/.test(url) || !hang) return null;
      const how = hang; hang = null;
      return new Promise((res, rej) => {
        if (how === 'abortable' && opt && opt.signal) opt.signal.addEventListener('abort', () => rej(new Error('given up')));
        if (how === 'stuck') stuck = res;
      });
    };

    /* coming back to the app doesn't wait at all */
    w.eval('STUCK_AFTER = 120000');
    hang = 'stuck';
    w.eval('refreshNow()'); await settle(w, 4);
    await changeJob(server, 'c', { name: 'Charlie Changed' });
    w.document.dispatchEvent(new w.Event('visibilitychange')); await settle(w, 10);
    ok(name(w, 'c') === 'Charlie Changed', 'coming back to the app checks straight away, even with a check stuck from before');
    w.close();
  }

  console.log('\n--- waking up checks straight away ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    let n = syncs(server);
    w.dispatchEvent(new w.Event('focus')); await settle(w, 8);
    ok(syncs(server) === n + 1, 'clicking into the window');
    n = syncs(server);
    w.dispatchEvent(new w.Event('online')); await settle(w, 8);
    ok(syncs(server) === n + 1, 'the network coming back');
    n = syncs(server);
    const back = new w.Event('pageshow'); Object.defineProperty(back, 'persisted', { value: true });
    w.dispatchEvent(back); await settle(w, 8);
    ok(syncs(server) === n + 1, 'the page being brought back');
    n = syncs(server);
    w.document.dispatchEvent(new w.Event('resume')); await settle(w, 8);
    ok(syncs(server) === n + 1, 'a phone waking the app up');
    w.close();
  }

  console.log('\n--- with a pop-up open ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three(), tab: 'diary' });
    const today = todayOf(w);
    w.eval(`openDay('${today}')`); await settle(w);
    ok($(w, 'daySheet').classList.contains('on'), '(the Day view is open)');
    addEvent(server, 'Glass from Pilkington', today);
    await refresh(w);
    ok(txt($(w, 'dayBody')).includes('Glass from Pilkington'), 'the Day view keeps up to date: a new event shows in it');
    w.eval('hideSheets()'); await settle(w);

    await click(w, $(w, 'draftsBtn'));
    ok($(w, 'draftSheet').classList.contains('on'), '(the Drafts list is open)');
    let n = syncs(server);
    await refresh(w);
    ok(syncs(server) === n + 1, 'so does everything else while the Drafts list is open');
    w.eval('hideSheets()'); await settle(w);

    await click(w, q(w, '#rail [data-f="all"]'));
    await click(w, q(w, '[data-open="a"]'));
    ok($(w, 'jobSheet').classList.contains('on'), '(a job is open)');
    n = syncs(server);
    await changeJob(server, 'b', { name: 'Bravo Elsewhere' });
    await refresh(w);
    ok(syncs(server) === n, 'with a job open, nothing changes under you, as before');
    await click(w, $(w, 'closeJob'));
    await pause(400); await settle(w, 8);
    ok(syncs(server) === n + 1 && txt($(w, 'list')).includes('Bravo Elsewhere'), 'and closing it checks straight away');
    const sheets = { bookSheet: 'booking into the diary', evSheet: 'adding an event', moveSheet: 'moving a job',
                     mailSheet: 'sending an email or text', rateSheet: 'prices and suppliers', expSheet: 'backups' };
    for (const id of Object.keys(sheets)) {
      w.eval(`showSheet($('${id}'))`);
      n = syncs(server); await refresh(w);
      const held = syncs(server) === n;
      w.eval('hideSheets()'); await pause(400); await settle(w, 8);
      ok(held && syncs(server) === n + 1, `the same for ${sheets[id]}: held while open, checked when closed`);
    }
    w.close();
  }

  console.log('\n--- your own change coming back doesn\'t redraw the screen ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: three() });
    await click(w, q(w, '[data-conf="a"]'));
    ok(cur(server, 'a').confirmed === true, '(Customer confirmed on Alpha)');
    const mark = $(w, 'list').firstElementChild; mark._mark = 1;
    const n = syncs(server);
    await refresh(w);
    ok(syncs(server) === n + 1 && w.eval("JOBS.find(j=>j.id==='a')._v") === server.rows.get('a').version,
       'the next check brings it back from the server');
    ok($(w, 'list').firstElementChild === mark, 'but it is the same as on screen, so nothing is drawn again (an animation is not cut short)');
    await changeJob(server, 'b', { name: 'Bravo Again' });
    await refresh(w);
    ok($(w, 'list').firstElementChild !== mark && txt($(w, 'list')).includes('Bravo Again'), 'a change from another machine is drawn, as before');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* Round 14: a job is saved once, however many times Save job is tapped.

   Run from the repo root:  node tests/t18_save_once.js                  */
const { boot, settle, makeServer, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const pause = ms => new Promise(r => setTimeout(r, ms));
/* if something never answers, say so rather than stopping quietly */
setTimeout(() => { console.log('  FAIL the tests stopped part way: something never answered'); process.exit(1); }, 120000);

const jobsOn = server => [...server.rows.values()].map(r => JSON.parse(r.data));
const covered = w => !$(w, 'savingCover').hidden;
const isPut = (u, o) => o && o.method === 'PUT' && /\/api\/jobs\//.test(String(u));
async function startJob(w, name) {
  await click(w, $(w, 'newBtn'));
  await type(w, $(w, 'fName'), name);
  await type(w, q(w, '[data-k="w"][data-i="0"]'), '900');
  await type(w, q(w, '[data-k="h"][data-i="0"]'), '600');
  /* a new job puts the cursor in the name box a moment after it opens;
     let that happen first, as it would for a person typing */
  await pause(100);
}
/* the shop's server, but it sits on job saves until told to answer */
function holdSaves(w, server) {
  const gate = { puts: 0, waiting: [] };
  w.fetch = (u, o) => {
    if (isPut(u, o)) { gate.puts++; return new Promise(res => gate.waiting.push(() => res(server.handle(String(u), o)))); }
    return server.handle(String(u), o);
  };
  gate.answer = () => gate.waiting.splice(0).forEach(go => go());
  return gate;
}
/* the save reaches the server, but the answer never gets back */
function loseAnswers(w, server) {
  const s = { on: true };
  w.fetch = (u, o) => (s.on && isPut(u, o))
    ? server.handle(String(u), o).then(() => { throw new TypeError('Failed to fetch'); })
    : server.handle(String(u), o);
  return s;
}

(async () => {
  /* =================================================================== */
  console.log('\n--- one tap, on a slow signal ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await startJob(w, 'Slow Sam');
    ok(!covered(w), 'nothing covers the job before Save job is tapped');
    const gate = holdSaves(w, server);
    await click(w, $(w, 'saveJob'));
    ok(covered(w), 'tapping Save job covers the screen');
    ok(txt(q(w, '#savingCover .savemsg')) === 'Hold on, we are saving this job.', 'saying "Hold on, we are saving this job."');
    ok($(w, 'saveJob').disabled && $(w, 'jobSheet').inert === true, 'the job sheet behind it cannot be used');
    ok(q(w, '#savingCover [role="alert"]') === $(w, 'savingBox') && w.document.activeElement === $(w, 'savingBox'),
       'and a screen reader is told straight away');
    for (let i = 0; i < 3; i++) await click(w, $(w, 'saveJob'));
    w.eval("$('saveJob').onclick()"); await settle(w);
    ok(gate.puts === 1, 'tapping Save job four more times sends nothing more');
    const esc = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    w.document.dispatchEvent(esc);
    ok(esc.defaultPrevented && $(w, 'jobSheet').classList.contains('on') && covered(w), 'Escape does not close the job while it saves');
    const enter = new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    $(w, 'saveJob').dispatchEvent(enter);
    ok(enter.defaultPrevented && gate.puts === 1, 'nor does Enter send it again');
    gate.answer(); await settle(w, 30);
    ok(server.rows.size === 1, 'when the server answers, there is one job');
    ok(!covered(w) && !$(w, 'jobSheet').classList.contains('on'), 'the cover goes and the job closes');
    ok(/^Quote 1650 saved/.test(txt($(w, 'toast'))), 'with the usual message');
    ok(!$(w, 'saveJob').disabled && !w.eval('SAVING') && $(w, 'jobSheet').inert === false, 'and the next job can be saved as normal');
    await startJob(w, 'Next Nora');
    await click(w, $(w, 'saveJob'));
    ok(gate.puts === 2 && covered(w), 'the next job covers the screen while it saves too');
    gate.answer(); await settle(w, 30);
    ok(server.rows.size === 2 && !covered(w), 'and saves');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    w.eval('SAVE_SLOW = 400');
    await startJob(w, 'Patient Pat');
    const gate = holdSaves(w, server);
    await click(w, $(w, 'saveJob'));
    ok($(w, 'savingSlow').hidden, 'at first it just says hold on');
    await pause(800);
    ok(!$(w, 'savingSlow').hidden && /^Still going\./.test(txt($(w, 'savingSlow'))), 'after a while it adds that it is still going');
    gate.answer(); await settle(w, 30);
    await startJob(w, 'Quick Quinn');
    await click(w, $(w, 'saveJob'));
    ok($(w, 'savingSlow').hidden, 'the next save starts without it');
    gate.answer(); await settle(w, 30);
    w.close();
  }
  {
    const { w } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await click(w, $(w, 'saveJob'));
    ok(!covered(w) && !w.eval('SAVING') && /Needs a customer name/.test(txt($(w, 'toast'))),
       'a job that cannot be saved yet (no name) does not bring the cover up');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- when it cannot be saved ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await startJob(w, 'Offline Olive');
    w.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(!covered(w) && /Could not save — check the connection/.test(txt($(w, 'toast'))), 'with no signal the cover goes and it says it could not save');
    ok($(w, 'jobSheet').classList.contains('on') && $(w, 'fName').value === 'Offline Olive', 'the job stays on screen, as typed');
    const key = w.eval('draftKey');
    w.fetch = (u, o) => server.handle(String(u), o);
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(server.rows.size === 1 && server.rows.has('j' + key.slice(4)), 'tapping Save job again once the signal is back saves it, once');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    w.eval('SAVE_WAIT = 300');
    await startJob(w, 'Hanging Hal');
    let aborted = false;
    /* a request that never gets an answer, unless the app gives up on it */
    w.fetch = (u, o) => isPut(u, o)
      ? new Promise((res, rej) => o.signal && o.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }))
      : server.handle(String(u), o);
    await click(w, $(w, 'saveJob'));
    ok(covered(w), 'covered while it waits for an answer');
    await pause(900); await settle(w, 20);
    ok(aborted && !covered(w) && /Could not save — check the connection/.test(txt($(w, 'toast'))),
       'if the server has not answered in time, it stops waiting and says so');
    ok($(w, 'jobSheet').classList.contains('on'), 'leaving the job on screen to try again');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- an answer lost on the way back ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j1', no: 1700 })] });
    await startJob(w, 'Lost Larry');
    const lose = loseAnswers(w, server);
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(server.rows.size === 2 && /Could not save/.test(txt($(w, 'toast'))) && $(w, 'jobSheet').classList.contains('on'),
       'the save got through but its answer was lost, so it looks as if it failed');
    const first = jobsOn(server).find(j => j.name === 'Lost Larry');
    await pause(5);
    lose.on = false;
    await type(w, $(w, 'fPhone'), '07700 900456');
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    const mine = jobsOn(server).filter(j => j.name === 'Lost Larry');
    ok(mine.length === 1, 'tapping Save job again does not make a second job');
    ok(mine[0].phone === '07700 900456' && mine[0].no === 1701 && mine[0].takenAt === first.takenAt,
       'it keeps the change made in between, and its job number and the time it was taken');
    ok(/^Quote 1701 saved/.test(txt($(w, 'toast'))) && !/changed job/.test(txt($(w, 'toast'))),
       'and says it saved, not that someone else changed it');
    ok(w.eval('JOBS').filter(j => j.name === 'Lost Larry').length === 1, 'the app has it once too');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j9', no: 1710, name: 'Edit Edna' })] });
    await click(w, q(w, '[data-open]'));
    await type(w, $(w, 'fNote'), 'Back door first');
    const lose = loseAnswers(w, server);
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(server.rows.get('j9').version === 2 && /Could not save/.test(txt($(w, 'toast'))),
       'a change to a job that got through with its answer lost looks as if it failed');
    lose.on = false;
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(/^Job 1710 updated/.test(txt($(w, 'toast'))) && !$(w, 'jobSheet').classList.contains('on'),
       'tapping Save job again just finishes, with no warning about someone else');
    ok(server.rows.get('j9').version === 2 && w.eval("JOBS.find(j => j.id === 'j9')._v") === 2,
       'without saving it a second time');
    await click(w, q(w, '[data-open]'));
    await type(w, $(w, 'fNote'), 'Back door first, then the side');
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(server.rows.get('j9').version === 3 && JSON.parse(server.rows.get('j9').data).note === 'Back door first, then the side',
       'and the next change saves as normal');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j9', no: 1710, name: 'Edit Edna' })] });
    await click(w, q(w, '[data-open]'));
    await type(w, $(w, 'fNote'), 'Mine');
    const office = JSON.parse(server.rows.get('j9').data); office.note = 'The office changed this';
    server.rows.set('j9', { data: JSON.stringify(office), version: 2, seq: 99 });
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(/the office changed job 1710 while you had it open/.test(txt($(w, 'toast'))) && JSON.parse(server.rows.get('j9').data).note === 'The office changed this',
       'a real change from another machine is still caught, not saved over');
    w.close();
  }

  {
    const { w } = await boot({ seed: [] });
    ok(w.eval("sameJob({ a: 1, b: { c: 2, d: [1, { e: 3 }] } }, { b: { d: [1, { e: 3 }], c: 2 }, a: 1, _v: 7 })"),
       'the same job is recognised whatever order its details are in, and whatever version it carries');
    ok(w.eval("sameJob({ a: undefined, b: 1 }, { b: 1 })") && !w.eval("sameJob({ a: 1 }, { a: 2 })") && !w.eval("sameJob({ a: [1, 2] }, { a: [2, 1] })"),
       'blanks are ignored, and any real difference counts');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- the draft remembers the job ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j1', no: 1700 })] });
    await startJob(w, 'Drafty Dan');
    const key = w.eval('draftKey');
    const lose = loseAnswers(w, server);
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    lose.on = false;
    await click(w, $(w, 'cancelJob'));
    await w.eval('refreshNow()'); await settle(w, 20);
    ok(w.eval('JOBS').some(j => j.name === 'Drafty Dan'), 'a save whose answer was lost turns up on the next refresh');
    await click(w, $(w, 'draftsBtn'));
    await click(w, q(w, `[data-dopen="${key}"]`));
    ok(w.eval('draftKey') === key && $(w, 'fName').value === 'Drafty Dan', 'its draft is still there to open');
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    const mine = jobsOn(server).filter(j => j.name === 'Drafty Dan');
    ok(mine.length === 1 && mine[0].id === 'j' + key.slice(4) && mine[0].no === 1701,
       'saving the draft finishes that same job, with its number, rather than making another');
    ok(w.eval('JOBS').filter(j => j.name === 'Drafty Dan').length === 1, 'and the app shows it once');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- photos ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await startJob(w, 'Photo Phil');
    w.eval(`photoList.push({ id: 'p1', name: 'door.jpg', mime: 'image/jpeg', w: 10, h: 10, data: 'data:image/jpeg;base64,AAAA', isNew: true })`);
    const real = (u, o) => server.handle(String(u), o);
    w.fetch = (u, o) => /\/api\/photos$/.test(String(u)) ? Promise.reject(new TypeError('Failed to fetch')) : real(u, o);
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    ok(!covered(w) && /Could not save — check the connection/.test(txt($(w, 'toast'))) && server.rows.size === 0,
       'a photo that cannot be sent stops the save, and says so');
    ok(w.eval("photoList.find(p => p.id === 'p1').isNew") === true, 'the photo waits to go with the next try');
    w.fetch = real;
    await click(w, $(w, 'saveJob')); await settle(w, 20);
    const j = jobsOn(server)[0];
    ok(server.rows.size === 1 && server.photos.has('p1') && j.photos.length === 1 && server.photos.get('p1').job_id === j.id,
       'the next try sends the photo and the job together, once');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    w.eval('PHOTO_WAIT = 300');
    await startJob(w, 'Photo Fay');
    w.eval(`photoList.push({ id: 'p2', name: 'pane.jpg', mime: 'image/jpeg', w: 10, h: 10, data: 'data:image/jpeg;base64,AAAA', isNew: true })`);
    let aborted = false;
    w.fetch = (u, o) => /\/api\/photos$/.test(String(u))
      ? new Promise((res, rej) => o.signal && o.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }))
      : server.handle(String(u), o);
    await click(w, $(w, 'saveJob'));
    await pause(900); await settle(w, 20);
    ok(aborted && !covered(w) && /Could not save/.test(txt($(w, 'toast'))) && server.rows.size === 0,
       'a photo that never finishes sending does not keep the screen covered');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

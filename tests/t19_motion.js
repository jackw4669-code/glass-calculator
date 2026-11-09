/* Round 15: the animations that show where things went, and what changed.

   The test library has no animation engine, so this mostly sees the quiet
   version (the one a phone set to reduce motion gets): the same words in
   the same pills, and the same tabs ticking over. One part stands in an
   animation engine to check the travelling version.

   Run from the repo root:  node tests/t19_motion.js                     */
const { boot, settle, makeServer, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const pause = ms => new Promise(r => setTimeout(r, ms));
setTimeout(() => { console.log('  FAIL the tests stopped part way: something never answered'); process.exit(1); }, 150000);

const pills = w => qa(w, '#motion .mpill').map(txt);
const pill = (w, re) => qa(w, '#motion .mpill').find(p => re.test(txt(p)));
const chip = (w, f) => q(w, `#rail [data-f="${f}"]`);
const clearPills = w => qa(w, '#motion .mpill').forEach(p => p.remove());
/* pills appear on a short stagger */
const shown = async w => { await pause(30); await settle(w, 20); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ordered = (over = {}) => job(Object.assign({ confirmed: true, status: 'order',
  items: [{ pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'order', supplier: 'Pilkington', ostate: 'ordered', arrived: false, cut: false }] }, over));

(async () => {
  /* =================================================================== */
  console.log('\n--- a job moving tab ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [
      job({ id: 'j1', no: 1701, name: 'Mrs Okafor' }),
      job({ id: 'j2', no: 1702, name: 'Mr Patel', items: [{ pid: 'c4mm', w: '900', h: '600', q: '1', addons: [], src: 'order', supplier: 'Pilkington', arrived: false, cut: false }] }),
      job({ id: 'j3', no: 1703, name: 'Hall Lane Dental', confirmed: true, status: 'cut' }),
      job({ id: 'j4', no: 1704, name: 'Sue Barker', confirmed: true, status: 'ready', readyAt: new Date().toISOString(),
            items: [{ pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'cut', supplier: '', arrived: false, cut: true }] }),
      job({ id: 'j5', no: 1705, name: 'Ann Lee' })] });
    const quotesBefore = txt(chip(w, 'quote').querySelector('b'));
    await click(w, q(w, '[data-conf="j1"]')); await shown(w);
    const p1 = pill(w, /Job 1701/);
    ok(!!p1 && /Job 1701 · Mrs Okafor/.test(txt(p1)) && /Quotes → To cut/.test(txt(p1)),
       'Customer confirmed shows the job going from Quotes to To cut: ' + pills(w).join(' | '));
    ok(chip(w, 'cut').classList.contains('bump') && chip(w, 'quote').classList.contains('drop'),
       'To cut ticks up and Quotes ticks down');
    ok(+txt(chip(w, 'quote').querySelector('b')) === +quotesBefore - 1, 'and the counts are right');
    ok(p1.classList.contains('calm'), 'with no animation engine (or motion turned down) it is the quiet version');
    ok(w.document.getElementById('motion').getAttribute('aria-hidden') === 'true' && !!$(w, 'toast').textContent,
       'screen readers get the usual message instead');
    clearPills(w);
    await click(w, q(w, '[data-conf="j2"]')); await shown(w);
    ok(!!pill(w, /Job 1702 · Mr Patel.*Quotes → To be ordered/), 'glass to order goes from Quotes to To be ordered');
    clearPills(w);
    await click(w, q(w, '[data-cut="j3"]')); await shown(w);
    ok(!!pill(w, /Job 1703 .*To cut → Ready/), 'Cutting done goes from To cut to Ready');
    clearPills(w);
    await click(w, q(w, '[data-call="j4"]')); await shown(w);
    ok(!!pill(w, /Job 1704 .*No longer in Not told/) && chip(w, 'told').classList.contains('drop'),
       'Mark told shows it leaving Not told');
    clearPills(w);
    await click(w, q(w, '[data-undo]')); await shown(w);
    ok(!!pill(w, /Job 1704 .*Now in Not told/), 'Undo shows it going back');
    clearPills(w);
    await click(w, q(w, '[data-lost="j5"]')); await shown(w);
    ok(!!pill(w, /Job 1705 .*Quotes → Closed/), 'Not going ahead goes from Quotes to Closed');
    clearPills(w);
    await click(w, q(w, '#rail [data-f="closed"]'));
    await click(w, q(w, '[data-conf="j5"]')); await shown(w);
    /* bringing a job back counts as the customer confirming it */
    ok(!!pill(w, /Job 1705 .*Closed → To cut/), 'Bring back goes from Closed to where the job is up to: ' + pills(w).join(' | '));
    clearPills(w);

    /* another machine's change arrives quietly */
    await click(w, q(w, '#rail [data-f="all"]'));
    const other = JSON.parse(server.rows.get('j2').data); other.confirmed = false; other.status = 'quote';
    server.rows.set('j2', { data: JSON.stringify(other), version: server.rows.get('j2').version + 1, seq: server.seq + 50 });
    await w.eval('refreshNow()'); await shown(w);
    ok(w.eval("JOBS.find(j => j.id === 'j2').status") === 'quote' && pills(w).length === 0,
       "another machine's change shows up without any animation");
    /* even when it lands while a change of this machine's to the same job
       is still on its way, it is not mistaken for that change */
    const again = JSON.parse(server.rows.get('j2').data); again.confirmed = true; again.status = 'pricing';
    server.rows.set('j2', { data: JSON.stringify(again), version: server.rows.get('j2').version + 1, seq: server.seq + 60 });
    w.eval("MOTION.local.add('j2')");
    await w.eval('refreshNow()'); await shown(w);
    ok(w.eval("JOBS.find(j => j.id === 'j2').status") === 'pricing' && pills(w).length === 0 && w.eval('MOTION.local.has("j2")'),
       'and it does not use up the animation waiting for that change');
    w.eval("MOTION.local.clear()");
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [ordered({ id: 'o1', no: 1801, name: 'A' }), ordered({ id: 'o2', no: 1802, name: 'B' }),
                                             ordered({ id: 'o3', no: 1803, name: 'C' }), ordered({ id: 'o4', no: 1804, name: 'D' })] });
    await click(w, q(w, '#rail [data-f="order"]'));
    await click(w, q(w, '[data-arrall="Pilkington"]')); await shown(w);
    /* bought-in glass needs no cutting, so it goes straight to Ready */
    ok(pills(w).length === 1 && /^4 jobs/.test(pills(w)[0]) && /On order → Ready/.test(pills(w)[0]),
       'four jobs going the same way share one pill: ' + pills(w).join(' | '));
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j1', no: 1700 })] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Nina New');
    await type(w, q(w, '[data-k="w"][data-i="0"]'), '600');
    await type(w, q(w, '[data-k="h"][data-i="0"]'), '400');
    await click(w, $(w, 'saveJob')); await shown(w);
    ok(!!pill(w, /Job 1701 · Nina New.*Now in Quotes/), 'a new job shows where it has gone: ' + pills(w).join(' | '));
    clearPills(w);
    await click(w, q(w, '[data-open="j1"]'));
    await type(w, $(w, 'fNote'), 'Back door');
    await click(w, $(w, 'saveJob')); await shown(w);
    ok(pills(w).length === 0, 'a change that keeps the job in the same tabs moves nothing');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- into Drafts ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j1', no: 1700, name: 'Dave' })] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Draft Dora');
    await click(w, $(w, 'closeJob')); await shown(w);
    const d = pill(w, /Kept in Drafts/);
    ok(!!d && /Draft Dora/.test(txt(d)) && d.classList.contains('draft'), 'closing an unsaved new job shows it going into Drafts');
    ok($(w, 'draftsBtn').classList.contains('bump') && txt($(w, 'draftCount')) === '1', 'the Drafts button bumps and shows 1');
    clearPills(w);
    await click(w, $(w, 'newBtn')); await click(w, $(w, 'cancelJob')); await shown(w);
    ok(pills(w).length === 0, 'a blank new job closed is not kept, so nothing moves');
    await click(w, q(w, '[data-open="j1"]')); await click(w, $(w, 'closeJob')); await shown(w);
    ok(pills(w).length === 0, 'nor is a job opened and closed with no changes');
    await click(w, q(w, '[data-open="j1"]'));
    await type(w, $(w, 'fNote'), 'Half done');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await shown(w);
    ok(!!pill(w, /Kept in Drafts.*Job 1700 · Dave/), 'a changed job closed with Escape goes into Drafts with its number');
    clearPills(w);
    await click(w, q(w, '[data-open="j1"]'));
    await type(w, $(w, 'fNote'), 'Done now');
    await click(w, $(w, 'saveJob')); await shown(w);
    ok(!pill(w, /Kept in Drafts/), 'a saved job does not go into Drafts');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- the saving screen says what changed ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, savePause: true, seed: [job({ id: 'j1', no: 1700, name: 'Dave' })] });
    w.eval('SAVE_SHOW = 600; SAVE_TICK = 200');
    await click(w, q(w, '[data-open="j1"]'));
    await type(w, $(w, 'fPhone'), '07700 900456');
    await type(w, $(w, 'fNote'), 'Ring before 9');
    await click(w, $(w, 'addItem'));
    await type(w, q(w, '[data-k="w"][data-i="1"]'), '300');
    await type(w, q(w, '[data-k="h"][data-i="1"]'), '200');
    const waiting = [];
    const real = (u, o) => server.handle(String(u), o);
    w.fetch = (u, o) => (o && o.method === 'PUT') ? new Promise(r => waiting.push(() => r(real(u, o)))) : real(u, o);
    await click(w, $(w, 'saveJob'));
    const lines = qa(w, '#savingList li').map(li => txt(li.querySelector('.k')) + ': ' + txt(li.querySelector('.v')));
    ok(txt(q(w, '#savingList h5')) === "What's changing" && lines.length >= 4, 'while it saves, the screen lists what is changing');
    ok(/^Price: £\d+\.\d\d → £\d+\.\d\d$/.test(lines[0]), 'the price first: ' + lines[0]);
    ok(lines.some(l => /^Phone: .*→ 07700 900 456$/.test(l)), 'then the phone number, old to new');
    ok(lines.some(l => /^Note: “Ring before 9”$/.test(l)), 'the note');
    ok(lines.some(l => /^Glass piece 2: added — 4 MM GLASS, 300 × 200 mm$/i.test(l)), 'and the piece added: ' + lines.filter(l => /Glass/.test(l)).join(' '));
    ok(txt($(w, 'savingMsg')) === 'Hold on, we are saving this job.' && !$(w, 'savingBox').classList.contains('done'), 'still saying hold on');
    waiting.splice(0).forEach(go => go()); await settle(w, 20);
    ok(txt($(w, 'savingMsg')) === 'Saved' && $(w, 'savingBox').classList.contains('done') && !$(w, 'savingCover').hidden,
       'once saved it says Saved, with a tick, and stays a moment to be read');
    ok($(w, 'jobSheet').classList.contains('on'), 'the job stays open behind it meanwhile');
    await click(w, $(w, 'savingCover'));
    ok($(w, 'savingCover').hidden && !$(w, 'jobSheet').classList.contains('on') && /Job 1700 updated/.test(txt($(w, 'toast'))),
       'a tap closes it straight away');

    w.fetch = real;
    await click(w, q(w, '[data-open="j1"]'));
    await type(w, $(w, 'fEmail'), 'dave@example.com');
    const t0 = Date.now();
    await click(w, $(w, 'saveJob'));
    ok(!$(w, 'savingCover').hidden && txt($(w, 'savingMsg')) === 'Saved', 'left alone, it waits');
    await pause(700); await settle(w, 20);
    ok($(w, 'savingCover').hidden && Date.now() - t0 >= 550, 'and closes by itself after a moment');

    await click(w, q(w, '[data-open="j1"]'));
    await click(w, $(w, 'saveJob'));
    ok(txt(q(w, '#savingList h5')) === 'Nothing has changed' && qa(w, '#savingList li').length === 0, 'saved with nothing different, it says so');
    await pause(350); await settle(w, 20);
    ok($(w, 'savingCover').hidden, 'and only shows the tick');

    await click(w, q(w, '[data-open="j1"]'));
    await type(w, $(w, 'fNote'), 'Ring after 9');
    await click(w, $(w, 'saveJob'));
    const enter = new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    w.document.dispatchEvent(enter); await settle(w, 20);
    ok($(w, 'savingCover').hidden && enter.defaultPrevented, 'Enter (or Escape) closes it straight away too');

    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Nell');
    await type(w, q(w, '[data-k="w"][data-i="0"]'), '600');
    await type(w, q(w, '[data-k="h"][data-i="0"]'), '400');
    await click(w, $(w, 'saveJob'));
    ok($(w, 'savingList').hidden && txt($(w, 'savingMsg')) === 'Saved', 'a new job has no list, just the tick');
    await pause(300); await settle(w, 20);
    ok($(w, 'savingCover').hidden, 'which goes after a moment');
    w.close();
  }
  {
    const { w } = await boot({ seed: [] });
    const ch = (a, b) => w.eval(`jobChanges(${JSON.stringify(a)}, ${JSON.stringify(b)})`).map(x => x[0] + ': ' + x[1]);
    const base = job();
    const p = (n, extra) => Object.assign({ pid: 'c4mm', w: String(n), h: '400', q: '1', addons: [], src: 'cut', supplier: '' }, extra || {});
    let c = ch(Object.assign({}, base, { items: [p(100), p(200), p(300)] }), Object.assign({}, base, { items: [p(100), p(300)] }));
    ok(c.length === 2 && c[1] === 'Glass piece 2: taken off (4 MM GLASS, 200 × 400 mm)' && /^Price/.test(c[0]),
       'a piece taken out of the middle is one line, not every piece after it: ' + c.join(' | '));
    c = ch(Object.assign({}, base, { items: [p(100)] }), Object.assign({}, base, { items: [p(50), p(100)] }));
    ok(c.some(x => x === 'Glass piece 1: added — 4 MM GLASS, 50 × 400 mm'), 'and so is one added at the front');
    c = ch(Object.assign({}, base, { items: [p(100)] }), Object.assign({}, base, { items: [p(100, { q: '3', src: 'order', supplier: 'Pilkington' })] }));
    ok(c.some(x => x === 'Glass piece 1: quantity 1 → 3, now ordered in, from Pilkington'), 'changes to a piece are listed together');
    const ap = (kind, date, time) => ({ kind, date, time, mins: 60 });
    c = ch(Object.assign({}, base, { appts: [] }), Object.assign({}, base, { appts: [ap('fit', '2026-11-12', '09:00')] }));
    ok(c.some(x => x === 'Fit: booked for Thu 12 Nov, 09:00'), 'a booking: ' + c.join(' | '));
    c = ch(Object.assign({}, base, { appts: [ap('fit', '2026-11-12', '09:00')] }), Object.assign({}, base, { appts: [ap('fit', '2026-11-13', '10:30')] }));
    ok(c.some(x => x === 'Fit: moved to Fri 13 Nov, 10:30'), 'a booking moved');
    c = ch(Object.assign({}, base, { appts: [ap('measure', '2026-11-12', '')] }), Object.assign({}, base, { appts: [] }));
    ok(c.some(x => x === 'Measure: taken out of the diary'), 'a booking taken out');
    c = ch(Object.assign({}, base, { payments: [{ date: '2026-11-01', amount: 20, method: 'Cash' }] }),
           Object.assign({}, base, { payments: [{ date: '2026-11-01', amount: 20, method: 'Cash' }, { date: '2026-11-09', amount: 50, method: 'Card' }] }));
    ok(c.some(x => x === 'Payment: £50.00 taken (card)'), 'a payment taken');
    c = ch(base, Object.assign({}, base, { confirmed: true, status: 'cut', attn: { text: 'Ring Dave', at: '2026-11-09T09:00:00Z' },
           needsInvoice: true, discountPct: 10, cardFee: true, noVat: true, photos: [{ id: 'p1' }, { id: 'p2' }],
           extras: [{ label: 'Fitting', amount: 60 }], trade: true, handover: 'fitting', email: 'd@x.com', note: 'Back door' }));
    ok(['Stage: Quote → To cut', 'Customer: confirmed', 'Attention: flagged: “Ring Dave”', 'Account: Retail → Trade', 'Handover: Collection → Fitting',
        'Email: d@x.com added', 'Note: “Back door”', 'Extra 1: added — Fitting £60.00', 'Discount: 0% → 10%', 'Card fee: added', 'VAT: not charged',
        'Invoice: needed', 'Photos: 2 added'].every(x => c.indexOf(x) >= 0), 'everything else that can change has its own line');
    ok(c.indexOf('Stage: Quote → To cut') < c.indexOf('Email: d@x.com added'), 'what matters most comes first');
    w.eval(`showChanges(jobChanges(${JSON.stringify(base)}, ${JSON.stringify(Object.assign({}, base, { confirmed: true, status: 'cut', trade: true, handover: 'fitting', email: 'd@x.com', note: 'N', discountPct: 5, cardFee: true }))}))`);
    ok(qa(w, '#savingList li').length === 7 && /^and \d+ more changes$/.test(txt(q(w, '#savingList li.more'))),
       'more than six changes: the first six, then how many more');
    c = ch(Object.assign({}, base, { attn: { text: 'Ring Dave', at: 'x' } }), base);
    ok(c.some(x => x === 'Attention: sorted'), 'attention sorted');
    ok(ch(base, Object.assign({}, base)).length === 0, 'nothing changed is nothing listed');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- the diary ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j5', no: 1705, name: 'Tom Reid', confirmed: true, status: 'cut', handover: 'fitting', addr: '12 Hall Lane' }),
                                             job({ id: 'j6', no: 1706, name: 'Ann Lee', confirmed: true, status: 'cut', handover: 'fitting', addr: '3 Station Road' })] });
    await click(w, q(w, '[data-book="j5"]'));
    $(w, 'bDate').value = today();
    await click(w, $(w, 'bSave')); await shown(w);
    const b = pill(w, /Job 1705 · Tom Reid/);
    ok(!!b && /Fit booked · /.test(txt(b)) && b.classList.contains('diary') && /No longer in To be booked in/.test(txt(b)),
       'booking a fitting shows it going into the diary: ' + pills(w).join(' | '));
    ok(chip(w, 'diary').classList.contains('bump'), 'and the Diary tab bumps');
    clearPills(w);

    await click(w, q(w, '#rail [data-f="diary"]'));
    await click(w, q(w, '[data-evnew]'));
    await type(w, $(w, 'evWhat'), 'Van in for service');
    await click(w, $(w, 'evSave')); await shown(w);
    const row = qa(w, '#list .evrow').find(r => /Van in for service/.test(txt(r)));
    ok(!!row && row.classList.contains('mk-in') && row.classList.contains('mk-flash'), 'in the diary, a new event slides into the day');
    ok(q(w, `#list .cell[data-day="${today()}"]`).classList.contains('mk-pulse'), 'and its date pulses');
    ok(pills(w).length === 0, 'with no pill, as it is right there');
    await click(w, q(w, '#list [data-evdel]')); await shown(w);
    ok(!qa(w, '#list .evrow').length && q(w, `#list .cell[data-day="${today()}"]`).classList.contains('mk-pulse'), 'taking it out pulses its date too');
    clearPills(w);
    /* booked from the diary itself: it slides in where it is, no pill */
    await click(w, q(w, `[data-bookday="${today()}"]`));
    await click(w, q(w, '[data-pickjob="j6"]'));
    $(w, 'bDate').value = today(); $(w, 'bTime').value = '13:00';
    await click(w, $(w, 'bSave')); await shown(w);
    const slots = qa(w, '#list .slot').filter(r => r.classList.contains('mk-in'));
    ok(pills(w).length === 0 && slots.length === 1 && /Ann Lee/.test(txt(slots[0])),
       'a job booked from the diary slides into the day, with no pill');
    ok(chip(w, 'book').classList.contains('drop'), 'while To be booked in still ticks down');

    await click(w, q(w, '#rail [data-f="all"]'));
    await click(w, $(w, 'evBtn'));
    await type(w, $(w, 'evWhat'), 'Collect from Pilkington');
    await click(w, $(w, 'evSave')); await shown(w);
    const e = pill(w, /Collect from Pilkington/);
    ok(!!e && /In the diary/.test(txt(e)) && e.classList.contains('diary'), 'from another tab, a new event goes to the Diary tab');
    clearPills(w);
    const tomorrow = w.eval(`shiftDay('${today()}', 1)`);
    w.eval("openEvent(EVENTS.find(e => e.what === 'Collect from Pilkington'))"); await settle(w);
    $(w, 'evDate').value = tomorrow;
    await click(w, $(w, 'evSave')); await shown(w);
    ok(!!pill(w, /Moved in the diary.*Collect from Pilkington/), 'an event moved to another day says so');
    clearPills(w);
    await click(w, q(w, '#rail [data-f="diary"]'));
    w.eval("openEvent(EVENTS.find(e => e.what === 'Collect from Pilkington'))"); await settle(w);
    $(w, 'evDate').value = today();
    await click(w, $(w, 'evSave')); await shown(w);
    const moved = qa(w, '#list .evrow').find(r => /Collect from Pilkington/.test(txt(r)));
    const tc = q(w, `#list .cell[data-day="${tomorrow}"]`);
    ok(!!moved && moved.classList.contains('mk-in') && q(w, `#list .cell[data-day="${today()}"]`).classList.contains('mk-pulse')
       && (!tc || tc.classList.contains('mk-pulse')),
       'and in the diary it slides into its new day, with both days pulsing');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j5', no: 1705, name: 'Tom Reid', confirmed: true, status: 'cut', handover: 'fitting',
      appts: [{ kind: 'fit', date: '2026-11-12', time: '09:00', mins: 60 }] })] });
    w.eval("openBook(JOBS.find(j => j.id === 'j5'), '2026-11-13')"); await settle(w);
    await click(w, $(w, 'bSave')); await shown(w);
    ok(!!pill(w, /Fit moved to Fri 13 Nov/), 'moving a booking says where to: ' + pills(w).join(' | '));
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await click(w, $(w, 'evBtn'));
    await type(w, $(w, 'evWhat'), 'Stock take');
    const waiting = [], real = (u, o) => server.handle(String(u), o);
    w.fetch = (u, o) => (o && o.method === 'PUT') ? new Promise(r => waiting.push(() => r(real(u, o)))) : real(u, o);
    await click(w, $(w, 'evSave'));
    ok($(w, 'evSave').classList.contains('busy'), 'a saving event shows a spinner on its button');
    await click(w, $(w, 'evSave')); await click(w, $(w, 'evSave'));
    ok(waiting.length === 1, 'and more taps send nothing more');
    waiting.splice(0).forEach(go => go()); await settle(w, 20);
    ok(JSON.parse(server.settings.get('events')).list.length === 1 && !$(w, 'evSave').classList.contains('busy'), 'one event, however many taps');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await click(w, $(w, 'evBtn'));
    await type(w, $(w, 'evWhat'), 'Glass delivery');
    const real = (u, o) => server.handle(String(u), o);
    let lose = true;
    w.fetch = (u, o) => (lose && o && o.method === 'PUT') ? real(u, o).then(() => { throw new TypeError('Failed to fetch'); }) : real(u, o);
    await click(w, $(w, 'evSave')); await settle(w, 20);
    ok(JSON.parse(server.settings.get('events')).list.length === 1 && $(w, 'evSheet').classList.contains('on'),
       'an event saved whose answer was lost looks as if it failed');
    lose = false;
    await click(w, $(w, 'evSave')); await settle(w, 20);
    ok(JSON.parse(server.settings.get('events')).list.length === 1, 'and saving it again does not add it twice');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- buttons that save ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [job({ id: 'j1', no: 1701 })] });
    const waiting = [], real = (u, o) => server.handle(String(u), o);
    w.fetch = (u, o) => (o && o.method === 'PUT') ? new Promise(r => waiting.push(() => r(real(u, o)))) : real(u, o);
    const btn = q(w, '[data-conf="j1"]');
    await click(w, btn); await pause(220);
    ok(btn.classList.contains('busy') && btn.dataset.working === '1', 'a button that takes a moment shows a spinner');
    await click(w, btn);
    ok(waiting.length === 1, 'and a second tap on it sends nothing more');
    waiting.splice(0).forEach(go => go()); await settle(w, 30);
    ok(w.eval("JOBS.find(j => j.id === 'j1').status") === 'cut' && !q(w, '#list .busy'), 'once saved, the job moves on and nothing is left spinning');
    await click(w, q(w, '[data-open="j1"]')); await pause(220);
    ok(!q(w, 'button.busy'), 'a button that just opens something never spins');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- the travelling version ---');
  {
    const calls = [];
    const { w } = await boot({ seed: [job({ id: 'j1', no: 1701 })], before: w => {
      w.matchMedia = () => ({ matches: false });
      w.HTMLElement.prototype.animate = function (kf, opt) {
        calls.push({ el: this, kf, opt });
        const a = { onfinish: null, cancel() {} };
        setTimeout(() => a.onfinish && a.onfinish(), 5);
        return a;
      };
    } });
    await click(w, q(w, '[data-conf="j1"]')); await pause(80); await settle(w, 20);
    const flights = calls.filter(c => c.el.classList && c.el.classList.contains('mpill'));
    ok(flights.length >= 2 && !flights[0].el.classList.contains('calm'), 'with motion on, the pill appears, then travels');
    ok(/scale\(0\.3\)/.test(flights[1].kf[1].transform) && flights[1].kf[1].opacity < 1, 'shrinking into the tab it is going to');
    ok(chip(w, 'cut').classList.contains('bump') && !q(w, '#motion .mpill'), 'which bumps as it lands, and the pill is gone');
    w.close();
  }
  {
    const calls = [];
    const { w } = await boot({ seed: [job({ id: 'j1', no: 1701 })], before: w => {
      w.matchMedia = q => ({ matches: /reduce/.test(q) });
      w.HTMLElement.prototype.animate = function () { calls.push(this); return { onfinish: null, cancel() {} }; };
    } });
    await click(w, q(w, '[data-conf="j1"]')); await shown(w);
    ok(calls.length === 0 && !!pill(w, /Quotes → To cut/) && pill(w, /Quotes → To cut/).classList.contains('calm'),
       'set to reduce motion, nothing travels: the words just fade in and out');
    w.close();
  }
  {
    const { w } = await boot({ seed: [job({ id: 'j1', no: 1701 })] });
    w.eval('playMotion = () => { throw new Error("broken animation"); }');
    await click(w, q(w, '[data-conf="j1"]')); await shown(w);
    ok(w.eval("JOBS.find(j => j.id === 'j1').status") === 'cut' && /confirmed/.test(txt($(w, 'toast'))),
       'an animation going wrong never stops the job book working');
    w.close();
  }
  {
    const fs = require('fs');
    const html = fs.readFileSync(['public/index.html', '../public/index.html'].find(p => fs.existsSync(p)), 'utf8');
    const reduce = (html.match(/@media \(prefers-reduced-motion:reduce\)\{\s*\.sheet\.on,[^}]*\}/) || [''])[0];
    ok(/\.sheet\.on/.test(reduce) && /\.mk-in/.test(reduce) && /\.chip\.bump b/.test(reduce) && /animation:none/.test(reduce),
       'set to reduce motion, sliding and bumping are switched off in the styles too');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

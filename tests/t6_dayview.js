const { boot, settle, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const key = async (w, k) => {
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  await settle(w, 4);
};
/* jsdom cannot navigate, so links are stopped before they try to; the
   app's own click handler still sees the event */
const noNav = w => w.document.addEventListener('click', e => {
  if (e.target.closest && e.target.closest('a')) e.preventDefault(); }, true);

/* dates worked out inside the page, so the tests never go stale */
const today = w => w.eval('ymd(new Date())');
const plus = (w, n) => w.eval(`shiftDay(ymd(new Date()),${n})`);

const NOTE = 'Polished edges both long sides';
const cutPiece = (o = {}) => Object.assign(
  { pid: 'c4mm', w: '900', h: '600', q: '1', addons: [], src: 'cut', cut: false, arrived: false }, o);

(async () => {
  console.log('\n--- a note on each piece ---');

  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    ok(!q(w, '[data-pn="item:0"]'), 'the note box is hidden until it is wanted');
    await click(w, q(w, '[data-pnopen="item:0"]'));
    const box = q(w, '[data-pn="item:0"]');
    ok(!!box, 'pressing the link opens it');
    ok(/cutting list/.test(txt(q(w, '.pnhint'))), 'and it says where the note will go');
    await type(w, box, '  ' + NOTE + '  ');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').items[0].note === NOTE, 'the note saves, trimmed');

    await click(w, q(w, '[data-open]'));
    ok(q(w, '[data-pn="item:0"]').value === NOTE, 'and is there when the job is reopened');
    await type(w, q(w, '[data-pn="item:0"]'), '   ');
    await click(w, $(w, 'saveJob'));
    ok(!('note' in cur(server, 'j1').items[0]), 'clearing it removes it rather than saving blanks');
    w.close();
  }

  {
    const j = job({ confirmed: true, items: [cutPiece({ note: NOTE })] });
    const { w } = await boot({ seed: [j] });
    ok(txt(q(w, '.docket .inote')) === NOTE, 'the job card shows it under the piece');

    await click(w, q(w, '[data-f="cut"]'));
    ok(txt(q(w, '.wsrow .inote')) === NOTE, 'the cutting list shows it');
    await click(w, q(w, '[data-print="cut"]'));
    ok(w._printed.indexOf(NOTE) > 0, 'and so does the printed cutting list');

    const csv = w.eval('piecesCSV()');
    ok(/Piece note/.test(csv.split('\r\n')[0]) && csv.indexOf(NOTE) > 0, 'the spreadsheet has a column for it');
    const head = csv.split('\r\n')[0].split(',').length, row = csv.split('\r\n')[1].split(',').length;
    ok(head === row, 'and the columns still line up');

    await click(w, q(w, '[data-f="all"]'));
    await type(w, $(w, 'search'), 'polished');
    ok(qa(w, '.job').length === 1, 'you can search for it');
    w.close();
  }

  {
    const j = job({ confirmed: true, status: 'pricing',
      items: [{ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order', supplier: 'Firmans',
                ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White', note: 'Georgian bars, 3 by 2' }] });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-po]'));
    ok(/Note: Georgian bars, 3 by 2/.test($(w, 'mPrev').textContent), 'it goes to the supplier with the piece');
    ok(/Georgian/.test(txt(q(w, '.pick .inote'))), 'and shows in the tick list');
    await click(w, $(w, 'closeMail'));
    await click(w, q(w, '[data-f="all"]'));
    await click(w, q(w, '[data-mail]'));
    ok(!/Georgian/.test($(w, 'mPrev').textContent), 'but never reaches the customer');
    w.close();
  }

  {
    const j = job({ kind: 'frames', items: [], frames: [{ desc: 'Casement', w: '1200', h: '900', q: '1',
      price: 200, arrived: false, note: 'Opener on the left' }] });
    const { w, server } = await boot({ seed: [j] });
    ok(txt(q(w, '.docket .inote')) === 'Opener on the left', 'frames can carry a note too');
    await click(w, q(w, '[data-open]'));
    ok(q(w, '[data-pn="frame:0"]').value === 'Opener on the left', 'shown open because it has one');
    await type(w, q(w, '[data-pn="frame:0"]'), 'Opener on the right');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').frames[0].note === 'Opener on the right', 'and edits save');
    w.close();
  }

  console.log('\n--- the day, full screen ---');

  const fitNotReady = w => job({ id: 'a', no: 1772, name: 'Hall Lane Builders', trade: true, confirmed: true,
    status: 'order', handover: 'fitting', addr: '14 Hall Lane, RM14 1AU', phone: '01708224411',
    items: [{ pid: 'dgclear', w: '1190', h: '890', q: '1', addons: [], src: 'order', supplier: 'Firmans',
              ostate: 'ordered', dgThick: '28 mm (4-20-4)', dgBar: 'White', note: 'Bead on the outside' }],
    appts: [{ kind: 'fit', date: today(w), time: '09:00', mins: 120 }] });
  const fitReady = (w, time) => job({ id: 'b', no: 1773, name: 'Pauline Doyle', confirmed: true,
    status: 'ready', kind: 'maintenance', items: [], extras: [{ label: 'Re-seal bay', amount: 180 }],
    handover: 'fitting', addr: '3 Corbets Tey Road', phone: '07864643640', note: 'Long ladder',
    appts: [{ kind: 'fit', date: today(w), time: time || '13:30', mins: 90 }] });

  {
    const { w: probe } = await boot({ seed: [] });
    const seed = [fitNotReady(probe), fitReady(probe)];
    probe.close();
    const { w, server } = await boot({ seed });
    noNav(w);

    await click(w, q(w, '[data-f="diary"]'));
    ok(q(w, '.cell.sel') && q(w, '.cell.sel').dataset.day === today(w), 'the diary opens with today picked');
    ok(qa(w, '.cell.today .dot').length === 2, 'today shows a dot per booking');
    ok(!!q(w, '[data-dayview]'), 'there is a way into the full-screen day');

    await click(w, q(w, '[data-dayview]'));
    ok($(w, 'daySheet').classList.contains('on'), 'it opens full screen');
    ok(/Today/.test(txt(q(w, '.dayhd .rel'))), 'and says it is today');

    const stops = qa(w, '#dayBody .tl .stop');
    ok(stops.length === 2, 'both bookings are on it');
    ok(/09:00/.test(txt(stops[0].querySelector('.t0'))) && /13:30/.test(txt(stops[1].querySelector('.t0'))),
       'in time order');
    ok(/2 hr 30 min free/.test(txt(q(w, '.gapline'))), 'with the free time between them');

    ok(!!q(w, '.dayalert'), 'a booking that cannot go out is flagged at the top');
    ok(/on order from Firmans/.test(txt(q(w, '.dayalert'))), 'saying exactly why');
    ok(stops[0].classList.contains('notready'), 'and the stop itself is marked');
    ok(/ready to go/.test(txt(stops[1].querySelector('.sready'))), 'a ready one says so');

    ok(/Bead on the outside/.test(txt(stops[0])), 'the piece notes are on the sheet');
    ok(/1190 × 890/.test(txt(stops[0])), 'with the sizes');
    ok(!!stops[0].querySelector('a.tel[href="tel:01708224411"]'), 'a phone number to ring');
    ok(!!stops[0].querySelector('a.maplink[href*="destination="]'), 'and directions');

    const sum = txt(q(w, '.daysum'));
    ok(/£216\.00/.test(sum) && /to collect/.test(sum), 'the summary says what to collect from retail');
    ok(/to invoice to trade/.test(sum), 'and what to invoice trade separately');
    ok(!stops[0].querySelector('[data-settle]'), 'a trade job has no take-payment button');
    ok(!!stops[1].querySelector('[data-settle]'), 'a retail one does');

    const route = q(w, '.dayacts a.maplink').getAttribute('href');
    const shop = w.eval('encodeURIComponent(SHOP.addr)');
    ok(route.indexOf('origin=' + shop) > 0 && route.indexOf('destination=' + shop) > 0,
       'the route starts and ends at the shop');
    ok(route.indexOf(encodeURIComponent('14 Hall Lane, RM14 1AU')) > 0 && /waypoints=/.test(route),
       'calling at each stop');

    await click(w, stops[1].querySelector('[data-coll]'));
    ok(cur(server, 'b').status === 'done', 'a job can be marked done from the day');
    const after = qa(w, '#dayBody .tl .stop');
    ok(after.length === 2, 'and it stays on the sheet');
    ok(after[1].classList.contains('done'), 'shown as done');
    ok(/1 done, 1 to go/.test(txt(q(w, '.daysum'))), 'and the summary keeps count');

    await click(w, after[0].querySelector('[data-open]'));
    ok($(w, 'jobSheet').classList.contains('on'), 'opening a job from the day shows the job');
    await click(w, $(w, 'closeJob'));
    ok($(w, 'daySheet').classList.contains('on'), 'and closing it goes back to the day');

    await click(w, $(w, 'dayPrint'));
    ok(/Run sheet/.test(w._printed), 'the day prints as a run sheet');
    ok(/NOT READY/.test(w._printed), 'with the warning on it');
    ok(/Bead on the outside/.test(w._printed), 'and the piece notes');

    await key(w, 'ArrowRight');
    ok(w.eval('dayViewDate') === plus(w, 1), 'the right arrow moves to tomorrow');
    ok(/Tomorrow/.test(txt(q(w, '.dayhd .rel'))), 'and says so');
    await key(w, 'ArrowLeft');
    ok(w.eval('dayViewDate') === today(w), 'the left arrow comes back');
    await click(w, q(w, '[data-dayjump="1"]'));
    await click(w, q(w, '[data-dayjump="0"]'));
    ok(w.eval('dayViewDate') === today(w), 'and the Today button jumps home');

    await key(w, 'Escape');
    ok(!$(w, 'daySheet').classList.contains('on'), 'Escape closes it');
    w.close();
  }

  {
    const { w: probe } = await boot({ seed: [] });
    const a = fitReady(probe, '09:00'); a.id = 'x'; a.no = 1; a.appts[0].mins = 120;
    const b = fitReady(probe, '10:00'); b.id = 'y'; b.no = 2;
    probe.close();
    const { w } = await boot({ seed: [a, b] });
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    ok(q(w, '.gapline.clash') && /Overlaps/.test(txt(q(w, '.gapline.clash'))),
       'two bookings that clash are called out');
    w.close();
  }

  {
    const waiting = job({ id: 'w1', no: 55, name: 'Waiting Wendy', confirmed: true, status: 'ready',
      kind: 'maintenance', items: [], extras: [{ label: 'Repair', amount: 90 }], handover: 'fitting', appts: [] });
    const { w } = await boot({ seed: [waiting] });
    w.eval("openDay('2031-01-01')"); await settle(w, 3);
    ok(!!q(w, '.dayempty'), 'an empty day says it is free');
    ok(/Waiting Wendy/.test(txt(q(w, '.dayempty'))), 'and offers the jobs still waiting for a slot');
    ok(!!q(w, '.dayempty [data-book="w1"]'), 'with a button to book each one');
    w.close();
  }

  console.log('\n--- the layout fixes ---');

  {
    const { w } = await boot({ seed: [job()] });
    noNav(w);
    ok(!!q(w, '.src-quoted'), 'glass on an unconfirmed quote reads Quoted');
    ok(!q(w, '.docket [data-pc]'), 'and cannot be ticked off as cut');
    ok(!!q(w, '#list .jobgrid'), 'jobs sit in a grid that goes two-wide on a big screen');

    const banner = txt(q(w, '.banner'));
    ok(/never been backed up/.test(banner) && !/0 days/.test(banner), 'the backup warning makes sense');

    const tel = q(w, '.jobtop a.tel');
    ok(!!tel && tel.getAttribute('href') === 'tel:07734078017', 'the phone number is a link');
    await click(w, tel);
    ok(!$(w, 'jobSheet').classList.contains('on'), 'tapping it rings rather than opening the job');
    w.close();
  }

  {
    const { w: probe } = await boot({ seed: [] });
    const j = fitReady(probe, '11:15'); probe.close();
    const { w } = await boot({ seed: [j] });
    ok(/Fit today 11:15/.test(txt(q(w, '.meta'))), 'a booking today says "today", not the date');
    ok(!!q(w, '.note a.maplink'), 'and the address opens a map');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* Round 10: glass, frames and maintenance on the same job; maintenance
   entered as lines and shown like glass; events and reminders in the diary.

   Run from the repo root:  node tests/t15_mixed_events.js              */
const { boot, settle, makeServer, $, q, qa, click, type, choose, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const near = (a, b, t = 0.005) => Math.abs(a - b) < t;
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const tick = async (w, el, v) => { el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); await settle(w, 3); };
const evList = s => s.settings.has('events') ? JSON.parse(s.settings.get('events')).list : [];
const cardOf = (w, id) => { const b = q(w, `#list [data-move="${id}"]`); return b && b.closest('.job'); };
const subCount = (w, k) => +txt(q(w, `[data-sub="${k}"] b`));
/* one line of a spreadsheet, with quoted cells that may hold commas */
const csvCells = line => { const out = []; let c = '', inq = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i];
    if (inq) { if (ch === '"') { if (line[i + 1] === '"') { c += '"'; i++; } else inq = false; } else c += ch; }
    else if (ch === ',') { out.push(c); c = ''; } else if (ch === '"') inq = true; else c += ch; }
  out.push(c); return out; };

const orderPiece = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order',
  supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }, o);
const frame = (o = {}) => Object.assign({ desc: 'White uPVC two window frame', w: '1150', h: '1250', q: '1', price: 480,
  supplier: 'Trade Frames', order: true, ostate: 'toprice' }, o);
const handles = (o = {}) => Object.assign({ desc: 'White espagnolette handles', supplier: 'Tudor', q: '2', price: 18,
  order: true, ostate: 'toprice' }, o);
const labour = (o = {}) => Object.assign({ desc: 'Ease and adjust the back door', supplier: '', q: '1', price: 65, order: false }, o);
const mixed = (o = {}) => job(Object.assign({ id: 'mx', no: 1810, name: 'Sandra Pell', confirmed: true, status: 'pricing',
  handover: 'fitting', addr: '12 Ash Road, RM14 2AB', items: [orderPiece()], frames: [frame()], works: [handles(), labour()],
  extras: [{ label: 'Fitting', amount: 120 }] }, o));

(async () => {
  console.log('\n--- glass, frames and maintenance on one job ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Mixed Mo');
    await type(w, q(w, '[data-k="w"][data-i="0"]'), '900');
    await type(w, q(w, '[data-k="h"][data-i="0"]'), '600');
    await click(w, $(w, 'addFrame'));
    await type(w, q(w, '[data-fdesc="0"]'), 'White uPVC casement');
    await type(w, q(w, '[data-fwid="0"]'), '1200');
    await type(w, q(w, '[data-fhgt="0"]'), '900');
    await type(w, q(w, '[data-fprice="0"]'), '300');
    await click(w, $(w, 'addWork'));
    await type(w, q(w, '[data-wdesc="0"]'), 'Replace the window handles');
    await type(w, q(w, '[data-wqty="0"]'), '2');
    await type(w, q(w, '[data-wprice="0"]'), '15');
    const rows = txt($(w, 'calcRows'));
    ok(/Glass and edgework/.test(rows) && /Frames£300\.00/.test(rows) && /Maintenance£30\.00/.test(rows),
       'the price panel adds up the glass, the frames and the maintenance');
    await click(w, $(w, 'saveJob'));
    const id = [...server.rows.keys()][0], j = cur(server, id);
    ok(j.items.length === 1 && j.frames.length === 1 && j.works.length === 1,
       'glass, a frame and maintenance put on together are all saved: nothing disappears');
    ok(j.items[0].w === '900' && j.frames[0].w === '1200' && j.works[0].desc === 'Replace the window handles' && j.works[0].q === '2',
       'each with what was typed in');
    const g = w.eval(`jobTotals(JOBS.find(x=>x.id==='${id}')).glassTotal`);
    ok(g > 0 && near(j._net, g + 300 + 30), 'the price is all three added together');
    ok(qa(w, `#list [data-move="${id}"]`).length === 1 && cardOf(w, id).querySelectorAll('.docket .ditem').length === 3,
       'the card shows all three');
    ok(w.eval(`kindLabel(JOBS.find(x=>x.id==='${id}'))`) === 'Glass + Frames + Maintenance', 'and the job is all three kinds');

    await click(w, q(w, `[data-open="${id}"]`));
    ok(qa(w, '#items .item').length === 1 && qa(w, '#frames .item').length === 1 && qa(w, '#works .item').length === 1,
       'opening it again shows the glass, the frame and the maintenance');
    ok(q(w, '[data-k="w"][data-i="0"]').value === '900' && q(w, '[data-fdesc="0"]').value === 'White uPVC casement'
       && q(w, '[data-wdesc="0"]').value === 'Replace the window handles', 'as they were');
    await type(w, q(w, '[data-wqty="0"]'), '3');
    await type(w, $(w, 'fDisc'), '10');
    await click(w, $(w, 'addExtra'));
    await type(w, q(w, '[data-xl="0"]'), 'Fitting');
    await type(w, q(w, '[data-xa="0"]'), '100');
    await click(w, $(w, 'saveJob'));
    const k = cur(server, id);
    ok(k.items.length === 1 && k.frames.length === 1 && k.works[0].q === '3', 'changing one keeps the others');
    ok(near(k._net, (g + 300 + 45) * 0.9 + 100), 'the discount comes off the glass, frames and maintenance, but not the fitting');
    w.close();
  }
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Nothing Ned');
    await click(w, q(w, '#items [data-rmi="0"]'));
    await click(w, $(w, 'addFrame'));
    await click(w, $(w, 'addWork'));
    await click(w, $(w, 'saveJob'));
    ok(!server.rows.size && /Add some glass, a frame or some maintenance/.test(txt($(w, 'toast'))),
       'a job with nothing on it will not save, and says what it needs');
    await type(w, q(w, '[data-wdesc="0"]'), 'Re-hang the shed door');
    await click(w, $(w, 'saveJob'));
    const j = cur(server, [...server.rows.keys()][0]);
    ok(j.works.length === 1 && !j.frames.length && !j.items.length, 'empty lines are left off, the rest is kept');
    w.close();
  }

  console.log('\n--- maintenance on the card looks like glass ---');
  {
    /* the job in the second photo: saved by the version before, with the
       work charged as an extra */
    const old = job({ id: 'oc', no: 1797, name: 'Mr Collins', kind: 'maintenance', items: [], handover: 'fitting',
                      extras: [{ label: 'Whole out build', amount: 4200 }], note: '6m x 5m new out building' });
    const { w } = await boot({ seed: [old] });
    const c = cardOf(w, 'oc'), it = c.querySelector('.docket .ditem');
    ok(!!it && txt(it.querySelector('.src')) === 'Quoted', 'it has a Quoted badge, like a piece of glass');
    ok(txt(it.querySelector('.prod')) === 'Maintenance' && txt(it.querySelector('.size.wname')) === 'Whole out build×1',
       'the work is in the large type, where a size goes');
    ok(parseFloat(w.getComputedStyle(it.querySelector('.wname')).fontSize) >= 18
       && parseFloat(w.getComputedStyle(it.querySelector('.prod')).fontSize) < 18, 'and as big as a size on glass');
    ok(!c.querySelector('.docket .sub.mono'), 'not tucked away on the small line any more');
    ok(/£5040\.00/.test(txt(c.querySelector('.jobfoot'))), 'the price is what it was');
    await click(w, q(w, '[data-open="oc"]'));
    ok(qa(w, '#works .item').length === 1 && q(w, '[data-wdesc="0"]').value === 'Whole out build' && q(w, '[data-wprice="0"]').value === '4200'
       && !qa(w, '#items .item').length && !qa(w, '#extras [data-xl]').length,
       'opening it shows the work as maintenance, not as an extra, with no glass');
    w.close();
  }
  {
    const { w } = await boot({ seed: [mixed({ confirmed: false, status: 'quote' })] });
    const items = qa(w, '#list .docket .ditem');
    ok(items.length === 4 && items.every(d => txt(d.querySelector('.src')) === 'Quoted'), 'on a quote, every line reads Quoted');
    ok(txt(items[1].querySelector('.prod')) === 'White uPVC two window frame · Trade Frames'
       && txt(items[1].querySelector('.size')) === '1150×1250×1', 'a frame: what it is, then its size in large type');
    ok(txt(items[2].querySelector('.prod')) === 'Maintenance · Tudor' && txt(items[2].querySelector('.wname')) === 'White espagnolette handles×2',
       'maintenance: where it is coming from, then what it is and how many in large type');
    w.close();
  }

  console.log('\n--- maintenance lines, ordered or not ---');
  {
    const { w } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await click(w, $(w, 'addWork'));
    const line = () => q(w, '#works .item');
    const labels = () => [...line().querySelectorAll('label')].map(txt);
    ok(['What it is', 'Coming from', 'Quantity', 'Price each, ex VAT'].every(l => labels().indexOf(l) >= 0)
       && /Needs to order\?/.test(txt(line().querySelector('.ltick'))), 'each line asks what it is, where from, how many, the price each before VAT, and Needs to order?');
    const before = [...line().querySelectorAll('input')].length;
    await tick(w, q(w, '#works [data-lord="0"]'), true);
    ok([...line().querySelectorAll('input')].length === before && line().classList.contains('ordered'), 'ticked or not, it asks the same things');
    ok(q(w, '#works [data-wqty="0"]').value === '1', 'quantity starts at one');
    await type(w, q(w, '#works [data-wqty="0"]'), '4');
    await type(w, q(w, '#works [data-wprice="0"]'), '12.50');
    ok(txt(q(w, '#works .iline')) === '4 × £12.50£50.00', 'and the line shows its total');
    ok(/1 maintenance item to order/.test(txt($(w, 'calcSplit'))), 'the price panel says what goes to order');
    w.close();
  }
  {
    const { w, server } = await boot({ seed: [mixed()] });
    ok(w.eval("bucket('pricing').length") === 1, 'a mixed job with things to order is in To be ordered');
    await click(w, q(w, '[data-f="pricing"]'));
    ok(subCount(w, 'glass') === 1 && subCount(w, 'maintenance') === 1 && subCount(w, 'frames') === 1,
       'and counts under Glass, Maintenance and Frames, as each has something to order');
    await click(w, q(w, '[data-sub="maintenance"]'));
    const c = cardOf(w, 'mx'), badges = qa(w, '#list .docket .ditem .src').map(txt);
    ok(badges.join() === 'To order,To order,To order,Ready', 'the glass, frame and handles are to order; the labour is ready');
    ok(/Mark as ordered \(3\)/.test(txt(c.querySelector('.acts'))), 'Mark as ordered covers the three');
    await click(w, c.querySelector('[data-ordj]'));
    let j = cur(server, 'mx');
    ok(j.status === 'order' && j.items[0].ostate === 'ordered' && j.frames[0].ostate === 'ordered' && j.works[0].ostate === 'ordered'
       && j.works[0].orderedAt && !j.works[1].orderedAt, 'and puts all three on order, and nothing else');
    await click(w, q(w, '[data-f="order"]'));
    ok(subCount(w, 'glass') === 1 && subCount(w, 'maintenance') === 1 && subCount(w, 'frames') === 1, 'On order counts it under all three too');
    await click(w, q(w, '[data-sub="maintenance"]'));
    const acts = txt(cardOf(w, 'mx').querySelector('.acts'));
    ok(/Firmans delivered/.test(acts) && /Trade Frames delivered/.test(acts) && /Tudor delivered/.test(acts),
       'with a delivered button for each supplier');
    await click(w, cardOf(w, 'mx').querySelector('[data-arr="mx|Tudor"]'));
    j = cur(server, 'mx');
    ok(j.works[0].ostate === 'arrived' && j.frames[0].ostate === 'ordered' && j.items[0].ostate === 'ordered' && j.status === 'order',
       'Tudor delivered books in the handles and nothing else');
    ok(/^Tudor booked in for job 1810/.test(txt($(w, 'toast'))), 'and says so');
    ok(subCount(w, 'maintenance') === 0 && subCount(w, 'frames') === 1, 'so it leaves On order, Maintenance, but not Frames');
    await click(w, q(w, '[data-sub="frames"]'));
    await click(w, cardOf(w, 'mx').querySelector('[data-fa="mx|0"]'));
    ok(cur(server, 'mx').frames[0].ostate === 'arrived' && cur(server, 'mx').status === 'order', 'the frame can be ticked off on its own');
    await click(w, q(w, '[data-sub="glass"]'));
    await click(w, q(w, '[data-view="jobs"]'));
    await click(w, cardOf(w, 'mx').querySelector('[data-arr="mx|Firmans"]'));
    ok(cur(server, 'mx').status === 'ready', 'and once everything is in, the job is ready');
    await click(w, q(w, '#banner [data-undo]'));
    ok(cur(server, 'mx').items[0].ostate === 'ordered' && cur(server, 'mx').status === 'order', 'Undo puts the glass back on order');
    w.close();
  }
  {
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'); probe.close();
    const j = mixed({ status: 'order', items: [orderPiece({ ostate: 'arrived' })], frames: [frame({ ostate: 'ordered' })],
                      works: [handles({ ostate: 'ordered' }), labour()], appts: [{ kind: 'fit', date: today, time: '09:00', mins: 120 }] });
    const { w, server } = await boot({ seed: [j] });
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    const alert = txt(q(w, '.dayalert'));
    ok(/1 frame has not arrived/.test(alert) && /the parts have not arrived/.test(alert), 'the day sheet says what has not arrived');
    const going = qa(w, '#dayBody .sgoing .sw').map(txt);
    ok(going.join('|') === 'White espagnolette handles|Ease and adjust the back door', 'and lists the maintenance going out, in full');
    $(w, 'dayPrint').click(); await settle(w, 3);
    ok(/White espagnolette handles ×2/.test(w._printed) && /Ease and adjust the back door/.test(w._printed), 'so does the printed run sheet');
    await click(w, $(w, 'closeDay'));
    await click(w, q(w, '[data-move="mx"]'));
    await click(w, q(w, '#moveBody [data-moveto="quote"]'));
    const k = cur(server, 'mx');
    ok(k.items[0].ostate === 'toprice' && k.frames[0].ostate === 'toprice' && k.works[0].ostate === 'toprice' && !k.works[0].orderedAt,
       'Move back to Quotes takes everything off order');
    w.close();
  }

  console.log('\n--- jobs and drafts from before ---');
  {
    const old = job({ id: 'om', no: 1795, name: 'Old Maint', kind: 'maintenance', items: [], confirmed: true, status: 'order',
                      extras: [{ label: 'Replace the handles', amount: 90 }], discountPct: 10, needsOrder: true,
                      workOrder: { what: 'Hinges', supplier: 'Tudor', ostate: 'ordered', orderedAt: '2026-10-20T09:00:00Z' } });
    const of = job({ id: 'of', no: 1796, name: 'Old Frames', kind: 'frames', items: [], confirmed: true, status: 'ready', needsOrder: false,
                     frames: [{ desc: 'Casement', w: '1200', h: '900', q: '1', price: 300, supplier: 'Trade Frames' }] });
    const { w, server } = await boot({ seed: [old, of] });
    const m = JSON.parse(w.eval("JSON.stringify(JOBS.find(j=>j.id==='om'))"));
    ok(m.works.length === 2 && m.works[0].desc === 'Replace the handles' && m.works[0].price === 90 && !m.works[0].order
       && m.works[1].desc === 'Hinges' && m.works[1].supplier === 'Tudor' && m.works[1].order && m.works[1].ostate === 'ordered',
       'an older maintenance job reads as two lines: the work, and the thing on order');
    ok(!m.extras.length && !('kind' in m) && !('needsOrder' in m) && !('workOrder' in m), 'with nothing left of the old shape');
    ok(near(w.eval("jobTotals(JOBS.find(j=>j.id==='om')).grand"), 108), 'and the same total: the old work was never discounted');
    ok(m.status === 'order' && w.eval("bucket('order').some(j=>j.id==='om')"), 'still on order');
    ok(w.eval("JOBS.find(j=>j.id==='of').frames[0].order") === false && w.eval("JOBS.find(j=>j.id==='of').status") === 'ready',
       'an older frames job with nothing to order stays that way');
    await click(w, q(w, '[data-open="om"]'));
    await click(w, $(w, 'saveJob'));
    const s = cur(server, 'om');
    ok(s.works.length === 2 && !('kind' in s) && !('workOrder' in s) && !('needsOrder' in s) && near(s._total, 108),
       'saved again, it is kept the new way, at the same price');
    await click(w, q(w, '[data-f="order"]'));
    await click(w, q(w, '#list [data-wa="om|1"]'));
    ok(cur(server, 'om').works[1].ostate === 'arrived' && cur(server, 'om').status === 'ready' && /Parts in — job 1795/.test(txt($(w, 'toast'))),
       'ticking off the hinges as they arrive makes it ready');
    w.close();
  }
  {
    /* a draft left by the version before, on a job whose parts are on order */
    const base = job({ id: 'db', no: 1798, name: 'Draft Base', kind: 'maintenance', items: [], confirmed: true, status: 'order',
                       extras: [{ label: 'Replace the handles', amount: 90 }], needsOrder: true,
                       workOrder: { what: 'Hinges', supplier: 'Tudor', ostate: 'ordered', orderedAt: '2026-10-20T09:00:00Z' } });
    const { w, server } = await boot({ seed: [base] });
    const form = { name: 'Draft Base', phone: '', email: '', trade: false, unit: 'mm', kind: 'maintenance',
      items: [{ pid: 'c4mm', w: '', h: '', q: '1', addons: [], src: 'cut' }], frames: [],
      extras: [{ label: 'Replace the handles', amount: '95' }], discountPct: '', cardFee: false, noVat: false, payments: [],
      handover: 'collection', addr: '', wanted: '', note: '', needsMeasure: false, measured: false, noteUrgent: false,
      needsInvoice: false, invoicedAt: '', attnOn: false, attnText: '', needsOrder: true, ordWhat: 'Hinges', ordSup: 'Tudor', photos: [] };
    w.localStorage.setItem('wg-drafts-v1', JSON.stringify({ 'job:db': { key: 'job:db', jobId: 'db', jobNo: 1798, baseV: 1,
      savedAt: new Date().toISOString(), form, photoGone: [], newPhotos: [] } }));
    w.eval('drawDraftCount()');
    await click(w, $(w, 'draftsBtn'));
    ok(/Maintenance · 2 items/.test(txt(q(w, '.drow .dm'))), 'an older draft is listed as maintenance');
    await click(w, q(w, '[data-dopen]'));
    ok(qa(w, '#works .item').length === 2 && q(w, '[data-wprice="0"]').value === '95' && q(w, '[data-wdesc="1"]').value === 'Hinges'
       && q(w, '#works [data-lord="1"]').checked && !qa(w, '#items .item').length,
       'restoring it puts the work and the thing to order in as maintenance lines');
    await click(w, $(w, 'saveJob'));
    const s = cur(server, 'db');
    ok(s.works[0].price === 95 && s.works[1].ostate === 'ordered' && s.works[1].orderedAt === '2026-10-20T09:00:00Z' && s.status === 'order',
       'and saving it keeps the hinges on order');
    w.close();
  }

  console.log('\n--- emails, search and the spreadsheet ---');
  {
    const { w } = await boot({ seed: [mixed({ confirmed: false, status: 'quote' })] });
    await click(w, q(w, '[data-mail="mx"]'));
    const b = $(w, 'mPrev').textContent;
    ok(b.indexOf('Frame: White uPVC two window frame\nSize: 1150 x 1250mm\nPrice: £480.00') > 0, 'the quote has the frame');
    ok(b.indexOf('Work: White espagnolette handles\nQuantity: 2\nPrice: £36.00') > 0 && b.indexOf('Work: Ease and adjust the back door\nPrice: £65.00') > 0,
       'each piece of maintenance, with how many and its price');
    ok(/Type of glass: Double glazed unit/.test(b) && /\nFitting: £120\.00\n/.test(b), 'the glass, and the fitting with the totals');
    ok(b.indexOf('Tudor') < 0 && b.indexOf('Trade Frames') < 0, 'but not where anything is coming from');
    await click(w, $(w, 'closeMail'));
    $(w, 'search').value = 'espagnolette';
    $(w, 'search').dispatchEvent(new w.Event('input', { bubbles: true })); await settle(w, 3);
    ok(qa(w, '#list .job').length === 1, 'searching finds a job by its maintenance');
    const csv = w.eval('jobsCSV()').split('\r\n'), head = csvCells(csv[0]), row = csvCells(csv[1]);
    ok(row[head.indexOf('Job type')] === 'Glass + Frames + Maintenance' && row[head.indexOf('Maintenance')] === '2'
       && row[head.indexOf('Frames')] === '1' && row.length === head.length, 'the spreadsheet has the kinds and a Maintenance column');
    w.close();
  }
  {
    const done = mixed({ status: 'ready', items: [orderPiece({ ostate: 'arrived' })], frames: [frame({ ostate: 'arrived' })],
                         works: [handles({ ostate: 'arrived' }), labour()] });
    const { w } = await boot({ seed: [done] });
    await click(w, q(w, '[data-mail="mx"]'));
    ok(/^Hello Sandra,\n\nEverything for job 1810 is ready:/.test($(w, 'mPrev').textContent), 'a job with more than one kind is "Everything ... is ready"');
    w.close();
  }
  {
    const old = job({ id: 'om', no: 1795, name: 'Old Maint', kind: 'maintenance', items: [],
                      extras: [{ label: 'Replace the handles', amount: 90 }], needsOrder: true, workOrder: { what: 'Hinges', supplier: 'Tudor' } });
    const { w } = await boot({ seed: [old] });
    await click(w, q(w, '[data-mail="om"]'));
    const b = $(w, 'mPrev').textContent;
    ok(b.indexOf('Work: Replace the handles\nPrice: £90.00') > 0 && /Work: Hinges\n\n-{10}/.test(b),
       'something with no price of its own is listed without one');
    w.close();
  }

  console.log('\n--- the + New event button ---');
  {
    const { w } = await boot({ seed: [] });
    const btn = $(w, 'evBtn');
    ok(!!btn && txt(btn) === '+ New event' && btn.nextElementSibling === $(w, 'newBtn'), 'it says + New event, just left of + New job');
    ok(btn.classList.contains('evbtn') && /rgb\(200, 68, 63\)|#c8443f/i.test(w.getComputedStyle(btn).backgroundColor + w.getComputedStyle(btn).background),
       'and it is red');
    await click(w, btn);
    ok($(w, 'evSheet').classList.contains('on') && $(w, 'evDate').value === w.eval('ymd(new Date())') && $(w, 'evTime').value === '09:00'
       && $(w, 'evMins').value === '60' && !$(w, 'evRemind').checked, 'it opens a page for the event: what, the date, the time and how long');
    w.close();
  }

  console.log('\n--- putting an event in ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    const today = w.eval('ymd(new Date())'), tomorrow = w.eval('shiftDay(ymd(new Date()),1)');
    await click(w, $(w, 'evBtn'));
    await click(w, $(w, 'evSave'));
    ok(!server.settings.has('events') && /Say what it is/.test(txt($(w, 'toast'))) && $(w, 'evSheet').classList.contains('on'),
       'it will not save without saying what it is');
    await type(w, $(w, 'evWhat'), '  Collect glass from Firmans ');
    await type(w, $(w, 'evDate'), tomorrow);
    await type(w, $(w, 'evTime'), '09:00');
    await choose(w, $(w, 'evMins'), '30');
    await tick(w, $(w, 'evRemind'), true);
    ok($(w, 'evRemTick').classList.contains('on') && /shows at the top of the app/.test(txt($(w, 'evRemState'))),
       'making it a reminder says what that does');
    await click(w, $(w, 'evSave'));
    const ev = evList(server)[0];
    ok(evList(server).length === 1 && ev.what === 'Collect glass from Firmans' && ev.date === tomorrow && ev.time === '09:00'
       && ev.mins === 30 && ev.remind === true, 'it saves to the job book: what, when, how long, and that it is a reminder');
    ok(!$(w, 'evSheet').classList.contains('on') && /remind everyone on the day/.test(txt($(w, 'toast'))), 'and says so');
    ok(!q(w, '#banner .remind'), 'the reminder does not show today, the day before');

    await click(w, q(w, '[data-f="diary"]'));
    w.eval(`diaryMonth=new Date('${tomorrow}T12:00:00'); selDay='${tomorrow}'; render();`); await settle(w, 3);
    const cell = q(w, `.cell[data-day="${tomorrow}"]`);
    ok(txt(cell.querySelector('.ev.ev-evt')) === '09:00 Collect glass from Firmans' && !!cell.querySelector('.dot.ev-evt'),
       'it is on the calendar, in red');
    const row = q(w, '.daypanel .evday .evrow');
    ok(/^09:00 to 09:30/.test(txt(row)) && /Collect glass from Firmans/.test(txt(row)) && /Reminder/.test(txt(row)) && /30 minutes/.test(txt(row)),
       'and on the day underneath, with the time, how long, and Reminder');
    ok(/No jobs booked in/.test(txt(q(w, '.daypanel'))), 'with no jobs that day');

    /* Jack off work between 8 and 12, today */
    await click(w, q(w, `[data-evnew]`));
    ok($(w, 'evDate').value === tomorrow, '+ Add an event under a day starts on that day');
    await type(w, $(w, 'evWhat'), 'Jack off work');
    await type(w, $(w, 'evDate'), today);
    await type(w, $(w, 'evTime'), '08:00');
    await choose(w, $(w, 'evMins'), '240');
    await tick(w, $(w, 'evRemind'), true);
    await click(w, $(w, 'evSave'));
    await type(w, $(w, 'search'), '');
    await click(w, q(w, '[data-f="all"]'));
    const rem = q(w, '#banner .remind');
    ok(!!rem && /Reminder for today/.test(txt(rem)) && /08:00 to 12:00 — Jack off work/.test(txt(rem)) && !/Firmans/.test(txt(rem)),
       'on the day, a reminder shows at the top of the app');

    const b = await boot({ server, seed: [] });
    ok(/Jack off work/.test(txt(q(b.w, '#banner .remind'))), 'on every machine');
    b.w.close();

    await click(w, q(w, '#banner [data-evseen]'));
    ok(!q(w, '#banner .remind'), 'Hide takes it away on this machine');
    const c = await boot({ server, seed: [] });
    ok(/Jack off work/.test(txt(q(c.w, '#banner .remind'))), 'but not on the others');
    c.w.close();
    w.close();
  }

  console.log('\n--- changing and taking out ---');
  {
    const server = makeServer();
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'); probe.close();
    server.settings.set('events', JSON.stringify({ list: [
      { id: 'e1', what: 'Jack off work', date: today, time: '08:00', mins: 240, remind: true, at: '2026-10-01T09:00:00Z' },
      { id: 'e2', what: 'Van in for its MOT', date: today, time: '', mins: 0, remind: false, at: '2026-10-01T09:00:00Z' }] }));
    server.settingsV.set('events', 'v0');
    const { w } = await boot({ server, seed: [job({ id: 'f', no: 1802, name: 'Cranham Lettings', confirmed: true, status: 'ready',
      handover: 'fitting', appts: [{ kind: 'fit', date: today, time: '10:30', mins: 60 }] })] });
    ok(qa(w, '#banner .rmrow').length === 1, 'only the event made a reminder is a reminder');
    await click(w, q(w, '#banner [data-evopen="e1"]'));
    ok($(w, 'evSheet').classList.contains('on') && $(w, 'evWhat').value === 'Jack off work' && $(w, 'evMins').value === '240'
       && $(w, 'evDel').style.display !== 'none', 'Change opens it, ready to change or delete');
    ok(/At the same time: 10:30 Cranham Lettings \(fit\)/.test(txt($(w, 'evClash'))), 'and says which jobs it clashes with');
    await choose(w, $(w, 'evMins'), '120');
    await click(w, $(w, 'evSave'));
    ok(evList(server).find(e => e.id === 'e1').mins === 120 && evList(server).length === 2, 'saving changes it, not adds another');

    w.eval('openEvent(EVENTS.find(e=>e.id===\'e2\'))'); await settle(w, 3);
    ok($(w, 'evMins').value === '0' && $(w, 'evTimeWrap').style.display === 'none', 'an all-day event has no time to fill in');
    await click(w, $(w, 'closeEv'));

    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    const block = txt(q(w, '#dayBody .evday'));
    ok(/All day Van in for its MOT/.test(block) && /08:00 to 10:00 Jack off work/.test(block), 'the day sheet shows the day\'s events');
    $(w, 'dayPrint').click(); await settle(w, 3);
    ok(/Events/.test(w._printed) && /All day · Van in for its MOT/.test(w._printed) && /08:00 to 10:00 · Jack off work \(reminder\)/.test(w._printed),
       'and so does the printed run sheet');

    await click(w, q(w, '#dayBody [data-evdel="e2"]'));
    ok(evList(server).map(e => e.id).join() === 'e1' && $(w, 'daySheet').classList.contains('on'), 'Remove takes it out of the diary');
    ok(!/Van in/.test(txt(q(w, '#dayBody .evday'))) && /Jack off work/.test(txt(q(w, '#dayBody .evday'))), 'and off the day');
    await click(w, q(w, '#dayBody .undobar [data-undo]'));
    ok(evList(server).map(e => e.id).sort().join() === 'e1,e2' && /Put back in the diary — Van in for its MOT/.test(txt($(w, 'toast'))),
       'Undo puts it back');
    await click(w, $(w, 'closeDay'));

    w.eval('openEvent(EVENTS.find(e=>e.id===\'e1\'))'); await settle(w, 3);
    await click(w, $(w, 'evDel'));
    ok(evList(server).map(e => e.id).join() === 'e2' && !$(w, 'evSheet').classList.contains('on'), 'Delete on the event takes it out too');

    await click(w, $(w, 'evBtn'));
    await type(w, $(w, 'evWhat'), 'Stocktake');
    await choose(w, $(w, 'evMins'), '0');
    ok($(w, 'evTimeWrap').style.display === 'none', 'choosing All day takes the time away');
    await click(w, $(w, 'evSave'));
    const st = evList(server).find(e => e.what === 'Stocktake');
    ok(!!st && st.time === '' && st.mins === 0, 'and it saves with no time');
    await click(w, q(w, '[data-f="diary"]'));
    w.eval(`selDay='${today}'; render();`); await settle(w, 3);
    ok(/^All day Stocktake/.test(txt(qa(w, '.daypanel .evrow').find(r => /Stocktake/.test(r.textContent)))), 'showing as All day');
    w.close();
  }

  console.log('\n--- two machines at once ---');
  {
    const server = makeServer();
    const a = await boot({ server, seed: [] }), b = await boot({ server, seed: [] });
    const day = a.w.eval('shiftDay(ymd(new Date()),3)');
    for (const [m, what] of [[a.w, 'Collect glass from Firmans'], [b.w, 'Bottle bank run']]) {
      await click(m, $(m, 'evBtn'));
      await type(m, $(m, 'evWhat'), what);
      await type(m, $(m, 'evDate'), day);
      await click(m, $(m, 'evSave'));
    }
    ok(evList(server).map(e => e.what).sort().join() === 'Bottle bank run,Collect glass from Firmans',
       'two machines adding events at the same time both keep theirs');
    ok(b.w.eval('EVENTS.length') === 2, 'and the second machine has both');
    a.w.close(); b.w.close();
  }

  console.log('\n--- bookings, offline, and old events ---');
  {
    const server = makeServer();
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'), longAgo = probe.eval('shiftDay(ymd(new Date()),-500)'); probe.close();
    server.settings.set('events', JSON.stringify({ list: [
      { id: 'e1', what: 'Jack off work', date: today, time: '08:00', mins: 240, remind: false },
      { id: 'e2', what: 'Van in for its MOT', date: today, time: '', mins: 0, remind: false },
      { id: 'old', what: 'Long gone', date: longAgo, time: '', mins: 0 }] }));
    const { w } = await boot({ server, seed: [job({ id: 'f', no: 1802, name: 'Cranham Lettings', confirmed: true, status: 'ready',
      handover: 'fitting', appts: [] })] });
    w.eval("openBook(JOBS.find(j=>j.id==='f'), ymd(new Date()))"); await settle(w, 3);
    $(w, 'bTime').value = '09:00'; w.eval('drawClash()');
    ok(/Overlaps Jack off work at 08:00/.test(txt($(w, 'bClash'))) && /Also that day: Van in for its MOT, all day/.test(txt($(w, 'bClash'))),
       'booking a job in says what events it clashes with');
    await click(w, $(w, 'closeBook'));
    w.eval('$("printDiary").click()'); await settle(w, 3);
    ok(/Jack off work/.test(w._printed) && /EVENT/.test(w._printed), 'the printed diary has the events');
    ok(JSON.parse(w.eval('backupJSON()')).events.length === 3, 'and so does the backup');

    await click(w, $(w, 'evBtn'));
    await type(w, $(w, 'evWhat'), 'Order the toughened');
    await click(w, $(w, 'evSave'));
    ok(evList(server).length === 3 && !evList(server).some(e => e.id === 'old'), 'events more than a year old are cleared out when the diary is saved');

    w.offline(); await w.eval('loadAll()'); await settle(w, 3);
    await click(w, $(w, 'evBtn'));
    await type(w, $(w, 'evWhat'), 'Will not save');
    await click(w, $(w, 'evSave'));
    ok(/cannot be reached/.test(txt($(w, 'toast'))) && $(w, 'evSheet').classList.contains('on') && evList(server).length === 3,
       'with no connection it says so, and keeps what was typed');
    ok(w.eval('EVENTS.length') === 3, 'the diary still shows the events it had');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

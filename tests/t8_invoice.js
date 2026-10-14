const fs = require('fs');
const { boot, settle, makeServer, $, q, qa, click, type, choose, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const tick = async (w, el, on) => { el.checked = on;
  el.dispatchEvent(new w.Event('change', { bubbles: true })); await settle(w, 3); };

/* the same date sums the page uses, worked out from today */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const day = n => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = day(0), TOMORROW = day(1);
const longToday = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const done = (o = {}) => job(Object.assign({ status: 'done', confirmed: true, doneAt: '2026-09-01T12:00:00Z',
  items: [{ pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'cut', cut: true }] }, o));
const toOrder = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order',
  supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }, o);

(async () => {
  console.log('\n--- needs invoice? ---');

  {
    const { w, server } = await boot({ seed: [job({ confirmed: true })] });
    await click(w, q(w, '[data-open]'));
    const lab = $(w, 'invTick');
    ok(!!lab && /Needs invoice\?/.test(txt(lab)), 'the job sheet has a Needs invoice? tick');
    ok(/Customer/.test(txt(lab.closest('.card').querySelector('h4'))), 'in the customer section');
    ok(!$(w, 'fInvoice').checked, 'unticked to start with');
    await tick(w, $(w, 'fInvoice'), true);
    ok(lab.classList.contains('on'), 'ticking it lights it up');
    ok(/To invoice/.test(txt($(w, 'invState'))), 'and says where the job will wait');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').needsInvoice === true, 'the tick saves');
    ok(/To invoice/.test(txt(q(w, '.job h3 .tag-inv'))), 'the card is tagged To invoice');

    const chip = q(w, '[data-f="invoice"]');
    ok(!!chip && /To invoice/.test(txt(chip)) && /1$/.test(txt(chip)), 'a To invoice tab counts it');
    await click(w, chip);
    ok(qa(w, '.job').length === 1, 'and lists it');
    const btn = q(w, '.job [data-inv]');
    ok(!!btn && /Mark invoiced/.test(txt(btn)), 'with a Mark invoiced button');

    await click(w, btn);
    const saved = cur(server, 'j1');
    ok(saved.invoicedAt && saved.invoicedAt.slice(0, 10) === TODAY, 'pressing it records the invoice as sent today');
    ok(qa(w, '.job').length === 0 && /Nothing to invoice/.test(txt($(w, 'list'))), 'and the job leaves the tab');
    ok(/0$/.test(txt(q(w, '[data-f="invoice"]'))), 'the count drops to nothing');

    await click(w, q(w, '[data-f="all"]'));
    ok(txt(q(w, '.job .istamp')) === 'Invoiced on ' + longToday(), 'the card is stamped "Invoiced on" today');
    ok(!q(w, '.job .tag-inv') && !q(w, '.job [data-inv]'), 'and no longer asks to be invoiced');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(!cur(server, 'j1').invoicedAt, 'which can be undone');
    w.close();
  }

  {
    const seed = [
      done({ id: 'old', no: 1, name: 'Finished long ago', needsInvoice: true, doneAt: '2026-08-01T12:00:00Z' }),
      done({ id: 'new', no: 2, name: 'Finished last week', needsInvoice: true, doneAt: '2026-09-20T12:00:00Z' }),
      job({ id: 'live', no: 3, name: 'Still being made', confirmed: true, needsInvoice: true }),
      job({ id: 'lost', no: 4, name: 'Not going ahead', status: 'lost', needsInvoice: true }),
      done({ id: 'paid', no: 5, name: 'Already invoiced', needsInvoice: true, invoicedAt: '2026-09-02T12:00:00Z' }),
      done({ id: 'no', no: 6, name: 'Paid at the counter' })
    ];
    const { w } = await boot({ seed });
    ok(!/Finished/.test(txt($(w, 'list'))), 'finished jobs are not on the Live tab');
    ok(q(w, '[data-f="invoice"]').classList.contains('alert'), 'the tab is flagged while finished work waits for an invoice');
    await click(w, q(w, '[data-f="invoice"]'));
    const names = qa(w, '.job h3').map(txt);
    ok(names.length === 3, 'it holds finished and unfinished jobs that need an invoice');
    ok(!names.some(n => /Not going ahead|Already invoiced|Paid at the counter/.test(n)),
       'but not lost jobs, invoiced ones, or ones never ticked');
    ok(/^Finished long ago/.test(names[0]) && /^Finished last week/.test(names[1]) && /^Still being made/.test(names[2]),
       'finished work first, longest waiting first');
    ok(/3 jobs need an invoice/.test(txt($(w, 'list'))), 'with a line saying how many');

    const csv = w.eval('jobsCSV()').split('\r\n');
    const head = csv[0].split(',');
    ok(head.indexOf('Needs invoice') > 0 && head.indexOf('Invoiced on') > 0, 'the spreadsheet has invoice columns');
    ok(csv.slice(1).filter(Boolean).every(r => r.split(',').length === head.length), 'and every row still lines up');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [done({ needsInvoice: true, invoicedAt: '2026-09-02T12:00:00Z' })] });
    await click(w, q(w, '[data-f="closed"]'));
    await click(w, q(w, '[data-open]'));
    ok(/Invoiced on 2 September 2026/.test(txt($(w, 'invState'))), 'an invoiced job says when on the job sheet');
    await click(w, q(w, '[data-uninv]'));
    await click(w, $(w, 'saveJob'));
    ok(!cur(server, 'j1').invoicedAt, '"Not invoiced after all" clears it');
    ok(/1$/.test(txt(q(w, '[data-f="invoice"]'))), 'and puts the job back in To invoice');
    w.close();
  }

  {
    const { w } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Trade Terry');
    await tick(w, $(w, 'fInvoice'), true);
    await click(w, $(w, 'closeJob'));
    await click(w, $(w, 'draftsBtn'));
    await click(w, q(w, '[data-dopen]'));
    ok($(w, 'fInvoice').checked, 'a draft remembers the tick');
    w.close();
  }

  console.log('\n--- completing stops on the day sheet ---');

  const daySeed = () => [
    job({ id: 'a', no: 11, name: 'Pat Retail', confirmed: true, status: 'ready', kind: 'maintenance', items: [],
          extras: [{ label: 'Re-seal', amount: 100 }], handover: 'fitting', addr: '1 High St',
          appts: [{ kind: 'fit', date: TODAY, time: '09:00', mins: 60 }] }),
    job({ id: 'm', no: 12, name: 'Mo Measure', items: [], needsMeasure: true, addr: '2 High St',
          appts: [{ kind: 'measure', date: TODAY, time: '11:00', mins: 30 }] }),
    job({ id: 'c', no: 13, name: 'Two Day Builders', trade: true, confirmed: true, status: 'ready', kind: 'maintenance',
          items: [], extras: [{ label: 'Big job', amount: 900 }], handover: 'fitting', addr: '3 High St',
          appts: [{ kind: 'fit', date: TODAY, time: '14:00', mins: 120 }, { kind: 'fit', date: TOMORROW, time: '09:00', mins: 240 }] }),
    job({ id: 'n', no: 14, name: 'Not Ready Ltd', trade: true, confirmed: true, status: 'order', handover: 'fitting',
          addr: '4 High St', items: [toOrder({ ostate: 'ordered', orderedAt: '2026-10-01T09:00:00Z' })],
          appts: [{ kind: 'fit', date: TODAY, time: '16:30', mins: 60 }] })
  ];

  {
    const { w, server } = await boot({ seed: daySeed() });
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    const stops = () => qa(w, '#dayBody .tl .stop');
    const stopFor = name => stops().find(s => s.textContent.indexOf(name) >= 0);
    /* greyed out, marked completed, and nothing left to press but Open */
    const isDone = s => !!s && s.classList.contains('done') && !s.querySelector('[data-stopdone]')
                        && /✓/.test(txt(s.querySelector('.kind')));
    const times = () => stops().map(s => txt(s.querySelector('.t0'))).join(' ');
    ok(stops().length === 4, 'four stops to start with');
    ok(stops().every(s => /Mark completed/.test(txt(s.querySelector('[data-stopdone]')))),
       'every stop can be marked completed, ready or not');

    await click(w, stopFor('Mo Measure').querySelector('[data-stopdone]'));
    ok(isDone(stopFor('Mo Measure')), 'a completed measure stays on the sheet, greyed out and marked completed');
    ok(times() === '09:00 11:00 14:00 16:30', 'in its place in the day');
    ok(cur(server, 'm').status !== 'done', 'but the job stays open — it still needs sizes and a quote');
    ok(cur(server, 'm').appts[0].doneAt, 'the visit itself is recorded as done');
    ok(/add the sizes/.test(txt($(w, 'toast'))), 'and the message says what comes next');

    await click(w, stopFor('Two Day Builders').querySelector('[data-stopdone]'));
    ok(isDone(stopFor('Two Day Builders')), "day one of a two-day fit is marked completed on today's sheet");
    ok(cur(server, 'c').status !== 'done', 'but the job is not closed while day two is still booked');

    let asked = '';
    w.confirm = m => { asked = m; return false; };
    await click(w, stopFor('Pat Retail').querySelector('[data-stopdone]'));
    ok(/still to collect/.test(asked) && /£120\.00/.test(asked), 'leaving money behind gets a warning first');
    ok(!!stopFor('Pat Retail') && !isDone(stopFor('Pat Retail')) && cur(server, 'a').status === 'ready', 'and saying no leaves the stop alone');

    asked = '';
    await click(w, stopFor('Not Ready Ltd').querySelector('[data-stopdone]'));
    ok(/not ready/.test(asked) && /on order from Firmans/.test(asked), 'so does closing off work that is not ready');

    w.confirm = m => { asked = m; return true; };
    await click(w, stopFor('Pat Retail').querySelector('[data-stopdone]'));
    ok(cur(server, 'a').status === 'done' && cur(server, 'a').doneAt, 'saying yes closes the job off');
    ok(isDone(stopFor('Pat Retail')) && /Fitted/.test(txt(stopFor('Pat Retail').querySelector('.kind'))),
       'and the stop stays, greyed out, marked Fitted');
    ok(/3 done, 1 to go/.test(txt(q(w, '.daysum'))), 'the summary keeps count of what is done');

    const bar = q(w, '#dayBody .undobar');
    ok(!!bar && /Job 11/.test(txt(bar)), 'an Undo bar sits at the top of the day sheet');
    await click(w, bar.querySelector('[data-undo]'));
    ok(!isDone(stopFor('Pat Retail')) && cur(server, 'a').status === 'ready', 'and puts the last one straight back');

    await click(w, stopFor('Pat Retail').querySelector('[data-stopdone]'));
    await click(w, stopFor('Not Ready Ltd').querySelector('[data-stopdone]'));
    ok(stops().length === 4 && stops().every(isDone), 'once everything is completed every stop is still there, greyed out');
    ok(/Everything for today is done/.test(txt($(w, 'dayBody'))), 'and says so');
    ok(!q(w, '#dayBody .dayacts a.maplink'), 'with no route left to drive');
    await click(w, $(w, 'dayPrint'));
    ok(/Everything booked for this day is done/.test(w._printed), 'the run sheet prints only what is left');

    w.eval("dayViewDate=shiftDay(ymd(new Date()),1); renderDay();"); await settle(w, 3);
    ok(!!stopFor('Two Day Builders') && !isDone(stopFor('Two Day Builders')), "day two is still to do on tomorrow's sheet");
    await click(w, stopFor('Two Day Builders').querySelector('[data-stopdone]'));
    ok(cur(server, 'c').status === 'done', 'and completing the last day closes the job');
    w.close();
  }

  {
    const j = job({ id: 'k', name: 'Card Check', confirmed: true, status: 'ready', handover: 'fitting',
      appts: [{ kind: 'measure', date: day(-2), time: '10:00', mins: 30, doneAt: '2026-10-01T10:30:00Z' },
              { kind: 'fit', date: TOMORROW, time: '08:15', mins: 60 }] });
    const { w } = await boot({ seed: [j] });
    ok(/Fit tomorrow 08:15/.test(txt(q(w, '.meta'))), 'a card shows the next booking, not one already done');
    await click(w, q(w, '[data-f="diary"]'));
    w.eval("selDay=shiftDay(ymd(new Date()),-2); diaryMonth=new Date(selDay); renderDiary();"); await settle(w, 3);
    ok(/Completed/.test(txt(q(w, '.slot'))), 'and the day under the calendar marks it completed');
    w.close();
  }

  console.log('\n--- the order email ---');

  const orderSeed = () => [
    job({ id: 'b', no: 1771, name: 'Brian Okafor', confirmed: true, status: 'pricing',
          items: [toOrder(), toOrder({ pid: 't6o', w: '820', h: '610', obsType: 'Stippolyte', dgThick: '', dgBar: '',
                                       note: 'Pattern runs\ntop to bottom' })] }),
    job({ id: 'h', no: 1772, name: 'Hall Lane Builders', trade: true, confirmed: true, status: 'pricing',
          items: [toOrder({ w: '1190', h: '890', dgThick: '', dgBar: '' })] })
  ];

  {
    const { w } = await boot({ seed: orderSeed() });
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-po="Firmans"]'));
    const body = $(w, 'mPrev').textContent;
    /* the whole email, word for word, in the layout asked for */
    const want = "Hello,\n\nI'd like to order the following please:\n\nReference: Brian Okafor\nType of glass: Double glazed unit (Clear × 4 MM)\nSize: 900 x 600mm\nThickness: 24 mm (4-16-4)\nBar colour: White\n\n----------------------------\n\nReference: Brian Okafor\nType of glass: Toughened obscured\nSize: 820 x 610mm\nThickness: 6 mm\nObscure pattern: Stippolyte\nNote: Pattern runs / top to bottom\n\n----------------------------\n\nReference: Hall Lane Builders\nType of glass: Double glazed unit (Clear × 4 MM)\nSize: 1190 x 890mm\nThickness: TO CONFIRM\nBar colour: TO CONFIRM\n\n----------------------------\n\nMany thanks,\nKeith\nWilson's Glass";
    ok(body === want, 'the order email reads exactly as laid out');
    if (body !== want) console.log('---- got ----\n' + body + '\n---- wanted ----\n' + want);
    ok(/^Hello,\n\n/.test(body), 'it opens with Hello,');
    ok(/Many thanks,\nKeith\nWilson's Glass$/.test(body), 'and ends Many thanks, Keith, Wilson\'s Glass');
    ok(/Reference: Brian Okafor\nType of glass: Double glazed unit/.test(body), "each piece starts with the customer's name as the reference");
    ok(/Type of glass: Toughened obscured\nSize: 820 x 610mm\nThickness: 6 mm\nObscure pattern: Stippolyte\nNote: Pattern runs \/ top to bottom/.test(body),
       'toughened glass says so, with its thickness, pattern and note each on a line');
    ok(/Reference: Hall Lane Builders\n[^-]*Thickness: TO CONFIRM\nBar colour: TO CONFIRM/.test(body),
       'anything not filled in still goes out marked TO CONFIRM');
    ok(!/job 17|Our ref|ORDER|Deliver to|Contact:/.test(body), 'no job numbers or letterhead');
    ok(body.indexOf(w.eval('SHOP.addr')) < 0, 'and no address block');

    /* the tick list redraws after each change, so look each box up afresh */
    for (const i of [0, 1]) await tick(w, q(w, '[data-mpick="' + i + '"]'), false);
    const less = $(w, 'mPrev').textContent;
    ok(!/Brian Okafor/.test(less) && /Reference: Hall Lane Builders/.test(less), "unticking a customer's pieces drops their reference too");
    w.close();
  }

  {
    const { w } = await boot({ seed: orderSeed() });
    await click(w, $(w, 'rateBtn'));
    ok($(w, 'fSign').value === 'Keith', 'the sign-off can be changed, and starts as Keith');
    await type(w, $(w, 'fSign'), 'Dave');
    await click(w, $(w, 'saveRates'));
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-po="Firmans"]'));
    ok(/Many thanks,\nDave\nWilson's Glass$/.test($(w, 'mPrev').textContent), 'and the email follows it');
    await click(w, $(w, 'closeMail'));
    await click(w, $(w, 'rateBtn'));
    await type(w, $(w, 'fSign'), '   ');
    await click(w, $(w, 'saveRates'));
    ok(w.eval('signOff()') === 'Keith', 'left blank, it goes back to Keith');
    w.close();
  }

  console.log('\n--- Tudor, and settings that survive a reload ---');

  {
    const { w } = await boot({ seed: [job()] });
    const sup = JSON.parse(w.eval('JSON.stringify(SUPPLIERS)'));
    const t = sup.find(s => s.name === 'Tudor');
    ok(!!t && t.email === 'orders@tudor.co.uk', 'Tudor is on the supplier list with orders@tudor.co.uk');
    ok(sup[sup.length - 1].name === 'Other' && sup[sup.length - 2].name === 'Tudor', 'just above Other');
    await click(w, q(w, '[data-open]'));
    await click(w, q(w, '[data-src="0:order"]'));
    ok([...q(w, '[data-sup="0"]').options].some(o => o.value === 'Tudor'), 'and can be picked for a piece');
    w.close();
  }

  {
    const j = job({ confirmed: true, status: 'pricing', items: [toOrder({ supplier: 'Tudor' })] });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-po="Tudor"]'));
    ok($(w, 'mTo').value === 'orders@tudor.co.uk', 'ordering from Tudor addresses the email to them');
    w.close();
  }

  {
    /* a shop that saved its supplier list before Tudor existed */
    const old = [{ name: 'Firmans', email: 'keith@firmans.example' }, { name: 'Simply', email: '' }, { name: 'Other', email: '' }];
    const mem = { 'wg:suppliers:v1': JSON.stringify({ suppliers: old, settings: {} }) };
    const { w } = await boot({ mem, seed: [] });
    const sup = JSON.parse(w.eval('JSON.stringify(SUPPLIERS)'));
    ok(sup.map(s => s.name).join(',') === 'Firmans,Simply,Tudor,Other', 'an older saved list gains Tudor');
    ok(sup[0].email === 'keith@firmans.example', 'without losing anything it already had');
    w.close();
  }

  {
    const renamed = [{ name: 'Firmans', email: '' }, { id: 'tudor', name: 'Tudor Glass Ltd', email: 'x@tudor.co.uk' }, { name: 'Other', email: '' }];
    const mem = { 'wg:suppliers:v1': JSON.stringify({ suppliers: renamed, settings: {} }) };
    const { w } = await boot({ mem, seed: [] });
    ok(w.eval("SUPPLIERS.filter(s=>/tudor/i.test(s.name)).length") === 1, 'a renamed Tudor is not added twice');
    w.close();
  }

  {
    const mem = {};
    const a = await boot({ mem, seed: [] });
    await click(a.w, $(a.w, 'rateBtn'));
    await type(a.w, q(a.w, '[data-se="0"]'), 'orders@firmans.example');
    await type(a.w, $(a.w, 'fSign'), 'Keith W');
    await type(a.w, q(a.w, '[data-p="c4mm"]'), '50.00');
    await click(a.w, $(a.w, 'saveRates'));
    a.w.close();

    /* the same device, after a reload, still online */
    const b = await boot({ mem, seed: [] });
    ok(b.w.eval("SUPPLIERS[0].email") === 'orders@firmans.example', 'a supplier email change survives a reload');
    ok(b.w.eval('signOff()') === 'Keith W', 'so does the sign-off');
    ok(b.w.eval("priceOf('c4mm')") === 50, 'and so does a price change');
    ok(b.w.eval("SUPPLIERS.filter(s=>s.name==='Tudor').length") === 1, 'with Tudor still there once');
    b.w.close();
  }

  {
    const server = makeServer();
    server.settings.set('suppliers', JSON.stringify({ suppliers: [{ name: 'Firmans', email: 'shared@firmans.example' }, { name: 'Other', email: '' }], settings: { signOff: 'Shop' } }));
    const mem = { 'wg:suppliers:v1': JSON.stringify({ suppliers: [{ name: 'Firmans', email: 'local@firmans.example' }], settings: {} }) };
    const { w } = await boot({ server, mem, seed: [] });
    ok(w.eval("SUPPLIERS[0].email") === 'shared@firmans.example', 'once the shared book has suppliers, they win');
    ok(w.eval("SUPPLIERS.some(s=>s.name==='Tudor')"), 'and Tudor is added to those too');
    w.close();
  }

  console.log('\n--- bigger small text ---');

  {
    const html = fs.readFileSync(process.env.JOBBOOK || ['public/index.html', 'index.html', '../public/index.html'].find(p => fs.existsSync(p)), 'utf8');
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const p0 = css.indexOf('@media print');
    let k = css.indexOf('{', p0), depth = 0;
    for (; ; k++) { if (css[k] === '{') depth++; else if (css[k] === '}' && --depth === 0) break; }
    const screen = css.slice(0, p0) + css.slice(k + 1) + html.slice(html.indexOf('</style>'));
    const sizes = [...screen.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => +m[1]);
    ok(Math.min(...sizes) >= 11.5, 'nothing on screen is smaller than 11.5px (smallest is ' + Math.min(...sizes) + 'px)');
    const rule = sel => (screen.match(new RegExp('(^|[}\\n])' + sel.replace('.', '\\.') + '\\{[^}]*font-size:([\\d.]+)px')) || [])[2];
    ok(+rule('.sub') >= 13.5, 'helper text is at least 13.5px (' + rule('.sub') + 'px)');
    ok(+rule('label') >= 12.5, 'field labels are at least 12.5px (' + rule('label') + 'px)');
    ok(/body\{[^}]*font-size:15px/.test(screen), 'and the main text size is unchanged');
    ok(css.slice(p0, k + 1).indexOf('font-size') >= 0, 'the print layout still has its own sizes');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

const { boot, settle, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const RULE = '----------------------------';
const SIGN = "Many thanks,\nKeith\nWilson's Glass";
const CALL = 'call us on 01708 224215';
const DAY = new Date('2030-01-15T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const metre = (o = {}) => Object.assign({ pid: 'c4mm', w: '1000', h: '1000', q: '1', addons: [], src: 'cut', cut: false }, o);
const unit = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '2', addons: [], src: 'order', supplier: 'Firmans',
                                         ostate: 'ordered', dgThick: '24 mm (4-16-4)', dgBar: 'Black' }, o);

/* open the email for a job, optionally switching the kind, and return
   the subject, the opening and the whole email */
async function email(seed, kind) {
  const { w } = await boot({ seed: [seed] });
  await click(w, q(w, '[data-f="all"]'));
  if (!q(w, '[data-mail]')) await click(w, q(w, '[data-f="closed"]'));
  await click(w, q(w, '[data-mail]'));
  if (kind) await click(w, q(w, '[data-k="' + kind + '"]'));
  const out = { subj: $(w, 'mSubj').value, opening: $(w, 'mMsg').value, body: $(w, 'mPrev').textContent, w };
  return out;
}
const same = (got, want, m) => {
  ok(got === want, m);
  if (got !== want) console.log('---- got ----\n' + got + '\n---- wanted ----\n' + want + '\n------');
};

(async () => {
  console.log('\n--- quotes ---');

  {
    const e = await email(job({ no: 1771, name: 'Brian Okafor', items: [metre()] }));
    same(e.body, [
      'Hello Brian,', "Here is your quote, reference 1771:",
      'Type of glass: Clear float glass\nSize: 1000 x 1000mm\nThickness: 4 mm\nPrice: £48.63', RULE,
      'Before VAT: £48.63\nVAT (20%): £9.73\nTotal: £58.36', RULE,
      "If you'd like to go ahead, just reply to this email or " + CALL + '. The quote is valid for 30 days.',
      SIGN].join('\n\n'), 'a quote reads exactly as laid out');
    ok(e.subj === "Quote 1771 from Wilson's Glass", 'with the usual subject');
    ok(e.opening === 'Hello Brian,\n\nHere is your quote, reference 1771:', 'and only the opening is left to edit');
    e.w.eval("PRICES['c4mm']=60"); await click(e.w, $(e.w, 'mBack')); await click(e.w, q(e.w, '[data-mail]'));
    ok(/Price: £48\.63/.test($(e.w, 'mPrev').textContent), 'it shows the price the job was quoted at, not today\'s');
    await type(e.w, $(e.w, 'mMsg'), 'Hello Brian,\n\nAs promised on the phone, here is the price:');
    ok(/^Hello Brian,\n\nAs promised on the phone, here is the price:\n\nType of glass/.test($(e.w, 'mPrev').textContent),
       'whatever is typed in the opening goes at the top');
    e.w.close();
  }

  {
    const e = await email(job({ no: 1773, name: 'Pauline Doyle', kind: 'maintenance', items: [],
                                extras: [{ label: 'Re-seal bay window', amount: 180 }] }));
    same(e.body, [
      'Hello Pauline,', 'Here is your quote, reference 1773:',
      'Work: Re-seal bay window\nPrice: £180.00', RULE,
      'Before VAT: £180.00\nVAT (20%): £36.00\nTotal: £216.00', RULE,
      "If you'd like to go ahead, just reply to this email or " + CALL + '. The quote is valid for 30 days.',
      SIGN].join('\n\n'), 'a maintenance quote lists the work');
    ok(!/measure up/.test(e.body) && e.subj === "Quote 1773 from Wilson's Glass",
       'and is a quote, not a measuring visit as it used to be');
    e.w.close();
  }

  {
    /* the old code treated any job with no glass as a quote, whatever its stage */
    const e = await email(job({ no: 1773, name: 'Pauline Doyle', kind: 'maintenance', items: [], confirmed: true,
                                status: 'ready', handover: 'fitting', extras: [{ label: 'Re-seal bay window', amount: 180 }] }));
    ok(/^Hello Pauline,\n\nWe are ready to do the work for job 1773:/.test(e.body), 'a confirmed maintenance job opens on the right email');
    ok(e.subj === "Job 1773 from Wilson's Glass" && /Total: £216\.00\nBalance: £216\.00/.test(e.body),
       'with the job subject and what is left to pay');
    e.w.close();
  }

  {
    const e = await email(job({ no: 1775, name: 'Kensington Lettings', trade: true, kind: 'frames', items: [],
      frames: [{ desc: 'White uPVC casement, one opener', w: '1200', h: '900', q: '2', price: 210, arrived: false }] }));
    ok(/^Hello,\n\nHere is your quote, reference 1775:/.test(e.body), 'a business gets plain Hello,');
    ok(e.body.indexOf('Frame: White uPVC casement, one opener\nSize: 1200 x 900mm\nQuantity: 2\nPrice: £420.00\n\n' + RULE) > 0,
       'a frames quote has a block for each frame');
    ok(/Before VAT: £420\.00\nVAT \(20%\): £84\.00\nTotal: £504\.00/.test(e.body), 'with its totals');
    ok(e.subj === "Quote 1775 from Wilson's Glass", 'and is a quote, not a visit');
    e.w.close();
  }

  {
    const e = await email(job({ items: [metre()], noVat: true }));
    ok(/\nTotal: £48\.63\n/.test(e.body) && !/VAT/.test(e.body), 'a no-VAT job never mentions VAT');
    e.w.close();
  }

  {
    const e = await email(job({ items: [metre()], discountPct: 10, cardFee: true }));
    ok(e.body.indexOf('Discount (10%): -£4.86\nBefore VAT: £43.77\nVAT (20%): £8.75\nCard payment (2%): £1.05\nTotal: £53.57') > 0,
       'a discount and the card charge each get a line, in order');
    e.w.close();
  }

  {
    const e = await email(job({ items: [unit({ dgThick: '', dgBar: '', q: '1' })] }));
    ok(/Thickness: to be confirmed\nBar colour: to be confirmed/.test(e.body),
       'a unit still being decided says "to be confirmed" to the customer');
    e.w.close();
  }

  console.log('\n--- once the order is taken ---');

  const fitted = (o = {}) => job(Object.assign({ no: 1776, name: 'Sandra Pell', confirmed: true, status: 'order',
    handover: 'fitting', addr: '14 Hall Lane, RM14 1AU', items: [unit()], extras: [{ label: 'Fitting', amount: 120 }],
    payments: [{ date: '2030-01-01', amount: 50, method: 'Card' }],
    appts: [{ kind: 'fit', date: '2030-01-15', time: '09:00', mins: 120 }] }, o));

  {
    const e = await email(fitted());
    same(e.body, [
      'Hello Sandra,', 'Thanks for your order. We have booked it in as job 1776:',
      'Type of glass: Double glazed unit (Clear × 4 MM)\nSize: 900 x 600mm\nQuantity: 2\nThickness: 24 mm (4-16-4)\nBar colour: Black\nPrice: £122.21', RULE,
      'Fitting: £120.00\nBefore VAT: £242.21\nVAT (20%): £48.44\nTotal: £290.66\nPaid: £50.00\nBalance: £240.66', RULE,
      'Fitting date: ' + DAY + ' at 09:00\nAddress: 14 Hall Lane, RM14 1AU', RULE,
      'We will be in touch as soon as it is ready. If anything needs changing, reply to this email or ' + CALL + '.',
      SIGN].join('\n\n'), 'an order confirmation reads exactly as laid out');
    ok(e.subj === "Job 1776 from Wilson's Glass", 'with the job subject');
    e.w.close();
  }

  {
    const e = await email(fitted({ status: 'ready' }));
    ok(/^Hello Sandra,\n\nYour glass is ready, job 1776:/.test(e.body), 'the ready email says so');
    ok(/\nSee you then\. Any questions, call us on/.test(e.body), 'and with a fitting booked, ends "See you then"');
    e.w.close();
  }

  {
    const e = await email(job({ no: 1771, name: 'Brian Okafor', confirmed: true, status: 'ready', items: [metre({ cut: true })],
                                payments: [{ date: '2030-01-01', amount: 20, method: 'Cash' }] }));
    ok(/Total: £58\.36\nPaid: £20\.00\nBalance: £38\.36/.test(e.body), 'a collection shows what is left to pay');
    ok(e.body.indexOf("It is ready to collect from the shop at 6 St Mary's Lane, Upminster, Essex. Any questions, " + CALL + '.') > 0,
       'and where to collect it');
    e.w.close();
  }

  {
    const e = await email(job({ no: 1760, name: 'Brian Okafor', confirmed: true, status: 'done', doneAt: '2030-01-02T10:00:00Z',
                                items: [metre({ cut: true })], payments: [{ date: '2030-01-02', amount: 58.36, method: 'Card' }] }));
    ok(/^Hello Brian,\n\nHere is the balance for job 1760:/.test(e.body), 'the balance email says what it is');
    ok(/Paid: £58\.36\nPaid in full/.test(e.body), 'and says when it is paid in full');
    e.w.close();
  }

  console.log('\n--- measuring visits ---');

  {
    const e = await email(job({ no: 1780, name: 'Mrs Pauline Doyle', items: [], needsMeasure: true, addr: '3 Corbets Tey Road',
                                appts: [{ kind: 'measure', date: '2030-01-15', time: '10:00', mins: 30 }] }));
    same(e.body, [
      'Hello Mrs Doyle,', 'Thanks for your enquiry. Here are the details of our visit to measure up:',
      'Measuring date: ' + DAY + ' at 10:00\nAddress: 3 Corbets Tey Road', RULE,
      'Once we have the sizes we will send you a price. Any questions, ' + CALL + '.',
      SIGN].join('\n\n'), 'a booked measuring visit reads exactly as laid out');
    ok(e.subj === "Visit 1780 from Wilson's Glass", 'with the visit subject');
    e.w.close();
  }

  {
    const e = await email(job({ no: 1781, name: 'Mrs Pauline Doyle', items: [], needsMeasure: true }));
    same(e.body, [
      'Hello Mrs Doyle,', 'Thanks for your enquiry. We will be in touch to arrange a time to come and measure up.',
      'Once we have the sizes we will send you a price. Any questions, ' + CALL + '.',
      SIGN].join('\n\n'), 'and one not yet booked says it will be');
    e.w.close();
  }

  console.log('\n--- hello ---');

  for (const [name, trade, want] of [['Brian Okafor', false, 'Hello Brian,'], ['paul', false, 'Hello Paul,'],
                                     ['Mrs Pauline Doyle', false, 'Hello Mrs Doyle,'], ['dr jones', false, 'Hello Dr Jones,'],
                                     ['Mrs', false, 'Hello,'], ['Hall Lane Builders', true, 'Hello,'], ['', false, 'Hello,']]) {
    const { w } = await boot({ seed: [] });
    ok(w.eval('greetingFor(' + JSON.stringify({ name, trade }) + ')') === want,
       (name || '(no name)') + (trade ? ', trade,' : '') + ' gets "' + want + '"');
    w.close();
  }

  console.log('\n--- the same ending everywhere ---');

  {
    const { w } = await boot({ seed: [job({ items: [metre()] })] });
    await click(w, $(w, 'rateBtn'));
    await type(w, $(w, 'fSign'), 'Dave');
    await click(w, $(w, 'saveRates'));
    await click(w, q(w, '[data-mail]'));
    ok(/\n\nMany thanks,\nDave\nWilson's Glass$/.test($(w, 'mPrev').textContent), 'the sign-off name is used for customers too');
    for (const k of ['quote', 'confirm', 'ready', 'balance']) {
      await click(w, q(w, '[data-k="' + k + '"]'));
      const b = $(w, 'mPrev').textContent;
      ok(/\n\nMany thanks,\nDave\nWilson's Glass$/.test(b) && b.split('\n' + RULE + '\n').length >= 3,
         'the ' + k + ' email has its blocks, dashed lines and sign-off');
    }
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

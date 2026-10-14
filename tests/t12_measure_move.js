/* Round 7: measuring, moving a job to any stage, completed stops on the
   full-screen day, and the iPhone zoom.

   Run from the repo root:  node tests/t12_measure_move.js              */
const fs = require('fs');
const { boot, settle, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const TABS = ['book', 'quote', 'pricing', 'order', 'cut', 'ready', 'told', 'invoice', 'closed'];
const tabs = (w, id) => TABS.filter(f => w.eval(`bucket('${f}').some(j=>j.id==='${id}')`)).join(' ');
const card = (w, id) => q(w, `#list [data-move="${id}"]`) && q(w, `#list [data-move="${id}"]`).closest('.job');
const buttons = el => [...el.querySelectorAll('.acts button')].map(b => txt(b)).join(' | ');
const tick = async (w, el, v) => { el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); await settle(w, 3); };
const day = (w, n = 0) => w.eval(`shiftDay(ymd(new Date()),${n})`);
const cutPiece = (o = {}) => Object.assign({ pid: 'c4mm', w: '900', h: '600', q: '1', addons: [], src: 'cut', cut: false }, o);
const orderPiece = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order',
  supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }, o);
const stub = (o = {}) => cutPiece(Object.assign({ w: '1', h: '1' }, o));
async function moveTo(w, id, k) {
  for (const f of ['all', 'closed']) {            /* find the job's card, wherever it now is */
    if (q(w, `#list [data-move="${id}"]`)) break;
    await click(w, q(w, `[data-f="${f}"]`));
  }
  await click(w, q(w, `[data-move="${id}"]`));
  await click(w, q(w, `#moveBody [data-moveto="${k}"]`));
}
const choices = w => qa(w, '#moveBody [data-moveto]').map(b => b.dataset.moveto).join(' ');

(async () => {
  console.log('\n--- booked in to measure, with 1 x 1 in for now ---');
  {
    const { w, server } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Measure Mike');
    await type(w, q(w, '[data-k="w"]'), '1');
    await type(w, q(w, '[data-k="h"]'), '1');
    ok($(w, 'measWrap').style.display === 'none', 'the Measured tick is hidden until the job needs measuring');
    await tick(w, $(w, 'fMeasure'), true);
    ok(w.eval('handover') === 'fitting' && $(w, 'addrWrap').style.display !== 'none',
       'ticking Needs measuring first makes it a fitting, and asks for the address');
    ok($(w, 'measWrap').style.display !== 'none' && !$(w, 'fMeasured').checked, 'the Measured tick appears under it, not ticked');
    await type(w, $(w, 'fAddr'), '5 Elm Road');
    await click(w, $(w, 'saveJob'));
    const id = [...server.rows.keys()][0];
    let j = cur(server, id);
    ok(j.status === 'measure' && j.measuredAt === null && !j.confirmed, 'it saves as To measure, not measured, not confirmed');
    ok(/book the measure in/.test(txt($(w, 'toast'))), 'and says to book the measure in');
    ok(tabs(w, id) === 'book quote', 'it is listed under To be booked in and Quotes');

    await click(w, q(w, '[data-f="quote"]'));
    const c = card(w, id);
    ok(/Mark as measured/.test(buttons(c)) && !/Customer confirmed/.test(buttons(c)),
       'its card offers Mark as measured, and not Customer confirmed yet');
    ok(txt(c.querySelector('.stat')) === 'To measure' && txt(c.querySelector('.src')) === 'To measure',
       'and reads To measure, the glass too');
    ok(/before measuring/.test(txt(c.querySelector('.jobfoot'))) && !/to pay/.test(txt(c.querySelector('.jobfoot'))),
       'its price says it is from before measuring, and nothing shows as owed');

    await click(w, c.querySelector('[data-book]'));
    ok($(w, 'bookSheet').classList.contains('on') && w.eval('bookKind') === 'measure',
       'the measure can be booked without the customer confirming');
    $(w, 'bDate').value = day(w); $(w, 'bTime').value = '10:00';
    await click(w, $(w, 'bSave'));
    ok(cur(server, id).appts.length === 1 && tabs(w, id) === 'quote', 'once it is in the diary it leaves To be booked in');

    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    const stop = () => qa(w, '#dayBody .tl .stop').find(s => /Measure Mike/.test(s.textContent));
    ok(/to measure/.test(txt(stop().querySelector('.sgoing'))) && !/1 × 1/.test(txt(stop())),
       'on the day sheet the glass reads "to measure", not 1 × 1');
    ok(!stop().querySelector('[data-settle]') && !/to collect/.test(txt(stop())), 'and there is no money to collect at a measure');
    let asked = '';
    w.confirm = m => { asked = m; return false; };
    await click(w, stop().querySelector('[data-stopdone]'));
    ok(/1 piece at 1 x 1/.test(asked), 'Mark completed asks first while a piece is still 1 x 1');
    ok(cur(server, id).status === 'measure' && !cur(server, id).appts[0].doneAt, 'and saying no changes nothing');

    w.confirm = m => { asked = m; return true; };
    await click(w, stop().querySelector('[data-open]'));
    await type(w, q(w, '[data-k="w"]'), '900');
    await type(w, q(w, '[data-k="h"]'), '600');
    await click(w, $(w, 'saveJob'));
    ok($(w, 'daySheet').classList.contains('on') && cur(server, id).status === 'measure',
       'filling in the sizes from the day goes back to the day, still To measure');
    asked = '';
    await click(w, stop().querySelector('[data-stopdone]'));
    j = cur(server, id);
    ok(asked === '', 'with the sizes in, Mark completed does not ask');
    ok(j.measuredAt && j.appts[0].doneAt === j.measuredAt, 'the job is marked measured, with the visit');
    ok(j.status === 'quote' && !j.confirmed, 'and is now a quote, still not confirmed');
    ok(tabs(w, id) === 'quote', 'in Quotes, and not on any worklist');
    ok(/still a quote until the customer confirms/.test(txt($(w, 'toast'))), 'the message says so');
    ok(stop().classList.contains('done') && /Measured/.test(txt(stop().querySelector('.kind'))),
       'the stop stays on the day, marked Measured');

    await click(w, $(w, 'closeDay'));
    await click(w, q(w, '[data-f="quote"]'));
    const c2 = card(w, id);
    ok(/Measured on/.test(txt(c2.querySelector('.mstamp'))) && /Customer confirmed/.test(buttons(c2)),
       'its card says when it was measured, and can now be confirmed');
    await click(w, c2.querySelector('[data-conf]'));
    ok(cur(server, id).status === 'cut' && tabs(w, id) === 'book cut',
       'Customer confirmed puts it on To cut, and in To be booked in for the fitting');
    ok(/Now book the fitting/.test(txt($(w, 'toast'))), 'and says to book the fitting');
    w.close();
  }

  console.log('\n--- other ways to mark it measured ---');
  {
    const j = job({ id: 'b', no: 31, name: 'Button Barry', needsMeasure: true, handover: 'fitting', addr: '1 Oak Rd',
                    items: [stub(), stub({ w: '700', h: '500' })],
                    appts: [{ kind: 'measure', date: '2030-03-01', time: '09:00', mins: 30 }] });
    const { w, server } = await boot({ seed: [j] });
    let asked = '';
    w.confirm = m => { asked = m; return true; };
    await click(w, q(w, '[data-measured="b"]'));
    ok(/1 piece at 1 x 1/.test(asked), 'the button on the card asks about 1 x 1 sizes too');
    ok(cur(server, 'b').measuredAt && cur(server, 'b').appts[0].doneAt, 'then marks it measured and completes the visit');
    ok(cur(server, 'b').status === 'quote', 'leaving a quote');
    await click(w, q(w, '#banner [data-undo]'));
    ok(cur(server, 'b').status === 'measure' && !cur(server, 'b').measuredAt, 'Undo puts it back to To measure');
    w.close();
  }
  {
    const j = job({ id: 't', no: 32, name: 'Tick Tina', needsMeasure: true, handover: 'fitting', addr: '2 Oak Rd',
                    items: [stub()], appts: [{ kind: 'measure', date: '2030-03-01', time: '09:00', mins: 30 }] });
    const { w, server } = await boot({ seed: [j] });
    await click(w, q(w, '[data-open="t"]'));
    let asked = '';
    w.confirm = m => { asked = m; return false; };
    await tick(w, $(w, 'fMeasured'), true);
    ok(/Saving marks it as measured/.test(txt($(w, 'measState'))), 'ticking Measured in the job says what saving will do');
    await click(w, $(w, 'saveJob'));
    ok(/at 1 x 1/.test(asked) && $(w, 'jobSheet').classList.contains('on') && !server.log.some(l => /^PUT \/api\/jobs\/t/.test(l)),
       'with 1 x 1 still in it asks, and Cancel leaves the job open and unsaved');
    w.confirm = () => true;
    await type(w, q(w, '[data-k="w"]'), '640');
    await type(w, q(w, '[data-k="h"]'), '480');
    await click(w, $(w, 'saveJob'));
    let t = cur(server, 't');
    ok(t.measuredAt && t.status === 'quote' && t.appts[0].doneAt, 'saving with the tick marks it measured, visit and all');
    ok(/still a quote/.test(txt($(w, 'toast'))), 'and says it is still a quote');
    await click(w, q(w, '[data-open="t"]'));
    ok($(w, 'fMeasured').checked && /Measured on/.test(txt($(w, 'measState'))), 'opening it again shows when it was measured');
    await tick(w, $(w, 'fMeasured'), false);
    await click(w, $(w, 'saveJob'));
    t = cur(server, 't');
    ok(t.status === 'measure' && t.measuredAt === null, 'and unticking it puts it back to To measure');
    w.close();
  }

  console.log('\n--- confirmed before anyone measured it ---');
  {
    const j = job({ id: 'e', no: 33, name: 'Early Eddie', needsMeasure: true, confirmed: true, status: 'measure',
                    handover: 'fitting', items: [orderPiece(), cutPiece()], measuredAt: null });
    const { w, server } = await boot({ seed: [j] });
    ok(!/pricing|cut/.test(tabs(w, 'e')), 'it stays off To be ordered and To cut until it has been measured');
    ok(!q(w, '[data-pc="e|1"]') && !q(w, '[data-ordj="e"]'), 'so nothing on it can be ticked off or ordered');
    w.confirm = () => true;
    await click(w, q(w, '[data-measured="e"]'));
    ok(/pricing/.test(tabs(w, 'e')) && /cut/.test(tabs(w, 'e')) && cur(server, 'e').status === 'pricing',
       'once measured it goes straight onto them');
    w.close();
  }
  {
    const { w: probe } = await boot({ seed: [] });
    const today = day(probe); probe.close();
    const j = job({ id: 'r', no: 34, name: 'Ready Rita', needsMeasure: true, confirmed: true, status: 'measure', kind: 'maintenance',
                    items: [], extras: [{ label: 'Repair', amount: 90 }], handover: 'fitting', measuredAt: null,
                    appts: [{ kind: 'fit', date: today, time: '09:00', mins: 60 }] });
    const { w } = await boot({ seed: [j] });
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    ok(/not been measured/.test(txt(q(w, '.dayalert'))), 'a fitting booked on a job nobody has measured is flagged');
    w.close();
  }

  console.log('\n--- jobs from before this version ---');
  {
    const seed = [
      job({ id: 'm1', no: 41, name: 'Old Measured', needsMeasure: true, items: [cutPiece()],
            appts: [{ kind: 'measure', date: '2026-09-01', time: '10:00', mins: 30, doneAt: '2026-09-01T10:30:00Z' }] }),
      job({ id: 'm2', no: 42, name: 'Old Underway', needsMeasure: true, confirmed: true, status: 'pricing', items: [orderPiece()] }),
      job({ id: 'm3', no: 43, name: 'Old Waiting', needsMeasure: true, items: [stub()],
            appts: [{ kind: 'measure', date: '2030-02-02', time: '10:00', mins: 30 }] }),
      job({ id: 'm5', no: 46, name: 'Old Sized', needsMeasure: true, items: [cutPiece()] }),
      job({ id: 'm7', no: 48, name: 'Old Past Visit', needsMeasure: true, items: [cutPiece()],
            appts: [{ kind: 'measure', date: '2026-09-03', time: '10:00', mins: 30 }] }),
      job({ id: 'm8', no: 49, name: 'Old Booked Again', needsMeasure: true, confirmed: true, status: 'pricing',
            items: [orderPiece()], appts: [{ kind: 'measure', date: '2030-02-04', time: '10:00', mins: 30 }] }),
      job({ id: 'm9', no: 50, name: 'Old Confirmed Stub', needsMeasure: true, confirmed: true, status: 'pricing',
            items: [orderPiece({ w: '1', h: '1' })] }),
      job({ id: 'm6', no: 47, name: 'Old Visit Due', needsMeasure: true, items: [cutPiece()],
            appts: [{ kind: 'measure', date: '2030-02-03', time: '10:00', mins: 30 }] }),
      job({ id: 'm4', no: 44, name: 'Old No Sizes', needsMeasure: true, items: [],
            appts: [{ kind: 'measure', date: '2026-09-02', time: '10:00', mins: 30, doneAt: '2026-09-02T10:30:00Z' }] })
    ];
    const { w } = await boot({ seed });
    const st = id => w.eval(`JOBS.find(j=>j.id==='${id}').status`);
    ok(st('m1') === 'quote' && w.eval("JOBS.find(j=>j.id==='m1').measuredAt") === '2026-09-01T10:30:00Z',
       'a quote whose measure was marked completed counts as measured');
    ok(st('m2') === 'pricing' && /pricing/.test(tabs(w, 'm2')), 'a confirmed job that was measured before stays where it was');
    ok(st('m3') === 'measure', 'a quote with 1 x 1 in, waiting for its measure visit, is To measure');
    ok(st('m5') === 'quote' && !card(w, 'm5').querySelector('.mstamp'),
       'a quote with its real sizes in and no visit to come is taken as measured, without making up a date');
    ok(st('m6') === 'measure', 'one with its measure visit still booked is To measure');
    ok(st('m7') === 'quote', 'a visit in the past that nobody marked completed is taken as done');
    ok(st('m8') === 'pricing' && /pricing/.test(tabs(w, 'm8')), 'a confirmed job with real sizes stays put, whatever is in the diary');
    ok(st('m9') === 'measure' && !/pricing/.test(tabs(w, 'm9')),
       'but a confirmed job still at 1 x 1 is taken off To be ordered until it is measured');
    ok(st('m4') === 'measure' && /Measured/.test(txt(card(w, 'm4').querySelector('.stat'))) && !/book/.test(tabs(w, 'm4')),
       'one measured with no sizes put in yet reads Measured, and is not sent back to be booked');
    w.close();
  }

  console.log('\n--- the email for a job still to measure ---');
  {
    const j = job({ id: 'v', no: 45, name: 'Visit Vera', needsMeasure: true, items: [stub()], addr: '9 Ash Road',
                    appts: [{ kind: 'measure', date: '2030-01-15', time: '10:00', mins: 30 }] });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-mail="v"]'));
    const body = $(w, 'mPrev').textContent;
    ok(/^Visit 45/.test($(w, 'mSubj').value) && /measure up/.test(body), 'it is the measuring visit email');
    ok(!/1 x 1/.test(body) && !/Price:/.test(body), 'not a quote for a 1 x 1 piece');
    ok(q(w, '#mKind [data-k="quote"]').classList.contains('on'), 'and it opens on the quote stage, not as an order');
    w.close();
  }

  console.log('\n--- moving a job ---');
  {
    const onOrder = job({ id: 'o', no: 51, name: 'Ordered Oscar', confirmed: true, status: 'order',
      items: [orderPiece({ ostate: 'ordered', orderedAt: '2026-10-10T09:00:00Z' }), cutPiece({ cut: true })] });
    const { w, server } = await boot({ seed: [onOrder] });
    await click(w, q(w, '[data-move="o"]'));
    ok($(w, 'moveSheet').classList.contains('on') && /Move job 51/.test(txt($(w, 'moveTitle'))), 'Move opens a sheet for the job');
    ok(choices(w) === 'measure quote pricing order cut ready done lost', 'listing every stage it can go to');
    const nowB = q(w, '#moveBody .mv.now');
    ok(nowB && nowB.dataset.moveto === 'order' && /Now/.test(txt(nowB)), 'with where it is now marked');
    await click(w, nowB);
    ok($(w, 'moveSheet').classList.contains('on') && cur(server, 'o').status === 'order', 'pressing that does nothing');

    await click(w, q(w, '#moveBody [data-moveto="quote"]'));
    let o = cur(server, 'o');
    ok(o.status === 'quote' && !o.confirmed, 'on order by mistake, it can go back to being a quote');
    ok(o.items[0].ostate === 'toprice' && !o.items[0].orderedAt && !o.items[1].cut,
       'which takes the glass off order and unticks the cutting');
    ok(tabs(w, 'o') === 'quote' && /moved to Quotes/.test(txt($(w, 'toast'))), 'it is in Quotes and says so');
    await click(w, q(w, '#banner [data-undo]'));
    o = cur(server, 'o');
    ok(o.status === 'order' && o.items[0].orderedAt === '2026-10-10T09:00:00Z' && o.items[1].cut, 'Undo puts it all back');
    w.close();
  }
  {
    const fresh = job({ id: 'f', no: 52, name: 'Forward Fred', handover: 'collection',
      items: [orderPiece(), cutPiece()] });
    const { w, server } = await boot({ seed: [fresh] });
    await moveTo(w, 'f', 'pricing');
    let f = cur(server, 'f');
    ok(f.status === 'pricing' && f.confirmed && /pricing/.test(tabs(w, 'f')), 'forwards to To be ordered confirms it');
    await moveTo(w, 'f', 'order');
    f = cur(server, 'f');
    ok(f.status === 'order' && f.items[0].ostate === 'ordered' && f.items[0].orderedAt, 'to On order stamps the glass as ordered');
    await moveTo(w, 'f', 'cut');
    f = cur(server, 'f');
    ok(f.status === 'cut' && f.items[0].ostate === 'arrived' && !f.items[1].cut, 'to To cut books the glass in');
    await moveTo(w, 'f', 'ready');
    f = cur(server, 'f');
    ok(f.status === 'ready' && f.items[1].cut && f.readyAt && /told/.test(tabs(w, 'f')), 'to Ready ticks the cutting, and waits to be told');
    await moveTo(w, 'f', 'done');
    f = cur(server, 'f');
    ok(f.status === 'done' && f.doneAt && tabs(w, 'f') === 'closed', 'to Closed closes it off');
    await click(w, q(w, '[data-f="closed"]'));
    await moveTo(w, 'f', 'ready');
    f = cur(server, 'f');
    ok(f.status === 'ready' && !f.doneAt, 'and a closed job can be opened again');

    await moveTo(w, 'f', 'cut');
    f = cur(server, 'f');
    ok(f.status === 'cut' && f.items[0].ostate === 'arrived' && !f.items[1].cut,
       'back from Ready to To cut unticks the cutting, and leaves the glass in');
    w.eval("(()=>{const j=JOBS.find(x=>x.id==='f'); j.items[1].cut=true; })()");
    await moveTo(w, 'f', 'order');
    f = cur(server, 'f');
    ok(f.status === 'order' && f.items[0].ostate === 'ordered' && f.items[1].cut,
       'back from To cut to On order puts the glass back on order, and leaves cut glass cut');
    w.close();
  }
  {
    const shopOnly = job({ id: 's', no: 53, name: 'Shop Cut', confirmed: true, status: 'cut', items: [cutPiece()] });
    const maint = job({ id: 'm', no: 54, name: 'Maintenance Mo', confirmed: true, status: 'ready', kind: 'maintenance',
                        items: [], extras: [{ label: 'Repair', amount: 90 }] });
    const bare = job({ id: 'n', no: 55, name: 'No Sizes', needsMeasure: true, items: [] });
    const { w } = await boot({ seed: [shopOnly, maint, bare] });
    await click(w, q(w, '[data-move="s"]'));
    ok(choices(w) === 'measure quote cut ready done lost', 'glass we cut ourselves has no ordering stages');
    await click(w, $(w, 'closeMove'));
    await click(w, q(w, '[data-move="m"]'));
    ok(choices(w) === 'measure quote ready done lost', 'maintenance has no glass stages at all');
    await click(w, $(w, 'closeMove'));
    await click(w, q(w, '[data-move="n"]'));
    ok(choices(w) === 'measure lost' && /no sizes/.test(txt($(w, 'moveBody'))),
       'a job with no sizes can only be measured or closed off, and says why');
    w.close();
  }
  {
    const fit = job({ id: 'g', no: 56, name: 'Goes Back', confirmed: true, status: 'ready', handover: 'fitting',
      called: true, toldHow: 'phone', items: [cutPiece({ cut: true })],
      appts: [{ kind: 'fit', date: '2030-04-04', time: '09:00', mins: 60 }] });
    const { w, server } = await boot({ seed: [fit] });
    await moveTo(w, 'g', 'measure');
    const g = cur(server, 'g');
    ok(g.status === 'measure' && g.needsMeasure && g.measuredAt === null && !g.confirmed,
       'it can go right back to To measure');
    ok(/book/.test(tabs(w, 'g')) && w.eval("neededAppts(JOBS.find(j=>j.id==='g')).join()") === 'measure',
       'needing a measure booking again');
    ok(/still booked in the diary/.test(txt($(w, 'toast'))), 'and says the fitting is still in the diary');
    ok(!g.called, 'it will need telling again once it is ready');
    w.close();
  }
  {
    const told = job({ id: 'k', no: 57, name: 'Told Too Soon', confirmed: true, status: 'ready', called: true, toldHow: 'phone',
      needsInvoice: true, invoicedAt: '2026-10-11T09:00:00Z', items: [cutPiece({ cut: true })] });
    const plain = job({ id: 'p', no: 58, name: 'Plain Pat', confirmed: true, status: 'ready', items: [cutPiece({ cut: true })] });
    const { w, server } = await boot({ seed: [told, plain] });
    await click(w, q(w, '[data-move="k"]'));
    ok(!!q(w, '[data-moveside="untold"]') && !!q(w, '[data-moveside="uninv"]'), 'the sheet also offers the other lists');
    await click(w, q(w, '[data-moveside="untold"]'));
    ok(!cur(server, 'k').called && /told/.test(tabs(w, 'k')), 'Back on Not told');
    await click(w, q(w, '[data-move="k"]'));
    await click(w, q(w, '[data-moveside="uninv"]'));
    ok(!cur(server, 'k').invoicedAt && /invoice/.test(tabs(w, 'k')), 'Back on To invoice');
    await click(w, q(w, '[data-move="p"]'));
    await click(w, q(w, '[data-moveside="inv"]'));
    ok(cur(server, 'p').needsInvoice && /invoice/.test(tabs(w, 'p')), 'and Add to To invoice');
    w.close();
  }

  console.log('\n--- a finished stop on the day sheet ---');
  {
    const { w: probe } = await boot({ seed: [] });
    const today = day(probe); probe.close();
    const seed = [
      job({ id: 'x', no: 61, name: 'First Fit', confirmed: true, status: 'ready', kind: 'maintenance', items: [],
            extras: [{ label: 'Repair', amount: 100 }], handover: 'fitting', addr: '1 First St', phone: '07700900001',
            payments: [{ date: today, amount: 120, method: 'Cash' }], appts: [{ kind: 'fit', date: today, time: '09:00', mins: 60 }] }),
      job({ id: 'y', no: 62, name: 'Second Fit', confirmed: true, status: 'ready', kind: 'maintenance', items: [],
            extras: [{ label: 'Repair', amount: 100 }], handover: 'fitting', addr: '2 Second St',
            appts: [{ kind: 'fit', date: today, time: '13:00', mins: 60 }] })
    ];
    const { w, server } = await boot({ seed });
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    const first = () => qa(w, '#dayBody .tl .stop')[0];
    await click(w, first().querySelector('[data-stopdone]'));
    ok(cur(server, 'x').status === 'done', 'completing a fitting closes the job, as before');
    ok(first().classList.contains('done') && /First Fit/.test(txt(first())), 'and its stop stays first on the sheet, greyed out');
    ok(/Fitted/.test(txt(first().querySelector('.kind'))) && /Fit completed at \d\d:\d\d/.test(txt(first().querySelector('.sdonewhen'))),
       'saying Fitted, and when');
    ok(!first().querySelector('.sreach') && !first().querySelector('[data-stopdone]') && !!first().querySelector('[data-open]'),
       'cut down to who and where, with Open job for the rest');
    const route = q(w, '#dayBody .dayacts a.maplink').getAttribute('href');
    ok(route.indexOf(encodeURIComponent('2 Second St')) > 0 && route.indexOf(encodeURIComponent('1 First St')) < 0,
       'the route only goes where there is still something to do');
    w.close();
  }

  console.log('\n--- no zooming in on an iPhone ---');
  {
    const CANDIDATES = [process.env.JOBBOOK, 'public/index.html', 'index.html', '../public/index.html'];
    const html = fs.readFileSync(CANDIDATES.filter(Boolean).find(p => fs.existsSync(p)), 'utf8');
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const touch = (css.match(/@media \(hover:none\),\(pointer:coarse\)\{([\s\S]*?)\n\}/) || [])[1] || '';
    ok(/(^|\n)\s*input,select,textarea\{font-size:16px!important\}/.test(touch),
       'on a touch screen every box you type in is at least 16px, the size an iPhone stops zooming at');
    ok(/\.dims \.inp\{font-size:17px!important\}/.test(touch), 'the size boxes stay at their bigger 17px');
    ok(/\*\{touch-action:manipulation\}/.test(css), 'a quick double tap no longer zooms');
    ok(/-webkit-text-size-adjust:100%/.test(css), 'and turning the phone does not blow the text up');
    const vp = (html.match(/<meta name="viewport" content="([^"]*)"/) || [])[1] || '';
    ok(/width=device-width/.test(vp) && !/maximum-scale|user-scalable/.test(vp), 'pinching to zoom on purpose still works');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

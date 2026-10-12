const { boot, settle, makeServer, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const key = async (w, k) => {
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  await settle(w, 4);
};
const today = w => w.eval('ymd(new Date())');
const toOrder = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order',
  supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }, o);

(async () => {
  console.log('\n--- jobs to be booked in ---');

  {
    const measure = job({ id: 'm', no: 1, name: 'Needs measuring', items: [], needsMeasure: true, wanted: '2030-05-01' });
    const fit = job({ id: 'f', no: 2, name: 'Needs fitting', confirmed: true, kind: 'maintenance', items: [],
      extras: [{ label: 'Repair', amount: 90 }], handover: 'fitting', wanted: '2030-01-01' });
    const del = job({ id: 'd', no: 3, name: 'Needs delivering', confirmed: true, handover: 'delivery',
      items: [{ pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'cut', cut: true }] });
    const booked = job({ id: 'b', no: 4, name: 'Already booked', confirmed: true, kind: 'maintenance', items: [],
      extras: [{ label: 'Repair', amount: 90 }], handover: 'fitting', appts: [{ kind: 'fit', date: '2030-02-02', time: '09:00', mins: 60 }] });
    const collect = job({ id: 'c', no: 5, name: 'Collecting', confirmed: true });
    const { w } = await boot({ seed: [measure, fit, del, booked, collect] });

    const chip = q(w, '[data-f="book"]');
    ok(!!chip && /To be booked in/.test(txt(chip)), 'the tab is called To be booked in');
    ok(!q(w, '[data-f="measure"]'), 'and the old To measure tab has gone');
    ok(/3$/.test(txt(chip)), 'it counts the three jobs that need a slot');

    await click(w, chip);
    const names = qa(w, '.job h3').map(txt).join('|');
    ok(/Needs measuring/.test(names) && /Needs fitting/.test(names) && /Needs delivering/.test(names),
       'measuring, fitting and delivery all show up');
    ok(!/Already booked/.test(names), 'a job already in the diary does not');
    ok(!/Collecting/.test(names), 'nor does one being collected from the shop');
    ok(/^Needs fitting/.test(txt(q(w, '.job h3'))), 'the soonest wanted-by comes first');
    ok(qa(w, '.job [data-book]').length === 3, 'each one can be booked from here');
    await click(w, q(w, '.job [data-book]'));
    ok($(w, 'bookSheet').classList.contains('on'), 'and Book opens the diary booking');
    w.close();
  }

  {
    const { w } = await boot({ seed: [job({ confirmed: true })] });
    await click(w, q(w, '[data-f="book"]'));
    ok(/Everything is booked in/.test(txt($(w, 'list'))), 'with nothing waiting it says so');
    w.close();
  }

  console.log('\n--- photos open inside the app ---');

  {
    const server = makeServer();
    ['p1', 'p2'].forEach((id, i) => server.photos.set(id, { id, job_id: 'j1', name: 'photo' + (i + 1) + '.jpg',
      mime: 'image/jpeg', bytes: '/9j/AAAA' }));
    const { w } = await boot({ server, seed: [job({ photos: [{ id: 'p1', name: 'photo1.jpg' }, { id: 'p2', name: 'photo2.jpg' }] })] });
    await settle(w, 6);

    await click(w, q(w, '[data-jph="p2"]'));
    ok($(w, 'lightbox').classList.contains('on'), 'tapping a photo opens the viewer');
    ok(!(w._opened || []).length, 'without leaving the app');
    ok(/Photo 2 of 2/.test(txt($(w, 'lbCount'))), 'at the photo that was tapped');
    ok(!!$(w, 'lbClose') && /Close/.test(txt($(w, 'lbClose'))), 'with a Close button');

    await click(w, $(w, 'lbNext'));
    ok(/Photo 1 of 2/.test(txt($(w, 'lbCount'))), 'the arrows move between photos');
    await click(w, $(w, 'lbClose'));
    ok(!$(w, 'lightbox').classList.contains('on'), 'Close shuts it');
    ok(!w.document.body.classList.contains('lbopen'), 'and the page scrolls again');

    await click(w, q(w, '[data-jph="p1"]'));
    await click(w, $(w, 'lbStage'));
    ok(!$(w, 'lightbox').classList.contains('on'), 'tapping the dark area around it shuts it');

    await click(w, q(w, '[data-jph="p1"]'));
    w.dispatchEvent(new w.PopStateEvent('popstate', { state: null }));
    await settle(w, 3);
    ok(!$(w, 'lightbox').classList.contains('on'), "the phone's back gesture shuts it");

    await click(w, q(w, '[data-open]'));
    await settle(w, 6);
    await click(w, q(w, '[data-phview="0"]'));
    ok($(w, 'lightbox').classList.contains('on'), 'photos on the job sheet open the same way');
    await key(w, 'Escape');
    ok(!$(w, 'lightbox').classList.contains('on'), 'Escape shuts the photo');
    ok($(w, 'jobSheet').classList.contains('on'), 'but leaves the job sheet open behind it');
    w.close();
  }

  console.log('\n--- drafts ---');

  {
    const { w, server } = await boot({ seed: [] });
    ok(!!$(w, 'draftsBtn'), 'there is a Drafts button');
    ok($(w, 'newBtn').nextElementSibling === $(w, 'draftsBtn'), 'right next to New job');
    ok(txt($(w, 'draftCount')) === '', 'with no count when there are none');

    await click(w, $(w, 'newBtn'));
    await click(w, $(w, 'closeJob'));
    ok(txt($(w, 'draftCount')) === '', 'opening and closing a blank job keeps nothing');

    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Half-done Harry');
    await type(w, $(w, 'fPhone'), '07700900111');
    await type(w, q(w, '[data-k="w"]'), '750');
    await click(w, $(w, 'closeJob'));
    ok(txt($(w, 'draftCount')) === '1', 'closing a job without saving keeps it as a draft');
    ok(server.rows.size === 0, 'and nothing reaches the shared job book');

    await click(w, $(w, 'draftsBtn'));
    ok(/New job — Half-done Harry/.test(txt($(w, 'draftBody'))), 'the Drafts page lists it');
    await click(w, q(w, '[data-dopen]'));
    ok($(w, 'jobSheet').classList.contains('on'), 'opening it goes straight back into the job');
    ok($(w, 'fName').value === 'Half-done Harry', 'with the name');
    ok(q(w, '[data-k="w"]').value === '750', 'and the sizes typed so far');

    await type(w, q(w, '[data-k="h"]'), '500');
    await click(w, $(w, 'saveJob'));
    ok(server.rows.size === 1, 'finishing it saves a real job');
    ok(txt($(w, 'draftCount')) === '', 'and the draft goes once it is saved');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job({ note: 'original note' })] });
    await click(w, q(w, '[data-open]'));
    await click(w, $(w, 'closeJob'));
    ok(txt($(w, 'draftCount')) === '', 'opening a job and closing it unchanged keeps no draft');

    await click(w, q(w, '[data-open]'));
    await type(w, $(w, 'fNote'), 'changed but not saved');
    await key(w, 'Escape');
    ok(txt($(w, 'draftCount')) === '1', 'changing a saved job and leaving keeps the changes');
    ok(cur(server, 'j1').note === 'original note', 'without touching the saved job');

    await click(w, q(w, '[data-open]'));
    ok($(w, 'draftBar').classList.contains('on'), 'reopening the job offers the unsaved changes');
    ok($(w, 'fNote').value === 'original note', 'but shows the saved version until asked');
    await click(w, $(w, 'closeJob'));
    ok(txt($(w, 'draftCount')) === '1', 'closing it again does not throw the draft away');

    await click(w, q(w, '[data-open]'));
    await click(w, q(w, '[data-dbrestore]'));
    ok($(w, 'fNote').value === 'changed but not saved', 'Restore brings the changes back');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').note === 'changed but not saved', 'and they save');
    ok(txt($(w, 'draftCount')) === '', 'clearing the draft');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    await type(w, $(w, 'fNote'), 'my edit');
    await click(w, $(w, 'closeJob'));
    /* somebody saves the same job on another machine */
    const row = server.rows.get('j1'); row.version += 1; w.eval('JOBS[0]._v += 1');
    await click(w, $(w, 'draftsBtn'));
    ok(/changed since/.test(txt($(w, 'draftBody'))), 'a draft warns when the job was changed elsewhere since');
    await click(w, q(w, '[data-ddrop]'));
    ok(txt($(w, 'draftCount')) === '', 'and a draft can be discarded');
    ok(/No drafts/.test(txt($(w, 'draftBody'))), 'leaving the page empty');
    w.close();
  }

  {
    const { w } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Battery died');
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    Object.defineProperty(w.document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    const stored = JSON.parse(w.localStorage.getItem('wg-drafts-v1') || '{}');
    ok(Object.values(stored).some(d => d.form.name === 'Battery died'),
       'the draft is written the moment the phone puts the app away');
    w.close();
  }

  console.log('\n--- the money tab and costs are gone ---');

  {
    const { w } = await boot({ seed: [job({ costs: [{ label: 'Fitter', amount: 40 }],
      items: [{ pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'cut', cost: 3 }] })] });
    ok(!q(w, '[data-f="money"]'), 'no Money tab');
    ok(!/profit/i.test(txt(q(w, '.job'))), 'no profit on the job card');
    await click(w, q(w, '[data-open]'));
    ok(!/What it costs us/.test(txt($(w, 'jobSheet'))), 'no What it costs us section');
    ok(!/Profit/.test(txt($(w, 'calcSplit'))), 'and no profit on the price panel');
    await click(w, $(w, 'closeJob'));
    await click(w, $(w, 'rateBtn'));
    ok(!q(w, '[data-p^="c:"]') && !$(w, 'ohTbl') && !$(w, 'fCutPct'), 'the price list asks nothing about costs');
    const csv = w.eval('jobsCSV()').split('\r\n')[0];
    ok(!/Profit|Our cost|Margin/.test(csv), 'and the spreadsheet has no profit columns');
    ok(w.eval('JSON.stringify(JOBS[0].costs)').indexOf('Fitter') > 0, 'old cost lines are left in the record, not deleted');
    w.close();
  }

  console.log('\n--- glass to be ordered ---');

  {
    const j = job({ confirmed: true, status: 'pricing', items: [toOrder()] });
    const { w, server } = await boot({ seed: [j] });
    ok(/To be ordered/.test(txt(q(w, '[data-f="pricing"]'))), 'the tab is called To be ordered');
    ok(/To be ordered/.test(txt(q(w, '.job .stat'))), 'and so is the job');
    const btn = q(w, '.job [data-ordj]');
    ok(!!btn && /Mark as ordered/.test(txt(btn)), 'the orange button on the live tab says Mark as ordered');
    ok(btn.classList.contains('warn'), 'and is the orange one');
    ok(!q(w, '.job [data-arr]'), 'it no longer claims the glass was delivered');

    await click(w, btn);
    const it = cur(server, 'j1').items[0];
    ok(it.ostate === 'ordered', 'pressing it puts the glass on order');
    ok(it.orderedAt && it.orderedAt.slice(0, 10) === today(w), 'dated today');
    ok(cur(server, 'j1').status === 'order', 'and moves the job on');
    const stamp = txt(q(w, '.job .ostamp'));
    const want = w.eval("new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})");
    ok(stamp === 'Glass was ordered on ' + want, 'the glass is stamped "Glass was ordered on" today');
    ok(!!q(w, '.job [data-arr]'), 'and only now is there a delivered button');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').items[0].ostate === 'toprice', 'which can be undone');
    w.close();
  }

  {
    const j = job({ confirmed: true, status: 'pricing', items: [toOrder(), toOrder({ w: '500', h: '400' })] });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="pricing"]'));
    ok(/Glass to be ordered/.test(txt(q(w, '.wshead h2'))), 'the list is headed Glass to be ordered');
    ok(!q(w, '.costin'), 'with no price boxes');
    ok(qa(w, '[data-mko]').every(b => /Mark as ordered/.test(txt(b))), 'each piece has Mark as ordered');
    const em = q(w, '[data-po]');
    ok(/Email Firmans to order/.test(txt(em)), 'and the email button is for ordering');
    await click(w, em);
    const body = $(w, 'mPrev').textContent;
    ok(/^Hello,\n\nI'd like to order the following please:\n/.test(body) && /Many thanks,\nKeith\nWilson's Glass$/.test(body),
       'the email is a plain order: hello, the glass, thanks');
    ok(/\nReference: Dave\n/.test(body) && !/job \d|ORDER —/.test(body), 'referenced by the customer, not a job number');
    ok(!/price|quoted|Agreed|Order total/i.test(body), 'with nothing about prices in it');
    ok(/Mark these as ordered/.test(txt($(w, 'mTold'))), 'and the button underneath marks them ordered');
    w.close();
  }

  {
    /* one Firmans piece ordered, one not: "Firmans delivered" must only
       book in the one that was actually ordered */
    const j = job({ confirmed: true, status: 'order',
      items: [toOrder({ ostate: 'ordered', orderedAt: '2030-01-01T09:00:00Z' }), toOrder({ w: '500', h: '400' })] });
    const { w, server } = await boot({ seed: [j] });
    await click(w, q(w, '.job [data-arr]'));
    const it = cur(server, 'j1').items;
    ok(it[0].ostate === 'arrived', 'delivered books in the piece that was ordered');
    ok(it[1].ostate === 'toprice', 'and leaves the one nobody ordered alone');
    w.close();
  }

  {
    const j = job({ confirmed: true, status: 'order',
      items: [toOrder({ ostate: 'ordered', orderedAt: '2030-01-01T09:00:00Z' }), toOrder({ w: '500', h: '400' })] });
    const { w, server } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="order"]'));
    await click(w, q(w, '[data-arrall]'));
    const it = cur(server, 'j1').items;
    ok(it[0].ostate === 'arrived' && it[1].ostate === 'toprice', 'and so does Mark all delivered');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

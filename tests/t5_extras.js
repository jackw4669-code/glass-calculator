const { boot, settle, $, q, qa, click, type, choose, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const near = (a, b, t = 0.005) => Math.abs(a - b) < t;
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
const tick = async (w, el, on) => { el.checked = on;
  el.dispatchEvent(new w.Event('change', { bubbles: true })); await settle(w, 3); };

/* canvas does not exist in jsdom, so the shrink step is replaced with
   something that returns a tiny fixed jpeg */
const TINY = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////'
           + '////////////////////////////////////////////////2wBDAf//////////////'
           + '//////////////////////////////////////////////wAARCAABAAEDASIA';
const stubShrink = w => w.eval(
  "shrink = f => Promise.resolve({data:" + JSON.stringify(TINY) + ",w:1200,h:900});");

const addPhoto = async (w, name) => {
  const inp = $(w, 'photoIn');
  Object.defineProperty(inp, 'files', { configurable: true, value: [{ name: name || 'a.jpg' }] });
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  await settle(w, 6);
};

(async () => {
  console.log('\n--- notes that have to be read ---');

  {
    const j = job({ note: 'Dog in the garden. Ring first.', noteUrgent: true });
    const { w } = await boot({ seed: [j] });
    ok(!!q(w, '.job.urgent'), 'a flagged job is marked on the list');
    const n = q(w, '.note.urgent');
    ok(!!n, 'and the note is shown in the loud style');
    ok(/Read this first/.test(txt(n)), 'with a heading that says so');
    /* jsdom does not resolve custom properties, so this checks the rule
       lands on the element rather than the final pixel colour */
    ok(w.getComputedStyle(q(w, '.job.urgent')).color === 'var(--red)',
       'the job text is set to the red');
    ok(w.getComputedStyle(q(w, '.job.urgent h3')).color === 'var(--red)',
       'including the customer name');
    ok(w.getComputedStyle(q(w, '.job.urgent .money')).color === 'var(--red)',
       'and the price');
    ok(parseFloat(w.getComputedStyle(n).fontSize) > 15, 'and the note is bigger than normal text');
    w.close();
  }

  {
    const j = job({ note: 'Careful, asbestos panel', noteUrgent: true, confirmed: true,
      handover: 'fitting', appts: [{ kind: 'fit', date: '2026-09-04', time: '09:00', mins: 60 }] });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="diary"]'));
    w.eval("diaryMonth=new Date('2026-09-04'); selDay='2026-09-04'; renderDiary();");
    await settle(w, 3);
    ok(!!q(w, '.dnote.urgent'), 'the diary shows it loudly too');
    ok(!!q(w, '.hasnote.urgent'), 'and the month grid marker turns red');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job({ note: 'Back gate is broken' })] });
    ok(!q(w, '.job.urgent'), 'an ordinary note leaves the job alone');
    await click(w, q(w, '[data-open]'));
    await tick(w, $(w, 'fUrgent'), true);
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').noteUrgent === true, 'the flag saves');
    ok(!!q(w, '.job.urgent'), 'and takes effect straight away');
    w.close();
  }

  console.log('\n--- jobs that are not glass ---');

  {
    const { w, server } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    ok(!!q(w, '[data-kind="glass"].on'), 'a new job starts as glass');
    ok($(w, 'glassWrap').style.display !== 'none', 'with the calculator showing');

    await click(w, q(w, '[data-kind="maintenance"]'));
    ok($(w, 'glassWrap').style.display === 'none', 'maintenance hides the calculator');
    ok($(w, 'framesWrap').style.display === 'none', 'and the frames list');
    ok(txt($(w, 'extrasTitle')) === 'The work', 'and renames Extras to The work');
    ok($(w, 'unitPick').style.display === 'none', 'the unit picker goes away');

    await type(w, $(w, 'fName'), 'Mrs Doyle');
    await click(w, $(w, 'addExtra'));
    await type(w, q(w, '[data-xl="0"]'), 'Re-seal bay window');
    await type(w, q(w, '[data-xa="0"]'), '180');
    await type(w, $(w, 'fNote'), 'Bring the long ladder');
    await click(w, $(w, 'saveJob'));

    const saved = [...server.rows.values()].map(r => JSON.parse(r.data))[0];
    ok(saved.kind === 'maintenance', 'it saves as a maintenance job');
    ok(saved.items.length === 0, 'with no glass on it');
    ok(near(saved._net, 180), 'and the price comes from the work line');
    ok(!/m²/.test(txt(q(w, '.job'))), 'the card does not talk about square metres');
    ok(/Maintenance/.test(txt(q(w, '.job'))), 'it says what sort of job it is');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await click(w, q(w, '[data-kind="frames"]'));
    ok($(w, 'framesWrap').style.display !== 'none', 'frames shows its own list');
    ok(!!q(w, '[data-fwid="0"]'), 'with a width box');
    ok($(w, 'unitPick').style.display !== 'none', 'and keeps the unit picker');

    await type(w, $(w, 'fName'), 'Hall Lane Builders');
    await type(w, q(w, '[data-fdesc="0"]'), 'White uPVC casement, one opener');
    await type(w, q(w, '[data-fwid="0"]'), '1200');
    await type(w, q(w, '[data-fhgt="0"]'), '900');
    await type(w, q(w, '[data-fqty="0"]'), '2');
    await type(w, q(w, '[data-fsup="0"]'), 'Trade Frames');
    await type(w, q(w, '[data-fprice="0"]'), '210');
    ok(/420\.00/.test(txt($(w, 'calcRows'))), 'two at 210 comes to 420 before VAT');
    await click(w, $(w, 'saveJob'));

    const saved = [...server.rows.values()].map(r => JSON.parse(r.data))[0];
    ok(saved.kind === 'frames', 'it saves as a frames job');
    ok(saved.frames.length === 1 && saved.frames[0].price === 210, 'with the price typed in');
    ok(saved.frames[0].w === '1200', 'and the size kept');
    ok(near(saved._net, 420), 'the net is the frames total');

    ok(/1200/.test(txt(q(w, '.job'))), 'the card shows the size');
    const id = saved.id;
    await click(w, q(w, '[data-conf]'));
    ok(cur(server, id).status === 'order', 'confirming puts it on order, not straight to ready');
    await click(w, q(w, '[data-fa]'));
    ok(cur(server, id).frames[0].arrived === true, 'the frame can be booked in');
    ok(cur(server, id).status === 'ready', 'and then it is ready');
    w.close();
  }

  console.log('\n--- jobs with no VAT ---');

  {
    const { w, server } = await boot({ seed: [job()] });
    const withVat = w.eval('jobTotals(JOBS[0]).grand');
    await click(w, q(w, '[data-open]'));
    await tick(w, $(w, 'fNoVat'), true);
    ok(/none on this job/.test(txt($(w, 'calcRows'))), 'the price panel says there is none');
    await click(w, $(w, 'saveJob'));

    const t = JSON.parse(w.eval('JSON.stringify(jobTotals(JOBS[0]))'));
    ok(t.vat === 0, 'no VAT is added');
    ok(near(t.grand, t.net), 'so the total is the net');
    ok(t.grand < withVat, 'and it is less than it was');
    ok(/no VAT/.test(txt(q(w, '.job'))), 'the card says so');

    await click(w, q(w, '[data-mail]'));
    ok(!/VAT/.test($(w, 'mPrev').textContent), 'and the quote does not mention VAT at all');
    w.close();
  }

  console.log('\n--- ordering pieces one at a time ---');

  const twoPieces = () => job({
    confirmed: true, status: 'pricing',
    items: [
      { pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order', supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' },
      { pid: 'dgtuf', w: '500', h: '400', q: '1', addons: [], src: 'order', supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }
    ]
  });

  {
    const { w, server } = await boot({ seed: [twoPieces()] });
    await click(w, q(w, '[data-f="pricing"]'));
    ok(qa(w, '[data-mko]').length === 2, 'each piece waiting on a price can be ordered on its own');
    await click(w, qa(w, '[data-mko]')[0]);
    const j = cur(server, 'j1');
    ok(j.items[0].ostate === 'ordered', 'the first piece goes on order');
    ok(j.items[1].ostate === 'toprice', 'and the second is left where it was');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').items[0].ostate === 'toprice', 'which can be undone');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [twoPieces()] });
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-po]'));
    ok($(w, 'pickCard').style.display !== 'none', 'the email asks which pieces it covers');
    ok(qa(w, '[data-mpick]').length === 2, 'listing both');
    ok(qa(w, '[data-mpick]').every(c => c.checked), 'both ticked to start with');
    ok(/900/.test($(w, 'mPrev').textContent) && /500/.test($(w, 'mPrev').textContent),
       'and both are in the message');

    await tick(w, qa(w, '[data-mpick]')[1], false);
    ok(/900/.test($(w, 'mPrev').textContent), 'unticking one leaves the other in');
    ok(!/500/.test($(w, 'mPrev').textContent), 'and takes it out of the message');
    ok(/1 of 2/.test(txt($(w, 'pickCount'))), 'the count keeps up');

    await click(w, $(w, 'pickNone'));
    ok(/Nothing is ticked/.test(txt($(w, 'mWarn'))), 'ticking nothing is called out');
    await click(w, $(w, 'pickAll'));
    ok(qa(w, '[data-mpick]').every(c => c.checked), 'and Tick all puts them back');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [twoPieces()] });
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-po]'));
    await tick(w, qa(w, '[data-mpick]')[1], false);
    await click(w, $(w, 'mTold'));
    const j = cur(server, 'j1');
    ok(j.items[0].ostate === 'ordered', 'only the ticked piece is marked as ordered');
    ok(j.items[1].ostate === 'toprice', 'the unticked one waits for next time');
    w.close();
  }

  console.log('\n--- photos ---');

  {
    const { w, server } = await boot({ seed: [job()] });
    stubShrink(w);
    await click(w, q(w, '[data-open]'));
    await addPhoto(w, 'opening.jpg');
    ok(qa(w, '.ph').length === 1, 'a photo appears on the job sheet');
    ok(!!q(w, '.ph img'), 'with a thumbnail');
    ok(server.photos.size === 0, 'nothing is uploaded until the job is saved');

    await click(w, $(w, 'saveJob'));
    ok(server.photos.size === 1, 'saving uploads it');
    const saved = cur(server, 'j1');
    ok(saved.photos.length === 1, 'the job records that it has one');
    ok(!saved.photos[0].data, 'but the picture itself is not in the job record');
    ok(String(server.rows.get('j1').data).length < 3000, 'so the job stays small');

    const stored = [...server.photos.values()][0];
    ok(stored.job_id === 'j1', 'the photo knows which job it belongs to');
    ok(stored.id.length === 32, 'and has a long random id for the public link');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job()] });
    stubShrink(w);
    await click(w, q(w, '[data-open]'));
    await addPhoto(w, 'one.jpg');
    await addPhoto(w, 'two.jpg');
    await click(w, $(w, 'saveJob'));
    ok(server.photos.size === 2, 'two photos go up');

    await click(w, q(w, '[data-open]'));
    await settle(w, 6);
    ok(qa(w, '.ph').length === 2, 'and come back when the job is reopened');
    await click(w, qa(w, '[data-phdel]')[0]);
    await click(w, $(w, 'saveJob'));
    ok(server.photos.size === 1, 'removing one deletes it from the database');
    ok(cur(server, 'j1').photos.length === 1, 'and from the job');
    w.close();
  }

  {
    const j = job({ confirmed: true, status: 'pricing',
      items: [{ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order', supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }] });
    const { w, server } = await boot({ seed: [j] });
    stubShrink(w);
    await click(w, q(w, '[data-open]'));
    await addPhoto(w, 'opening.jpg');
    await click(w, $(w, 'saveJob'));
    const id = cur(server, 'j1').photos[0].id;

    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-po]'));
    ok($(w, 'mPrev').textContent.indexOf('/p/' + id) > 0, 'the price request links the photo');
    ok(/\nPhotos\n/.test($(w, 'mPrev').textContent), 'under a heading');
    ok(/cannot carry attachments/.test(txt($(w, 'mWarn'))),
       'and the sheet is straight about attachments not being possible');
    ok($(w, 'mPhotos').style.display !== 'none', 'offering to save them instead');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job()] });
    stubShrink(w);
    await click(w, q(w, '[data-open]'));
    await addPhoto(w, 'private.jpg');
    await tick(w, q(w, '[data-phsend="0"]'), false);
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').photos[0].send === false, 'a photo can be held back from suppliers');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job()] });
    stubShrink(w);
    await click(w, q(w, '[data-open]'));
    await addPhoto(w, 'gone.jpg');
    await click(w, $(w, 'saveJob'));
    ok(server.photos.size === 1, 'photo is there');
    await click(w, q(w, '[data-open]'));
    await click(w, $(w, 'delJob'));
    ok(server.photos.size === 0, 'deleting the job takes its photos with it');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

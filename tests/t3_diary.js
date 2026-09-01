const { boot, settle, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));

const NOTE = 'Ring the bell round the side.\nOld boy is deaf.';

(async () => {
  console.log('\n--- notes in the diary ---');

  {
    const j = job({
      confirmed: true, handover: 'fitting', addr: '12 Corbets Tey Rd', note: NOTE,
      appts: [{ kind: 'fit', date: '2026-09-04', time: '10:00', mins: 60 }]
    });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="diary"]'));
    w.eval("diaryMonth=new Date('2026-09-04'); selDay='2026-09-04'; renderDiary();");
    await settle(w, 3);

    const note = q(w, '.slot .dnote');
    ok(!!note, 'the booked slot shows the note');
    ok(/Ring the bell/.test(note.textContent), 'with the text in it');
    ok(/Old boy is deaf/.test(note.textContent), 'including the second line');
    ok(/^Note/.test(note.textContent.trim()), 'labelled so it reads as a note');
    ok(w.getComputedStyle(note).whiteSpace === 'pre-wrap', 'line breaks are preserved');

    const ev = q(w, '.cell .ev .hasnote');
    ok(!!ev, 'the month grid marks the day as carrying a note');
    ok(/Ring the bell/.test(q(w, '.cell .ev').getAttribute('title') || ''),
       'and the marker carries the note as a tooltip');

    await click(w, q(w, '[data-print="diary"]'));
    await settle(w, 3);
    ok(/Ring the bell/.test(w._printed), 'the printed diary carries the note');
    w.close();
  }

  {
    const j = job({
      confirmed: true, handover: 'delivery', addr: '4 Hall Lane', note: 'Leave with next door',
      appts: []
    });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="diary"]'));
    const un = q(w, '.unsched .dnote');
    ok(!!un, 'a job still needing a slot shows its note as well');
    ok(/next door/.test(un.textContent), 'with the text in it');
    w.close();
  }

  {
    const j = job({ confirmed: true, handover: 'fitting', note: '',
      appts: [{ kind: 'fit', date: '2026-09-04', time: '10:00', mins: 60 }] });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="diary"]'));
    w.eval("diaryMonth=new Date('2026-09-04'); selDay='2026-09-04'; renderDiary();");
    await settle(w, 3);
    ok(!q(w, '.dnote'), 'no empty note box when there is nothing to say');
    ok(!q(w, '.hasnote'), 'and no marker on the grid');
    w.close();
  }

  console.log('\n--- regressions ---');

  /* pricing must be untouched */
  {
    const { w } = await boot({ seed: [job()] });
    const t = w.eval("JSON.stringify(priceItem({pid:'c4mm',w:'500',h:'400',q:'1',addons:[]},'mm'))");
    const r = JSON.parse(t);
    ok(Math.abs(r.area - 0.2) < 1e-9, '0.5 x 0.4 still prices as 0.2 m\u00b2');
    const dg = JSON.parse(w.eval("JSON.stringify(priceItem({pid:'dgclear',w:'400',h:'400',q:'1',addons:[]},'mm'))"));
    ok(Math.abs(dg.area - 0.3) < 1e-9, 'a small unit still lifts to the 0.3 m\u00b2 minimum');
    const grand = w.eval("totals([{pid:'c4mm',w:'1000',h:'1000',q:'1',addons:[]}],[],0,false,'mm').grand");
    ok(Math.abs(grand - 48.63 * 1.2) < 0.005, 'VAT and the list price are unchanged');
    w.close();
  }

  /* records taken before any of this still open and save */
  {
    const old = {
      id: 'old1', no: 1200, name: 'Terry', phone: '07864643640',
      unit: 'mm', items: [{ pid: 's64l', w: '600', h: '400', q: '1' }],
      status: 'cut', cutDone: false, schedDate: '2026-09-10', deliver: true,
      takenAt: '2024-02-02T09:00:00.000Z'
    };
    const { w, server } = await boot({ seed: [old] });
    ok(qa(w, '.job').length === 1, 'an old record still renders');
    ok(!q(w, '.specmiss'), 'and is not nagged about detail it never needed');
    await click(w, q(w, '[data-open]'));
    await click(w, $(w, 'saveJob'));
    const saved = JSON.parse(server.rows.get('old1').data);
    ok(saved.appts.length === 1, 'its old single booking became a diary appointment');
    ok(saved.handover === 'delivery', 'and the old deliver flag became a handover');
    w.close();
  }

  /* the header badge, which was pointing at an element that did not exist */
  {
    const { w } = await boot({ seed: [job()] });
    ok($(w, 'storeTag').textContent === 'Shared', 'the badge reads Shared when D1 answers');
    ok($(w, 'storeTag').className === 'st-shop', 'and is styled as the shared state');
    ok(!qa(w, '.banner').some(b => /cannot be reached/.test(b.textContent)),
       'with no "cannot be reached" warning');
    w.close();
  }

  /* and what happens when Cloudflare is not there */
  {
    const { w } = await boot({ seed: [job({ name: 'Minde' })] });
    w.offline();
    await w.eval('loadAll()');
    await settle(w, 4);
    w.eval('render()');
    await settle(w, 3);
    ok($(w, 'storeTag').textContent === 'Offline copy', 'the badge says the shared book is unreachable');
    ok(/cannot be reached/.test(q(w, '.banner').textContent), 'a banner explains why');
    ok(qa(w, '.job').length === 1, 'the last copy on this machine is still readable');
    ok(/Minde/.test(q(w, '.job').textContent), 'with the right job in it');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

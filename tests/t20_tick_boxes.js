/* The tick boxes on the To cut, To be ordered and On order lists.
   The animations update gave the saving screen's tick the same class name
   as these boxes, and its rule hid them. This checks they show, that
   nothing hides them, and that each one does its job. */
const { boot, $, q, qa, click, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));

const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const puts = (s, id) => s.log.filter(l => l === 'PUT /api/jobs/' + id).length;
const shown = (w, el) => !!el && w.getComputedStyle(el).display !== 'none';

const toCut = () => job({ id: 'j1', no: 1801, name: 'Mrs Okafor', confirmed: true, status: 'cut' });
const toOrder = () => job({
  id: 'j2', no: 1802, name: 'Mr Patel', confirmed: true, status: 'pricing',
  items: [
    { pid: 'c4mm', w: '900', h: '600', q: '1', addons: [], src: 'order', supplier: 'Firmans', ostate: 'toprice', arrived: false, cut: false },
    { pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'order', supplier: 'Firmans', ostate: 'toprice', arrived: false, cut: false }
  ]
});
const onOrder = () => job({
  id: 'j3', no: 1803, name: 'Hall Lane Dental', confirmed: true, status: 'order',
  items: [{ pid: 'c4mm', w: '700', h: '500', q: '1', addons: [], src: 'order', supplier: 'Pilkington', ostate: 'ordered', orderedAt: '2026-11-02T09:00:00.000Z', arrived: false, cut: false }]
});
const all = () => [toCut(), toOrder(), onOrder()];

/* every CSS rule, including those inside @media blocks */
function rules(w) {
  const out = [];
  const walk = list => [...list].forEach(r => {
    if (r.selectorText !== undefined) out.push(r);
    else if (r.cssRules && !r.keyText && r.constructor.name !== 'CSSKeyframesRule') walk(r.cssRules);
  });
  [...w.document.styleSheets].forEach(s => walk(s.cssRules));
  return out;
}

(async () => {
  console.log('\n--- the tick boxes can be seen ---');
  {
    const { w } = await boot({ seed: all() });

    /* no rule anywhere hides something called "tick" */
    const tickRules = rules(w).filter(r => /\.tick(?![\w-])/.test(r.selectorText));
    ok(tickRules.length >= 1, 'the tick boxes have their own styling');
    ok(tickRules.every(r => r.style.display !== 'none' && r.style.visibility !== 'hidden' && r.style.opacity !== '0'),
       'and no rule hides them: ' + tickRules.map(r => r.selectorText).join(' | '));

    await click(w, q(w, '#rail [data-f="cut"]'));
    let t = q(w, '#list .wsrow .tick');
    ok(t && t.dataset.pc === 'j1|0', 'To cut: each piece has a tick box');
    ok(shown(w, t), 'which shows');
    ok(t && w.getComputedStyle(t).width === '36px' && w.getComputedStyle(t).height === '36px', 'at its usual size');
    ok(t && t.title === 'Tick off when it is cut', 'and says what it does');
    ok(t && t.nextElementSibling && t.nextElementSibling.classList.contains('info'), 'on the left of the piece, as before');

    await click(w, q(w, '#rail [data-f="order"]'));
    t = q(w, '#list .wsrow .tick');
    ok(t && t.dataset.pa === 'j3|0', 'On order: each piece has a tick box');
    ok(shown(w, t), 'which shows');
    ok(t && t.title === 'Tick off when it arrives', 'and says what it does');

    await click(w, q(w, '#rail [data-f="pricing"]'));
    const ticks = qa(w, '#list .wsrow .tick');
    ok(ticks.length === 2 && ticks.map(x => x.dataset.pord).join() === 'j2|0,j2|1', 'To be ordered: each piece has a tick box too');
    ok(ticks.every(x => shown(w, x)), 'which shows');
    ok(ticks.every(x => x.title === 'Tick off when it is ordered'), 'and says what it does');
    ok(ticks.every(x => x.nextElementSibling && x.nextElementSibling.classList.contains('info')), 'in the same place as on the other lists');
    const mk = qa(w, '#list .wsrow [data-mko]');
    ok(mk.length === 2 && mk.every(b => /Mark as ordered/.test(b.textContent)), 'and each piece keeps its Mark as ordered button');
    ok(qa(w, '#list .wsrow').every(r => r.querySelectorAll('.tick').length === 1), 'one tick box a piece, no more');
    w.close();
  }

  console.log('\n--- the saving screen keeps its own tick ---');
  {
    const { w } = await boot({ seed: all() });
    const box = $(w, 'savingBox'), st = q(w, '#savingBox .savetick');
    ok(!!st && !q(w, '#savingBox .tick'), 'its tick has a name of its own');
    ok(!shown(w, st), 'and stays hidden while saving');
    box.classList.add('done');
    ok(shown(w, st), 'then shows once saved');
    box.classList.remove('done');
    ok(qa(w, '.tick').every(x => x.tagName === 'BUTTON'), 'nothing else is called "tick"');
    w.close();
  }

  console.log('\n--- To cut: ticking a piece off ---');
  {
    const { w, server } = await boot({ seed: all() });
    await click(w, q(w, '#rail [data-f="cut"]'));
    await click(w, q(w, '#list .tick[data-pc="j1|0"]'));
    ok(cur(server, 'j1').items[0].cut === true, 'the piece is marked cut');
    ok(cur(server, 'j1').status === 'ready', 'and, being the last one, the job is ready');
    ok(puts(server, 'j1') === 1, 'saved once');
    ok(/Piece cut — job 1801/.test($(w, 'toast').textContent), 'it says so');
    ok(!q(w, '#list .tick[data-pc="j1|0"]'), 'and the piece leaves the cutting list');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').items[0].cut === false && cur(server, 'j1').status === 'cut', 'Undo puts it back');
    ok(!!q(w, '#list .tick[data-pc="j1|0"]'), 'with its tick box');
    w.close();
  }

  console.log('\n--- On order: ticking a piece off when it arrives ---');
  {
    const { w, server } = await boot({ seed: all() });
    await click(w, q(w, '#rail [data-f="order"]'));
    await click(w, q(w, '#list .tick[data-pa="j3|0"]'));
    const it = cur(server, 'j3').items[0];
    ok(it.ostate === 'arrived' && it.arrived === true && !!it.arrivedAt, 'the piece is booked in');
    ok(cur(server, 'j3').status !== 'order', 'and the job moves on from On order');
    ok(puts(server, 'j3') === 1, 'saved once');
    ok(/Piece booked in — job 1803/.test($(w, 'toast').textContent), 'it says so');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j3').items[0].ostate === 'ordered' && cur(server, 'j3').status === 'order', 'Undo puts it back');
    w.close();
  }

  console.log('\n--- To be ordered: ticking a piece off as ordered ---');
  let viaTick, viaButton;
  {
    const { w, server } = await boot({ seed: all() });
    await click(w, q(w, '#rail [data-f="pricing"]'));
    await click(w, q(w, '#list .tick[data-pord="j2|0"]'));
    viaTick = cur(server, 'j2');
    ok(viaTick.items[0].ostate === 'ordered' && !!viaTick.items[0].orderedAt, 'the piece goes on order');
    ok(viaTick.items[1].ostate === 'toprice', 'and the other piece is left where it was');
    ok(viaTick.status === 'pricing', 'so the job stays in To be ordered for now');
    ok(puts(server, 'j2') === 1, 'saved once');
    ok(/Piece on order — job 1802/.test($(w, 'toast').textContent), 'it says so');
    ok(qa(w, '#list .tick[data-pord]').map(x => x.dataset.pord).join() === 'j2|1', 'and only the other piece is left to tick');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j2').items[0].ostate === 'toprice', 'Undo puts it back');
    ok(qa(w, '#list .tick[data-pord]').length === 2, 'with its tick box');
    await click(w, q(w, '#list .tick[data-pord="j2|0"]'));
    await click(w, q(w, '#list .tick[data-pord="j2|1"]'));
    ok(cur(server, 'j2').items.every(i => i.ostate === 'ordered'), 'ticking both puts both on order');
    ok(cur(server, 'j2').status === 'order', 'and the job moves to On order');
    ok(/Nothing to order/.test($(w, 'list').textContent), 'leaving nothing to order');
    await click(w, q(w, '#rail [data-f="order"]'));
    ok(qa(w, '#list .tick[data-pa^="j2|"]').length === 2, 'where both pieces wait with tick boxes for when they arrive');
    w.close();
  }
  {
    const { w, server } = await boot({ seed: all() });
    await click(w, q(w, '#rail [data-f="pricing"]'));
    await click(w, q(w, '#list [data-mko="j2|0"]'));
    viaButton = cur(server, 'j2');
    ok(/Piece on order — job 1802/.test($(w, 'toast').textContent), 'Mark as ordered still works as it did');
    w.close();
  }
  const same = (a, b) => JSON.stringify(a, (k, v) => k === 'orderedAt' ? '-' : v) === JSON.stringify(b, (k, v) => k === 'orderedAt' ? '-' : v);
  ok(same(viaTick, viaButton), 'and the tick does exactly what Mark as ordered does');

  console.log('\n--- the job cards are as they were ---');
  {
    const { w } = await boot({ seed: all() });
    await click(w, q(w, '#rail [data-f="cut"]'));
    await click(w, q(w, '[data-view="jobs"]'));
    ok(!q(w, '#list .tick') && !!q(w, '#list .docket [data-pc="j1|0"]'), 'To cut as jobs: the card has its To cut button, no extra tick box');
    await click(w, q(w, '#rail [data-f="pricing"]'));
    await click(w, q(w, '[data-view="jobs"]'));
    ok(!!q(w, '#list .job') && !q(w, '#list .tick') && !q(w, '#list [data-pord]'), 'To be ordered as jobs: no extra tick box either');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

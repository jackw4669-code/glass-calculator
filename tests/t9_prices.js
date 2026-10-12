const { boot, settle, makeServer, $, q, qa, click, type, choose, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const near = (a, b, t = 0.005) => Math.abs(a - b) < t;
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const metre = (o = {}) => Object.assign({ pid: 'c4mm', w: '1000', h: '1000', q: '1', addons: [], src: 'cut', cut: false }, o);

(async () => {
  console.log('\n--- prices are locked onto each job ---');

  {
    const { w, server } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Locked Lenny');
    await type(w, q(w, '[data-k="w"]'), '1000');
    await type(w, q(w, '[data-k="h"]'), '1000');
    await click(w, q(w, '[data-ad="0:pol-std"]'));
    await click(w, $(w, 'saveJob'));
    const first = [...server.rows.values()].map(r => JSON.parse(r.data))[0];
    ok(first.items[0].rate === 48.63, 'a new piece is saved with the rate it was quoted at');
    ok(first.items[0].addons[0].rate === 5.5, 'and so is its edgework');

    const id = first.id, total = () => w.eval(`jobTotals(JOBS.find(j=>j.id==='${id}')).grand`);
    const before = total();
    w.eval("PRICES['c4mm']=52; PRICES['a:pol-std']=7; ADJ=10;");
    ok(near(total(), before, 1e-9), 'putting prices up afterwards leaves its total alone');

    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Later Larry');
    await type(w, q(w, '[data-k="w"]'), '1000');
    await type(w, q(w, '[data-k="h"]'), '1000');
    await click(w, $(w, 'saveJob'));
    const later = [...server.rows.values()].map(r => JSON.parse(r.data)).find(j => j.name === 'Later Larry');
    ok(near(later.items[0].rate, 57.2, 1e-9), 'a job quoted after the rise gets the new price, adjustment included');
    w.close();
  }

  {
    /* the case from before: quoted and paid at £58.36 */
    const j = job({ confirmed: true, status: 'done', doneAt: '2026-09-01T12:00:00Z', items: [metre({ cut: true })],
                    payments: [{ date: '2026-09-01', amount: 58.36, method: 'Cash' }] });
    const { w } = await boot({ seed: [j] });
    ok(near(w.eval('balanceOf(JOBS[0])'), 0), 'a job quoted and paid at £58.36 is paid');
    w.eval("PRICES['c4mm']=52; ADJ=10;");
    ok(near(w.eval('balanceOf(JOBS[0])'), 0), 'and is still paid after 4mm goes to £52 and everything up 10%');
    ok(near(w.eval('jobTotals(JOBS[0]).grand'), 58.36), 'its total stays at what the customer was quoted');
    w.close();
  }

  {
    /* a machine with its own different list, as could happen last round */
    const mem = { 'wg:prices:v4': JSON.stringify({ prices: { c4mm: 99, 'a:pol-std': 9 }, adj: 5 }) };
    const old = job({ items: [metre({ addons: [{ id: 'pol-std', m: '' }] })] });
    const { w } = await boot({ mem, seed: [old] });
    ok(w.eval("priceOf('c4mm')") === 99, 'this machine has a different price list');
    ok(w.eval('JOBS[0].items[0].rate') === 48.63, 'but a job from before locking is held at the list it was quoted from');
    ok(w.eval('JOBS[0].items[0].addons[0].rate') === 5.5, 'edgework too');
    ok(near(w.eval('jobTotals(JOBS[0]).net'), 48.63 + 22), 'so it reads the same as on every other machine');
    w.close();
  }

  {
    const mem = { 'wg:prices:v4': JSON.stringify({ prices: { c4mm: 60 }, adj: 0 }) };
    const { w, server } = await boot({ mem, seed: [job({ items: [metre({ rate: 48.63 })] })] });
    await click(w, q(w, '[data-open]'));
    const hint = txt($(w, 'calcHint'));
    ok(/Priced at the rates it was quoted at/.test(hint) && /£72\.00/.test(hint), "a job quoted at older prices says what today's would be");
    ok(/£58\.36/.test(txt($(w, 'calcRows'))), 'while still showing its quoted price');

    await type(w, q(w, '[data-k="w"]'), '2000');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').items[0].rate === 48.63, 'changing a size keeps the price per m² it was quoted at');
    ok(near(cur(server, 'j1')._net, 48.63 * 2), 'charged at that rate for the new size');

    await click(w, q(w, '[data-open]'));
    await click(w, q(w, '[data-reprice]'));
    ok(!q(w, '[data-reprice]'), "Use today's prices brings it up to date");
    ok(/£144\.00/.test(txt($(w, 'calcRows'))), 'and the price panel shows the new total');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').items[0].rate === 60, "and it saves at today's rate");

    await click(w, q(w, '[data-open]'));
    await choose(w, q(w, '[data-pid="0"]'), 'c6mm');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').items[0].rate === 80.04, "a piece changed to a different glass is priced at today's list");
    w.close();
  }

  {
    const { w } = await boot({ seed: [job({ items: [metre()] })] });
    await click(w, q(w, '[data-open]'));
    ok(!q(w, '[data-reprice]'), 'nothing to say when the price list has not changed');
    w.close();
  }

  console.log('\n--- one price list for the whole shop ---');

  {
    const server = makeServer();
    const a = await boot({ server, seed: [] });
    await click(a.w, $(a.w, 'rateBtn'));
    ok(/this machine's own prices/.test(txt($(a.w, 'rateShare'))), "before anything is shared, the sheet says these are this machine's own");
    ok(txt($(a.w, 'saveRates')) === 'Save for the whole shop', 'and the button says what it does');

    let asked = '';
    a.w.confirm = m => { asked = m; return false; };
    await type(a.w, q(a.w, '[data-p="c4mm"]'), '50');
    await click(a.w, $(a.w, 'saveRates'));
    ok(/shop's prices/.test(asked), "the first save asks before making them the shop's");
    ok(!server.settings.has('shop'), 'saying no shares nothing');

    a.w.confirm = () => true;
    await click(a.w, $(a.w, 'saveRates'));
    const shared = JSON.parse(server.settings.get('shop') || '{}');
    ok(shared.prices && shared.prices.c4mm === 50, "saying yes makes them the shop's, with the price typed");
    ok((shared.suppliers || []).some(s => s.name === 'Tudor'), 'the suppliers go too, Tudor included');
    ok(shared.settings && shared.settings.signOff === 'Keith', 'and the sign-off');
    ok(/Saved for the whole shop/.test(txt($(a.w, 'toast'))), 'and it says so');

    const b = await boot({ server, seed: [] });
    ok(b.w.eval("priceOf('c4mm')") === 50, "another machine picks up the shop's prices");
    await click(b.w, $(b.w, 'rateBtn'));
    ok(/Shared with every machine/.test(txt($(b.w, 'rateShare'))), 'and its sheet says they are shared');
    let asked2 = '';
    b.w.confirm = m => { asked2 = m; return true; };
    await type(b.w, q(b.w, '[data-se="0"]'), 'orders@firmans.example');
    await click(b.w, $(b.w, 'saveRates'));
    ok(asked2 === '', 'once shared, saving does not ask again');
    const s2 = JSON.parse(server.settings.get('shop'));
    ok(s2.suppliers[0].email === 'orders@firmans.example', 'a change on that machine reaches the shop');
    ok(s2.prices.c4mm === 50, 'without disturbing the prices');

    /* machine A has not looked since: its copy is out of date */
    await click(a.w, $(a.w, 'rateBtn'));
    await type(a.w, q(a.w, '[data-p="c6mm"]'), '90');
    await click(a.w, $(a.w, 'saveRates'));
    ok(/Nothing was saved/.test(txt($(a.w, 'rateWarn'))), 'a machine saving from an out-of-date copy is stopped');
    const s3 = JSON.parse(server.settings.get('shop'));
    ok(s3.suppliers[0].email === 'orders@firmans.example', "so the other machine's change survives");
    ok(s3.prices.c6mm === 80.04, 'and the out-of-date £90 did not go through');
    ok($(a.w, 'rateSheet').classList.contains('on'), 'the sheet stays open');
    ok(q(a.w, '[data-se="0"]').value === 'orders@firmans.example', 'showing the latest version');

    await type(a.w, q(a.w, '[data-p="c6mm"]'), '90');
    await click(a.w, $(a.w, 'saveRates'));
    const s4 = JSON.parse(server.settings.get('shop'));
    ok(s4.prices.c6mm === 90 && s4.suppliers[0].email === 'orders@firmans.example', 'so the change can be made again, on top of the other one');

    ok(b.w.eval("priceOf('c6mm')") === 80.04, 'the other machine has the old price until it next checks');
    await b.w.eval('loadAll()'); await settle(b.w, 4);
    ok(b.w.eval("priceOf('c6mm')") === 90, 'and the new one after it does, which it does every ten seconds');
    a.w.close(); b.w.close();
  }

  {
    const server = makeServer();
    server.settings.set('shop', JSON.stringify({ prices: { c4mm: 55 }, adj: 0,
      suppliers: [{ name: 'Firmans', email: 'f@example.com' }, { name: 'Other', email: '' }], settings: { signOff: 'Keith' } }));
    const { w } = await boot({ server, seed: [] });
    ok(w.eval("priceOf('c4mm')") === 55, 'shared prices load');
    ok(w.eval("SUPPLIERS.map(s=>s.name).join()") === 'Firmans,Tudor,Other', 'and Tudor is added to a shared list that lacks it');

    w.offline();
    await w.eval('loadAll()'); await settle(w, 4);
    ok(w.eval("priceOf('c4mm')") === 55, 'with the connection down, the last shared copy is still used');
    await click(w, $(w, 'rateBtn'));
    ok(/cannot be reached/.test(txt($(w, 'rateShare'))), 'and the sheet says they cannot be changed');
    const puts = server.log.filter(l => /^PUT \/api\/settings/.test(l)).length;
    await type(w, q(w, '[data-p="c4mm"]'), '70');
    await click(w, $(w, 'saveRates'));
    ok(/nothing was saved/i.test(txt($(w, 'rateWarn'))) && /only be changed while it is connected/.test(txt($(w, 'rateWarn'))),
       'saving while offline is refused, and says why');
    ok(server.log.filter(l => /^PUT \/api\/settings/.test(l)).length === puts, 'nothing is sent');
    ok(w.eval("priceOf('c4mm')") === 55, 'and nothing changes');
    w.close();
  }

  {
    /* a shared price change does not move a job that is already priced */
    const server = makeServer();
    const a = await boot({ server, seed: [job({ items: [metre()] })] });
    const before = a.w.eval('jobTotals(JOBS[0]).grand');
    await click(a.w, $(a.w, 'rateBtn'));
    await type(a.w, q(a.w, '[data-p="c4mm"]'), '75');
    await click(a.w, $(a.w, 'saveRates'));
    const b = await boot({ server, seed: [] });
    ok(near(b.w.eval('jobTotals(JOBS[0]).grand'), before), 'when the shop list changes, existing jobs keep their price on every machine');
    a.w.close(); b.w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

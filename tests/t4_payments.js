const { boot, settle, $, q, qa, click, type, choose, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const near = (a, b, t = 0.005) => Math.abs(a - b) < t;
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => el.textContent.replace(/\s+/g, ' ').trim();

/* a finished job: 1 m2 of 4mm at 48.63, so net 48.63, VAT 9.726 */
const done = (over = {}) => job(Object.assign({
  status: 'done', confirmed: true, doneAt: '2026-08-14T15:00:00.000Z',
  items: [{ pid: 'c4mm', w: '1000', h: '1000', q: '1', addons: [], src: 'cut', cut: true, arrived: false }]
}, over));

(async () => {
  /* The Money tab, the costs section and overheads were taken out, and
     their tests with them. Payments stayed, so these did too. */
  console.log('\n--- payments ---');

  {
    const { w, server } = await boot({ seed: [job({ deposit: 20 })] });
    const j = w.eval('JSON.stringify(JOBS[0].payments)');
    const p = JSON.parse(j);
    ok(p.length === 1, 'an old deposit becomes the first payment');
    ok(p[0].amount === 20, 'with the same amount');
    ok(p[0].date === '2026-08-01', 'dated when the job was taken');
    ok(near(w.eval('balanceOf(JOBS[0])'), w.eval('jobTotals(JOBS[0]).grand') - 20),
       'and the balance still comes out the same');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    ok(!!$(w, 'pays'), 'the job sheet has a payments card');
    await click(w, $(w, 'addPay'));
    await type(w, q(w, '[data-payv="0"]'), '5');
    await choose(w, q(w, '[data-paym="0"]'), 'Card');
    ok(/5\.00 paid/.test(txt($(w, 'payBal'))), 'the running balance updates as you type');
    ok(/6\.67 left/.test(txt($(w, 'payBal'))), 'and shows what is left on an 11.67 job');
    await click(w, $(w, 'saveJob'));

    const saved = cur(server, 'j1');
    ok(saved.payments.length === 1, 'the payment is saved');
    ok(saved.payments[0].method === 'Card', 'with its method');
    ok(saved.deposit === 5, 'and deposit is kept in step for older builds');
    ok(near(JSON.parse(server.rows.get('j1').data)._paid, 5), 'the paid column is sent to the database');
    w.close();
  }

  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    await click(w, $(w, 'payFull'));
    await click(w, $(w, 'saveJob'));
    ok(near(w.eval('balanceOf(JOBS[0])'), 0), 'settling the balance clears it');
    ok($(w, 'payBal') && true, 'and the card still renders');
    w.close();
  }

  /* one-click settle from the list, with undo */
  {
    const j = done({ status: 'ready', doneAt: '', payments: [] });
    const { w, server } = await boot({ seed: [j] });
    const btn = q(w, '[data-settle]');
    ok(!!btn, 'a job that owes money offers a one-click payment');
    await click(w, btn);
    ok(near(w.eval('balanceOf(JOBS[0])'), 0), 'which clears the balance');
    ok(cur(server, 'j1').payments.length === 1, 'and records a real payment');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').payments.length === 0, 'undo takes the payment back off');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

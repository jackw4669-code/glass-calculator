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

  console.log('\n--- what it costs us ---');

  {
    const { w } = await boot({ seed: [done()] });
    ok(near(w.eval('itemCost(JOBS[0], JOBS[0].items[0])'), 0),
       'with no cost information, cost is zero rather than a guess');

    w.eval("SETTINGS.cutCostPct=40;");
    ok(near(w.eval('itemCost(JOBS[0], JOBS[0].items[0])'), 48.63 * 0.4),
       'the rough percentage is used when nothing better exists');

    w.eval("PRICES['c:c4mm']=20;");
    ok(near(w.eval('itemCost(JOBS[0], JOBS[0].items[0])'), 20),
       'our own cost per m\u00b2 beats the percentage');
    ok(w.eval("costBasis(JOBS[0], JOBS[0].items[0])") === 'ourrate', 'and says so');

    w.eval("JOBS[0].items[0].cost=17.5;");
    ok(near(w.eval('itemCost(JOBS[0], JOBS[0].items[0])'), 17.5),
       'what the supplier actually charged beats everything');
    ok(w.eval("costBasis(JOBS[0], JOBS[0].items[0])") === 'supplier', 'and says so');
    w.close();
  }

  {
    const { w } = await boot({ seed: [job()] });
    await click(w, $(w, 'rateBtn'));
    const box = q(w, '[data-p="c:c4mm"]');
    ok(!!box, 'the price list has a cost column');
    ok(box.value === '', 'blank when we have not worked it out');
    await type(w, box, '22');
    await click(w, $(w, 'saveRates'));
    ok(w.eval("costRateOf('c4mm')") === 22, 'the cost rate saves');

    await click(w, $(w, 'rateBtn'));
    await type(w, q(w, '[data-p="c:c4mm"]'), '');
    await click(w, $(w, 'saveRates'));
    ok(w.eval("costRateOf('c4mm')") === null,
       'clearing it means "not worked out", not "costs nothing"');
    w.close();
  }

  console.log('\n--- overheads and break even ---');

  {
    const { w } = await boot({ seed: [job()] });
    await click(w, $(w, 'rateBtn'));
    await click(w, $(w, 'addOh'));
    await type(w, q(w, '[data-ohl="0"]'), 'Rent');
    await type(w, q(w, '[data-oha="0"]'), '1200');
    await click(w, $(w, 'addOh'));
    await type(w, q(w, '[data-ohl="1"]'), 'Van');
    await type(w, q(w, '[data-oha="1"]'), '300');
    await click(w, $(w, 'saveRates'));
    ok(w.eval('overheadsMonthly()') === 1500, 'monthly overheads add up');
    w.close();
  }

  {
    /* twelve finished jobs at 50% margin, 1500 a month of overheads
       => needs 3000 a month of sales to break even */
    const seed = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(2026, i % 12, 10));
      seed.push(done({
        id: 'j' + i, no: 1700 + i, doneAt: d.toISOString(),
        items: [{ pid: 'c4mm', w: '1000', h: '1000', q: '1', addons: [], src: 'cut', cut: true, cost: 24.315 }]
      }));
    }
    const { w } = await boot({ seed });
    w.eval("SETTINGS.overheads=[{label:'Rent',amount:1500}];");
    const be = JSON.parse(w.eval('JSON.stringify(breakEven())'));
    ok(near(be.margin, 50, 0.5), 'the trailing margin comes out at 50%');
    ok(near(be.need, 3000, 1), 'so break even is twice the overheads');
    w.close();
  }

  {
    const { w } = await boot({ seed: [done()] });
    const be = JSON.parse(w.eval('JSON.stringify(breakEven())'));
    ok(/overheads/.test(be.why), 'no overheads entered means no break-even figure');
    w.eval("SETTINGS.overheads=[{label:'Rent',amount:1500}];");
    const be2 = JSON.parse(w.eval('JSON.stringify(breakEven())'));
    ok(/not enough/.test(be2.why), 'one job is not enough to work a margin out from');
    w.close();
  }

  console.log('\n--- the money tab ---');

  {
    const inAug = done({ id: 'a', no: 1, doneAt: '2026-08-14T12:00:00.000Z' });
    const inJul = done({ id: 'b', no: 2, doneAt: '2026-07-14T12:00:00.000Z' });
    const notDone = job({ id: 'c', no: 3, status: 'ready', confirmed: true });
    const { w } = await boot({ seed: [inAug, inJul, notDone] });

    await click(w, q(w, '[data-f="money"]'));
    ok(/Money/.test(txt(q(w, '.dtop h2'))), 'the Money tab opens');

    /* worked out from today, so this does not go stale at the end of the month */
    const r = JSON.parse(w.eval("JSON.stringify(periodRange('month',0))"));
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const first = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
    const lastD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const last = lastD.getFullYear() + '-' + pad(lastD.getMonth() + 1) + '-' + pad(lastD.getDate());
    ok(r.from === first && r.to === last, 'this month runs from the 1st to the last day of the current month');

    const aug = JSON.parse(w.eval("JSON.stringify(moneyFor('2026-08-01','2026-08-31').jobs.map(j=>j.id))"));
    ok(aug.length === 1 && aug[0] === 'a', 'only the job finished in August counts to August');

    const all = JSON.parse(w.eval("JSON.stringify(moneyFor('2000-01-01','2100-01-01').jobs.map(j=>j.id))"));
    ok(all.length === 2, 'a job that has not gone out yet counts to no month at all');

    const m = JSON.parse(w.eval("JSON.stringify(moneyFor('2026-08-01','2026-08-31'))"));
    ok(near(m.sales, 48.63), 'sales are counted before VAT');
    ok(near(m.vat, 48.63 * 0.2), 'and the VAT is shown separately');
    w.close();
  }

  {
    /* cash and profit land in different months, which is the point */
    const j = done({ doneAt: '2026-08-14T12:00:00.000Z', payments: [
      { date: '2026-07-02', amount: 20, method: 'Cash' },
      { date: '2026-09-01', amount: 38.36, method: 'Card' }] });
    const { w } = await boot({ seed: [j] });
    ok(near(w.eval("moneyFor('2026-08-01','2026-08-31').sales"), 48.63),
       'the sale counts in the month the job went out');
    ok(near(w.eval("takingsFor('2026-08-01','2026-08-31').total"), 0),
       'even though no cash came in that month');
    ok(near(w.eval("takingsFor('2026-07-01','2026-07-31').total"), 20), 'the deposit counts in July');
    ok(near(w.eval("takingsFor('2026-09-01','2026-09-30').total"), 38.36), 'the balance counts in September');
    w.close();
  }

  {
    const owing = done({ id: 'x', no: 9, payments: [], doneAt: '2026-01-05T12:00:00.000Z' });
    const paid = done({ id: 'y', no: 10, doneAt: '2026-08-05T12:00:00.000Z',
      payments: [{ date: '2026-08-05', amount: 58.36, method: 'Cash' }] });
    const { w } = await boot({ seed: [owing, paid] });
    const list = JSON.parse(w.eval("JSON.stringify(owedList().map(o=>({no:o.j.no,bal:o.bal})))"));
    ok(list.length === 1 && list[0].no === 9, 'only the unpaid job is owed');

    await click(w, q(w, '[data-f="money"]'));
    await click(w, q(w, '[data-mview="owed"]'));
    ok(/Owed to the shop/.test(txt($(w, 'list'))), 'the owed view lists it');
    ok(!!q(w, '.mrow.late'), 'and flags it as long overdue');
    ok(/Over 60 days/.test(txt($(w, 'list'))), 'in the over-60-days bucket');
    w.close();
  }

  {
    /* finished inside the period the tab opens on, so it is actually counted */
    const j = done({ doneAt: new Date().toISOString(),
      items: [{ pid: 'dgclear', w: '1000', h: '1000', q: '1', addons: [], src: 'order', supplier: 'Firmans', ostate: 'arrived', arrived: true }] });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="money"]'));
    const body = txt($(w, 'list'));
    ok(/no supplier price entered/.test(body), 'a missing supplier price is called out');
    ok(/gross profit only/i.test(body), 'and so is the absence of overheads');
    w.close();
  }

  {
    const { w } = await boot({ seed: [done()] });
    await click(w, q(w, '[data-f="money"]'));
    await click(w, q(w, '[data-mkind="year"]'));
    ok(/2026/.test(txt(q(w, '.wsmeta'))), 'the period can be changed to a year');
    await click(w, q(w, '[data-mview="jobs"]'));
    ok(/1700/.test(txt($(w, 'list'))), 'the jobs view lists what was finished');
    await click(w, q(w, '[data-print="money"]'));
    await settle(w, 3);
    ok(/Gross profit/.test(w._printed), 'and it prints a summary');
    ok(/not a set of accounts/.test(w._printed), 'with the caveat on it');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

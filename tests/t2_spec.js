const { boot, settle, $, q, qa, click, type, choose, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));

const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const piece = (over = {}) => Object.assign(
  { pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'cut', supplier: '', arrived: false, cut: false }, over);

(async () => {
  console.log('\n--- unit and obscure detail ---');

  /* 1. The fields only appear for the products that need them */
  {
    const { w } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    ok(!q(w, '[data-xs]'), 'plain float glass asks nothing extra');

    await choose(w, q(w, '[data-pid="0"]'), 'dgclear');
    const keys = qa(w, '[data-xs]').map(e => e.dataset.xs);
    ok(keys.includes('0:dgThick'), 'a unit asks for the overall thickness');
    ok(keys.includes('0:dgBar'), 'a unit asks for the bar colour');
    ok(!keys.includes('0:obsType'), 'a clear unit does not ask for a pattern');

    await choose(w, q(w, '[data-pid="0"]'), 'o4mm');
    const keys2 = qa(w, '[data-xs]').map(e => e.dataset.xs);
    ok(keys2.includes('0:obsType'), 'obscured glass asks for the pattern');
    ok(!keys2.includes('0:dgThick'), 'and does not ask unit questions');
    w.close();
  }

  /* 2. Obscure glass inside a unit is asked for via the add-on */
  {
    const { w } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    await choose(w, q(w, '[data-pid="0"]'), 'dgtuf');
    ok(!qa(w, '[data-xs]').map(e => e.dataset.xs).includes('0:obsType'),
       'a toughened unit starts without a pattern question');
    await click(w, q(w, '[data-ad="0:obsunit"]'));
    ok(qa(w, '[data-xs]').map(e => e.dataset.xs).includes('0:obsType'),
       'ticking "obscure glass in unit" asks which pattern');
    w.close();
  }

  /* 3. The answers survive a save and reload */
  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    await choose(w, q(w, '[data-pid="0"]'), 'dgclear');
    await choose(w, $(w, 'x0dgThick'), '24 mm (4-16-4)');
    await choose(w, $(w, 'x0dgBar'), 'Black');
    await click(w, $(w, 'saveJob'));

    const it = cur(server, 'j1').items[0];
    ok(it.dgThick === '24 mm (4-16-4)', 'thickness is stored on the piece');
    ok(it.dgBar === 'Black', 'bar colour is stored on the piece');

    await click(w, q(w, '[data-open]'));
    ok($(w, 'x0dgThick').value === '24 mm (4-16-4)', 'thickness comes back when reopened');
    ok($(w, 'x0dgBar').value === 'Black', 'bar colour comes back when reopened');
    w.close();
  }

  /* 4. "Other" opens a free text box, and what is typed is kept */
  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    await choose(w, q(w, '[data-pid="0"]'), 'dgclear');
    await choose(w, $(w, 'x0dgThick'), '__other');
    const box = q(w, '[data-xo="0:dgThick"]');
    ok(!!box, 'choosing Other reveals a text box');
    await type(w, box, '22 mm (4-14-4)');
    ok(q(w, '[data-xo="0:dgThick"]') === box, 'typing does not redraw and steal focus');
    await choose(w, $(w, 'x0dgBar'), 'White');
    await click(w, $(w, 'saveJob'));
    ok(cur(server, 'j1').items[0].dgThick === '22 mm (4-14-4)', 'the typed value is saved');

    await click(w, q(w, '[data-open]'));
    ok(!!q(w, '[data-xo="0:dgThick"]'), 'an off-list value reopens in the text box');
    ok(q(w, '[data-xo="0:dgThick"]').value === '22 mm (4-14-4)', 'with the value in it');
    w.close();
  }

  /* 5. Missing detail is flagged, on the card and in the job sheet */
  {
    const j = job({ confirmed: true, items: [piece({ pid: 'dgclear', src: 'order', supplier: 'Firmans', ostate: 'toprice' })] });
    const { w } = await boot({ seed: [j] });
    const miss = q(w, '.specmiss');
    ok(!!miss, 'the job card warns that detail is missing');
    ok(/thickness/.test(miss.textContent) && /bar colour/.test(miss.textContent),
       'and says which pieces of detail');

    await click(w, q(w, '[data-open]'));
    ok(!!q(w, '.item .miss'), 'the job sheet warns too');
    w.close();
  }

  /* 6. It reaches the price request and the order */
  {
    const j = job({
      confirmed: true, status: 'pricing',
      items: [piece({ pid: 'dgclear', src: 'order', supplier: 'Firmans', ostate: 'toprice', dgThick: '28 mm (4-20-4)', dgBar: 'Grey' })]
    });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-rfq]'));
    const body = $(w, 'mPrev').textContent;
    ok(/Overall thickness: 28 mm \(4-20-4\)/.test(body), 'the price request states the thickness');
    ok(/Bar colour: Grey/.test(body), 'and the bar colour');
    ok(!q(w, '#mWarn .warnbox'), 'no warning when everything is filled in');
    w.close();
  }

  /* 7. Gaps go out marked, and the shop is warned first */
  {
    const j = job({
      confirmed: true, status: 'pricing',
      items: [piece({ pid: 'o4mm', src: 'order', supplier: 'Firmans', ostate: 'toprice' })]
    });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="pricing"]'));
    await click(w, q(w, '[data-rfq]'));
    ok(/Obscure pattern: TO CONFIRM/.test($(w, 'mPrev').textContent),
       'an unanswered pattern goes out as TO CONFIRM');
    const warn = q(w, '#mWarn .warnbox');
    ok(!!warn, 'and the shop is warned before sending');
    ok(/obscure pattern/i.test(warn.textContent), 'the warning names what is missing');
    w.close();
  }

  /* 8. It reaches the worklists, the customer quote and the printout */
  {
    const j = job({
      confirmed: true, wanted: '2026-09-30',
      items: [piece({ pid: 'o4mm', obsType: 'Stippolyte' })]
    });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-f="cut"]'));
    ok(/Stippolyte/.test(q(w, '.wsrow').textContent), 'the cutting list shows the pattern');

    await click(w, q(w, '[data-print="cut"]'));
    await settle(w, 3);
    ok(/Stippolyte/.test(w._printed), 'the printed cutting list shows it too');

    await click(w, q(w, '[data-f="all"]'));
    await click(w, q(w, '[data-mail]'));
    ok(/Stippolyte/.test($(w, 'mPrev').textContent), 'and it appears on the customer quote');
    w.close();
  }

  /* 9. The every-piece spreadsheet gains its own columns */
  {
    const j = job({ items: [piece({ pid: 'dgclear', dgThick: '24 mm (4-16-4)', dgBar: 'White' })] });
    const { w } = await boot({ seed: [j] });
    const csv = w.eval('piecesCSV()');
    const head = csv.split('\r\n')[0], row = csv.split('\r\n')[1];
    ok(/Unit thickness/.test(head) && /Bar colour/.test(head) && /Obscure pattern/.test(head),
       'the spreadsheet has columns for the new detail');
    ok(head.split(',').length === row.split(',').length,
       'header and data rows still line up');
    ok(/24 mm \(4-16-4\)/.test(row) && /White/.test(row), 'and the values are in it');
    w.close();
  }

  /* 10. Searchable by pattern */
  {
    const j = job({ items: [piece({ pid: 'o4mm', obsType: 'Cotswold' })] });
    const { w } = await boot({ seed: [j] });
    await type(w, $(w, 'search'), 'cotswold');
    ok(qa(w, '.job').length === 1, 'you can find a job by its obscure pattern');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

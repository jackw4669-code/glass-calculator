/* Round 8: the Needs attention tab.

   Run from the repo root:  node tests/t13_attention.js                 */
const { boot, settle, makeServer, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const tick = async (w, el, v) => { el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); await settle(w, 3); };
const chip = (w, f) => q(w, `#rail [data-f="${f}"]`);
const count = (w, f) => +txt(chip(w, f).querySelector('b'));
const cardOf = (w, id) => { const b = q(w, `#list [data-move="${id}"]`); return b && b.closest('.job'); };
const orderPiece = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order',
  supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }, o);
const JOB_TEXT = 'Order the toughened glass from Firmans — customer wants it Friday';

(async () => {
  console.log('\n--- the tab ---');
  {
    const { w } = await boot({ seed: [job()] });
    const order = qa(w, '#rail .chip').map(c => c.dataset.f);
    ok(order[0] === 'attn' && order[1] === 'all', 'Needs attention is the first tab, before Live');
    ok(/^Needs attention 0$/.test(txt(chip(w, 'attn'))) && !chip(w, 'attn').classList.contains('alert'),
       'it reads Needs attention 0, and is quiet while nothing is flagged');
    ok(w.eval('filter') === 'all', 'the app still opens on Live');
    await click(w, chip(w, 'attn'));
    ok(/Nothing needs attention/.test(txt($(w, 'list'))) && /Needs attention\?/.test(txt($(w, 'list'))),
       'with nothing flagged it says how to flag a job');
    w.close();
  }

  console.log('\n--- flagging a job ---');
  {
    const server = makeServer();
    const { w } = await boot({ server, seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Counter Carol');
    await type(w, q(w, '[data-k="w"]'), '500');
    await type(w, q(w, '[data-k="h"]'), '400');
    ok($(w, 'attnWrap').style.display === 'none', 'the box for what needs doing stays hidden until it is wanted');
    await tick(w, $(w, 'fAttn'), true);
    ok($(w, 'attnWrap').style.display !== 'none' && $(w, 'attnTick').classList.contains('on'),
       'ticking Needs attention? opens a box to say what needs doing');
    await click(w, $(w, 'saveJob'));
    ok(!server.rows.size && $(w, 'jobSheet').classList.contains('on') && /Say what needs doing/.test(txt($(w, 'toast'))),
       'it will not save ticked with nothing said');
    await type(w, $(w, 'fAttnText'), '  ' + JOB_TEXT + '  ');
    await click(w, $(w, 'saveJob'));
    const id = [...server.rows.keys()][0], j = cur(server, id);
    ok(j.attn && j.attn.text === JOB_TEXT && j.attn.at, 'with words in, it saves the flag, trimmed, with when it was flagged');
    ok(count(w, 'attn') === 1 && chip(w, 'attn').classList.contains('alert'), 'the tab counts it and turns red');

    await click(w, chip(w, 'attn'));
    const c = cardOf(w, id);
    ok(!!c && txt(c.querySelector('.attn')).indexOf(JOB_TEXT) >= 0, 'the job is in Needs attention, saying what needs doing');
    ok(/Flagged today at \d\d:\d\d/.test(txt(c.querySelector('.attn .attnwhen'))), 'and when it was flagged');
    ok(/Mark sorted/.test(txt(c.querySelector('.acts'))), 'with a Mark sorted button');
    await click(w, chip(w, 'all'));
    ok(txt(cardOf(w, id).querySelector('.attn')).indexOf(JOB_TEXT) >= 0, 'the note shows on the job in Live too');

    /* another machine on the same job book */
    const b = await boot({ server, seed: [] });
    ok(count(b.w, 'attn') === 1, 'another machine sees it as well');
    b.w.close();

    await click(w, cardOf(w, id).querySelector('[data-sorted]'));
    ok(!cur(server, id).attn && count(w, 'attn') === 0, 'Mark sorted takes it off the list');
    ok(/sorted/.test(txt($(w, 'toast'))), 'and says so');
    await click(w, q(w, '#banner [data-undo]'));
    ok(cur(server, id).attn && cur(server, id).attn.text === JOB_TEXT && count(w, 'attn') === 1, 'Undo puts it back');
    w.close();
  }

  console.log('\n--- changing or clearing it in the job ---');
  {
    const j = job({ id: 'e', no: 70, name: 'Edit Ed', attn: { text: 'Ring back about the bar colour', at: '2026-10-01T09:15:00.000Z' } });
    const { w, server } = await boot({ seed: [j] });
    await click(w, q(w, '[data-open="e"]'));
    ok($(w, 'fAttn').checked && $(w, 'fAttnText').value === 'Ring back about the bar colour',
       'opening a flagged job shows the tick and the words');
    ok(/^Flagged on /.test(txt($(w, 'attnState'))), 'and when it was flagged');
    await type(w, $(w, 'fAttnText'), 'Ring back about the bar colour — they said white');
    await click(w, $(w, 'saveJob'));
    let e = cur(server, 'e');
    ok(e.attn.text === 'Ring back about the bar colour — they said white' && e.attn.at === '2026-10-01T09:15:00.000Z',
       'changing the words keeps when it was first flagged');
    await click(w, q(w, '[data-open="e"]'));
    await tick(w, $(w, 'fAttn'), false);
    await click(w, $(w, 'saveJob'));
    e = cur(server, 'e');
    ok(!('attn' in e) && w.eval('bucket("attn").length') === 0, 'unticking it clears it');
    w.close();
  }

  console.log('\n--- which jobs, in what order ---');
  {
    const seed = [
      job({ id: 'n', no: 71, name: 'Newer Nick', attn: { text: 'Second thing', at: '2026-10-10T09:00:00.000Z' } }),
      job({ id: 'o', no: 72, name: 'Older Olive', attn: { text: 'First thing', at: '2026-10-02T09:00:00.000Z' } }),
      job({ id: 'c', no: 73, name: 'Closed Colin', confirmed: true, status: 'done', doneAt: '2026-09-20T12:00:00Z',
            attn: { text: 'Customer rang about a chip in the glass', at: '2026-10-12T09:00:00.000Z' } }),
      job({ id: 'p', no: 74, name: 'Plain Pete' }),
      job({ id: 'b', no: 75, name: 'Blank Bea', attn: { text: '   ', at: '2026-10-12T09:00:00.000Z' } })
    ];
    const { w } = await boot({ seed });
    await click(w, chip(w, 'attn'));
    const names = qa(w, '#list .job h3').map(h => txt(h).split(' ')[0]);
    ok(names.join(' ') === 'Older Newer Closed', 'the longest waiting comes first');
    ok(names.indexOf('Closed') >= 0, 'a closed job that has been flagged is there too');
    ok(names.indexOf('Plain') < 0 && names.indexOf('Blank') < 0, 'and nothing that has not been flagged with words');
    ok(/3 jobs need something doing/.test(txt($(w, 'list'))), 'the tab says how many');
    await click(w, chip(w, 'all'));
    $(w, 'search').value = 'chip in the glass';
    $(w, 'search').dispatchEvent(new w.Event('input', { bubbles: true })); await settle(w, 3);
    ok(qa(w, '#list .job').length === 1 && /Closed Colin/.test(txt(q(w, '#list .job'))), 'search finds what needs doing');
    w.close();
  }

  console.log('\n--- it stays inside the shop ---');
  {
    const j = job({ id: 's', no: 76, name: 'Secret Sam', confirmed: true, status: 'pricing', items: [orderPiece()],
                    attn: { text: 'Do not order until the deposit clears', at: '2026-10-12T09:00:00.000Z' } });
    const { w } = await boot({ seed: [j] });
    await click(w, q(w, '[data-mail="s"]'));
    ok($(w, 'mPrev').textContent.indexOf('deposit clears') < 0, 'the customer email never mentions it');
    await click(w, $(w, 'closeMail'));
    await click(w, chip(w, 'pricing'));
    await click(w, q(w, '[data-po]'));
    ok(/Reference: Secret Sam/.test($(w, 'mPrev').textContent) && $(w, 'mPrev').textContent.indexOf('deposit clears') < 0,
       'nor does the order to the supplier');
    w.close();
  }

  console.log('\n--- the time it says ---');
  {
    const { w } = await boot({ seed: [] });
    const said = w.eval("(()=>{ const d=new Date(); d.setHours(0,30,0,0); return whenText(d.toISOString()); })()");
    ok(said === 'today at 00:30', 'just after midnight is still today, in summer time too');
    w.close();
  }

  console.log('\n--- drafts ---');
  {
    const { w } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await type(w, $(w, 'fName'), 'Draft Dora');
    await tick(w, $(w, 'fAttn'), true);
    await type(w, $(w, 'fAttnText'), 'Check the sizes with Keith');
    await click(w, $(w, 'closeJob'));
    await click(w, $(w, 'draftsBtn'));
    await click(w, q(w, '[data-dopen]'));
    ok($(w, 'fAttn').checked && $(w, 'fAttnText').value === 'Check the sizes with Keith', 'a draft keeps the tick and the words');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

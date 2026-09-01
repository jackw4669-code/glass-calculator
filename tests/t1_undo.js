const { boot, settle, $, q, qa, click, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));

const cur = (s, id) => JSON.parse(s.rows.get(id).data);

(async () => {
  console.log('\n--- undo ---');

  /* 1. Customer confirmed, then undone */
  {
    const { w, server } = await boot({ seed: [job()] });
    const btn = q(w, '[data-conf]');
    ok(!!btn, 'a quote offers "Customer confirmed"');
    await click(w, btn);
    ok(cur(server, 'j1').confirmed === true, 'confirming sets confirmed on the server');
    ok(cur(server, 'j1').status !== 'quote', 'and moves it off the quotes tab');

    const bar = q(w, '.undobar');
    ok(!!bar, 'an undo bar appears');
    ok(/confirmed/i.test(bar.textContent), 'the bar names what happened');
    ok(!!q(w, '#toast .undobtn'), 'the toast also carries an Undo button');

    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').confirmed === false, 'undo puts confirmed back to false');
    ok(cur(server, 'j1').status === 'quote', 'and the job returns to the quotes tab');
    ok(!q(w, '.undobar'), 'the undo bar clears after use');
    w.close();
  }

  /* 2. Undo survives the version bump — this is the whole point */
  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-conf]'));
    const vAfter = server.rows.get('j1').version;
    ok(vAfter === 2, 'the save bumped the row version to 2');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(server.rows.get('j1').version === 3, 'undo writes a further version rather than 409-ing');
    ok(cur(server, 'j1').status === 'quote', 'and the data really did go back');
    w.close();
  }

  /* 3. Not going ahead */
  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-lost]'));
    ok(cur(server, 'j1').status === 'lost', 'closing a quote sets lost');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').status === 'quote', 'undo brings it back to quote');
    w.close();
  }

  /* 4. Ticking a piece off as cut */
  {
    const j = job({ confirmed: true, status: 'cut' });
    const { w, server } = await boot({ seed: [j] });
    await click(w, q(w, '[data-pc]'));
    ok(cur(server, 'j1').items[0].cut === true, 'the piece is marked cut');
    ok(cur(server, 'j1').status === 'ready', 'the job moves to ready');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').items[0].cut === false, 'undo unticks the piece');
    ok(cur(server, 'j1').status === 'cut', 'and the job goes back to the cutting tab');
    w.close();
  }

  /* 5. Collected — the one that closes a job off */
  {
    const j = job({ confirmed: true, status: 'ready', items: [{ pid: 'c4mm', w: '5', h: '4', q: '1', addons: [], src: 'cut', cut: true, arrived: false }] });
    const { w, server } = await boot({ seed: [j] });
    await click(w, q(w, '[data-coll]'));
    ok(cur(server, 'j1').status === 'done', 'collection closes the job');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'j1').status === 'ready', 'undo reopens it');
    w.close();
  }

  /* 6. A deleted job can be put back */
  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-open]'));
    await click(w, $(w, 'delJob'));
    ok(!server.rows.has('j1'), 'the row is gone from the database');
    ok(!!q(w, '.undobar'), 'an undo is still offered');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(server.rows.has('j1'), 'undo re-inserts the job');
    ok(server.rows.get('j1').version === 1, 'as a fresh row at version 1');
    ok(cur(server, 'j1').name === 'Dave', 'with the customer intact');
    w.close();
  }

  /* 7. Booking a whole supplier delivery in, across several jobs */
  {
    const mk = (id, no) => job({
      id, no, confirmed: true, status: 'order',
      items: [{ pid: 'dgclear', w: '500', h: '400', q: '1', addons: [], src: 'order', supplier: 'Firmans', ostate: 'ordered', arrived: false, cut: false }]
    });
    const { w, server } = await boot({ seed: [mk('a', 1), mk('b', 2)] });
    await click(w, q(w, '[data-f="order"]'));
    const all = q(w, '[data-arrall]');
    ok(!!all, 'the order list offers "Mark all delivered"');
    await click(w, all);
    ok(cur(server, 'a').items[0].ostate === 'arrived', 'job a is booked in');
    ok(cur(server, 'b').items[0].ostate === 'arrived', 'job b is booked in');
    await click(w, q(w, '.undobar [data-undo]'));
    ok(cur(server, 'a').items[0].ostate === 'ordered', 'undo restores job a');
    ok(cur(server, 'b').items[0].ostate === 'ordered', 'undo restores job b');
    w.close();
  }

  /* 8. Dismiss, and the ten-minute cutoff */
  {
    const { w, server } = await boot({ seed: [job()] });
    await click(w, q(w, '[data-conf]'));
    await click(w, q(w, '[data-undodrop]'));
    ok(!q(w, '.undobar'), 'dismiss clears the bar');
    ok(cur(server, 'j1').confirmed === true, 'and leaves the change in place');

    await click(w, q(w, '[data-pc]'));
    ok(!!q(w, '.undobar'), 'a later action offers undo again');
    w.eval('UNDO.at = Date.now() - 11*60*1000;');
    w.eval('render();');
    await settle(w, 3);
    ok(!q(w, '.undobar'), 'an undo older than ten minutes is no longer offered');
    w.close();
  }

  /* 9. A failed save must not leave a misleading undo */
  {
    const { w, server } = await boot({ seed: [job()] });
    server.rows.set('j1', { data: server.rows.get('j1').data, version: 99 });  // office got there first
    await click(w, q(w, '[data-conf]'));
    ok(!q(w, '.undobar'), 'a rejected save leaves no undo bar');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

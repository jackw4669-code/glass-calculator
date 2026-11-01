/* Round 9: frames and maintenance through ordering, Glass / Maintenance /
   Frames inside To be ordered and On order, changing a time from the
   diary, and putting a day in order.

   Run from the repo root:  node tests/t14_order_diary.js               */
const { boot, settle, makeServer, $, q, qa, click, type, choose, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const cur = (s, id) => JSON.parse(s.rows.get(id).data);
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const tick = async (w, el, v) => { el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); await settle(w, 3); };
const count = (w, f) => +txt(q(w, `#rail [data-f="${f}"] b`));
const subCount = (w, k) => +txt(q(w, `[data-sub="${k}"] b`));
const cardNames = w => qa(w, '#list .job h3').map(h => txt(h).replace(/ (Trade|To invoice)$/, ''));
const orderPiece = (o = {}) => Object.assign({ pid: 'dgclear', w: '900', h: '600', q: '1', addons: [], src: 'order',
  supplier: 'Firmans', ostate: 'toprice', dgThick: '24 mm (4-16-4)', dgBar: 'White' }, o);
const maint = (o = {}) => job(Object.assign({ kind: 'maintenance', items: [], extras: [{ label: 'Replace the handles', amount: 90 }] }, o));
const framesJob = (o = {}) => job(Object.assign({ kind: 'frames', items: [],
  frames: [{ desc: 'White uPVC casement', w: '1200', h: '900', q: '1', price: 300, supplier: 'Trade Frames' }] }, o));

(async () => {
  console.log('\n--- Needs to order? on frames and maintenance ---');
  {
    const { w, server } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    ok(!q(w, '#items [data-lord]'), 'glass does not ask: it is ordered piece by piece');
    await click(w, $(w, 'addWork'));
    const tick0 = () => q(w, '#works [data-lord="0"]');
    ok(!!tick0() && !tick0().checked, 'maintenance asks Needs to order?, not ticked');
    ok(!!q(w, '[data-wdesc="0"]') && !!q(w, '[data-wsup="0"]') && !!q(w, '[data-wqty="0"]') && !!q(w, '[data-wprice="0"]'),
       'and always asks what it is, where it is coming from, how many and the price each');
    await type(w, $(w, 'fName'), 'Handle Harry');
    await click(w, q(w, '#items [data-rmi="0"]'));
    await type(w, q(w, '[data-wdesc="0"]'), '2 white espagnolette handles');
    await type(w, q(w, '[data-wsup="0"]'), 'Tudor');
    ok(tick0().checked && tick0().closest('.ltick').classList.contains('on'), 'saying where it is coming from ticks it');
    await type(w, q(w, '[data-wqty="0"]'), '2');
    await type(w, q(w, '[data-wprice="0"]'), '45');
    await click(w, $(w, 'saveJob'));
    const id = [...server.rows.keys()][0];
    let j = cur(server, id);
    ok(j.works.length === 1 && j.works[0].desc === '2 white espagnolette handles' && j.works[0].supplier === 'Tudor'
       && j.works[0].order === true && j.works[0].ostate === 'toprice' && j.works[0].q === '2' && j.works[0].price === 45,
       'it saves what it is, from where, how many and the price, not ordered yet');
    ok(Math.abs(j._net - 90) < 0.005, 'two at 45 is 90 before VAT');

    await click(w, q(w, `[data-conf="${id}"]`));
    ok(cur(server, id).status === 'pricing', 'once confirmed it goes to To be ordered, not straight to ready');
    await click(w, q(w, '[data-f="pricing"]'));
    ok(!!q(w, '.subtabs') && q(w, '[data-sub="maintenance"]').classList.contains('on'),
       'To be ordered opens on Maintenance, the kind with something in it');
    ok(cardNames(w).join() === 'Handle Harry', 'and shows the job');
    const c = q(w, '#list .job');
    ok(/To order/.test(txt(c.querySelector('.docket'))) && /Maintenance · Tudor/.test(txt(c.querySelector('.docket')))
       && txt(c.querySelector('.docket .wname')) === '2 white espagnolette handles×2',
       'its card says what is to order, from where, and how many');
    await click(w, c.querySelector('[data-ordj]'));
    j = cur(server, id);
    ok(j.status === 'order' && j.works[0].ostate === 'ordered' && j.works[0].orderedAt, 'Mark as ordered puts it on order');
    await click(w, q(w, '[data-f="order"]'));
    ok(q(w, '[data-sub="maintenance"]').classList.contains('on') && cardNames(w).join() === 'Handle Harry', 'it is under On order, Maintenance');
    ok(/Ordered on/.test(txt(q(w, '#list .job .docket'))), 'saying when it was ordered');
    await click(w, q(w, '#list [data-arr]'));
    j = cur(server, id);
    ok(j.status === 'ready' && j.works[0].ostate === 'arrived', 'Tudor delivered makes it ready');
    w.close();
  }
  {
    const { w, server } = await boot({ seed: [maint({ id: 'p', no: 81, name: 'Plain Polly' }),
                                              framesJob({ id: 'r', no: 82, name: 'Ready Rob', needsOrder: false })] });
    await click(w, q(w, '[data-conf="p"]'));
    ok(cur(server, 'p').status === 'ready', 'maintenance with nothing to order goes straight to ready, as before');
    await click(w, q(w, '[data-conf="r"]'));
    ok(cur(server, 'r').status === 'ready', 'so do frames with nothing to order');
    await click(w, q(w, '[data-f="all"]'));
    const rc = qa(w, '#list .job').find(c => /Ready Rob/.test(c.textContent));
    ok(/Ready/.test(txt(rc.querySelector('.docket .src'))), 'the frame reads Ready');
    w.close();
  }
  {
    const { w } = await boot({ seed: [] });
    await click(w, $(w, 'newBtn'));
    await click(w, $(w, 'addFrame'));
    const t0 = () => q(w, '#frames [data-lord="0"]');
    ok(!!t0() && !t0().checked, 'frames ask Needs to order? too, one frame at a time');
    await type(w, q(w, '[data-fsup="0"]'), 'Trade Frames');
    ok(t0().checked, 'saying where a frame is coming from ticks it');
    await tick(w, t0(), false);
    await type(w, q(w, '[data-fsup="0"]'), 'Trade Frames Ltd');
    ok(!t0().checked && !t0().closest('.ltick').classList.contains('on'), 'untick it and it stays unticked while the name is finished off');
    w.close();
  }
  {
    /* from before Needs to order? existed: frames were always ordered */
    const seed = [
      framesJob({ id: 'o', no: 83, name: 'Old On Order', confirmed: true, status: 'order',
                  frames: [{ desc: 'Casement', w: '1200', h: '900', q: '1', price: 300, supplier: 'Trade Frames', arrived: false }] }),
      framesJob({ id: 'q', no: 84, name: 'Old Quote', frames: [{ desc: 'Casement', w: '1200', h: '900', q: '1', price: 300, arrived: false }] })
    ];
    const { w, server } = await boot({ seed });
    ok(w.eval("JOBS.find(j=>j.id==='o').frames[0].order") === true && w.eval("bucket('order').some(j=>j.id==='o')"),
       'an older confirmed frames job stays on order');
    await click(w, q(w, '[data-conf="q"]'));
    ok(cur(server, 'q').status === 'pricing', 'and an older frames quote goes to To be ordered once confirmed');
    await click(w, q(w, '[data-f="order"]'));
    ok(q(w, '[data-sub="frames"]').classList.contains('on') && cardNames(w).join() === 'Old On Order', 'under On order, Frames');
    w.close();
  }

  console.log('\n--- Glass, Maintenance and Frames inside the tabs ---');
  {
    const seed = [
      job({ id: 'g1', no: 91, name: 'Glass One', confirmed: true, status: 'pricing', items: [orderPiece()] }),
      job({ id: 'g2', no: 92, name: 'Glass Two', confirmed: true, status: 'pricing', items: [orderPiece({ supplier: 'Tudor' })] }),
      maint({ id: 'm1', no: 93, name: 'Maint One', confirmed: true, status: 'pricing', needsOrder: true,
              workOrder: { what: 'Hinges', supplier: 'Tudor', ostate: 'toprice' } }),
      framesJob({ id: 'f1', no: 94, name: 'Frame One', confirmed: true, status: 'pricing', needsOrder: true,
                  frames: [{ desc: 'Casement', w: '1200', h: '900', q: '1', price: 300, supplier: 'Trade Frames', ostate: 'toprice' }] })
    ];
    const { w } = await boot({ seed });
    ok(count(w, 'pricing') === 4, 'To be ordered counts every kind');
    await click(w, q(w, '[data-f="pricing"]'));
    ok(qa(w, '.subtabs [data-sub]').map(b => b.dataset.sub).join() === 'glass,maintenance,frames', 'it is split into Glass, Maintenance and Frames');
    ok(subCount(w, 'glass') === 2 && subCount(w, 'maintenance') === 1 && subCount(w, 'frames') === 1, 'each with its own count');
    ok(q(w, '[data-sub="glass"]').classList.contains('on') && !!q(w, '[data-po="Firmans"]') && !!q(w, '[data-po="Tudor"]'),
       'Glass still shows the order list, with an email for each supplier');
    await click(w, q(w, '[data-sub="maintenance"]'));
    ok(cardNames(w).join() === 'Maint One', 'Maintenance shows only maintenance');
    await click(w, q(w, '[data-sub="frames"]'));
    ok(cardNames(w).join() === 'Frame One', 'Frames shows only frames');
    $(w, 'search').value = 'One';
    $(w, 'search').dispatchEvent(new w.Event('input', { bubbles: true })); await settle(w, 3);
    ok(!q(w, '.subtabs') && cardNames(w).length === 3, 'searching looks across everything');
    w.close();
  }
  {
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'); probe.close();
    const j = maint({ id: 'x', no: 95, name: 'Parts Pending', confirmed: true, status: 'order', handover: 'fitting', needsOrder: true,
                      workOrder: { what: 'Hinges', supplier: 'Tudor', ostate: 'ordered', orderedAt: '2026-10-20T09:00:00Z' },
                      appts: [{ kind: 'fit', date: today, time: '09:00', mins: 60 }] });
    const { w, server } = await boot({ seed: [j] });
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    ok(/the parts have not arrived/.test(txt(q(w, '.dayalert'))), 'a fitting waiting on parts is flagged on the day sheet');
    await click(w, $(w, 'closeDay'));
    await click(w, q(w, '[data-move="x"]'));
    await click(w, q(w, '#moveBody [data-moveto="quote"]'));
    ok(cur(server, 'x').works[1].ostate === 'toprice' && !cur(server, 'x').works[1].orderedAt && !('workOrder' in cur(server, 'x')),
       'Move back to Quotes takes the parts off order');
    w.close();
  }

  console.log('\n--- changing a time from the diary ---');
  const daySeed = today => [
    job({ id: 'a', no: 101, name: 'Alpha', confirmed: true, status: 'ready', handover: 'fitting', addr: '1 Hall Lane, RM14 1AU',
          items: [orderPiece({ ostate: 'arrived' })], appts: [{ kind: 'fit', date: today, time: '09:00', mins: 60 }] }),
    job({ id: 'b', no: 102, name: 'Bravo', confirmed: true, status: 'ready', handover: 'fitting', addr: '2 Corbets Tey Road, RM14 2AB',
          items: [orderPiece({ ostate: 'arrived' })], appts: [{ kind: 'fit', date: today, time: '11:00', mins: 60 }] }),
    job({ id: 'c', no: 103, name: 'Charlie', confirmed: true, status: 'ready', handover: 'fitting', addr: '3 Front Lane, RM14 3DA',
          items: [orderPiece({ ostate: 'arrived' })], appts: [{ kind: 'fit', date: today, time: '13:00', mins: 60 }] })
  ];
  const stops = w => qa(w, '#dayBody .tl .stop');
  const names = w => stops(w).map(s => txt(s.querySelector('h3')).replace(/^\d+/, ''));
  {
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'), tomorrow = probe.eval('shiftDay(ymd(new Date()),1)'); probe.close();
    const { w, server } = await boot({ seed: daySeed(today) });
    try { w.localStorage.removeItem('wg-daymode-v1'); } catch (e) {}
    w.eval("dayMode='time'");
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    ok(stops(w).every(s => /Change time/.test(txt(s.querySelector('[data-retime]')))), 'every stop has a Change time button');
    await click(w, stops(w)[0].querySelector('[data-retime]'));
    ok(!!q(w, '#dayBody .retime') && $(w, 'rtTime').value === '09:00' && $(w, 'rtDate').value === today && $(w, 'rtMins').value === '60',
       'it opens on the stop, filled in with its day, time and length');
    $(w, 'rtTime').value = '15:30'; $(w, 'rtMins').value = '90';
    await click(w, q(w, '[data-rtsave]'));
    const a = cur(server, 'a').appts[0];
    ok(a.time === '15:30' && a.mins === 90 && a.date === today, 'Save the new time keeps it on the day at the new time');
    ok(names(w).join() === 'Bravo,Charlie,Alpha' && !q(w, '#dayBody .retime'), 'and the day re-sorts, with the box closed');
    ok(/now at 15:30/.test(txt($(w, 'toast'))), 'and says so');
    await click(w, q(w, '#dayBody .undobar [data-undo]'));
    ok(cur(server, 'a').appts[0].time === '09:00', 'Undo puts the old time back');

    await click(w, stops(w)[1].querySelector('[data-retime]'));
    await click(w, q(w, '[data-rtcancel]'));
    ok(!q(w, '#dayBody .retime') && cur(server, 'b').appts[0].time === '11:00', 'Cancel closes it and changes nothing');

    await click(w, stops(w)[1].querySelector('[data-retime]'));
    $(w, 'rtDate').value = tomorrow;
    await click(w, q(w, '[data-rtsave]'));
    ok(cur(server, 'b').appts[0].date === tomorrow && names(w).indexOf('Bravo') < 0, 'changing the day moves it off this one');
    ok(/moved to/.test(txt($(w, 'toast'))), 'and the message says which day');
    await click(w, $(w, 'closeDay'));

    /* the day under the calendar has it too */
    await click(w, q(w, '[data-f="diary"]'));
    const slot = qa(w, '#list .slot').find(s => /Charlie/.test(s.textContent));
    await click(w, slot.querySelector('[data-retime]'));
    $(w, 'rtTime').value = '14:15';
    await click(w, q(w, '#list [data-rtsave]'));
    ok(cur(server, 'c').appts[0].time === '14:15', 'and so does the day under the calendar in the Diary');
    w.close();
  }

  console.log('\n--- putting the day in order ---');
  {
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'); probe.close();
    const server = makeServer();
    const { w } = await boot({ server, seed: daySeed(today) });
    w.eval("dayMode='time'");
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    ok(qa(w, '#dayBody [data-dmode]').map(b => b.dataset.dmode).join() === 'time,manual,route',
       'the day can be put in order by Time, Manual or Quickest route');
    ok(q(w, '#dayBody [data-dmode="time"]').classList.contains('on') && names(w).join() === 'Alpha,Bravo,Charlie', 'by time to start with');

    await click(w, q(w, '#dayBody [data-dmode="manual"]'));
    ok(w.localStorage.getItem('wg-daymode-v1') === 'manual', 'the choice is remembered on the device');
    const pick = stops(w)[0].querySelector('[data-seq]');
    ok(!!pick && [...pick.options].map(o => o.textContent).join() === '1st,2nd,3rd', 'Manual gives each stop a 1st, 2nd, 3rd');
    pick.value = '3'; pick.dispatchEvent(new w.Event('change', { bubbles: true })); await settle(w, 12);
    ok(names(w).join() === 'Bravo,Charlie,Alpha', 'choosing 3rd for the first stop moves it to the end');
    ok(cur(server, 'a').appts[0].seq === 3 && cur(server, 'b').appts[0].seq === 1 && cur(server, 'c').appts[0].seq === 2,
       'the order is kept on the bookings');
    ok(/not in this order/.test(txt($(w, 'dayBody'))), 'it says when the times no longer match the order');
    const route = q(w, '#dayBody .dayacts a.maplink').getAttribute('href');
    ok(route.indexOf(encodeURIComponent('2 Corbets Tey Road')) < route.indexOf(encodeURIComponent('1 Hall Lane')),
       'the route in Maps follows that order');
    await click(w, $(w, 'dayPrint'));
    ok(w._printed.indexOf('Bravo') < w._printed.indexOf('Alpha'), 'and so does the printed run sheet');

    const other = await boot({ server, seed: [] });
    other.w.eval("dayMode='manual'"); other.w.eval('openDay(ymd(new Date()))'); await settle(other.w, 3);
    ok(names(other.w).join() === 'Bravo,Charlie,Alpha', 'another device in Manual shows the same order');
    other.w.eval("dayMode='time'"); other.w.eval('renderDay()'); await settle(other.w, 3);
    ok(/put in order by hand/.test(txt(other.w.document.getElementById('dayBody'))), 'and in Time it says the day has been put in order by hand');
    other.w.close();

    await click(w, q(w, '#dayBody .undobar [data-undo]'));
    ok(cur(server, 'a').appts[0].seq === undefined, 'Undo takes the order back off');
    w.close();
  }
  {
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'); probe.close();
    const fit = (id, no, name, addr, time) => job({ id, no, name, confirmed: true, status: 'ready', handover: 'fitting', addr,
      items: [orderPiece({ ostate: 'arrived' })], appts: [{ kind: 'fit', date: today, time, mins: 60 }] });
    const seed = [
      fit('w', 111, 'West', '5 Warren Drive, Hornchurch RM12 4PL', '09:00'),
      fit('e', 112, 'East', '9 Front Lane, Cranham, RM14 3DA', '10:00'),
      fit('n', 113, 'North', '4 Hall Lane, RM14 1AU', '11:00'),
      fit('s', 114, 'South', '7 Corbets Tey Road, rm14 2ab', '12:00'),
      fit('b', 115, 'Brentwood', '1 Hutton Road, CM13 3AB', '13:00'),
      fit('x', 116, 'Nowhere', '14 High Street', '08:00')
    ];
    const server = makeServer();
    const { w } = await boot({ server, seed });
    w.eval("dayMode='time'");
    w.eval('openDay(ymd(new Date()))'); await settle(w, 3);
    await click(w, q(w, '#dayBody [data-dmode="route"]'));
    await settle(w, 30);
    const got = names(w);
    ok(got[got.length - 1] === 'Nowhere' && /No postcode found for 116 Nowhere/.test(txt($(w, 'dayBody'))),
       'a stop with no postcode goes at the end, and it says so');
    /* the best possible round trip, tried every way, to check against */
    const P = name => ({ West: 'RM12 4PL', East: 'RM14 3DA', North: 'RM14 1AU', South: 'RM14 2AB', Brentwood: 'CM13 3AB' })[name];
    const at = pc => { const v = server.postcodes.get(pc); return { lat: v[0], lon: v[1] }; };
    const km = (a, b) => { const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
      const s = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(s)); };
    const shop = at('RM14 2QT');
    const tour = list => { let s = 0, p = shop; list.forEach(n => { s += km(p, at(P(n))); p = at(P(n)); }); return s + km(p, shop); };
    const perms = a => a.length < 2 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map(r => [x].concat(r)));
    const best = Math.min(...perms(['West', 'East', 'North', 'South', 'Brentwood']).map(tour));
    const placed = got.slice(0, 5);
    ok(Math.abs(tour(placed) - best) < 1e-9, 'Quickest route finds the shortest round trip from the shop and back');
    ok(tour(placed) < tour(['West', 'East', 'North', 'South', 'Brentwood']) - 1, 'which is shorter than going in time order');
    ok(/about \d+ miles/.test(txt($(w, 'dayBody'))), 'and says roughly how far it is');
    const route = q(w, '#dayBody .dayacts a.maplink').getAttribute('href');
    const wp = decodeURIComponent(route.split('waypoints=')[1]).split('|');
    ok(wp.length === 6 && placed.every((n, i) => wp[i].indexOf({ West: 'Warren', East: 'Front', North: 'Hall', South: 'Corbets', Brentwood: 'Hutton' }[n]) >= 0),
       'the route in Maps goes in that order');
    ok(/origin=6%20St%20Mary's%20Lane%2C%20Upminster%2C%20Essex%2C%20RM14%202QT/.test(route.replace(/'/g, "'")) || route.indexOf(encodeURIComponent('RM14 2QT')) > 0,
       'starting from the shop, by its postcode');
    const looked = server.log.filter(l => /postcodes/.test(l)).length;
    w.eval('for(const k in ROUTES) delete ROUTES[k]; renderDay()'); await settle(w, 30);
    await click(w, q(w, '#dayBody [data-dmode="time"]'));
    await click(w, q(w, '#dayBody [data-dmode="route"]')); await settle(w, 10);
    ok(server.log.filter(l => /postcodes/.test(l)).length === looked && names(w).join() === got.join(),
       'postcodes are only looked up once, and kept on the device');

    /* the best order, checked against every possible order, for days the
       made-up postcodes above are too tidy to test */
    const res = JSON.parse(w.eval(`(()=>{ let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
      const out=[]; for(let t=0;t<40;t++){ const home={lat:51.55+rnd()*0.05,lon:0.20+rnd()*0.12};
        const pts=Array.from({length:8},()=>({lat:51.52+rnd()*0.10,lon:0.15+rnd()*0.22}));
        out.push({home,pts,got:shortestRound(home,pts).km}); } return JSON.stringify(out); })()`));
    const worst = Math.max(...res.map(r => {
      const tourOf = o => { let s = 0, p = r.home; o.forEach(i => { s += km(p, r.pts[i]); p = r.pts[i]; }); return s + km(p, r.home); };
      const bestHere = Math.min(...perms([0, 1, 2, 3, 4, 5, 6, 7]).map(tourOf));
      return r.got - bestHere; }));
    ok(worst < 1e-9, 'on 40 made-up days of 8 stops it always finds the shortest round trip');
    w.close();
  }
  {
    const { w: probe } = await boot({ seed: [] });
    const today = probe.eval('ymd(new Date())'); probe.close();
    const server = makeServer(); server.postcodesDown = true;
    const { w } = await boot({ server, seed: daySeed(today) });
    try { w.localStorage.removeItem('wg-pcgeo-v1'); } catch (e) {}
    w.eval("dayMode='route'; PCGEO={}");
    w.eval('openDay(ymd(new Date()))'); await settle(w, 30);
    ok(/Could not look the postcodes up/.test(txt($(w, 'dayBody'))) && names(w).join() === 'Alpha,Bravo,Charlie',
       'with no connection to the postcode lookup, it says so and keeps time order');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

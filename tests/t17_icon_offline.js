/* Round 13: the app icon, opening with no signal, the new-version bar,
   and opening on the Diary.

   Run from the repo root:  node tests/t17_icon_offline.js               */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { boot, settle, makeServer, $, q, qa, click, type, job } = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m))
                       : (fail++, console.log('  FAIL ' + m));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const pause = ms => new Promise(r => setTimeout(r, ms));
/* if something never answers, say so rather than stopping quietly */
setTimeout(() => { console.log('  FAIL the tests stopped part way: something never answered'); process.exit(1); }, 120000);

const PUB = ['public', '../public'].find(p => fs.existsSync(path.join(p, 'index.html')));
if (!PUB) { console.error('Run from the repo root'); process.exit(1); }
const file = f => path.join(PUB, f.replace(/^\//, '') || 'index.html');
const html = fs.readFileSync(file('index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const BUILD = (/<meta name="wg-build" content="([^"]+)"/.exec(html) || [])[1];

/* a PNG's size and colour type, read from its header */
const png = f => { const b = fs.readFileSync(file(f));
  return { sig: b.slice(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20), colour: b[25] }; };

(async () => {
  /* =================================================================== */
  console.log('\n--- it opens on the Diary ---');
  {
    const today = new Date(); const ymd = d => d.toISOString().slice(0, 10);
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const { w } = await boot({ tab: null, seed: [job({ status: 'cut', name: 'Mrs Okafor',
      appts: [{ kind: 'fit', date: t, time: '09:00', mins: 120 }] })] });
    ok(w.eval('filter') === 'diary', 'the app starts on the Diary');
    ok(q(w, '#rail [data-f="diary"]').classList.contains('on'), 'and the Diary tab is lit');
    ok(w.eval('selDay') === t, 'with today picked');
    ok(!!q(w, '#list .cell.today.sel'), 'today is marked on the month');
    ok(/Mrs Okafor/.test(txt(q(w, '#list .daypanel'))), "and today's bookings are listed under it");
    await type(w, $(w, 'search'), 'Okafor');
    ok(qa(w, '#list .job').length === 1 && /Mrs Okafor/.test(txt(q(w, '#list .job'))),
       'searching from the Diary still finds the job');
    await type(w, $(w, 'search'), '');
    ok(!!q(w, '#list .daypanel'), 'and clearing the search goes back to the Diary');
    await click(w, q(w, '#rail [data-f="all"]'));
    ok(w.eval('filter') === 'all' && qa(w, '#list .job').length === 1, 'Live shows the list as before');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- the icon and what installs it ---');
  {
    ok(/<link rel="manifest" href="\/manifest\.json" crossorigin="use-credentials">/.test(head),
       'the page names its manifest, sent with the login cookie for when Cloudflare Access is on');
    ok(/<meta name="theme-color" content="#16262B">/.test(head), 'the title bar matches the header');
    ok(/<meta name="apple-mobile-web-app-title" content="Job Book">/.test(head), 'iPhones label it Job Book');
    const touch = (/rel="apple-touch-icon" href="([^"]+)"/.exec(head) || [])[1];
    const fav = (/rel="icon" href="([^"]+)"/.exec(head) || [])[1];
    ok(touch && fs.existsSync(file(touch)), 'the iPhone icon it names is there');
    ok(fav && fs.existsSync(file(fav)), 'and so is the browser tab icon');

    let m = null;
    try { m = JSON.parse(fs.readFileSync(file('manifest.json'), 'utf8')); } catch (e) {}
    ok(!!m, 'manifest.json reads as JSON');
    ok(m && m.name === "Wilson's Glass Job Book" && m.short_name === 'Job Book', "it is called Wilson's Glass Job Book, Job Book for short");
    ok(m && m.start_url === '/' && m.scope === '/' && m.display === 'standalone', 'it opens the job book, full screen');
    const icons = (m && m.icons) || [];
    const has = (size, purpose) => icons.find(i => i.sizes === size && i.purpose === purpose);
    ok(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'),
       'it lists the 192 and 512 icons, and one Android can crop');
    let sizesRight = icons.length > 0;
    icons.forEach(i => { const [W, H] = i.sizes.split('x').map(Number);
      if (!fs.existsSync(file(i.src))) { sizesRight = false; return; }
      const p = png(i.src); if (p.sig !== 'PNG' || p.w !== W || p.h !== H) sizesRight = false; });
    ok(sizesRight, 'every icon it lists is there, a PNG of the size it says');
    ok(png(has('512x512', 'maskable').src).colour === 2, 'the Android one is solid, with no see-through corners');
    ok(png('icons/apple-touch-icon.png').colour === 2 && png('icons/apple-touch-icon.png').w === 180,
       'the iPhone one is 180 pixels and solid, as iPhones want');
    ok(png(has('512x512', 'any').src).colour === 6, 'the plain one has see-through rounded corners');
    const ico = fs.readFileSync(file('favicon.ico'));
    const n = ico.readUInt16LE(4), sizes = [];
    for (let i = 0; i < n; i++) sizes.push(ico[6 + i * 16] || 256);
    ok(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && [16, 32, 48].every(s => sizes.includes(s)),
       'the tab icon holds 16, 32 and 48 pixel sizes');
  }

  /* =================================================================== */
  console.log('\n--- the fonts come with the app ---');
  {
    ok(!/fonts\.googleapis|fonts\.gstatic/.test(html), 'nothing is fetched from Google Fonts');
    const faces = [...style.matchAll(/@font-face\{([^}]*)\}/g)].map(x => x[1]);
    const srcs = faces.map(f => (/url\(([^)]+)\)/.exec(f) || [])[1]);
    ok(faces.length === 14, 'Archivo in four weights and IBM Plex Mono in three, plain and accented letters');
    ok(srcs.every(s => s && fs.existsSync(file(s)) && fs.readFileSync(file(s)).slice(0, 4).toString() === 'wOF2'),
       'every font file the page names is there, and is a real font');
    const weightsOf = fam => faces.filter(f => f.includes(`font-family:'${fam}'`)).map(f => +(/font-weight:(\d+)/.exec(f) || [])[1]);
    const used = [...new Set([...style.replace(/@font-face\{[^}]*\}/g, '').matchAll(/font-weight:\s*(\d+)/g)].map(x => +x[1]))];
    ok(used.every(u => weightsOf('Archivo').includes(u)), 'every weight the app uses has its own file (' + used.sort().join(', ') + ')');
    ok(faces.every(f => { const wt = (/font-weight:(\d+)/.exec(f) || [])[1]; return new RegExp('-' + wt + '-normal\\.woff2').test(f); }),
       "each weight points at that weight's own file");
    ok(['Archivo', 'IBM Plex Mono'].every(fam => weightsOf(fam).every(wt =>
         faces.filter(f => f.includes(`font-family:'${fam}'`) && f.includes('font-weight:' + wt + ';')).length === 2)),
       'with plain and accented letters for every weight');
    ok(faces.every(f => /font-display:swap/.test(f)), 'text shows straight away while a font loads');
    const pre = (/rel="preload" href="([^"]+)" as="font"/.exec(head) || [])[1];
    ok(pre && fs.existsSync(file(pre)), 'the main font is asked for early');
    ok(fs.existsSync(file('fonts/LICENSE-Archivo.txt')) && fs.existsSync(file('fonts/LICENSE-IBM-Plex-Mono.txt')),
       'with their licences');
  }

  /* =================================================================== */
  console.log('\n--- the app asks the browser to keep a copy of it ---');
  {
    const calls = [];
    const { w } = await boot({ before: w => {
      Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: u => { calls.push(u); return Promise.resolve({}); } } });
      Object.defineProperty(w, 'isSecureContext', { value: true });
    } });
    await settle(w);
    ok(calls.length === 1 && calls[0] === '/sw.js', 'it registers /sw.js once');
    w.close();
  }
  {
    const { w } = await boot({ before: w => {
      Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => Promise.reject(new Error('no')) } });
      Object.defineProperty(w, 'isSecureContext', { value: true });
    } });
    await settle(w);
    ok(qa(w, '#list .job').length >= 0 && !!q(w, '#rail .chip.on'), 'and carries on as normal if the browser says no');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- sw.js, in a pretend browser ---');
  {
    const ORIGIN = 'https://glass-calculator.test';
    const code = fs.readFileSync(file('sw.js'), 'utf8');
    const KEEP = [...((/const KEEP = \[([\s\S]*?)\];/.exec(code) || [])[1] || '').matchAll(/'([^']+)'/g)].map(x => x[1]);
    const CACHE = 'wg-app-' + (/const VERSION = '([^']+)'/.exec(code) || [])[1];

    const resp = (body, o = {}) => { const status = o.status || 200, type = o.type || 'basic';
      return { body, status, type, ok: status >= 200 && status < 300, clone: () => resp(body, { status, type }), text: async () => body }; };
    const stores = new Map();
    const key = (r, o) => { const u = new URL(typeof r === 'string' ? r : r.url, ORIGIN); if (o && o.ignoreSearch) u.search = ''; return u.href; };
    const store = n => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
    let net = null, fetched = [];
    const world = {
      caches: {
        async open(n) { const m = store(n); return {
          async addAll(reqs) { for (const r of reqs) { const res = await world.fetch(r); if (!res.ok) throw new TypeError('bad'); m.set(key(r), res); } },
          async put(r, res) { m.set(key(r), res); },
          async match(r, o) { const k = key(r, o); for (const [kk, v] of m) if (key(kk, o) === k) return v; return undefined; } }; },
        async keys() { return [...stores.keys()]; },
        async delete(n) { return stores.delete(n); }
      },
      fetch: r => { const u = typeof r === 'string' ? r : r.url; fetched.push(u); return net(new URL(u, ORIGIN)); }
    };
    const on = {}; let skipped = false, claimed = false;
    const sandbox = {
      self: { addEventListener: (t, f) => { on[t] = f; }, location: new URL(ORIGIN + '/sw.js'),
              skipWaiting: async () => { skipped = true; }, clients: { claim: async () => { claimed = true; } } },
      caches: world.caches, fetch: r => world.fetch(r), URL, Promise, console,
      Request: class { constructor(u, o) { this.url = new URL(u, ORIGIN).href; this.cache = o && o.cache; this.method = 'GET'; this.mode = 'cors'; } },
      setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 25))     /* WAIT shortened for the test */
    };
    vm.runInNewContext(code, sandbox);
    const disk = u => { const p = file(u.pathname === '/' ? 'index.html' : u.pathname);
      return fs.existsSync(p) ? resp(fs.readFileSync(p, 'utf8')) : resp('missing', { status: 404 }); };
    const lifecycle = async (t) => { const waits = []; on[t]({ waitUntil: p => waits.push(p) }); await Promise.all(waits); };
    /* a request the way the browser sends it; null if sw.js leaves it alone */
    const ask = async (url, mode = 'cors', method = 'GET') => {
      let reply = null; const waits = [];
      on.fetch({ request: { url: new URL(url, ORIGIN).href, mode, method },
                 respondWith: p => { reply = Promise.resolve(p); }, waitUntil: p => waits.push(p) });
      if (!reply) return null;
      /* let it finish keeping things, without waiting on a server that never answers */
      try { return await reply; } finally { for (let i = 0; i < 3; i++) await Promise.race([Promise.allSettled(waits.slice()), pause(40)]); }
    };
    const pageKept = async () => { const r = await store(CACHE).get(ORIGIN + '/'); return r && r.body; };

    ok(KEEP.length >= 10 && KEEP.every(u => fs.existsSync(file(u))), 'every file it keeps is in public/ (' + KEEP.length + ')');
    const headFiles = [...head.matchAll(/(?:href)="(\/[^"]+)"/g)].map(x => x[1]);
    ok(headFiles.every(f => KEEP.includes(f)), 'including everything the page itself names at the top');

    net = disk;
    stores.set('wg-app-2026-01-01', new Map()); stores.set('someone-else', new Map());
    await lifecycle('install');
    ok(store(CACHE).size === KEEP.length && skipped, 'installing keeps a copy of each of them');
    await lifecycle('activate');
    ok(!stores.has('wg-app-2026-01-01') && stores.has(CACHE) && stores.has('someone-else') && claimed,
       "starting up clears out an older version's copies, and nothing else");

    net = () => Promise.resolve(resp('<html>version 2</html>'));
    let r = await ask('/', 'navigate');
    ok(r && r.body === '<html>version 2</html>', 'with a signal, the page comes from the server');
    ok(await pageKept() === '<html>version 2</html>', 'and the copy is brought up to date');

    net = () => Promise.reject(new TypeError('offline'));
    r = await ask('/', 'navigate');
    ok(r && r.body === '<html>version 2</html>', 'with no signal, it opens the copy');
    r = await ask('/?from=homescreen', 'navigate');
    ok(r && r.body === '<html>version 2</html>', 'however it was opened');

    let arrive; net = () => new Promise(res => { arrive = res; });
    r = await ask('/', 'navigate');
    ok(r && r.body === '<html>version 2</html>', 'with a signal too weak to answer in time, it opens the copy');
    arrive(resp('<html>version 3</html>')); await pause(30);
    ok(await pageKept() === '<html>version 3</html>', 'and keeps the newer page when it does arrive');

    net = () => Promise.resolve(resp('Worker threw an error', { status: 500 }));
    r = await ask('/', 'navigate');
    ok(r && r.status === 500 && await pageKept() === '<html>version 3</html>', 'a server error is not kept over the good copy');
    net = () => Promise.resolve(resp('', { status: 0, type: 'opaqueredirect' }));
    r = await ask('/', 'navigate');
    ok(r && r.type === 'opaqueredirect' && await pageKept() === '<html>version 3</html>',
       'nor is a redirect to a login page');

    fetched = [];
    ok(await ask('/api/sync?since=12') === null, 'the job book itself (/api/) is never touched');
    ok(await ask('/api/jobs/j1', 'cors', 'PUT') === null && await ask('/', 'navigate', 'POST') === null, 'nor are saves');
    ok(await ask('https://api.postcodes.io/postcodes', 'cors', 'POST') === null && await ask('https://www.google.com/maps/dir/', 'navigate') === null
       && await ask('https://cdn.example.com/fonts/x.woff2') === null, 'nor anything on another site');
    ok(await ask('/p/8f3k2j', 'navigate') === null, 'nor a photo link');
    ok(await ask('/', 'cors') === null, "nor the app's own check for a new version, which must reach the server");
    ok(fetched.length === 0, 'none of those went through it');

    const fresh = new Map(); net = u => Promise.resolve(fresh.get(u.pathname) || disk(u));
    store(CACHE).delete(ORIGIN + '/fonts/archivo-latin-ext-400-normal.woff2');
    r = await ask('/fonts/archivo-latin-ext-400-normal.woff2');
    ok(r && r.ok && store(CACHE).has(ORIGIN + '/fonts/archivo-latin-ext-400-normal.woff2'), 'a font not kept yet is fetched and kept');
    net = () => Promise.reject(new TypeError('offline'));
    r = await ask('/fonts/archivo-latin-ext-400-normal.woff2');
    ok(r && r.ok, 'and is there next time with no signal');
    r = await ask('/icons/apple-touch-icon.png?v=2');
    ok(r && r.ok, 'icons too, whatever is on the end of the address');

    const empty = new Map(); stores.set(CACHE, empty);
    let threw = false; try { await ask('/', 'navigate'); } catch (e) { threw = true; }
    ok(threw, 'with no signal and no copy yet, the browser shows its own no-connection page');
  }

  /* =================================================================== */
  console.log('\n--- the new-version bar ---');
  {
    ok(!!BUILD, 'the page carries a build mark (' + BUILD + ')');
    const server = makeServer();
    let live = BUILD, down = false, asks = 0;
    server.extra = (url) => {
      if (url !== '/') return null;
      asks++;
      if (down) throw new Error('offline');
      return { ok: true, status: 200, text: async () => `<!DOCTYPE html><head><meta name="wg-build" content="${live}"></head>` };
    };
    const pageAsks = () => asks;
    const { w } = await boot({ server, seed: [job()] });
    w.reloadApp = () => { w._reloaded = (w._reloaded || 0) + 1; };
    ok(w.eval('BUILD') === BUILD, 'the app knows which version it is');

    await w.eval('checkBuild(true)'); await settle(w);
    ok(!q(w, '.banner.update'), 'no bar while it is the newest');
    live = '2026-12-01.1';
    await w.eval('checkBuild()'); await settle(w);
    ok(!q(w, '.banner.update') && pageAsks() === 1, 'it does not ask again within ten minutes');
    w.eval('BUILDAT = Date.now() - 11 * 60 * 1000'); w.eval('pollTick()'); await settle(w, 20);
    ok(pageAsks() === 2, 'but does after ten minutes, on its regular refresh');
    const bar = q(w, '.banner.update');
    ok(!!bar && /A new version of the job book is ready/.test(txt(bar)), 'and shows the bar when the server has a newer version');
    ok(!!q(w, '.banner.update [data-update]') && /Update now/.test(txt(q(w, '.banner.update button'))), 'with an Update now button');
    await click(w, q(w, '#rail [data-f="diary"]'));
    ok(!!q(w, '.banner.update'), 'the bar stays put on other tabs, the Diary included');
    ok(!w._reloaded, 'nothing has reloaded by itself');
    await click(w, q(w, '[data-update]'));
    ok(w._reloaded === 1, 'Update now loads the new version');

    live = BUILD; w.eval('BUILDAT = 0'); await w.eval('checkBuild()'); await settle(w);
    ok(!q(w, '.banner.update'), 'if the newer version is taken back off, the bar goes');
    live = '2026-12-01.1'; down = true; await w.eval('checkBuild(true)'); await settle(w);
    ok(!q(w, '.banner.update'), 'no signal: no bar and no error');
    down = false;
    /* even an error page that happens to carry a build mark */
    server.extra = (url) => url === '/' ? (asks++, { ok: false, status: 503,
      text: async () => '<meta name="wg-build" content="2099-01-01.1"> Service unavailable' }) : null;
    await w.eval('checkBuild(true)'); await settle(w);
    ok(!q(w, '.banner.update'), 'a server that is not answering properly does not bring the bar up either');

    Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true });
    const before = asks;
    w.eval('BUILDAT = 0'); w.eval('pollTick()'); await settle(w, 20);
    ok(asks === before, 'nothing is checked while the app is off screen');
    w.close();
  }
  {
    const server = makeServer();
    server.extra = url => url === '/' ? { ok: true, status: 200, text: async () => '<meta name="wg-build" content="2027-01-01.1">' } : null;
    const { w } = await boot({ server, seed: [job()], before: w => w.offline() });
    ok(!w.eval('ONLINE') && !q(w, '.banner.update'), 'opened with no signal, it shows the copy on this machine');
    w.fetch = (u, o) => server.handle(String(u), o);
    await w.eval('refreshNow()'); await settle(w, 20);
    ok(w.eval('ONLINE') && !!q(w, '.banner.update'), 'and once the signal is back, it checks straight away and offers the newer version');
    w.close();
  }
  {
    const server = makeServer();
    server.extra = url => url === '/' ? { ok: true, status: 200, text: async () => '<meta name="wg-build" content="2027-01-01.1">' } : null;
    const { w } = await boot({ server, seed: [job()] });
    ok(!q(w, '.banner.update'), 'on opening there is no bar straight away');
    await pause(5300); await settle(w, 20);
    ok(!!q(w, '.banner.update'), 'but it checks a few seconds after opening');
    w.close();
  }

  /* =================================================================== */
  console.log('\n--- printing on an iPhone home-screen app ---');
  {
    const { w } = await boot({ seed: [job()] });
    await click(w, $(w, 'printCut'));
    ok(typeof w._printed === 'string', 'in a browser, Print still prints');
    w.close();
  }
  {
    const { w } = await boot({ seed: [job()], before: w => Object.defineProperty(w.navigator, 'standalone', { value: true }) });
    for (const b of ['printCut', 'printOrder', 'printDiary']) await click(w, $(w, b));
    ok(w._printed === undefined, 'on an iPhone home-screen app, the print buttons do not pretend to print');
    ok(/iPhones can't print from the home-screen app\. Print in Safari or on the PC\./.test(txt($(w, 'toast'))),
       'they say why, and what to do instead');
    ok((html.match(/window\.print\(\)/g) || []).length === 1, 'every print button goes through that one check');
    w.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

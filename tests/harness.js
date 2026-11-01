/* Boots index.html in jsdom with a stand-in for the Worker API, so the
   tests exercise the real save path including the version conflict.  */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const CANDIDATES = [process.env.JOBBOOK, 'public/index.html', 'index.html', '../public/index.html'];
const TARGET = CANDIDATES.filter(Boolean).find(p => fs.existsSync(p));
if (!TARGET) { console.error('Could not find index.html. Run from the repo root, or set JOBBOOK=path/to/index.html'); process.exit(1); }


/* A stand-in for postcodes.io: made-up but realistic places round
   Upminster, so the quickest-route tests know where everything is. */
const POSTCODES = {
  'RM14 2QT': [51.5560, 0.2490],   // the shop
  'RM14 1AU': [51.5735, 0.2470],   // Hall Lane, north
  'RM14 2AB': [51.5455, 0.2525],   // Corbets Tey Road, south
  'RM12 4PL': [51.5540, 0.2070],   // Hornchurch, west
  'RM14 3DA': [51.5640, 0.2780],   // Cranham, east
  'CM13 3AB': [51.5940, 0.3290],   // out towards Brentwood
  'RM11 1AA': [51.5770, 0.2120]    // Emerson Park, north-west
};

function makeServer() {
  const rows = new Map();          // id -> {data, version, seq}
  const gone = new Map();          // id -> the change number it was deleted at
  let seqN = 0;                    // the job book's change counter
  const photos = new Map();
  const settings = new Map();
  const settingsV = new Map();      // key -> version, as updated_at in D1
  let vcount = 0;
  const log = [];
  const postcodes = new Map(Object.entries(POSTCODES));
  return {
    rows, gone, settings, settingsV, log, photos, postcodes,
    /* how many jobs have been sent to the app, to see what a refresh costs */
    sent: 0,
    /* oldWorker: no /api/sync at all; noCounter: the database has no
       change numbers yet, so /api/sync always sends everything */
    oldWorker: false, noCounter: false,
    get seq() { return seqN; },
    seed(job) { rows.set(job.id, { data: JSON.stringify(job), version: 1, seq: 0 }); },
    async handle(url, opt) {
      if (this._photoRoute) { const r = this._photoRoute(url, opt); if (r) return r; }
      const method = (opt && opt.method) || 'GET';
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      log.push(method + ' ' + path);
      if (/^https:\/\/api\.postcodes\.io\/postcodes$/.test(url) && method === 'POST') {
        if (this.postcodesDown) throw new Error('offline');
        const asked = JSON.parse(opt.body).postcodes || [];
        return { ok: true, status: 200, json: async () => ({ status: 200, result: asked.map(pc => {
          const at = postcodes.get(String(pc).toUpperCase());
          return { query: pc, result: at ? { postcode: pc, latitude: at[0], longitude: at[1] } : null };
        }) }) };
      }
      const json = (o, status = 200) => ({
        ok: status < 400, status,
        json: async () => o
      });

      if (path === '/api/jobs' && method === 'GET') {
        this.sent += rows.size;
        return json([...rows.values()].map(r => ({ ...JSON.parse(r.data), _v: r.version })));
      }
      /* the same as the real Worker: everything, or just what changed */
      if (path.startsWith('/api/sync') && method === 'GET') {
        if (this.oldWorker) return json({ error: 'not found' }, 404);
        const m = /[?&]since=(-?\d+)/.exec(path), since = m ? +m[1] : -1;
        const all = since < 0 || this.noCounter;
        const jobs = [...rows.values()].filter(r => all || (r.seq || 0) > since)
          .map(r => ({ ...JSON.parse(r.data), _v: r.version }));
        this.sent += jobs.length;
        return json({ all, seq: this.noCounter ? null : seqN, jobs,
                      gone: all ? [] : [...gone.entries()].filter(([, s]) => s > since).map(([id]) => id) });
      }

      /* the same rules as the real Worker: a version per setting, and a
         save is refused unless it names the version it was editing */
      if (path === '/api/settings' && method === 'GET') {
        const out = { _versions: {} };
        settings.forEach((v, k) => { out[k] = JSON.parse(v); out._versions[k] = settingsV.get(k) || 'seed'; });
        return json(out);
      }
      if (path.startsWith('/api/settings/') && method === 'PUT') {
        const key = decodeURIComponent(path.slice('/api/settings/'.length));
        const body = JSON.parse(opt.body);
        const have = settings.has(key), cur = have ? (settingsV.get(key) || 'seed') : null;
        if (have && (body.base ?? null) !== cur)
          return json({ conflict: true, current: { value: JSON.parse(settings.get(key)), version: cur } }, 409);
        const ver = new Date().toISOString().replace('Z', String(++vcount).padStart(4, '0') + 'Z');
        settings.set(key, JSON.stringify(body.value)); settingsV.set(key, ver);
        return json({ ok: true, version: ver });
      }

      if (path.startsWith('/api/jobs/') && method === 'PUT') {
        const id = path.split('/')[3];
        const job = JSON.parse(opt.body);
        const expected = job._v ?? 0;
        delete job._v;
        const cur = rows.get(id);
        if (!cur) {                                   // fresh insert
          rows.set(id, { data: JSON.stringify(job), version: 1, seq: ++seqN });
          gone.delete(id);
          return json({ ok: true, version: expected + 1 });
        }
        if (cur.version !== expected)                 // somebody else got there first
          return json({ conflict: true, current: { ...cur, updated_by: 'the office' } }, 409);
        rows.set(id, { data: JSON.stringify(job), version: cur.version + 1, seq: ++seqN });
        return json({ ok: true, version: expected + 1 });
      }

      if (path.startsWith('/api/jobs/') && method === 'DELETE') {
        const id = path.split('/')[3];
        [...photos.keys()].forEach(k => { if (photos.get(k).job_id === id) photos.delete(k); });
        rows.delete(id);
        gone.set(id, ++seqN);
        return json({ ok: true });
      }

      if (path === '/api/photos' && method === 'POST') {
        const p = JSON.parse(opt.body);
        if (String(p.data).length > 1000000) return json({ error: 'too big' }, 413);
        photos.set(p.id, { id: p.id, job_id: p.jobId, name: p.name, mime: p.mime,
                           bytes: p.data, w: p.w, h: p.h });
        return json({ ok: true, id: p.id });
      }
      if (path.startsWith('/api/photo/') && method === 'GET') {
        const p = photos.get(path.split('/')[3]);
        return p ? json(p) : json({ error: 'not found' }, 404);
      }
      if (path.startsWith('/api/photo/') && method === 'DELETE') {
        photos.delete(path.split('/')[3]);
        return json({ ok: true });
      }
      return json({ error: 'not found' }, 404);
    }
  };
}

async function boot(opts = {}) {
  const html = fs.readFileSync(TARGET, 'utf8');
  const server = opts.server || makeServer();
  (opts.seed || []).forEach(j => server.seed(j));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://glass-calculator.test/',
    beforeParse(w) {
      /* pass opts.mem to share one device's storage between two sessions,
         the way a page reload would */
      const mem = opts.mem || {};
      w.storage = {                                   // shop-wide store stub
        async get(k) { return k in mem ? { value: mem[k] } : null; },
        async set(k, v) { mem[k] = v; return { key: k }; },
      };
      w._mem = mem;
      w.confirm = () => true;
      w.print = () => { w._printed = w.document.getElementById('printarea').innerHTML; };
      w.open = (u) => { (w._opened = w._opened || []).push(u); return null; };
      w.scrollTo = () => {};
      w.fetch = (u, o) => server.handle(String(u), o);
      /* jsdom has no canvas, so the shrink step is stubbed in tests */
      w.__photos = server.photos;
      w.offline = () => { w.fetch = async () => { throw new Error('offline'); }; };
    }
  });

  const w = dom.window;
  await new Promise(r => w.addEventListener('load', r));
  await settle(w);
  return { dom, w, doc: w.document, server };
}

/* let the boot IIFE and any pending awaits drain */
const settle = (w, n = 12) => new Promise(res => {
  let i = 0;
  const tick = () => (++i >= n) ? res() : setTimeout(tick, 0);
  tick();
});

const $ = (w, id) => w.document.getElementById(id);
const q = (w, sel) => w.document.querySelector(sel);
const qa = (w, sel) => [...w.document.querySelectorAll(sel)];
const click = async (w, el) => {
  if (!el) throw new Error('nothing to click');
  el.dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle(w);
};
const type = async (w, el, v) => {
  el.value = v;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  await settle(w, 3);
};
const choose = async (w, el, v) => {
  el.value = v;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
  await settle(w, 3);
};

const job = (over = {}) => Object.assign({
  id: 'j1', no: 1700, name: 'Dave', phone: '07734078017', email: '', trade: false,
  unit: 'mm', items: [{ pid: 'c4mm', w: '500', h: '400', q: '1', addons: [], src: 'cut', supplier: '', arrived: false, cut: false }],
  extras: [], costs: [], discountPct: 0, deposit: 0, cardFee: false,
  handover: 'collection', deliver: false, addr: '', needsMeasure: false,
  appts: [], wanted: '', note: '', called: false, confirmed: false,
  status: 'quote', takenAt: '2026-08-01T09:00:00.000Z'
}, over);

module.exports = { boot, settle, makeServer, $, q, qa, click, type, choose, job };

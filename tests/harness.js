/* Boots index.html in jsdom with a stand-in for the Worker API, so the
   tests exercise the real save path including the version conflict.  */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const CANDIDATES = [process.env.JOBBOOK, 'public/index.html', 'index.html', '../public/index.html'];
const TARGET = CANDIDATES.filter(Boolean).find(p => fs.existsSync(p));
if (!TARGET) { console.error('Could not find index.html. Run from the repo root, or set JOBBOOK=path/to/index.html'); process.exit(1); }


function makeServer() {
  const rows = new Map();          // id -> {data, version}
  const photos = new Map();
  const settings = new Map();
  const log = [];
  return {
    rows, settings, log, photos,
    seed(job) { rows.set(job.id, { data: JSON.stringify(job), version: 1 }); },
    async handle(url, opt) {
      if (this._photoRoute) { const r = this._photoRoute(url, opt); if (r) return r; }
      const method = (opt && opt.method) || 'GET';
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      log.push(method + ' ' + path);
      const json = (o, status = 200) => ({
        ok: status < 400, status,
        json: async () => o
      });

      if (path === '/api/jobs' && method === 'GET')
        return json([...rows.values()].map(r => ({ ...JSON.parse(r.data), _v: r.version })));

      if (path === '/api/settings' && method === 'GET') {
        const out = {};
        settings.forEach((v, k) => { out[k] = JSON.parse(v); });
        return json(out);
      }

      if (path.startsWith('/api/jobs/') && method === 'PUT') {
        const id = path.split('/')[3];
        const job = JSON.parse(opt.body);
        const expected = job._v ?? 0;
        delete job._v;
        const cur = rows.get(id);
        if (!cur) {                                   // fresh insert
          rows.set(id, { data: JSON.stringify(job), version: 1 });
          return json({ ok: true, version: expected + 1 });
        }
        if (cur.version !== expected)                 // somebody else got there first
          return json({ conflict: true, current: { ...cur, updated_by: 'the office' } }, 409);
        rows.set(id, { data: JSON.stringify(job), version: cur.version + 1 });
        return json({ ok: true, version: expected + 1 });
      }

      if (path.startsWith('/api/jobs/') && method === 'DELETE') {
        const id = path.split('/')[3];
        [...photos.keys()].forEach(k => { if (photos.get(k).job_id === id) photos.delete(k); });
        rows.delete(id);
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

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // A photo by its own long random id. This is the link that goes to
    // suppliers, so it sits outside /api/ and returns the image itself
    // rather than JSON. Anyone holding the link can see that one photo
    // and nothing else — if the Worker is behind Cloudflare Access,
    // outsiders will not get this far without a bypass rule for /p/.
    if (path.startsWith('/p/') && request.method === 'GET') {
      const row = await env.DB
        .prepare('SELECT mime, bytes FROM photos WHERE id=?')
        .bind(path.slice(3)).first();
      if (!row) return new Response('Not found', { status: 404 });
      const bin = atob(row.bytes);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Response(buf, {
        headers: {
          'content-type': row.mime || 'image/jpeg',
          'cache-control': 'public, max-age=31536000, immutable'
        }
      });
    }

    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request); // serve index.html etc.
    }

    // Who is asking? Only present once Cloudflare Access is on.
    let who = '';
    try { who = (await ctx.access?.getIdentity())?.email || ''; } catch (e) {}

    try {
      // ---- jobs ----
      if (path === '/api/jobs' && request.method === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT data, version FROM jobs')
          .all();
        return json(results.map(r => ({ ...JSON.parse(r.data), _v: r.version })));
      }

      if (path.startsWith('/api/jobs/') && request.method === 'PUT') {
        const id = path.split('/')[3];
        const job = await request.json();
        const expected = job._v ?? 0; // version the browser loaded
        delete job._v;

        // The app works these out before sending. They are copies of what
        // is already inside `data`, kept as real columns so the database
        // can sort and total without unpacking every job.
        const res = await env.DB.prepare(`
          INSERT INTO jobs (id,no,name,phone,email,trade,status,confirmed,
            wanted,total,balance,paid,done_at,cost,net,
            data,updated_at,updated_by,version)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,1)
          ON CONFLICT(id) DO UPDATE SET
            no=?2, name=?3, phone=?4, email=?5, trade=?6, status=?7,
            confirmed=?8, wanted=?9, total=?10, balance=?11, paid=?12,
            done_at=?13, cost=?14, net=?15,
            data=?16, updated_at=?17, updated_by=?18, version=jobs.version+1
          WHERE jobs.version = ?19
        `).bind(
          job.id, job.no, job.name, job.phone || '', job.email || '',
          job.trade ? 1 : 0, job.status, job.confirmed ? 1 : 0,
          job.wanted || '', job._total ?? 0, job._balance ?? 0, job._paid ?? 0,
          job._doneAt || null, job._cost ?? null, job._net ?? null,
          JSON.stringify(job), new Date().toISOString(), who, expected
        ).run();

        // Nothing changed = someone else saved this job first.
        if (res.meta.changes === 0) {
          const cur = await env.DB
            .prepare('SELECT data, version, updated_by, updated_at FROM jobs WHERE id=?')
            .bind(id).first();
          return json({ conflict: true, current: cur }, 409);
        }
        return json({ ok: true, version: expected + 1 });
      }

      if (path.startsWith('/api/jobs/') && request.method === 'DELETE') {
        const id = path.split('/')[3];
        // photos first, so a failure here cannot orphan them
        await env.DB.batch([
          env.DB.prepare('DELETE FROM photos WHERE job_id=?').bind(id),
          env.DB.prepare('DELETE FROM jobs WHERE id=?').bind(id)
        ]);
        return json({ ok: true });
      }

      // ---- photos ----
      if (path.startsWith('/api/photo/') && request.method === 'GET') {
        const row = await env.DB
          .prepare('SELECT id, name, mime, bytes, w, h FROM photos WHERE id=?')
          .bind(path.split('/')[3]).first();
        return row ? json(row) : json({ error: 'not found' }, 404);
      }

      if (path === '/api/photos' && request.method === 'POST') {
        const p = await request.json();
        if (!p.id || !p.jobId || !p.data) return json({ error: 'incomplete' }, 400);
        // D1 will not take a value over a megabyte. The app shrinks
        // pictures before sending, so this only catches something odd.
        if (p.data.length > 1000000) return json({ error: 'too big' }, 413);
        await env.DB.prepare(`
          INSERT INTO photos (id,job_id,name,mime,bytes,w,h,added_at,added_by)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
        `).bind(p.id, p.jobId, p.name || 'photo.jpg', p.mime || 'image/jpeg',
                p.data, p.w || null, p.h || null, new Date().toISOString(), who).run();
        return json({ ok: true, id: p.id });
      }

      if (path.startsWith('/api/photo/') && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM photos WHERE id=?')
          .bind(path.split('/')[3]).run();
        return json({ ok: true });
      }

      // ---- prices, suppliers, settings ----
      if (path === '/api/settings' && request.method === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT key, value FROM settings').all();
        const out = {};
        results.forEach(r => { out[r.key] = JSON.parse(r.value); });
        return json(out);
      }

      if (path === '/api/settings' && request.method === 'PUT') {
        const body = await request.json();
        const now = new Date().toISOString();
        await env.DB.batch(Object.entries(body).map(([k, v]) =>
          env.DB.prepare(`
            INSERT INTO settings (key,value,updated_at) VALUES (?1,?2,?3)
            ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=?3
          `).bind(k, JSON.stringify(v), now)
        ));
        return json({ ok: true });
      }

      // ---- who owes us money ----
      // The Money tab works this out in the browser, because every job is
      // loaded there anyway and it still works with the connection down.
      // This is the same question asked of the database instead, and it is
      // what you would use once the book is too big to load in one go.
      if (path === '/api/owing' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT id, no, name, phone, trade, total, paid, balance, done_at
          FROM jobs
          WHERE balance > 0.005 AND status IN ('done','ready')
          ORDER BY balance DESC
        `).all();
        const total = results.reduce((s, r) => s + r.balance, 0);
        return json({ jobs: results, total });
      }

      // ---- money by month ----
      // Grouping four hundred jobs by month is the one thing the database
      // is plainly better at than the browser. cost and net are only
      // filled in on jobs saved since the money columns were added, so
      // `complete` says whether the profit figures can be trusted yet.
      if (path === '/api/summary' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT substr(done_at,1,7)          AS month,
                 COUNT(*)                     AS jobs,
                 SUM(net)                     AS net,
                 SUM(cost)                    AS cost,
                 SUM(net) - SUM(cost)         AS gross,
                 SUM(total)                   AS gross_inc_vat,
                 SUM(paid)                    AS paid,
                 SUM(CASE WHEN net IS NULL THEN 1 ELSE 0 END) AS unpriced
          FROM jobs
          WHERE status = 'done' AND done_at IS NOT NULL AND done_at <> ''
          GROUP BY month
          ORDER BY month
        `).all();
        return json({
          months: results,
          complete: results.every(r => r.unpriced === 0)
        });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }
};

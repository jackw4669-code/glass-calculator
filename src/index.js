const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

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

        const res = await env.DB.prepare(`
          INSERT INTO jobs (id,no,name,phone,email,trade,status,confirmed,
            wanted,total,balance,data,updated_at,updated_by,version)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,1)
          ON CONFLICT(id) DO UPDATE SET
            no=?2, name=?3, phone=?4, email=?5, trade=?6, status=?7,
            confirmed=?8, wanted=?9, total=?10, balance=?11, data=?12,
            updated_at=?13, updated_by=?14, version=jobs.version+1
          WHERE jobs.version = ?15
        `).bind(
          job.id, job.no, job.name, job.phone || '', job.email || '',
          job.trade ? 1 : 0, job.status, job.confirmed ? 1 : 0,
          job.wanted || '', job._total ?? 0, job._balance ?? 0,
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
        await env.DB.prepare('DELETE FROM jobs WHERE id=?')
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
      if (path === '/api/owing' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT no, name, phone, trade, balance
          FROM jobs
          WHERE balance > 0.005 AND status IN ('done','ready')
          ORDER BY balance DESC
        `).all();
        const total = results.reduce((s, r) => s + r.balance, 0);
        return json({ jobs: results, total });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }
};
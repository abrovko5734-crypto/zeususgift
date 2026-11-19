const { verify } = require('./_tg'), { redis } = require('./_db');
module.exports = async (req, res) => {
  const u = verify(req.headers['x-init']);
  if (!u) return res.status(401).json({ error: 'auth' });
  const id = String(u.id);
  try {
    if (await redis(['SISMEMBER', 'bans', id])) return res.json({ banned: true });
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const bal = Math.max(0, Math.min(1e9, +b.b || 0));
      await redis(['HSET', 'p:' + id, 'b', bal, 'g', JSON.stringify(b.g || {}).slice(0, 2000)]);
      await redis(['HSET', 'names', id, String(u.first_name || 'Игрок').slice(0, 24)]);
      await redis(['ZADD', 'top', bal, id]);
      return res.json({ banned: false });
    }
    const a = await redis(['HGETALL', 'p:' + id]), o = {};
    for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1];
    res.json({ banned: false, b: o.b !== undefined ? +o.b : null, g: o.g ? JSON.parse(o.g) : null });
  } catch (e) { res.status(500).json({ error: 'db' }); }
};

const { verify, isAdmin } = require('./_tg'), { redis } = require('./_db');
module.exports = async (req, res) => {
  if (!isAdmin(verify(req.headers['x-init']))) return res.status(403).json({ error: 'forbidden' });
  try {
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = String(b.id || '').replace(/\D/g, '');
      if (!id) return res.status(400).json({ error: 'Нужен Telegram ID' });
      await redis([b.ban ? 'SADD' : 'SREM', 'bans', id]);
    }
    const a = await redis(['ZREVRANGE', 'top', 0, 49, 'WITHSCORES']), bans = await redis(['SMEMBERS', 'bans']), ids = [], sc = [];
    for (let i = 0; i < a.length; i += 2) { ids.push(a[i]); sc.push(+a[i + 1]); }
    const nm = ids.length ? await redis(['HMGET', 'names', ...ids]) : [];
    res.json({ total: await redis(['ZCARD', 'top']), players: ids.map((id, i) => ({ id, n: nm[i] || '', s: sc[i], banned: bans.includes(id) })) });
  } catch (e) { res.status(500).json({ error: 'Подключи Upstash Redis (см. README)' }); }
};

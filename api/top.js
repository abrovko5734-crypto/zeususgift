const { redis } = require('./_db');
module.exports = async (req, res) => {
  try {
    const a = await redis(['ZREVRANGE', 'top', 0, 19, 'WITHSCORES']), ids = [], sc = [];
    for (let i = 0; i < a.length; i += 2) { ids.push(a[i]); sc.push(+a[i + 1]); }
    const bans = await redis(['SMEMBERS', 'bans']);
    const nm = ids.length ? await redis(['HMGET', 'names', ...ids]) : [];
    res.setHeader('Cache-Control', 'no-store');
    res.json(ids.map((id, i) => ({ id, n: nm[i] || 'Игрок', s: sc[i] })).filter(x => !bans.includes(x.id)).map(({ n, s }) => ({ n, s })));
  } catch (e) { res.json([]); }
};

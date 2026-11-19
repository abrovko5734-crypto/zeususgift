const { verify, isAdmin } = require('./_tg');
const DEF = { minBet: 1, edge: 0.97, tapSecs: 20, tapCd: 30 };
const U = process.env.UPSTASH_REDIS_REST_URL, T = process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(cmd) {
  const r = await fetch(U, { method: 'POST', headers: { Authorization: 'Bearer ' + T }, body: JSON.stringify(cmd) });
  return (await r.json()).result;
}
module.exports = async (req, res) => {
  let cfg = DEF;
  if (U) { try { const v = await redis(['GET', 'cfg']); if (v) cfg = { ...DEF, ...JSON.parse(v) }; } catch (e) {} }
  if (req.method === 'POST') {
    if (!isAdmin(verify(req.headers['x-init']))) return res.status(403).json({ error: 'forbidden' });
    if (!U) return res.status(500).json({ error: 'Подключи Upstash Redis (см. README)' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    cfg = {
      minBet: Math.max(1, +b.minBet || 1),
      edge: Math.min(1, Math.max(0.8, +b.edge || 0.97)),
      tapSecs: Math.max(5, +b.tapSecs || 20),
      tapCd: Math.max(0, +b.tapCd || 0)
    };
    await redis(['SET', 'cfg', JSON.stringify(cfg)]);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(cfg);
};

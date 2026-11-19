const U = process.env.UPSTASH_REDIS_REST_URL, T = process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(cmd) {
  if (!U) throw new Error('no db');
  const r = await fetch(U, { method: 'POST', headers: { Authorization: 'Bearer ' + T }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
module.exports = { redis };

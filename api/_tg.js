const crypto = require('crypto');
const ADMIN = process.env.ADMIN_ID || '7128871752';
function verify(initData) {
  if (!initData || !process.env.BOT_TOKEN) return null;
  const p = new URLSearchParams(initData), hash = p.get('hash');
  p.delete('hash');
  const s = [...p.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const h = crypto.createHmac('sha256', key).update(s).digest('hex');
  if (h !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  try { return JSON.parse(p.get('user')); } catch (e) { return null; }
}
const isAdmin = u => !!u && String(u.id) === String(ADMIN);
module.exports = { verify, isAdmin };

const { verify, isAdmin } = require('./_tg');
module.exports = (req, res) => {
  const u = verify(req.headers['x-init']);
  res.json({ ok: !!u, id: u && u.id, name: u && u.first_name, admin: isAdmin(u) });
};

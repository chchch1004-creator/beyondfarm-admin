const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

async function loadPermissions(userId, role) {
  if (role === 'superadmin') return null;
  const rows = await db.prepare('SELECT page, can_view, can_edit FROM user_permissions WHERE user_id = ?').all(userId);
  const perms = {};
  rows.forEach(r => { perms[r.page] = { view: !!r.can_view, edit: !!r.can_edit }; });
  return perms;
}

router.post('/login', async (req, res) => {
  try {
    const { username, password, autoLogin } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE username = ? AND status = ?').get(username, 'active');
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }
    if (autoLogin) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
    const permissions = await loadPermissions(user.id, user.role);
    res.json({ user: { ...req.session.user, permissions } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  try {
    const permissions = await loadPermissions(req.session.user.id, req.session.user.role);
    res.json({ user: { ...req.session.user, permissions } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/profile', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  try {
    const user = await db.prepare('SELECT id, username, name, role, department, position, phone, email, hire_date FROM users WHERE id = ?').get(req.session.user.id);
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/profile', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  try {
    const { email, phone, current_password, new_password } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
    if (new_password) {
      if (!current_password) return res.status(400).json({ error: '현재 비밀번호를 입력하세요.' });
      if (!bcrypt.compareSync(current_password, user.password)) return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
      await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), user.id);
    }
    await db.prepare('UPDATE users SET email = ?, phone = ? WHERE id = ?').run(email ?? user.email, phone ?? user.phone, user.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a) };
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password, autoLogin } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND status = ?').get(username, 'active');
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 잘못되었습니다.' });
  }
  if (autoLogin) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30일
  }
  req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  res.json({ user: req.session.user });
});

router.post('/change-password', requireLogin, (req, res) => {
  const { current, next } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(current, user.password)) {
    return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
  }
  const hash = bcrypt.hashSync(next, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

// 마이페이지 - 내 정보 조회
router.get('/profile', requireLogin, (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, department, position, phone, email, hire_date FROM users WHERE id = ?').get(req.session.user.id);
  res.json(user);
});

// 마이페이지 - 내 정보 수정 (이메일, 전화번호, 비밀번호만)
router.put('/profile', requireLogin, (req, res) => {
  const { email, phone, current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (new_password) {
    if (!current_password) return res.status(400).json({ error: '현재 비밀번호를 입력하세요.' });
    if (!bcrypt.compareSync(current_password, user.password)) {
      return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
  }

  db.prepare('UPDATE users SET email = ?, phone = ? WHERE id = ?').run(
    email ?? user.email,
    phone ?? user.phone,
    user.id
  );
  res.json({ ok: true });
});

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

module.exports = router;

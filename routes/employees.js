const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a) };
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

// 전체 직원 목록 (관리자: 전체, 직원: 자기 정보만)
router.get('/', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role === 'admin') {
    const rows = db.prepare('SELECT id, username, name, role, department, position, phone, email, hire_date, status, created_at FROM users ORDER BY name').all();
    return res.json(rows);
  }
  const row = db.prepare('SELECT id, username, name, role, department, position, phone, email, hire_date, status FROM users WHERE id = ?').get(req.session.user.id);
  res.json([row]);
});

// 직원 등록 (관리자)
router.post('/', requireAdmin, (req, res) => {
  const { username, password, name, role, department, position, phone, email, hire_date } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: '필수 항목 누락' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(`
      INSERT INTO users (username, password, name, role, department, position, phone, email, hire_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(username, hash, name, role || 'employee', department, position, phone, email, hire_date);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });
    throw e;
  }
});

// 직원 수정
router.put('/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  const id = parseInt(req.params.id);
  if (req.session.user.role !== 'admin' && req.session.user.id !== id) {
    return res.status(403).json({ error: '권한 없음' });
  }
  const { name, department, position, phone, email, hire_date, role, status, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: '직원을 찾을 수 없습니다.' });

  const newName = name ?? user.name;
  const newDept = department ?? user.department;
  const newPos = position ?? user.position;
  const newPhone = phone ?? user.phone;
  const newEmail = email ?? user.email;
  const newHire = hire_date ?? user.hire_date;
  const newRole = (req.session.user.role === 'admin' && role) ? role : user.role;
  const newStatus = (req.session.user.role === 'admin' && status) ? status : user.status;

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, id);
  }

  db.prepare(`
    UPDATE users SET name=?, department=?, position=?, phone=?, email=?, hire_date=?, role=?, status=? WHERE id=?
  `).run(newName, newDept, newPos, newPhone, newEmail, newHire, newRole, newStatus, id);

  res.json({ ok: true });
});

// 직원 퇴직 처리 (관리자)
router.delete('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(id);
  res.json({ ok: true });
});

module.exports = router;

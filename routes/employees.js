const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

router.get('/', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  try {
    if (['admin','superadmin'].includes(req.session.user.role)) {
      return res.json(await db.prepare('SELECT id, username, name, role, department, position, phone, email, hire_date, birth_date, status, created_at, employee_type, ssn, bank_name, bank_account, hourly_rate FROM users ORDER BY name').all());
    }
    // 일반 직원: 전체 목록 조회 가능하지만 민감정보 제외
    res.json(await db.prepare('SELECT id, name, role, department, position, hire_date, birth_date, status FROM users WHERE status = ? ORDER BY name').all('active'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  const { username, password, name, role, department, position, phone, email, hire_date, employee_type, ssn, bank_name, bank_account } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: '필수 항목 누락' });
  try {
    const result = await db.prepare('INSERT INTO users (username, password, name, role, department, position, phone, email, hire_date, employee_type, ssn, bank_name, bank_account) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(username, bcrypt.hashSync(password, 10), name, role || 'employee', department, position, phone, email, hire_date, employee_type || '평일', ssn || null, bank_name || null, bank_account || null);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  const id = parseInt(req.params.id);
  const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
  if (!isAdmin && req.session.user.id !== id) return res.status(403).json({ error: '권한 없음' });
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
    const { name, department, position, phone, email, hire_date, birth_date, role, status, password, employee_type, ssn, bank_name, bank_account, hourly_rate } = req.body;
    if (password) await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
    if (isAdmin && req.body.username) await db.prepare('UPDATE users SET username = ? WHERE id = ?').run(req.body.username, id);
    await db.prepare('UPDATE users SET name=?, department=?, position=?, phone=?, email=?, hire_date=?, birth_date=?, role=?, status=?, employee_type=?, ssn=?, bank_name=?, bank_account=?, hourly_rate=? WHERE id=?')
      .run(name ?? user.name, department ?? user.department, position ?? user.position, phone ?? user.phone,
           email ?? user.email, hire_date ?? user.hire_date, birth_date ?? user.birth_date,
           (isAdmin && role) ? role : user.role, (isAdmin && status) ? status : user.status,
           (isAdmin && employee_type !== undefined) ? employee_type : user.employee_type,
           (isAdmin && ssn !== undefined) ? ssn : user.ssn,
           (isAdmin && bank_name !== undefined) ? bank_name : user.bank_name,
           (isAdmin && bank_account !== undefined) ? bank_account : user.bank_account,
           (isAdmin && hourly_rate !== undefined) ? (parseInt(hourly_rate) || 0) : user.hourly_rate,
           id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

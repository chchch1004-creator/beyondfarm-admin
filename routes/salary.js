const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a) };
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

// 급여 내역 조회
router.get('/', requireLogin, (req, res) => {
  const { year, month, user_id } = req.query;
  let query = `
    SELECT s.*, u.name, u.department, u.position
    FROM salaries s JOIN users u ON s.user_id = u.id WHERE 1=1
  `;
  const params = [];

  if (req.session.user.role !== 'admin') {
    query += ' AND s.user_id = ?';
    params.push(req.session.user.id);
  } else if (user_id) {
    query += ' AND s.user_id = ?';
    params.push(parseInt(user_id));
  }

  if (year) { query += ' AND s.year = ?'; params.push(parseInt(year)); }
  if (month) { query += ' AND s.month = ?'; params.push(parseInt(month)); }

  query += ' ORDER BY s.year DESC, s.month DESC, u.name';
  res.json(db.prepare(query).all(...params));
});

// 급여 등록 (관리자)
router.post('/', requireAdmin, (req, res) => {
  const { user_id, year, month, base_salary, overtime_pay, bonus, deduction, note } = req.body;
  const net = (base_salary || 0) + (overtime_pay || 0) + (bonus || 0) - (deduction || 0);
  const result = db.prepare(`
    INSERT INTO salaries (user_id, year, month, base_salary, overtime_pay, bonus, deduction, net_pay, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user_id, year, month, base_salary || 0, overtime_pay || 0, bonus || 0, deduction || 0, net, note);
  res.json({ id: result.lastInsertRowid });
});

// 급여 수정 (관리자)
router.put('/:id', requireAdmin, (req, res) => {
  const { base_salary, overtime_pay, bonus, deduction, note } = req.body;
  const net = (base_salary || 0) + (overtime_pay || 0) + (bonus || 0) - (deduction || 0);
  db.prepare(`
    UPDATE salaries SET base_salary=?, overtime_pay=?, bonus=?, deduction=?, net_pay=?, note=? WHERE id=?
  `).run(base_salary || 0, overtime_pay || 0, bonus || 0, deduction || 0, net, note, req.params.id);
  res.json({ ok: true });
});

// 급여 삭제 (관리자)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM salaries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

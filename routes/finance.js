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

// 수입/지출 목록
router.get('/', requireLogin, (req, res) => {
  const { year, month, type } = req.query;
  let query = `
    SELECT f.*, u.name as creator_name FROM finance f
    LEFT JOIN users u ON f.created_by = u.id WHERE 1=1
  `;
  const params = [];
  if (type) { query += ' AND f.type = ?'; params.push(type); }
  if (year) { query += ` AND strftime('%Y', f.date) = ?`; params.push(String(year)); }
  if (month) { query += ` AND strftime('%m', f.date) = ?`; params.push(String(month).padStart(2, '0')); }
  query += ' ORDER BY f.date DESC, f.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// 월별 요약
router.get('/summary', requireLogin, (req, res) => {
  const { year } = req.query;
  const y = year || new Date().getFullYear();
  const rows = db.prepare(`
    SELECT strftime('%m', date) as month,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
    FROM finance
    WHERE strftime('%Y', date) = ?
    GROUP BY month ORDER BY month
  `).all(String(y));
  res.json(rows);
});

// 등록 (관리자)
router.post('/', requireAdmin, (req, res) => {
  const { type, category, amount, description, date, receipt_no } = req.body;
  const result = db.prepare(`
    INSERT INTO finance (type, category, amount, description, date, receipt_no, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(type, category, amount, description, date, receipt_no, req.session.user.id);
  res.json({ id: result.lastInsertRowid });
});

// 수정 (관리자)
router.put('/:id', requireAdmin, (req, res) => {
  const { type, category, amount, description, date, receipt_no } = req.body;
  db.prepare(`
    UPDATE finance SET type=?, category=?, amount=?, description=?, date=?, receipt_no=? WHERE id=?
  `).run(type, category, amount, description, date, receipt_no, req.params.id);
  res.json({ ok: true });
});

// 삭제 (관리자)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM finance WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

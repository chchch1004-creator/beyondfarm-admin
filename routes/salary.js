const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireLogin(req, res, next) { if (!req.session.user) return res.status(401).json({ error: '로그인 필요' }); next(); }
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const { year, month, user_id } = req.query;
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    let query = `SELECT s.*, u.name, u.department, u.position FROM salaries s JOIN users u ON s.user_id = u.id WHERE 1=1`;
    const params = [];
    if (!isAdmin) { query += ' AND s.user_id = ?'; params.push(req.session.user.id); }
    else if (user_id) { query += ' AND s.user_id = ?'; params.push(parseInt(user_id)); }
    if (year) { query += ' AND s.year = ?'; params.push(parseInt(year)); }
    if (month) { query += ' AND s.month = ?'; params.push(parseInt(month)); }
    query += ' ORDER BY s.year DESC, s.month DESC, u.name';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { user_id, year, month, base_salary, overtime_pay, bonus, deduction, note } = req.body;
    const net = (base_salary||0) + (overtime_pay||0) + (bonus||0) - (deduction||0);
    const result = await db.prepare('INSERT INTO salaries (user_id, year, month, base_salary, overtime_pay, bonus, deduction, net_pay, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(user_id, year, month, base_salary||0, overtime_pay||0, bonus||0, deduction||0, net, note);
    res.json({ id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { base_salary, overtime_pay, bonus, deduction, note } = req.body;
    const net = (base_salary||0) + (overtime_pay||0) + (bonus||0) - (deduction||0);
    await db.prepare('UPDATE salaries SET base_salary=?, overtime_pay=?, bonus=?, deduction=?, net_pay=?, note=? WHERE id=?')
      .run(base_salary||0, overtime_pay||0, bonus||0, deduction||0, net, note, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try { await db.prepare('DELETE FROM salaries WHERE id = ?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

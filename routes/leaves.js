const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();
let gcal;
try { gcal = require('./gcal'); } catch {}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const { year, user_id } = req.query;
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    let query = `SELECT l.*, u.name as user_name, a.name as approver_name FROM leaves l JOIN users u ON l.user_id = u.id LEFT JOIN users a ON l.approved_by = a.id WHERE 1=1`;
    const params = [];
    if (!isAdmin) { query += ' AND l.user_id = ?'; params.push(req.session.user.id); }
    else if (user_id) { query += ' AND l.user_id = ?'; params.push(parseInt(user_id)); }
    if (year) { query += ` AND strftime('%Y', l.start_date) = ?`; params.push(String(year)); }
    query += ' ORDER BY l.created_at DESC';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', requireLogin, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    let query = `SELECT u.id, u.name, u.department, COALESCE(SUM(CASE WHEN l.status='approved' THEN l.days ELSE 0 END), 0) as used_days FROM users u LEFT JOIN leaves l ON u.id = l.user_id AND strftime('%Y', l.start_date) = ? WHERE u.status = 'active'`;
    const params = [String(year)];
    if (!isAdmin) { query += ' AND u.id = ?'; params.push(req.session.user.id); }
    query += ' GROUP BY u.id ORDER BY u.name';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireLogin, async (req, res) => {
  try {
    const { type, start_date, end_date, days, reason } = req.body;
    const result = await db.prepare('INSERT INTO leaves (user_id, type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.session.user.id, type, start_date, end_date, days, reason);
    res.json({ id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/status', requireLogin, async (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '권한 없음' });
  try {
    await db.prepare(`UPDATE leaves SET status=?, approved_by=?, approved_at=datetime('now') WHERE id=?`)
      .run(req.body.status, req.session.user.id, req.params.id);

    // 승인 시 구글캘린더에 등록
    if (req.body.status === 'approved' && gcal?.pushLeaveToCalendar) {
      const leave = await db.prepare(`SELECT l.*, u.name as user_name FROM leaves l JOIN users u ON l.user_id=u.id WHERE l.id=?`).get(req.params.id);
      if (leave) {
        gcal.pushLeaveToCalendar(req.session.user.id, {
          leaveId: leave.id, userName: leave.user_name,
          type: leave.type, start_date: leave.start_date,
          end_date: leave.end_date, reason: leave.reason
        }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const leave = await db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
    if (!leave) return res.status(404).json({ error: '없음' });
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    if (!isAdmin && leave.user_id !== req.session.user.id) return res.status(403).json({ error: '권한 없음' });
    if (leave.status !== 'pending' && !isAdmin) return res.status(400).json({ error: '이미 처리된 신청은 취소할 수 없습니다.' });
    await db.prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

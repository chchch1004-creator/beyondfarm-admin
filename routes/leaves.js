const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a) };
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// 휴가 목록
router.get('/', requireLogin, (req, res) => {
  const { year, user_id } = req.query;
  let query = `
    SELECT l.*, u.name as user_name, a.name as approver_name
    FROM leaves l
    JOIN users u ON l.user_id = u.id
    LEFT JOIN users a ON l.approved_by = a.id
    WHERE 1=1
  `;
  const params = [];

  if (req.session.user.role !== 'admin') {
    query += ' AND l.user_id = ?';
    params.push(req.session.user.id);
  } else if (user_id) {
    query += ' AND l.user_id = ?';
    params.push(parseInt(user_id));
  }

  if (year) {
    query += ` AND strftime('%Y', l.start_date) = ?`;
    params.push(String(year));
  }

  query += ' ORDER BY l.created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// 연간 휴가 사용 현황
router.get('/summary', requireLogin, (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  let query = `
    SELECT u.id, u.name, u.department,
      COALESCE(SUM(CASE WHEN l.status='approved' THEN l.days ELSE 0 END), 0) as used_days
    FROM users u
    LEFT JOIN leaves l ON u.id = l.user_id AND strftime('%Y', l.start_date) = ?
    WHERE u.status = 'active'
  `;
  const params = [String(year)];

  if (req.session.user.role !== 'admin') {
    query += ' AND u.id = ?';
    params.push(req.session.user.id);
  }

  query += ' GROUP BY u.id ORDER BY u.name';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// 휴가 신청
router.post('/', requireLogin, (req, res) => {
  const { type, start_date, end_date, days, reason } = req.body;
  const userId = req.session.user.id;
  const result = db.prepare(`
    INSERT INTO leaves (user_id, type, start_date, end_date, days, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, type, start_date, end_date, days, reason);
  res.json({ id: result.lastInsertRowid });
});

// 휴가 승인/반려 (관리자)
router.put('/:id/status', requireLogin, (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: '권한 없음' });
  const { status } = req.body;
  db.prepare(`
    UPDATE leaves SET status=?, approved_by=?, approved_at=datetime('now','localtime') WHERE id=?
  `).run(status, req.session.user.id, req.params.id);
  res.json({ ok: true });
});

// 휴가 삭제 (본인 or 관리자, 대기 중일 때만)
router.delete('/:id', requireLogin, (req, res) => {
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!leave) return res.status(404).json({ error: '없음' });
  if (req.session.user.role !== 'admin' && leave.user_id !== req.session.user.id) {
    return res.status(403).json({ error: '권한 없음' });
  }
  if (leave.status !== 'pending' && req.session.user.role !== 'admin') {
    return res.status(400).json({ error: '이미 처리된 신청은 취소할 수 없습니다.' });
  }
  db.prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}
async function canEdit(req) {
  if (req.session.user.role === 'superadmin') return true;
  const db = getDb();
  const row = await db.prepare('SELECT can_edit FROM user_permissions WHERE user_id=? AND page=?').get(req.session.user.id, 'dashboard');
  return !!row?.can_edit;
}

function kstNow() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace('T', ' ');
}

// GET /api/dashboard/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/schedule', requireLogin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = getDb();
    const rows = await db.prepare(
      'SELECT date, slot, text, color, updated_at, updated_by FROM dashboard_schedule WHERE date >= ? AND date <= ? ORDER BY date, slot'
    ).all(from, to);
    // 날짜별로 그룹핑
    const map = {};
    rows.forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push({ slot: r.slot, text: r.text, color: r.color, updated_at: r.updated_at, updated_by: r.updated_by });
    });
    res.json(map);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/dashboard/schedule/:date  body: { entries: [{slot, text, color}] }
router.put('/schedule/:date', requireLogin, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한이 없습니다' });
    const { date } = req.params;
    const { entries } = req.body;
    const db = getDb();
    const now = kstNow();
    const who = req.session.user.name || req.session.user.username;

    const stmts = [];
    // 기존 삭제 후 재삽입
    stmts.push({ sql: 'DELETE FROM dashboard_schedule WHERE date = ?', args: [date] });
    (entries || []).forEach((e, i) => {
      if (!e.text?.trim()) return;
      stmts.push({
        sql: 'INSERT INTO dashboard_schedule (date, slot, text, color, updated_at, updated_by) VALUES (?,?,?,?,?,?)',
        args: [date, i, e.text.trim(), e.color || null, now, who]
      });
    });
    await db.batch(stmts);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

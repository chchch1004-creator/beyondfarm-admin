const express = require('express');
const { getDb } = require('../db/database');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

async function canView(req) {
  if (req.session.user.role === 'superadmin') return true;
  const row = await getDb().prepare('SELECT can_view FROM user_permissions WHERE user_id=? AND page=?').get(req.session.user.id, 'checklist');
  return !!row?.can_view;
}

async function canEdit(req) {
  if (req.session.user.role === 'superadmin') return true;
  const row = await getDb().prepare('SELECT can_edit FROM user_permissions WHERE user_id=? AND page=?').get(req.session.user.id, 'checklist');
  return !!row?.can_edit;
}

// GET /api/checklist/dates - 체크리스트가 있는 날짜 목록
router.get('/dates', requireAuth, async (req, res) => {
  try {
    if (!await canView(req)) return res.status(403).json({ error: '접근 권한이 없습니다' });
    const rows = await getDb().prepare('SELECT DISTINCT date FROM checklist_data ORDER BY date DESC').all();
    res.json(rows.map(r => r.date));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/checklist/:date/:timeslot
router.get('/:date/:timeslot', requireAuth, async (req, res) => {
  try {
    if (!await canView(req)) return res.status(403).json({ error: '접근 권한이 없습니다' });
    const row = await getDb().prepare('SELECT data FROM checklist_data WHERE date=? AND timeslot=?').get(req.params.date, req.params.timeslot);
    if (!row) return res.json(null);
    res.json(JSON.parse(row.data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/checklist/:date/:timeslot
router.put('/:date/:timeslot', requireAuth, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한이 없습니다' });
    const json = JSON.stringify(req.body);
    await getDb().prepare(`
      INSERT INTO checklist_data (date, timeslot, data, updated_at) VALUES (?,?,?,datetime('now'))
      ON CONFLICT(date, timeslot) DO UPDATE SET data=excluded.data, updated_at=datetime('now')
    `).run(req.params.date, req.params.timeslot, json);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/checklist/:date/:timeslot
router.delete('/:date/:timeslot', requireAuth, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한이 없습니다' });
    await getDb().prepare('DELETE FROM checklist_data WHERE date=? AND timeslot=?').run(req.params.date, req.params.timeslot);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

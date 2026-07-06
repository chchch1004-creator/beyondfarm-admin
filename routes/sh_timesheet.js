const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

// 주주 목록 + 참여 데이터
router.get('/', requireAdmin, async (req, res) => {
  try {
    const y = parseInt(req.query.year) || new Date().getFullYear();
    const m = parseInt(req.query.month) || new Date().getMonth() + 1;
    const days = new Date(y, m, 0).getDate();

    const employees = await db.prepare(
      `SELECT id, name FROM users
       WHERE status = 'active' AND employee_type = '주주'
       ORDER BY CASE name WHEN '조상희' THEN 1 WHEN '조상하' THEN 2 WHEN '정재호' THEN 3 WHEN '소재훈' THEN 4 ELSE 5 END`
    ).all();

    const participations = await db.prepare(
      `SELECT user_id, day FROM shareholder_participation
       WHERE year = ? AND month = ? AND participated = 1`
    ).all(y, m);

    const note = await db.prepare(
      `SELECT content FROM sh_notes WHERE year = ? AND month = ?`
    ).get(y, m);

    // 참여 데이터를 { userId: Set<day> } 형태로
    const partMap = {};
    employees.forEach(e => { partMap[e.id] = new Set(); });
    participations.forEach(p => { if (partMap[p.user_id]) partMap[p.user_id].add(p.day); });

    const result = employees.map(e => ({
      id: e.id,
      name: e.name,
      days: [...partMap[e.id]]
    }));

    res.json({ year: y, month: m, days, employees: result, note: note?.content || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 참여 여부 저장
router.post('/toggle', requireAdmin, async (req, res) => {
  try {
    const { user_id, year, month, day, participated } = req.body;
    if (participated) {
      await db.prepare(`INSERT INTO shareholder_participation (user_id, year, month, day, participated)
        VALUES (?,?,?,?,1) ON CONFLICT(user_id,year,month,day) DO UPDATE SET participated=1`)
        .run(user_id, year, month, day);
    } else {
      await db.prepare(`DELETE FROM shareholder_participation WHERE user_id=? AND year=? AND month=? AND day=?`)
        .run(user_id, year, month, day);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 배치 저장 (자동입력용)
router.post('/batch', requireAdmin, async (req, res) => {
  try {
    const { year, month, days } = req.body; // days: [{user_id, day, participated}]
    if (!Array.isArray(days)) return res.status(400).json({ error: 'days 배열 필요' });
    for (const item of days) {
      if (item.participated) {
        await db.prepare(`INSERT INTO shareholder_participation (user_id, year, month, day, participated)
          VALUES (?,?,?,?,1) ON CONFLICT(user_id,year,month,day) DO UPDATE SET participated=1`)
          .run(item.user_id, year, month, item.day);
      } else {
        await db.prepare(`DELETE FROM shareholder_participation WHERE user_id=? AND year=? AND month=? AND day=?`)
          .run(item.user_id, year, month, item.day);
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 메모 저장
router.post('/notes', requireAdmin, async (req, res) => {
  try {
    const { year, month, content } = req.body;
    await db.prepare(`INSERT INTO sh_notes (year, month, content) VALUES (?,?,?)
      ON CONFLICT(year,month) DO UPDATE SET content=excluded.content`)
      .run(year, month, content);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

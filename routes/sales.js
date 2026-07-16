const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireSuperAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '총괄관리자 권한 필요' });
  next();
}

// 해당 page에 대한 보기 권한 또는 총괄관리자 허용
function requirePageView(page) {
  return async (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
    if (req.session.user.role === 'superadmin') return next();
    const row = await getDb().prepare('SELECT can_view FROM user_permissions WHERE user_id=? AND page=?').get(req.session.user.id, page);
    if (row?.can_view) return next();
    res.status(403).json({ error: '접근 권한이 없습니다' });
  };
}

function requirePageEdit(page) {
  return async (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
    if (req.session.user.role === 'superadmin') return next();
    const row = await getDb().prepare('SELECT can_edit FROM user_permissions WHERE user_id=? AND page=?').get(req.session.user.id, page);
    if (row?.can_edit) return next();
    res.status(403).json({ error: '수정 권한이 없습니다' });
  };
}

router.get('/revenue', requirePageView('sales'), async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    res.json(await db.prepare('SELECT * FROM sales_revenue WHERE year=? ORDER BY month').all(year));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/revenue', requirePageEdit('sales'), async (req, res) => {
  try {
    const { year, month, working_days, baemin, other_sales, other_income, note } = req.body;
    await db.prepare(`INSERT INTO sales_revenue (year, month, working_days, baemin, other_sales, other_income, note)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(year, month) DO UPDATE SET
        working_days=excluded.working_days, baemin=excluded.baemin,
        other_sales=excluded.other_sales, other_income=excluded.other_income, note=excluded.note`)
      .run(year, month, working_days || 0, baemin || 0, other_sales || 0, other_income || 0, note || '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/yts', requirePageView('inflow'), async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    res.json(await db.prepare('SELECT * FROM sales_yts WHERE year=? ORDER BY month').all(year));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/yts', requirePageEdit('inflow'), async (req, res) => {
  try {
    const { year, month, baemin_input, other_input, external_input,
            baemin_request, other_request, external_request,
            baemin_next, other_next, external_next } = req.body;
    await db.prepare(`INSERT INTO sales_yts
      (year, month, baemin_input, other_input, external_input, baemin_request, other_request, external_request, baemin_next, other_next, external_next)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(year, month) DO UPDATE SET
        baemin_input=excluded.baemin_input, other_input=excluded.other_input, external_input=excluded.external_input,
        baemin_request=excluded.baemin_request, other_request=excluded.other_request, external_request=excluded.external_request,
        baemin_next=excluded.baemin_next, other_next=excluded.other_next, external_next=excluded.external_next`)
      .run(year, month,
        baemin_input || 0, other_input || 0, external_input || 0,
        baemin_request || 0, other_request || 0, external_request || 0,
        baemin_next || 0, other_next || 0, external_next || 0);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

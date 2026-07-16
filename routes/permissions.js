const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

const PAGES = [
  { key: 'dashboard',             label: '대시보드' },
  { key: 'employees',             label: '직원 관리' },
  { key: 'attendance',            label: '출퇴근 관리' },
  { key: 'leaves',                label: '휴가 관리' },
  { key: 'salary',                label: '급여 관리' },
  { key: 'finance',               label: '수입/지출' },
  { key: 'inventory',             label: '재고 현황' },
  { key: 'timesheet',             label: '근무표' },
  { key: 'shareholder_timesheet', label: '주주근무표' },
  { key: 'sales',                 label: '매출현황' },
  { key: 'inflow',                label: '유입량' },
];

function requireSuperAdmin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '총괄관리자 권한 필요' });
  next();
}

// GET /api/permissions/pages — 페이지 목록
router.get('/pages', requireSuperAdmin, (req, res) => res.json(PAGES));

// GET /api/permissions/:userId — 특정 유저 권한 조회
router.get('/:userId', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.userId);
    const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: '유저 없음' });
    const rows = await db.prepare('SELECT page, can_view, can_edit FROM user_permissions WHERE user_id = ?').all(userId);
    const perms = {};
    rows.forEach(r => { perms[r.page] = { view: !!r.can_view, edit: !!r.can_edit }; });
    res.json({ role: user.role, permissions: perms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissions/:userId — 권한 저장
router.put('/:userId', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.userId);
    const { role, permissions } = req.body;

    if (role !== undefined) {
      if (!['superadmin', 'user'].includes(role)) return res.status(400).json({ error: '유효하지 않은 권한' });
      await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    }

    if (permissions) {
      for (const pg of PAGES) {
        const perm = permissions[pg.key] || { view: false, edit: false };
        await db.prepare(`
          INSERT INTO user_permissions (user_id, page, can_view, can_edit)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, page) DO UPDATE SET can_view=excluded.can_view, can_edit=excluded.can_edit
        `).run(userId, pg.key, perm.view ? 1 : 0, perm.edit ? 1 : 0);
      }
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.PAGES = PAGES;

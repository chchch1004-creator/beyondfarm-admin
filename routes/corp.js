const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

async function canAccess(req) {
  const user = req.session.user;
  if (user.role === 'superadmin') return true;
  const row = await getDb().prepare('SELECT can_view FROM user_permissions WHERE user_id=? AND page=?').get(user.id, 'corp');
  return !!row?.can_view;
}

async function canEdit(req) {
  const user = req.session.user;
  if (user.role === 'superadmin') return true;
  const row = await getDb().prepare('SELECT can_edit FROM user_permissions WHERE user_id=? AND page=?').get(user.id, 'corp');
  return !!row?.can_edit;
}

// 목록 조회
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!await canAccess(req)) return res.status(403).json({ error: '접근 권한 없음' });
    const { category } = req.query;
    let rows;
    if (category) {
      rows = await getDb().prepare('SELECT * FROM corp_credentials WHERE category=? ORDER BY site_name').all(category);
    } else {
      rows = await getDb().prepare('SELECT * FROM corp_credentials ORDER BY category, site_name').all();
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 카테고리 목록
router.get('/categories', requireAuth, async (req, res) => {
  try {
    if (!await canAccess(req)) return res.status(403).json({ error: '접근 권한 없음' });
    const rows = await getDb().prepare('SELECT DISTINCT category FROM corp_credentials ORDER BY category').all();
    res.json(rows.map(r => r.category));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 추가
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한 없음' });
    const { category, site_name, url, login_id, password, memo } = req.body;
    if (!site_name?.trim()) return res.status(400).json({ error: '사이트명을 입력하세요' });
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const pad = n => String(n).padStart(2, '0');
    const now = `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}:${pad(kst.getSeconds())}`;
    const result = await getDb().prepare(
      'INSERT INTO corp_credentials (category, site_name, url, login_id, password, memo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(category||'기타', site_name.trim(), url||'', login_id||'', password||'', memo||'', now, now);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 수정
router.put('/:id', requireAuth, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한 없음' });
    const { category, site_name, url, login_id, password, memo } = req.body;
    if (!site_name?.trim()) return res.status(400).json({ error: '사이트명을 입력하세요' });
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const pad = n => String(n).padStart(2, '0');
    const now = `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}:${pad(kst.getSeconds())}`;
    await getDb().prepare(
      'UPDATE corp_credentials SET category=?, site_name=?, url=?, login_id=?, password=?, memo=?, updated_at=? WHERE id=?'
    ).run(category||'기타', site_name.trim(), url||'', login_id||'', password||'', memo||'', now, parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 삭제
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한 없음' });
    await getDb().prepare('DELETE FROM corp_credentials WHERE id=?').run(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

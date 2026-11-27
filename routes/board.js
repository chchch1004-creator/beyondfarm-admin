const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

function kstNow() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T');
}

// 목록 조회
router.get('/', requireLogin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const today = new Date().toISOString().slice(0, 10);

    const posts = await db.prepare(`
      SELECT id, user_id, author_name, title, is_notice, notice_until, views, created_at
      FROM board_posts
      ORDER BY
        CASE WHEN is_notice=1 AND (notice_until IS NULL OR notice_until >= ?) THEN 0 ELSE 1 END ASC,
        created_at DESC
      LIMIT ? OFFSET ?
    `).all(today, parseInt(limit), offset);

    const total = (await db.prepare('SELECT COUNT(*) as cnt FROM board_posts').get()).cnt;
    res.json({ posts, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 활성 공지 (배너용)
router.get('/notices/active', requireLogin, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const notices = await db.prepare(`
      SELECT id, title, created_at FROM board_posts
      WHERE is_notice=1 AND (notice_until IS NULL OR notice_until >= ?)
      ORDER BY created_at DESC
    `).all(today);
    res.json(notices);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 단건 조회 + 조회수
router.get('/:id', requireLogin, async (req, res) => {
  try {
    await db.prepare('UPDATE board_posts SET views=views+1 WHERE id=?').run(req.params.id);
    const post = await db.prepare('SELECT * FROM board_posts WHERE id=?').get(req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다' });
    res.json(post);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 작성
router.post('/', requireLogin, async (req, res) => {
  try {
    const { title, content, is_notice, notice_until } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: '제목을 입력하세요' });
    const isNotice = is_notice ? 1 : 0;
    const noticeAdmin = ['admin','superadmin'].includes(req.session.user.role);
    if (isNotice && !noticeAdmin) return res.status(403).json({ error: '공지사항은 관리자만 등록할 수 있습니다' });
    const result = await db.prepare(
      `INSERT INTO board_posts (user_id, author_name, title, content, is_notice, notice_until, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(req.session.user.id, req.session.user.name, title.trim(), content||'', isNotice, notice_until||null, kstNow(), kstNow());
    res.json({ id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 수정
router.put('/:id', requireLogin, async (req, res) => {
  try {
    const post = await db.prepare('SELECT * FROM board_posts WHERE id=?').get(req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다' });
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    if (post.user_id !== req.session.user.id && !isAdmin)
      return res.status(403).json({ error: '수정 권한이 없습니다' });
    const { title, content, is_notice, notice_until } = req.body;
    const isNotice = is_notice ? 1 : 0;
    if (isNotice && !isAdmin) return res.status(403).json({ error: '공지사항은 관리자만 설정할 수 있습니다' });
    await db.prepare(
      `UPDATE board_posts SET title=?, content=?, is_notice=?, notice_until=?, updated_at=? WHERE id=?`
    ).run(title?.trim()||post.title, content??post.content, isNotice, notice_until??post.notice_until, kstNow(), req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 삭제
router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const post = await db.prepare('SELECT * FROM board_posts WHERE id=?').get(req.params.id);
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다' });
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    if (post.user_id !== req.session.user.id && !isAdmin)
      return res.status(403).json({ error: '삭제 권한이 없습니다' });
    await db.prepare('DELETE FROM board_posts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

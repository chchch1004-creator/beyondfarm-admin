const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

router.get('/messages', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { channel = 'free', limit = 100 } = req.query;
    const rows = await db.prepare(
      'SELECT * FROM community_messages WHERE channel = ? ORDER BY id DESC LIMIT ?'
    ).all(channel, parseInt(limit));
    res.json(rows.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/messages', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { channel = 'free', content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '내용을 입력하세요' });
    const user = req.session.user;
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const pad = n => String(n).padStart(2, '0');
    const created_at = `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}:${pad(kst.getSeconds())}`;

    const result = await db.prepare(
      'INSERT INTO community_messages (user_id, user_name, channel, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, user.name, channel, content.trim(), created_at);

    const msg = { id: result.lastInsertRowid, user_id: user.id, user_name: user.name, channel, content: content.trim(), created_at };

    if (global.wsBroadcast) global.wsBroadcast({ type: 'community_message', data: msg });

    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/messages/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const user = req.session.user;
    const msg = await db.prepare('SELECT * FROM community_messages WHERE id = ?').get(parseInt(req.params.id));
    if (!msg) return res.status(404).json({ error: '없음' });
    if (msg.user_id !== user.id && user.role !== 'superadmin') return res.status(403).json({ error: '권한 없음' });
    await db.prepare('DELETE FROM community_messages WHERE id = ?').run(parseInt(req.params.id));
    if (global.wsBroadcast) global.wsBroadcast({ type: 'community_delete', data: { id: parseInt(req.params.id), channel: msg.channel } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

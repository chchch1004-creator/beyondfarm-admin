const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

async function isMember(db, roomId, userId) {
  const row = await db.prepare('SELECT 1 FROM call_room_members WHERE room_id=? AND user_id=?').get(roomId, userId);
  return !!row;
}

// ── 자유채팅 메시지 ──

router.get('/messages', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { channel = 'free', limit = 100 } = req.query;
    const rows = await db.prepare(
      'SELECT * FROM community_messages WHERE channel = ? AND (room_id IS NULL OR room_id = 0) ORDER BY id DESC LIMIT ?'
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
    if (global.wsBroadcast) global.wsBroadcast({ type: 'community_delete', data: { id: parseInt(req.params.id), channel: msg.channel, room_id: msg.room_id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 호출 방 목록 (내가 멤버인 방) ──
router.get('/rooms', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const rows = await db.prepare(`
      SELECT r.id, r.title, r.created_by_name, r.created_at,
             (SELECT content FROM community_messages WHERE room_id = r.id ORDER BY id DESC LIMIT 1) AS last_msg,
             (SELECT created_at FROM community_messages WHERE room_id = r.id ORDER BY id DESC LIMIT 1) AS last_msg_at
      FROM call_rooms r
      JOIN call_room_members m ON m.room_id = r.id
      WHERE m.user_id = ?
      ORDER BY r.id DESC
    `).all(userId);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 방 멤버 목록 ──
router.get('/rooms/:id/members', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const roomId = parseInt(req.params.id);
    const userId = req.session.user.id;
    if (!await isMember(db, roomId, userId)) return res.status(403).json({ error: '접근 권한 없음' });
    const rows = await db.prepare(`
      SELECT u.id, u.name FROM call_room_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ?
    `).all(roomId);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 방 메시지 조회 ──
router.get('/rooms/:id/messages', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const roomId = parseInt(req.params.id);
    const userId = req.session.user.id;
    if (!await isMember(db, roomId, userId)) return res.status(403).json({ error: '접근 권한 없음' });
    const rows = await db.prepare(
      'SELECT * FROM community_messages WHERE room_id = ? ORDER BY id DESC LIMIT 100'
    ).all(roomId);
    res.json(rows.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 방 메시지 전송 ──
router.post('/rooms/:id/messages', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const roomId = parseInt(req.params.id);
    const userId = req.session.user.id;
    if (!await isMember(db, roomId, userId)) return res.status(403).json({ error: '접근 권한 없음' });
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '내용을 입력하세요' });
    const user = req.session.user;
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const pad = n => String(n).padStart(2, '0');
    const created_at = `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}:${pad(kst.getSeconds())}`;

    const result = await db.prepare(
      'INSERT INTO community_messages (user_id, user_name, channel, room_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user.id, user.name, 'room', roomId, content.trim(), created_at);

    const msg = { id: result.lastInsertRowid, user_id: user.id, user_name: user.name, channel: 'room', room_id: roomId, content: content.trim(), created_at };
    if (global.wsBroadcast) global.wsBroadcast({ type: 'room_message', data: msg });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

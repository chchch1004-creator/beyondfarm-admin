const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// FCM / WebPush 발송 (room 메시지 알림용)
let _fcm = null;
let _webpush = null;
function getFcm() {
  if (_fcm) return _fcm;
  try { const { getMessaging } = require('firebase-admin/messaging'); _fcm = getMessaging(); } catch {}
  return _fcm;
}
function getWebpush() {
  if (_webpush) return _webpush;
  try { _webpush = require('web-push'); } catch {}
  return _webpush;
}

async function sendPushToUsers(db, userIds, title, body, url) {
  if (!userIds.length) return;
  const ph = userIds.map(() => '?').join(',');
  const fcmTokens = await db.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${ph})`).all(userIds);
  const webSubs   = await db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${ph})`).all(userIds);

  const fcm = getFcm();
  if (fcm && fcmTokens.length) {
    for (const { token } of fcmTokens) {
      try {
        await fcm.send({
          token,
          notification: { title, body },
          data: { url: url || '/', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
          android: { priority: 'high' },
        });
      } catch {}
    }
  }

  const wp = getWebpush();
  if (wp && process.env.VAPID_PUBLIC_KEY && webSubs.length) {
    for (const s of webSubs) {
      try {
        await wp.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url: url || '/' })
        );
      } catch {}
    }
  }
}

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

// ── 방 상세 (멤버만) ──
router.get('/rooms/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const roomId = parseInt(req.params.id);
    const userId = req.session.user.id;
    if (!await isMember(db, roomId, userId)) return res.status(403).json({ error: '접근 권한 없음' });
    const room = await db.prepare('SELECT * FROM call_rooms WHERE id=?').get(roomId);
    if (!room) return res.status(404).json({ error: '방 없음' });
    const members = await db.prepare(`
      SELECT u.id, u.name FROM call_room_members m
      JOIN users u ON u.id = m.user_id WHERE m.room_id=?
    `).all(roomId);
    res.json({ ...room, members });
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

    // 나를 제외한 나머지 멤버에게 푸시 알림
    const members = await db.prepare('SELECT user_id FROM call_room_members WHERE room_id=?').all(roomId);
    const otherIds = members.map(m => m.user_id).filter(id => id !== user.id);
    if (otherIds.length) {
      const room = await db.prepare('SELECT title FROM call_rooms WHERE id=?').get(roomId);
      const notifTitle = `💬 ${room?.title || '호출 채팅'}`;
      const notifBody  = `${user.name}: ${content.trim().slice(0, 80)}`;
      const notifUrl   = `/community?room=${roomId}`;
      sendPushToUsers(db, otherIds, notifTitle, notifBody, notifUrl).catch(() => {});
    }

    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

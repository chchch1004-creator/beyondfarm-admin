const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { getDb } = require('../db/database');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:chchch1004@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// VAPID 공개키 전달
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// 구독 저장
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const { endpoint, keys } = req.body;
    await db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth
    `).run(userId, endpoint, keys.p256dh, keys.auth);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 구독 해제
router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const { endpoint } = req.body;
    await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 특정 유저에게 알림 전송
router.post('/send', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { to_user_id, title, body, url } = req.body;
    const sender = req.session.user;

    let subs;
    if (to_user_id === 'all') {
      subs = await db.prepare('SELECT * FROM push_subscriptions').all();
    } else {
      subs = await db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(parseInt(to_user_id));
    }

    const payload = JSON.stringify({ title, body, url: url || '/', sender: sender.name });
    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      ))
    );

    // 만료된 구독 정리
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const status = results[i].reason?.statusCode;
        if (status === 404 || status === 410) {
          await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(subs[i].endpoint);
        }
      }
    }

    const sent = results.filter(r => r.status === 'fulfilled').length;
    res.json({ ok: true, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { getDb } = require('../db/database');

// Web Push (브라우저/PWA)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:chchch1004@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// FCM (안드로이드 앱)
let firebaseAdmin = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
    );
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    firebaseAdmin = admin;
    console.log('Firebase Admin 초기화 완료');
  } catch (e) { console.error('Firebase Admin 초기화 실패:', e.message); }
}

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// VAPID 공개키 전달
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

// Web Push 구독 저장 (브라우저/PWA)
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

// FCM 토큰 저장 (안드로이드 앱)
router.post('/fcm-token', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: '토큰 없음' });
    await db.prepare(`
      INSERT INTO fcm_tokens (user_id, token)
      VALUES (?, ?)
      ON CONFLICT(user_id, token) DO UPDATE SET updated_at=datetime('now','localtime')
    `).run(userId, token);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 알림 전송 (Web Push + FCM 동시)
router.post('/send', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { to_user_id, title, body, url } = req.body;

    let webSubs, fcmTokens;
    if (to_user_id === 'all') {
      webSubs = await db.prepare('SELECT * FROM push_subscriptions').all();
      fcmTokens = await db.prepare('SELECT token FROM fcm_tokens').all();
    } else {
      webSubs = await db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(parseInt(to_user_id));
      fcmTokens = await db.prepare('SELECT token FROM fcm_tokens WHERE user_id = ?').all(parseInt(to_user_id));
    }

    let sent = 0;

    // Web Push 전송
    if (webSubs.length > 0) {
      const payload = JSON.stringify({ title, body, url: url || '/' });
      const results = await Promise.allSettled(
        webSubs.map(s => webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        ))
      );
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled') { sent++; }
        else {
          const status = results[i].reason?.statusCode;
          if (status === 404 || status === 410) {
            await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(webSubs[i].endpoint);
          }
        }
      }
    }

    // FCM 전송 (안드로이드 앱)
    if (firebaseAdmin && fcmTokens.length > 0) {
      const tokens = fcmTokens.map(t => t.token);
      const message = {
        notification: { title, body },
        data: { url: url || '/' },
        tokens,
      };
      try {
        const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
        sent += response.successCount;
        // 만료된 토큰 정리
        response.responses.forEach((r, i) => {
          if (!r.success && (r.error?.code === 'messaging/invalid-registration-token' ||
              r.error?.code === 'messaging/registration-token-not-registered')) {
            db.prepare('DELETE FROM fcm_tokens WHERE token = ?').run(tokens[i]);
          }
        });
      } catch (e) { console.error('FCM 전송 실패:', e.message); }
    }

    res.json({ ok: true, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

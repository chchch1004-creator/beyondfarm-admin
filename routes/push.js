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

// FCM (안드로이드 앱) - firebase-admin v12+ 방식
let fcmMessaging = null;
let firebaseInitError = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(raw);
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    fcmMessaging = getMessaging();
    console.log('Firebase Admin 초기화 완료');
  } catch (e) {
    firebaseInitError = e.message;
    console.error('Firebase Admin 초기화 실패:', e.message);
  }
} else {
  firebaseInitError = 'FIREBASE_SERVICE_ACCOUNT 환경변수 없음';
}

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// VAPID 공개키 전달
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

// 진단: FCM 상태 확인
router.get('/status', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const fcmTokens = await db.prepare('SELECT token, updated_at FROM fcm_tokens WHERE user_id=?').all(userId);
    const webSubs = await db.prepare('SELECT endpoint, created_at FROM push_subscriptions WHERE user_id=?').all(userId);
    res.json({
      firebase_initialized: !!fcmMessaging,
      firebase_error: firebaseInitError,
      vapid_initialized: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      fcm_tokens: fcmTokens,
      web_subscriptions: webSubs,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// 알림 해제
router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const { endpoint } = req.body;
    if (endpoint) {
      await db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(userId, endpoint);
    } else {
      // FCM: 해당 유저의 토큰 전체 삭제
      await db.prepare('DELETE FROM fcm_tokens WHERE user_id=?').run(userId);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 알림 전송 (Web Push + FCM 동시)
router.post('/send', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { to_user_id, title, body, url } = req.body;

    const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const todayStr = `${kstDate.getFullYear()}-${String(kstDate.getMonth()+1).padStart(2,'0')}-${String(kstDate.getDate()).padStart(2,'0')}`;

    let webSubs, fcmTokens;

    if (to_user_id === 'all') {
      // 알림 동의한 전원 (출근 여부 무관)
      webSubs = await db.prepare('SELECT * FROM push_subscriptions').all();
      fcmTokens = await db.prepare('SELECT token FROM fcm_tokens').all();

    } else if (to_user_id === 'clocked') {
      // 현재 출근 중인 직원만
      const clockedIn = await db.prepare(
        `SELECT DISTINCT user_id FROM attendance WHERE date = ? AND check_in IS NOT NULL AND (check_out IS NULL OR check_out = '')`
      ).all(todayStr);
      const ids = clockedIn.map(r => r.user_id);
      if (ids.length === 0) return res.json({ ok: true, sent: 0, reason: '현재 출근 중인 직원이 없습니다.' });
      const ph = ids.map(() => '?').join(',');
      webSubs = await db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${ph})`).all(ids);
      fcmTokens = await db.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${ph})`).all(ids);

    } else if (to_user_id.includes(',')) {
      // 개별 선택 (쉼표로 구분된 ID 목록)
      const ids = to_user_id.split(',').map(id => parseInt(id)).filter(Boolean);
      const ph = ids.map(() => '?').join(',');
      webSubs = await db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${ph})`).all(ids);
      fcmTokens = await db.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${ph})`).all(ids);

    } else {
      // 단일 직원
      const uid = parseInt(to_user_id);
      webSubs = await db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(uid);
      fcmTokens = await db.prepare('SELECT token FROM fcm_tokens WHERE user_id = ?').all(uid);
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
    if (fcmMessaging && fcmTokens.length > 0) {
      const tokens = fcmTokens.map(t => t.token);
      const message = {
        notification: { title, body },
        data: { url: url || '/' },
        tokens,
      };
      try {
        const response = await fcmMessaging.sendEachForMulticast(message);
        sent += response.successCount;
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

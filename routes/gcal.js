const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { getDb } = require('../db/database');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://beyondfarm-production.up.railway.app/api/gcal/callback';

function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인이 필요합니다' });
  next();
}

function requireAdmin(req, res, next) {
  if (!['admin','superadmin'].includes(req.session?.user?.role)) return res.status(403).json({ error: '관리자 권한이 필요합니다' });
  next();
}

// Google OAuth URL 생성
router.get('/auth-url', requireAuth, requireAdmin, (req, res) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: String(req.session.user.id)
  });
  res.json({ url });
});

// OAuth 콜백
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('인증 코드가 없습니다');

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    const db = getDb();
    const userId = parseInt(state);

    await db.prepare(`
      INSERT INTO google_tokens (user_id, access_token, refresh_token, expiry_date)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token=excluded.access_token,
        refresh_token=COALESCE(excluded.refresh_token, refresh_token),
        expiry_date=excluded.expiry_date,
        updated_at=datetime('now')
    `).run(userId, tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null);

    res.send(`<script>window.opener?.postMessage({type:'gcal-connected'},'*');window.close();</script>`);
  } catch (e) {
    console.error('GCal callback error:', e);
    res.status(500).send('연동 실패: ' + e.message);
  }
});

// 연동 상태 확인
router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  const db = getDb();
  const token = await db.prepare('SELECT id, calendar_id, updated_at FROM google_tokens WHERE user_id = ?').get(req.session.user.id);
  res.json({ connected: !!token, calendar_id: token?.calendar_id || 'primary', updated_at: token?.updated_at });
});

// 연동 해제
router.delete('/disconnect', requireAuth, requireAdmin, async (req, res) => {
  const db = getDb();
  await db.prepare('DELETE FROM google_tokens WHERE user_id = ?').run(req.session.user.id);
  res.json({ ok: true });
});

// 구글캘린더 → 홈페이지로 가져오기
router.get('/events', requireAuth, requireAdmin, async (req, res) => {
  const db = getDb();
  const token = await db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.session.user.id);
  if (!token) return res.status(400).json({ error: '구글캘린더가 연동되지 않았습니다' });

  try {
    const auth = getOAuth2Client();
    auth.setCredentials({ access_token: token.access_token, refresh_token: token.refresh_token, expiry_date: token.expiry_date });

    const calendar = google.calendar({ version: 'v3', auth });
    // 과거 1년 ~ 미래 2년 범위로 전체 조회 (페이지네이션 처리)
    const timeMin = new Date(); timeMin.setFullYear(timeMin.getFullYear() - 1);
    const timeMax = new Date(); timeMax.setFullYear(timeMax.getFullYear() + 2);

    let allItems = [];
    let pageToken = undefined;
    do {
      const response = await calendar.events.list({
        calendarId: token.calendar_id || 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 2500,
        singleEvents: true,
        orderBy: 'startTime',
        pageToken,
      });
      allItems = allItems.concat(response.data.items || []);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    const events = allItems.map(e => ({
      id: e.id,
      title: e.summary || '(제목 없음)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      description: e.description,
      allDay: !!e.start?.date
    }));

    res.json(events);
  } catch (e) {
    console.error('GCal events error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 홈페이지 → 구글캘린더 이벤트 생성
router.post('/push-event', requireAuth, requireAdmin, async (req, res) => {
  const { title, start, end, description, allDay } = req.body;
  if (!title || !start) return res.status(400).json({ error: '제목과 시작일은 필수입니다' });

  const db = getDb();
  const token = await db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.session.user.id);
  if (!token) return res.status(400).json({ error: '구글캘린더가 연동되지 않았습니다' });

  try {
    const auth = getOAuth2Client();
    auth.setCredentials({ access_token: token.access_token, refresh_token: token.refresh_token, expiry_date: token.expiry_date });

    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: title,
      description: description || '',
      start: allDay ? { date: start } : { dateTime: start, timeZone: 'Asia/Seoul' },
      end: allDay ? { date: end || start } : { dateTime: end || start, timeZone: 'Asia/Seoul' }
    };

    const result = await calendar.events.insert({ calendarId: token.calendar_id || 'primary', requestBody: event });
    res.json({ ok: true, eventId: result.data.id });
  } catch (e) {
    console.error('GCal push error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 휴가 승인 시 캘린더에 자동 등록 (leaves route에서 호출)
async function pushLeaveToCalendar(userId, leaveData) {
  const db = getDb();
  // superadmin 또는 admin 토큰 사용
  const token = await db.prepare(`
    SELECT gt.* FROM google_tokens gt
    JOIN users u ON u.id = gt.user_id
    WHERE u.role IN ('superadmin','admin')
    ORDER BY CASE u.role WHEN 'superadmin' THEN 0 ELSE 1 END
    LIMIT 1
  `).get();

  if (!token) return;

  try {
    const auth = getOAuth2Client();
    auth.setCredentials({ access_token: token.access_token, refresh_token: token.refresh_token, expiry_date: token.expiry_date });

    const calendar = google.calendar({ version: 'v3', auth });
    const typeMap = { annual: '연차', half: '반차', sick: '병가', official: '공가', other: '기타휴가' };

    const event = {
      summary: `[휴가] ${leaveData.userName} - ${typeMap[leaveData.type] || leaveData.type}`,
      description: leaveData.reason || '',
      start: { date: leaveData.start_date },
      end: { date: leaveData.end_date }
    };

    const result = await calendar.events.insert({ calendarId: token.calendar_id || 'primary', requestBody: event });

    await db.prepare(`
      INSERT INTO gcal_events (source, source_id, gcal_event_id, user_id)
      VALUES ('leave', ?, ?, ?)
    `).run(leaveData.leaveId, result.data.id, userId);
  } catch (e) {
    console.error('휴가 캘린더 등록 실패:', e.message);
  }
}

module.exports = router;
module.exports.pushLeaveToCalendar = pushLeaveToCalendar;

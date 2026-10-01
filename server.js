const http = require('http');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { WebSocketServer } = require('ws');
const { init } = require('./db/database');
const TursoStore = require('./db/session-store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));
const sessionStore = new TursoStore();
app.use(session({
  secret: process.env.SESSION_SECRET || 'beyondfarm-secret-2024',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  rolling: true,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
// 1시간마다 만료 세션 정리
setInterval(() => sessionStore.cleanup(), 60 * 60 * 1000);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/timesheet', require('./routes/timesheet'));
app.use('/api/gcal', require('./routes/gcal'));
app.use('/api/sh-timesheet', require('./routes/sh_timesheet'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/push', require('./routes/push'));
app.use('/api/user-settings', require('./routes/settings_user'));
app.use('/api/community', require('./routes/community'));
app.use('/api/corp', require('./routes/corp'));
app.use('/api/payhere', require('./routes/payhere'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/subscriptions', require('./routes/subscriptions'));

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server });
global.wsBroadcast = (data) => {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
};
wss.on('connection', (ws) => {
  ws.on('error', () => {});
});

// ── 매일 새벽 2시(KST) 자동 백업 ─────────────────────────────────
function scheduleBackup() {
  const { runBackup } = require('./routes/backup');
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const next2am = new Date(kst);
  next2am.setHours(2, 0, 0, 0);
  if (next2am <= kst) next2am.setDate(next2am.getDate() + 1);
  const ms = next2am - kst;
  setTimeout(async () => {
    try { await runBackup(); } catch {}
    scheduleBackup();
  }, ms);
  console.log(`[백업] 다음 자동백업: ${next2am.toLocaleString('ko-KR')} (${Math.round(ms/3600000)}시간 후)`);
}

// ── 매일 오전 9시(KST) 자동 구독 결제 ─────────────────────────────
function scheduleAutoCharge() {
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const next9am = new Date(kst);
  next9am.setHours(9, 0, 0, 0);
  if (next9am <= kst) next9am.setDate(next9am.getDate() + 1);
  const ms = next9am - kst;
  setTimeout(async () => {
    await runAutoCharge();
    scheduleAutoCharge();
  }, ms);
  console.log(`[구독결제] 다음 자동결제: ${next9am.toLocaleString('ko-KR')} (${Math.round(ms/3600000)}시간 후)`);
}

async function runAutoCharge() {
  const https = require('https');
  const { getDb } = require('./db/database');
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) { console.log('[구독결제] TOSS_SECRET_KEY 미설정, 스킵'); return; }

  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
  const db = getDb();
  const dues = await db.prepare(`
    SELECT * FROM subscriptions WHERE status='active' AND billing_key IS NOT NULL AND next_bill_at <= ?
  `).all(today);

  console.log(`[구독결제] ${today} 결제 대상: ${dues.length}건`);

  const PLANS = {
    charcoal:            { name: '숯불 무료',                   price:  3900 },
    extra_hour_5:        { name: '추가1시간 무료(최대5인)',       price: 12900 },
    extra_hour_unlim:    { name: '추가1시간 무료(인원 무제한)',   price: 18900 },
    charcoal_extra_5:    { name: '숯불+1시간 무료(최대5인)',      price: 14900 },
    charcoal_extra_unlim:{ name: '숯불+1시간 무료(인원 무제한)', price: 20900 },
  };

  for (const sub of dues) {
    const plan = PLANS[sub.plan];
    if (!plan) continue;
    const orderId = `sub_${sub.id}_${Date.now()}`;
    const payload = JSON.stringify({
      customerKey: `customer_${sub.id}`,
      amount: plan.price,
      orderId,
      orderName: `비욘더팜 ${plan.name} 구독`,
      customerName: sub.customer_name,
      customerMobilePhone: sub.phone,
    });
    try {
      const result = await new Promise((resolve, reject) => {
        const req2 = https.request({
          hostname: 'api.tosspayments.com',
          path: `/v1/billing/${sub.billing_key}`,
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        }, (r) => {
          let data = '';
          r.on('data', c => { data += c; });
          r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(data) }));
        });
        req2.on('error', reject);
        req2.write(payload);
        req2.end();
      });

      const billedDate = today;
      const d = new Date(billedDate);
      d.setDate(sub.billing_day);
      while (d.toISOString().slice(0, 10) <= billedDate) d.setMonth(d.getMonth() + 1);
      const nextBill = d.toISOString().slice(0, 10);

      if (result.status === 200) {
        await db.prepare(`INSERT INTO subscription_payments (subscription_id,amount,status,billed_at,toss_order_id,toss_payment_key) VALUES (?,?,?,?,?,?)`)
          .run(sub.id, plan.price, 'success', billedDate, orderId, result.body.paymentKey);
        await db.prepare('UPDATE subscriptions SET last_billed_at=?,next_bill_at=? WHERE id=?')
          .run(billedDate, nextBill, sub.id);
        console.log(`[구독결제] ✅ ${sub.customer_name} ${plan.price.toLocaleString()}원 성공`);
      } else {
        await db.prepare(`INSERT INTO subscription_payments (subscription_id,amount,status,billed_at,fail_reason) VALUES (?,?,?,?,?)`)
          .run(sub.id, plan.price, 'fail', billedDate, result.body.message || '결제 실패');
        console.log(`[구독결제] ❌ ${sub.customer_name} 실패: ${result.body.message}`);
      }
    } catch (e) {
      console.error(`[구독결제] 오류 ${sub.customer_name}:`, e.message);
    }
  }
}

module.exports = { runAutoCharge };

init().then(() => {
  server.listen(PORT, () => {
    console.log(`비욘더팜 관리 시스템 실행 중: http://localhost:${PORT}`);
  });
  scheduleBackup();
  scheduleAutoCharge();
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});

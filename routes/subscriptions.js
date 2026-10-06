const express = require('express');
const router = express.Router();
const https = require('https');
const { getDb } = require('../db/database');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  const r = req.session.user.role;
  if (r !== 'superadmin' && r !== 'admin') return res.status(403).json({ error: '권한 없음' });
  next();
}

const PLANS = {
  charcoal:            { name: '숯불 무료',                    price:  3900, mandatory: 6, benefit: '숯불비용 무료' },
  extra_hour_5:        { name: '추가1시간 무료(최대5인)',        price: 12900, mandatory: 3, benefit: '1시간 추가비용 무료 (최대 5인)' },
  extra_hour_unlim:    { name: '추가1시간 무료(인원 무제한)',    price: 18900, mandatory: 3, benefit: '1시간 추가비용 무료 (인원 무제한)' },
  charcoal_extra_5:    { name: '숯불+1시간 무료(최대5인)',       price: 14900, mandatory: 3, benefit: '숯불비용 무료 + 1시간 추가비용 무료 (최대 5인)' },
  charcoal_extra_unlim:{ name: '숯불+1시간 무료(인원 무제한)',   price: 20900, mandatory: 3, benefit: '숯불비용 무료 + 1시간 추가비용 무료 (인원 무제한)' },
};

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function nextBillDate(startDate, billingDay) {
  const today = new Date().toISOString().slice(0, 10);
  let d = new Date(startDate);
  d.setDate(billingDay);
  while (d.toISOString().slice(0, 10) <= today) d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// 전체 구독 목록
router.get('/', requireAdmin, async (req, res) => {
  const db = getDb();
  const rows = await db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM subscription_payments p WHERE p.subscription_id = s.id AND p.status='success') as paid_count
    FROM subscriptions s ORDER BY s.created_at DESC
  `).all();
  res.json(rows.map(r => ({ ...r, plan_info: PLANS[r.plan] || {} })));
});

// 구독 상세
router.get('/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: '없음' });
  const payments = await db.prepare(
    'SELECT * FROM subscription_payments WHERE subscription_id=? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json({ ...sub, plan_info: PLANS[sub.plan] || {}, payments });
});

// 구독 등록
router.post('/', requireAdmin, async (req, res) => {
  const { customer_name, phone, plan, start_date, billing_day = 1, memo } = req.body;
  if (!customer_name || !phone || !plan || !start_date)
    return res.status(400).json({ error: '필수값 누락' });
  if (!PLANS[plan]) return res.status(400).json({ error: '유효하지 않은 플랜' });

  const db = getDb();
  const mandatory = PLANS[plan].mandatory;
  const mandatory_end_date = addMonths(start_date, mandatory);
  const next_bill_at = nextBillDate(start_date, billing_day);

  const r = await db.prepare(`
    INSERT INTO subscriptions (customer_name, phone, plan, start_date, billing_day, mandatory_months, mandatory_end_date, status, next_bill_at, memo, created_by)
    VALUES (?,?,?,?,?,?,?,'active',?,?,?)
  `).run(customer_name, phone, plan, start_date, billing_day, mandatory, mandatory_end_date, next_bill_at, memo || null, req.session.user.name);

  res.json({ id: r.lastInsertRowid });
});

// 구독 수정
router.put('/:id', requireAdmin, async (req, res) => {
  const { status, memo, billing_key } = req.body;
  const db = getDb();
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: '없음' });

  const fields = [], args = [];
  if (status !== undefined)      { fields.push('status=?');      args.push(status); }
  if (memo !== undefined)        { fields.push('memo=?');         args.push(memo); }
  if (billing_key !== undefined) { fields.push('billing_key=?'); args.push(billing_key); }
  if (!fields.length) return res.json({ ok: true });
  args.push(req.params.id);
  await db.prepare(`UPDATE subscriptions SET ${fields.join(',')} WHERE id=?`).run(...args);
  res.json({ ok: true });
});

// 결제 수동 기록
router.post('/:id/payments', requireAdmin, async (req, res) => {
  const { amount, status = 'success', billed_at, fail_reason, toss_payment_key } = req.body;
  const db = getDb();
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: '없음' });

  const billedDate = billed_at || new Date().toISOString().slice(0, 10);
  await db.prepare(`
    INSERT INTO subscription_payments (subscription_id, amount, status, billed_at, toss_payment_key, fail_reason)
    VALUES (?,?,?,?,?,?)
  `).run(req.params.id, amount || PLANS[sub.plan]?.price || 0, status, billedDate, toss_payment_key || null, fail_reason || null);

  if (status === 'success') {
    const nextBill = nextBillDate(billedDate, sub.billing_day);
    await db.prepare('UPDATE subscriptions SET last_billed_at=?, next_bill_at=? WHERE id=?')
      .run(billedDate, nextBill, req.params.id);
  }
  res.json({ ok: true });
});

// 토스페이먼츠 자동결제 실행
router.post('/:id/charge', requireAdmin, async (req, res) => {
  const db = getDb();
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: '없음' });
  if (!sub.billing_key) return res.status(400).json({ error: '빌링키 없음. 카드 등록 먼저 필요.' });

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'TOSS_SECRET_KEY 환경변수 미설정' });

  const plan = PLANS[sub.plan];
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

    if (result.status === 200) {
      const billedDate = new Date().toISOString().slice(0, 10);
      const nextBill = nextBillDate(billedDate, sub.billing_day);
      await db.prepare(`
        INSERT INTO subscription_payments (subscription_id, amount, status, billed_at, toss_order_id, toss_payment_key)
        VALUES (?,?,?,?,?,?)
      `).run(sub.id, plan.price, 'success', billedDate, orderId, result.body.paymentKey);
      await db.prepare('UPDATE subscriptions SET last_billed_at=?, next_bill_at=? WHERE id=?')
        .run(billedDate, nextBill, sub.id);
      res.json({ ok: true, amount: plan.price });
    } else {
      const billedDate = new Date().toISOString().slice(0, 10);
      await db.prepare(`
        INSERT INTO subscription_payments (subscription_id, amount, status, billed_at, fail_reason)
        VALUES (?,?,?,?,?)
      `).run(sub.id, plan.price, 'fail', billedDate, result.body.message || '결제 실패');
      res.status(400).json({ error: result.body.message || '결제 실패' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 빌링키 발급 확인 (Toss 카드 등록 성공 후 호출)
router.post('/:id/billing-confirm', requireAdmin, async (req, res) => {
  const { authKey, customerKey } = req.body;
  if (!authKey || !customerKey) return res.status(400).json({ error: 'authKey/customerKey 필요' });

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'TOSS_SECRET_KEY 미설정' });

  const db = getDb();
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: '없음' });

  try {
    const result = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ authKey, customerKey });
      const req2 = https.request({
        hostname: 'api.tosspayments.com',
        path: '/v1/billing/authorizations/issue',
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

    if (result.status === 200) {
      const billingKey = result.body.billingKey;
      await db.prepare('UPDATE subscriptions SET billing_key=? WHERE id=?').run(billingKey, sub.id);
      res.json({ ok: true, billingKey });
    } else {
      res.status(400).json({ error: result.body.message || '빌링키 발급 실패' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 클라이언트 키 반환 (카드 등록 위젯용)
router.get('/meta/client-key', requireAdmin, (req, res) => {
  const key = process.env.TOSS_CLIENT_KEY;
  if (!key) return res.status(500).json({ error: 'TOSS_CLIENT_KEY 미설정' });
  res.json({ clientKey: key });
});

// 혜택 확인 (전화번호로 조회 — 현장 직원용)
router.get('/check/:phone', requireLogin, async (req, res) => {
  const db = getDb();
  const phone = req.params.phone.replace(/[^0-9]/g, '');
  const subs = await db.prepare(`
    SELECT plan, status, mandatory_end_date, last_billed_at
    FROM subscriptions WHERE REPLACE(phone,'-','') = ? AND status='active'
  `).all(phone);
  if (!subs.length) return res.json({ active: false });
  const benefits = subs.map(s => ({ plan: s.plan, benefit: PLANS[s.plan]?.benefit || '', ...s }));
  res.json({ active: true, benefits });
});

// 플랜 목록
router.get('/meta/plans', requireLogin, async (req, res) => {
  res.json(PLANS);
});

module.exports = router;

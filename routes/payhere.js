const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { getDb } = require('../db/database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '권한 없음' });
  next();
}

// 상품 목록 (전체 or 부족 상품만)
router.get('/products', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const lowOnly = req.query.low === '1';
    let rows;
    if (lowOnly) {
      rows = await db.prepare(
        `SELECT * FROM payhere_products WHERE threshold IS NOT NULL AND threshold > 0 AND stock_qty <= threshold ORDER BY category, product_name`
      ).all();
    } else {
      rows = await db.prepare(
        `SELECT * FROM payhere_products ORDER BY category, product_name`
      ).all();
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 안전재고 기준 수정
router.put('/products/:sku/threshold', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { threshold } = req.body;
    await db.prepare(
      `UPDATE payhere_products SET threshold=? WHERE sku=?`
    ).run(threshold === '' || threshold === null ? null : parseInt(threshold), req.params.sku);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 엑셀 업로드 → 재고 파싱 → DB 저장
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일 없음' });
    const db = getDb();

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, cellNF: false, cellText: false, cellFormula: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // NaN/Infinity 셀 값 제거 (SSF.format 오류 방지)
    Object.keys(ws).filter(k => k[0] !== '!').forEach(k => {
      const c = ws[k];
      if (c && typeof c.v === 'number' && !isFinite(c.v)) c.v = null;
      if (c && c.t === 'e') { c.t = 'n'; c.v = null; } // 수식 오류 셀
    });
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

    // 컬럼명 매핑 (페이히어 엑셀 형식)
    const COL_SKU = 'SKU';
    const COL_QTY = '기존 수량';
    const COL_NAME = '상품명';
    const COL_CAT = '카테고리';
    const COL_BARCODE = '바코드';
    const COL_PRICE = '판매가';
    const COL_THRESHOLD = '안전재고';

    if (!rows.length || !(COL_SKU in rows[0])) {
      return res.status(400).json({ error: '페이히어 재고 엑셀 형식이 아닙니다. (SKU, 상품명, 기존 수량 컬럼 필요)' });
    }

    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const pad = n => String(n).padStart(2, '0');
    const now = `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}:${pad(kst.getSeconds())}`;

    let inserted = 0, updated = 0;
    for (const row of rows) {
      const sku = String(row[COL_SKU] || '').trim();
      const name = String(row[COL_NAME] || '').trim();
      if (!sku || !name) continue;

      const stockQty = parseFloat(row[COL_QTY]) || 0;
      const category = String(row[COL_CAT] || '').trim();
      const barcode = String(row[COL_BARCODE] || '').trim();
      const price = parseInt(row[COL_PRICE]) || 0;
      const thresholdFromFile = (row[COL_THRESHOLD] !== null && row[COL_THRESHOLD] !== undefined && row[COL_THRESHOLD] !== '')
        ? parseInt(row[COL_THRESHOLD]) : null;

      // 이미 있으면 재고만 업데이트, 없으면 INSERT (안전재고는 파일값 우선, 이미 설정됐으면 유지)
      const existing = await db.prepare('SELECT threshold FROM payhere_products WHERE sku=?').get(sku);
      if (existing) {
        const keepThreshold = (existing.threshold !== null && existing.threshold !== undefined)
          ? existing.threshold : thresholdFromFile;
        await db.prepare(
          `UPDATE payhere_products SET product_name=?, category=?, barcode=?, price=?, stock_qty=?, threshold=?, updated_at=? WHERE sku=?`
        ).run(name, category, barcode, price, stockQty, keepThreshold, now, sku);
        updated++;
      } else {
        await db.prepare(
          `INSERT INTO payhere_products (sku, product_name, category, barcode, price, stock_qty, threshold, updated_at) VALUES (?,?,?,?,?,?,?,?)`
        ).run(sku, name, category, barcode, price, stockQty, thresholdFromFile, now);
        inserted++;
      }
    }

    // 부족 상품 집계
    const lowRows = await db.prepare(
      `SELECT * FROM payhere_products WHERE threshold IS NOT NULL AND threshold > 0 AND stock_qty <= threshold ORDER BY category, product_name`
    ).all();

    res.json({ ok: true, inserted, updated, total: rows.length, low_count: lowRows.length, low_items: lowRows, uploaded_at: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 전체 상품 삭제
router.delete('/products', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM payhere_products').run();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 재고 부족 알림 발송
router.post('/notify', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const lowRows = await db.prepare(
      `SELECT * FROM payhere_products WHERE threshold IS NOT NULL AND threshold > 0 AND stock_qty <= threshold ORDER BY stock_qty ASC`
    ).all();

    if (!lowRows.length) return res.json({ ok: true, sent: 0, reason: '부족 상품 없음' });

    const lines = lowRows.map(r => `• ${r.product_name}: ${r.stock_qty}개 (기준 ${r.threshold}개)`);
    const title = `📦 재고 부족 알림 (${lowRows.length}개 상품)`;
    const body = lines.slice(0, 8).join('\n') + (lines.length > 8 ? `\n외 ${lines.length - 8}개` : '');

    // FCM 발송
    let sent = 0;
    const fcmTokenRows = await db.prepare('SELECT DISTINCT token FROM fcm_tokens').all();

    if (fcmTokenRows.length) {
      let fcmMessaging = null;
      try {
        const { getMessaging } = require('firebase-admin/messaging');
        fcmMessaging = getMessaging();
      } catch {}

      if (fcmMessaging) {
        for (const { token } of fcmTokenRows) {
          try {
            await fcmMessaging.send({
              token,
              notification: { title, body },
              data: { url: '/inventory', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
              android: { priority: 'high' }
            });
            sent++;
          } catch {}
        }
      }
    }

    // Web Push 발송
    let webpush = null;
    try { webpush = require('web-push'); } catch {}
    if (webpush && process.env.VAPID_PUBLIC_KEY) {
      const subs = await db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all();
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title, body, url: '/inventory' })
          );
          sent++;
        } catch {}
      }
    }

    res.json({ ok: true, sent, low_count: lowRows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

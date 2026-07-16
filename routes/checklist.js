const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { getDb } = require('../db/database');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 네이버 예약 엑셀 파싱 및 텐트 자동 배정 ──────────────────────────────

const TENT8_LABELS = ['A','B','C','D','E','F','G','H','J','K','L','P','S'];

function parseNaverExcel(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const confirmed = rows.slice(3).filter(r => String(r[5] || '') === '확정');

  const timeMap = { '오전 11:00': '11', '오후 3:00': '15', '오후 7:00': '19' };

  // Extract date from first confirmed row
  let date = '';
  if (confirmed.length > 0) {
    const ds = String(confirmed[0][13] || '');
    // Format: '26. 7. 17.(금) 오전 11:00' → 2026-07-17
    const m = ds.match(/(\d+)\.\s*(\d+)\.\s*(\d+)\./);
    if (m) {
      const yr = parseInt(m[1]) < 100 ? 2000 + parseInt(m[1]) : parseInt(m[1]);
      date = `${yr}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    }
  }

  const orders = {};
  for (const r of confirmed) {
    const ono = r[3];
    const ds = String(r[13] || '');
    let ts = '';
    for (const [k, v] of Object.entries(timeMap)) {
      if (ds.includes(k)) { ts = v; break; }
    }
    if (!ts) continue;

    if (!orders[ono]) {
      orders[ono] = {
        name: String(r[7] || '').trim(),
        product_raw: String(r[15] || '').trim(),
        ts,
        extra: 0, bulmung: '', child: 0, adult: 0, play: 0, ticket: 0,
      };
    }
    const opt = String(r[17] || '').trim();
    const ol = opt.toLowerCase();
    if (opt === '불멍 세트') orders[ono].bulmung = 'o';
    else if (ol.includes('아이') && (ol.includes('풀') || ol.includes('스위밍'))) orders[ono].child++;
    else if (ol.includes('성인') && (ol.includes('풀') || ol.includes('스위밍'))) orders[ono].adult++;
    else if (ol.includes('플레이')) orders[ono].play++;
    else if (ol.includes('인원 추가')) orders[ono].extra++;
    else if (opt.includes('티켓')) orders[ono].ticket++;
  }

  return { date, orders: Object.values(orders) };
}

function getProductType(raw) {
  if (/7인/.test(raw)) return 'L';
  if (/4인/.test(raw)) return 'M';
  if (/2인/.test(raw)) return 'S';
  if (/티켓/.test(raw)) return 'T';
  if (/단체/.test(raw)) return 'G';
  return '?';
}

function getReserved(o) {
  const t = getProductType(o.product_raw);
  if (t === 'T') return o.ticket;
  if (t === 'G') {
    const m = o.product_raw.match(/단체(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }
  const base = t === 'L' ? 7 : t === 'M' ? 4 : 2;
  return base + o.extra;
}

function assignTents(allOrders) {
  const byTs = { '11': [], '15': [], '19': [] };
  for (const o of allOrders) { if (byTs[o.ts]) byTs[o.ts].push(o); }

  // two_time map
  const nameToSlots = {};
  for (const [ts, orders] of Object.entries(byTs)) {
    for (const o of orders) {
      if (!o.name) continue;
      if (!nameToSlots[o.name]) nameToSlots[o.name] = [];
      if (!nameToSlots[o.name].includes(ts)) nameToSlots[o.name].push(ts);
    }
  }
  const twoTimeMap = {};
  for (const [name, slots] of Object.entries(nameToSlots)) {
    if (slots.length > 1) twoTimeMap[name] = slots.sort().join(' ');
  }

  // tentMap: name → { M: slotIdx, L: slotIdx }
  const tentMap = {};

  const makeEmptyRow = (tentNo) => ({
    tent_no: String(tentNo), product:'', visit_count:'', name:'', reserved:'',
    actual:'', two_time:'', play:'', child_pool:'', adult_pool:'',
    bulmung:'', adult_only:'', extra_hour:'', memo:'',
  });

  const makeRow = (tentNo, o, prodOverride) => {
    if (!o) return makeEmptyRow(tentNo);
    const rsv = getReserved(o);
    return {
      tent_no: String(tentNo),
      product: prodOverride || (['T','?'].includes(getProductType(o.product_raw)) ? '' : getProductType(o.product_raw)),
      visit_count: '', name: o.name,
      reserved: rsv ? String(rsv) : '',
      actual: '', two_time: twoTimeMap[o.name] || '',
      play: o.play ? String(o.play) : '',
      child_pool: o.child ? String(o.child) : '',
      adult_pool: o.adult ? String(o.adult) : '',
      bulmung: o.bulmung || '', adult_only: '', extra_hour: '', memo: '',
    };
  };

  const result = {};

  for (const ts of ['11', '15', '19']) {
    const orders = byTs[ts];
    const Llist = orders.filter(o => getProductType(o.product_raw) === 'L').sort((a,b) => getReserved(b) - getReserved(a));
    const MSlist = orders.filter(o => ['M','S'].includes(getProductType(o.product_raw))).sort((a,b) => getReserved(b) - getReserved(a));
    const Tlist = orders.filter(o => getProductType(o.product_raw) === 'T');
    const Glist = orders.filter(o => getProductType(o.product_raw) === 'G');

    const overflow = Math.max(0, MSlist.length - 12);
    const msToL = MSlist.slice(0, overflow);
    const msToM = MSlist.slice(overflow);
    const allL = [...Llist, ...msToL].sort((a,b) => getReserved(b) - getReserved(a));

    // Assign M slots (0–11) with same-tent priority
    const mSlots = {};
    for (const o of msToM) {
      const prev = tentMap[o.name]?.M;
      if (prev !== undefined && !mSlots[prev]) mSlots[prev] = o;
    }
    const remainingM = msToM.filter(o => !Object.values(mSlots).includes(o));
    const freeM = Array.from({length: 12}, (_, i) => i).filter(i => !(i in mSlots));
    remainingM.forEach((o, i) => {
      if (i < freeM.length) {
        mSlots[freeM[i]] = o;
        if (!tentMap[o.name]) tentMap[o.name] = {};
        if (tentMap[o.name].M === undefined) tentMap[o.name].M = freeM[i];
      }
    });
    // Record assignments for pre-assigned too
    for (const [slot, o] of Object.entries(mSlots)) {
      if (!tentMap[o.name]) tentMap[o.name] = {};
      if (tentMap[o.name].M === undefined) tentMap[o.name].M = parseInt(slot);
    }

    // Assign L slots (0–12) with same-tent priority
    const lSlots = {};
    for (const o of allL) {
      const prev = tentMap[o.name]?.L;
      if (prev !== undefined && !lSlots[prev]) lSlots[prev] = o;
    }
    const remainingL = allL.filter(o => !Object.values(lSlots).includes(o));
    const freeL = Array.from({length: 13}, (_, i) => i).filter(i => !(i in lSlots));
    remainingL.forEach((o, i) => {
      if (i < freeL.length) {
        lSlots[freeL[i]] = o;
        if (!tentMap[o.name]) tentMap[o.name] = {};
        if (tentMap[o.name].L === undefined) tentMap[o.name].L = freeL[i];
      }
    });
    for (const [slot, o] of Object.entries(lSlots)) {
      if (!tentMap[o.name]) tentMap[o.name] = {};
      if (tentMap[o.name].L === undefined) tentMap[o.name].L = parseInt(slot);
    }

    const tent4 = Array.from({length: 6}, (_, i) => makeRow(i, mSlots[i]));
    const tent2 = Array.from({length: 6}, (_, i) => makeRow(6 + i, mSlots[6 + i]));
    const tent8 = Array.from({length: 13}, (_, i) => makeRow(TENT8_LABELS[i], lSlots[i]));

    // 단체 처리: 연속 텐트 배정 (tent8 빈 자리에 추가)
    const freeL2 = Array.from({length: 13}, (_, i) => i).filter(i => !lSlots[i]);
    let freeIdx = 0;
    for (const o of Glist) {
      const m = o.product_raw.match(/단체(\d+)/);
      const slots = m ? Math.ceil(parseInt(m[1]) / 10) : 1;
      for (let j = 0; j < slots && freeIdx < freeL2.length; j++, freeIdx++) {
        const li = freeL2[freeIdx];
        tent8[li] = makeRow(TENT8_LABELS[li], j === 0 ? o : { ...o, name: '' });
      }
    }

    const extra = Tlist.map(o => makeRow('', o));
    result[ts] = { summary: {}, tent4, tent2, tent8, extra };
  }

  return result;
}

// POST /api/checklist/upload-excel
router.post('/upload-excel', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한이 없습니다' });
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다' });

    const { date, orders } = parseNaverExcel(req.file.buffer);
    if (!date) return res.status(400).json({ error: '날짜를 인식할 수 없습니다. 네이버 예약 내보내기 파일인지 확인해주세요.' });

    const slotData = assignTents(orders);

    for (const ts of ['11', '15', '19']) {
      await getDb().prepare(`
        INSERT INTO checklist_data (date, timeslot, data, updated_at) VALUES (?,?,?,datetime('now'))
        ON CONFLICT(date, timeslot) DO UPDATE SET data=excluded.data, updated_at=datetime('now')
      `).run(date, ts, JSON.stringify(slotData[ts]));
    }

    res.json({ ok: true, date });
  } catch (e) {
    console.error('Excel upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

async function canView(req) {
  if (req.session.user.role === 'superadmin') return true;
  const row = await getDb().prepare('SELECT can_view FROM user_permissions WHERE user_id=? AND page=?').get(req.session.user.id, 'checklist');
  return !!row?.can_view;
}

async function canEdit(req) {
  if (req.session.user.role === 'superadmin') return true;
  const row = await getDb().prepare('SELECT can_edit FROM user_permissions WHERE user_id=? AND page=?').get(req.session.user.id, 'checklist');
  return !!row?.can_edit;
}

// GET /api/checklist/dates - 체크리스트가 있는 날짜 목록
router.get('/dates', requireAuth, async (req, res) => {
  try {
    if (!await canView(req)) return res.status(403).json({ error: '접근 권한이 없습니다' });
    const rows = await getDb().prepare('SELECT DISTINCT date FROM checklist_data ORDER BY date DESC').all();
    res.json(rows.map(r => r.date));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/checklist/:date/:timeslot
router.get('/:date/:timeslot', requireAuth, async (req, res) => {
  try {
    if (!await canView(req)) return res.status(403).json({ error: '접근 권한이 없습니다' });
    const row = await getDb().prepare('SELECT data FROM checklist_data WHERE date=? AND timeslot=?').get(req.params.date, req.params.timeslot);
    if (!row) return res.json(null);
    res.json(JSON.parse(row.data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/checklist/:date/:timeslot
router.put('/:date/:timeslot', requireAuth, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한이 없습니다' });
    const json = JSON.stringify(req.body);
    await getDb().prepare(`
      INSERT INTO checklist_data (date, timeslot, data, updated_at) VALUES (?,?,?,datetime('now'))
      ON CONFLICT(date, timeslot) DO UPDATE SET data=excluded.data, updated_at=datetime('now')
    `).run(req.params.date, req.params.timeslot, json);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/checklist/:date/:timeslot
router.delete('/:date/:timeslot', requireAuth, async (req, res) => {
  try {
    if (!await canEdit(req)) return res.status(403).json({ error: '수정 권한이 없습니다' });
    await getDb().prepare('DELETE FROM checklist_data WHERE date=? AND timeslot=?').run(req.params.date, req.params.timeslot);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

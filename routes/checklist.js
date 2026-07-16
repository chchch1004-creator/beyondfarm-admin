const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { getDb } = require('../db/database');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 네이버 예약 엑셀 파싱 및 텐트 자동 배정 ──────────────────────────────

const TENT8_LABELS = ['A','B','C','D','E','F','G','H','J','K','L','P','S'];

function parseNaverExcel(buffer) {
  // raw:false → 날짜/시간 셀을 Date 객체 대신 포맷된 문자열로 반환 (UTC 타임존 이슈 방지)
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  // 헤더 행 동적 탐색: "예약번호", "상태", "예약자명" 등의 키워드로 헤더 위치 찾기
  let headerRow = -1;
  let colStatus = -1, colOrderNo = -1, colName = -1, colProduct = -1, colDateTime = -1, colOption = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    for (let j = 0; j < r.length; j++) {
      const v = String(r[j] || '').trim();
      if (v.includes('예약번호') || v.includes('주문번호')) { if (colOrderNo < 0) { colOrderNo = j; headerRow = i; } }
      if (v === '상태' || v === '예약상태') { if (colStatus < 0) colStatus = j; }
      if ((v.includes('예약자') && v.includes('명')) || v === '예약자명') colName = j;
      if (v.includes('상품명') || v.includes('예약상품') || v === '상품구분' || v === '상품') { if (colProduct < 0) colProduct = j; }
      if (v.includes('방문일') || v.includes('예약일') || v.includes('이용일시') || v.includes('방문일시')) colDateTime = j;
      if (v.includes('옵션') || v.includes('추가상품') || v.includes('가격분류')) { if (colOption < 0) colOption = j; }
    }
    if (headerRow >= 0 && colStatus >= 0) break;
  }

  // 헤더를 못 찾으면 네이버 예약 내보내기 기본 인덱스로 fallback
  if (headerRow < 0) headerRow = 2;
  if (colOrderNo < 0) colOrderNo = 0;
  if (colStatus < 0) colStatus = 5;
  if (colName < 0) colName = 7;
  if (colDateTime < 0) colDateTime = 12;
  if (colProduct < 0) colProduct = 13;
  if (colOption < 0) colOption = 14;

  const VALID_STATUS = ['확정', '이용완료', '예약완료', '사용완료', '방문완료'];
  // 데이터 행: 헤더 다음 행부터, 유효한 상태만
  const dataRows = rows.slice(headerRow + 1).filter(r =>
    VALID_STATUS.includes(String(r[colStatus] || '').trim())
  );

  // 타임슬롯 파싱
  function parseTs(cell) {
    if (cell instanceof Date) {
      const h = cell.getHours();
      if (h === 11) return '11';
      if (h === 15) return '15';
      if (h === 19) return '19';
      return '';
    }
    const s = String(cell || '');
    if (s.includes('오전 11') || s.includes('11:00')) return '11';
    if (s.includes('오후 3') || s.includes('15:00') || s.includes('오후3')) return '15';
    if (s.includes('오후 7') || s.includes('19:00') || s.includes('오후7')) return '19';
    return '';
  }

  // 날짜 파싱
  function parseDate(cell) {
    if (cell instanceof Date) {
      const yr = cell.getFullYear();
      const mo = cell.getMonth() + 1;
      const dy = cell.getDate();
      return `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
    }
    const s = String(cell || '');
    // "26. 7. 17.(금)" or "2026-07-17" or "2026/7/17"
    let m = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m = s.match(/(\d+)\.\s*(\d+)\.\s*(\d+)\./);
    if (m) {
      const yr = parseInt(m[1]) < 100 ? 2000 + parseInt(m[1]) : parseInt(m[1]);
      return `${yr}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    }
    return '';
  }

  let date = '';
  const orders = {};

  for (const r of dataRows) {
    const dtCell = r[colDateTime];
    if (!date) date = parseDate(dtCell);
    const ts = parseTs(dtCell);
    if (!ts) continue;

    const ono = String(r[colOrderNo] || '').trim() || Math.random().toString();
    if (!orders[ono]) {
      orders[ono] = {
        name: String(r[colName] || '').trim(),
        product_raw: String(r[colProduct] || '').trim(),
        ts,
        extra: 0, bulmung: '', child: 0, adult: 0, play: 0, ticket: 0,
      };
    }
    const opt = String(r[colOption] || '').trim();
    const ol = opt.toLowerCase();
    if (opt === '불멍 세트') orders[ono].bulmung = 'o';
    else if (ol.includes('아이') && (ol.includes('풀') || ol.includes('스위밍'))) orders[ono].child++;
    else if (ol.includes('성인') && (ol.includes('풀') || ol.includes('스위밍'))) orders[ono].adult++;
    else if (ol.includes('플레이')) orders[ono].play++;
    else if (ol.includes('인원 추가')) orders[ono].extra++;
    else if (opt.includes('티켓')) orders[ono].ticket++;
  }

  const firstDtRaw = dataRows[0]?.[colDateTime] ?? '없음';
  // 4~8행의 colStatus 셀값을 샘플로 수집
  const headerSample = rows[headerRow] ? `HDR:[${rows[headerRow].slice(0,20).map(v=>String(v).substring(0,8)).join('|')}]` : '';
  const sampleRows = headerSample + ' ' + rows.slice(headerRow+1, headerRow+3).map(r => `[${r.slice(0,20).map(v=>String(v).substring(0,10)).join('|')}]`).join(' ');
  return {
    date, orders: Object.values(orders),
    _debug: {
      headerRow, colStatus, colOrderNo, colName, colProduct, colDateTime, colOption,
      confirmedCount: dataRows.length,
      firstDateCell: String(firstDtRaw),
      sampleRows,
    },
  };
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

    const parsed = parseNaverExcel(req.file.buffer);
    const { date, orders } = parsed;
    if (!date) {
      const d = parsed._debug;
      return res.status(400).json({ error: `날짜 인식 실패. 확정:${d.confirmedCount}, headerRow:${d.headerRow}, statusCol:${d.colStatus}, 날짜셀:"${d.firstDateCell}", 샘플:"${d.sampleRows}"` });
    }

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

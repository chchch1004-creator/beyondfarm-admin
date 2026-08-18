const express = require('express');
const { getDb } = require('../db/database');
const { isHoliday } = require('../utils/holidays');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireSuperAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '총괄관리자 권한 필요' });
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// 근무표 데이터
router.get('/', requireAuth, async (req, res) => {
  try {
    const y = parseInt(req.query.year) || new Date().getFullYear();
    const m = parseInt(req.query.month) || new Date().getMonth() + 1;
    const days = new Date(y, m, 0).getDate();

    const employees = await db.prepare(
      `SELECT id, name, employee_type, ssn, bank_name, bank_account, hourly_rate, hire_date
       FROM users WHERE status = 'active' ORDER BY
       CASE name
         WHEN '조상희' THEN 101
         WHEN '조상하' THEN 102
         WHEN '정재호' THEN 103
         WHEN '소재훈' THEN 104
         WHEN '관리자' THEN 105
         ELSE CASE
           WHEN name LIKE '%TEST%' OR name = 'T' THEN 106
           WHEN name LIKE '%테스트%' THEN 107
           ELSE 0
         END
       END,
       hire_date ASC, name`
    ).all();

    const [attendance, settingsRows, manualHoursAll, adjustmentsAll, noteRow] = await Promise.all([
      db.prepare(`SELECT * FROM attendance WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`).all(String(y), String(m).padStart(2, '0')),
      db.prepare('SELECT key, value FROM settings').all(),
      db.prepare('SELECT * FROM timesheet_manual_hours WHERE year = ? AND month = ?').all(y, m),
      db.prepare('SELECT * FROM timesheet_adjustments WHERE year = ? AND month = ?').all(y, m),
      db.prepare('SELECT content FROM timesheet_notes WHERE year = ? AND month = ?').get(y, m),
    ]);

    const cfg = {};
    settingsRows.forEach(r => { cfg[r.key] = r.value; });
    const officeStart = cfg.office_start || '10:00';
    const fieldWeekdayStart = cfg.field_weekday_start || '13:00';
    const fieldWeekendStart = cfg.field_weekend_start || '09:30';

    const parseMin = t => { const [h,m] = (t||'00:00').split(':').map(Number); return h*60+m; };
    function calcOfficialHours(checkIn, checkOut, employeeType, date, workLocation) {
      if (!checkIn || !checkOut) return 0;
      const dow = new Date(date).getDay(); // 0=일, 6=토
      const isWeekend = dow === 0 || dow === 6 || isHoliday(date);
      // work_location 2 = 현장, 1 = 사무실. 미설정 시 employee_type으로 fallback
      const isField = workLocation === 2 || (workLocation == null && ['주말고정','주말','평일'].includes(employeeType));
      const officialStartStr = isField ? (isWeekend ? fieldWeekendStart : fieldWeekdayStart) : officeStart;
      const officialStart = parseMin(officialStartStr);
      const actualStart = parseMin(checkIn);
      const end = parseMin(checkOut);
      const effectiveStart = Math.max(actualStart, officialStart);
      const totalMins = end - effectiveStart;
      if (totalMins <= 0) return 0;
      return Math.round(totalMins / 30) * 0.5;
    }

    const manualHours = manualHoursAll;
    const adjustments = adjustmentsAll;
    const note = noteRow;

    const shareholderNames = ['조상희','조상하','정재호','소재훈'];
    const shareholderIds = employees.filter(e => shareholderNames.includes(e.name)).map(e => e.id);
    let shParticipations = [], shExtras = [];
    if (shareholderIds.length > 0) {
      [shParticipations, shExtras] = await Promise.all([
        db.prepare(`SELECT user_id, day FROM shareholder_participation WHERE year=? AND month=? AND participated=1`).all(y, m),
        db.prepare(`SELECT user_id, day FROM shareholder_extra WHERE year=? AND month=? AND participated=1`).all(y, m),
      ]);
    }
    const shMap = {}, shExtraMap = {};
    shareholderIds.forEach(id => { shMap[id] = new Set(); shExtraMap[id] = new Set(); });
    shParticipations.forEach(p => { if (shMap[p.user_id] !== undefined) shMap[p.user_id].add(p.day); });
    shExtras.forEach(p => { if (shExtraMap[p.user_id] !== undefined) shExtraMap[p.user_id].add(p.day); });

    const data = employees.map(emp => {
      // 출근 기록에서 시간 계산
      const attDaily = {};
      attendance.filter(a => a.user_id === emp.id).forEach(att => {
        if (att.check_in && att.check_out) {
          const day = parseInt(att.date.split('-')[2]);
          const hours = calcOfficialHours(att.check_in, att.check_out, emp.employee_type, att.date, att.work_location);
          if (hours > 0) attDaily[day] = (attDaily[day] || 0) + hours;
        }
      });

      // 수동 입력 시간
      const manDaily = {};
      manualHours.filter(h => h.user_id === emp.id).forEach(h => {
        manDaily[h.day] = h.hours;
      });

      // 최종: 수동입력 우선, 없으면 출근기록
      const daily = {};
      const allDays = new Set([...Object.keys(attDaily), ...Object.keys(manDaily)].map(Number));
      allDays.forEach(day => {
        if (manDaily[day] !== undefined) {
          daily[day] = { hours: manDaily[day], is_manual: true };
        } else if (attDaily[day] !== undefined) {
          daily[day] = { hours: attDaily[day], is_manual: false };
        }
      });

      const adj_row = adjustments.find(a => a.user_id === emp.id);

      return {
        id: emp.id,
        name: emp.name,
        employee_type: emp.employee_type || '평일',
        ssn: emp.ssn || '',
        bank_name: emp.bank_name || '',
        bank_account: emp.bank_account || '',
        hourly_rate: emp.hourly_rate || 0,
        daily,
        adj: adj_row?.adj || 0,
        adj1: adj_row?.adj1 || 0,
        sh_days: shMap[emp.id] ? [...shMap[emp.id]] : null,
        sh_extra_days: shExtraMap[emp.id] ? [...shExtraMap[emp.id]] : null,
      };
    });

    res.json({ year: y, month: m, days, employees: data, note: note?.content || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 수동 시간 저장
router.put('/hours', requireSuperAdmin, async (req, res) => {
  try {
    const { user_id, year, month, day, hours } = req.body;
    if (hours === 0 || hours === null || hours === '') {
      await db.prepare('DELETE FROM timesheet_manual_hours WHERE user_id=? AND year=? AND month=? AND day=?').run(user_id, year, month, day);
    } else {
      await db.prepare(`INSERT INTO timesheet_manual_hours (user_id, year, month, day, hours) VALUES (?,?,?,?,?)
        ON CONFLICT(user_id, year, month, day) DO UPDATE SET hours=excluded.hours`).run(user_id, year, month, day, hours);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 조정 저장
router.put('/adjustments', requireSuperAdmin, async (req, res) => {
  try {
    const { user_id, year, month, adj, adj1 } = req.body;
    await db.prepare(`INSERT INTO timesheet_adjustments (user_id, year, month, adj, adj1) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id, year, month) DO UPDATE SET adj=excluded.adj, adj1=excluded.adj1`).run(user_id, year, month, adj || 0, adj1 || 0);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 월별 메모 저장
router.post('/notes', requireSuperAdmin, async (req, res) => {
  try {
    const { year, month, content } = req.body;
    await db.prepare(`INSERT INTO timesheet_notes (year, month, content) VALUES (?, ?, ?)
       ON CONFLICT(year, month) DO UPDATE SET content=excluded.content`).run(year, month, content);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 급여 확인 상태 조회 (관리자: 전체, 직원: 본인)
router.get('/confirmations', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.query;
    const user = req.session.user;
    if (user.role === 'superadmin') {
      const rows = await db.prepare(
        `SELECT tc.*, u.name FROM timesheet_confirmations tc
         JOIN users u ON u.id = tc.user_id
         WHERE tc.year=? AND tc.month=?`
      ).all(parseInt(year), parseInt(month));
      return res.json(rows);
    }
    const row = await db.prepare(
      `SELECT * FROM timesheet_confirmations WHERE user_id=? AND year=? AND month=?`
    ).get(user.id, parseInt(year), parseInt(month));
    res.json(row || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 이력 조회
router.get('/confirmations/history', requireAuth, async (req, res) => {
  try {
    const { year, month, user_id } = req.query;
    const user = req.session.user;
    const uid = user.role === 'superadmin' && user_id ? parseInt(user_id) : user.id;
    const rows = await db.prepare(
      `SELECT * FROM timesheet_confirmation_history WHERE user_id=? AND year=? AND month=? ORDER BY id ASC`
    ).all(uid, parseInt(year), parseInt(month));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 급여 확인/수정요청 저장
router.post('/confirmations', requireAuth, async (req, res) => {
  try {
    const { year, month, status, comment } = req.body;
    const user = req.session.user;
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const pad = n => String(n).padStart(2,'0');
    const now = `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}`;
    await db.prepare(`
      INSERT INTO timesheet_confirmations (user_id, year, month, status, comment, confirmed_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id, year, month) DO UPDATE SET status=excluded.status, comment=excluded.comment, confirmed_at=excluded.confirmed_at
    `).run(user.id, parseInt(year), parseInt(month), status, comment || '', now);
    // 이력 기록: 마지막 이력이 본인(직원) 것이면 UPDATE, 아니면 INSERT
    const actionLabel = status === 'confirmed' ? '✅ 급여 확인' : '❗ 수정 요청';
    const lastHist = await db.prepare(
      `SELECT id, actor FROM timesheet_confirmation_history WHERE user_id=? AND year=? AND month=? ORDER BY id DESC LIMIT 1`
    ).get(user.id, parseInt(year), parseInt(month));
    if (lastHist && lastHist.actor === user.name) {
      await db.prepare(
        `UPDATE timesheet_confirmation_history SET action=?, comment=?, created_at=? WHERE id=?`
      ).run(actionLabel, comment || '', now, lastHist.id);
    } else {
      await db.prepare(
        `INSERT INTO timesheet_confirmation_history (user_id, year, month, actor, action, comment, created_at) VALUES (?,?,?,?,?,?,?)`
      ).run(user.id, parseInt(year), parseInt(month), user.name, actionLabel, comment || '', now);
    }

    // 수정요청인 경우 총괄관리자에게 푸시 알림
    if (status === 'disputed') {
      const admins = await db.prepare(`SELECT id FROM users WHERE role='superadmin'`).all();
      const adminIds = admins.map(a => a.id);
      if (adminIds.length) {
        const title = `❗ 급여 수정요청 — ${user.name}`;
        const body  = comment ? comment.slice(0, 100) : `${year}년 ${month}월 급여 수정을 요청했습니다.`;
        const url   = `/timesheet?year=${year}&month=${month}`;
        // lazy-load FCM / WebPush (community.js와 동일 패턴)
        try {
          const ph = adminIds.map(() => '?').join(',');
          const fcmTokens = await db.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${ph})`).all(adminIds);
          const webSubs   = await db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${ph})`).all(adminIds);
          let fcm;
          try { const { getMessaging } = require('firebase-admin/messaging'); fcm = getMessaging(); } catch {}
          if (fcm) for (const { token } of fcmTokens) {
            try { await fcm.send({ token, notification: { title, body }, data: { url }, android: { priority: 'high' } }); } catch {}
          }
          let wp;
          try { wp = require('web-push'); } catch {}
          if (wp && process.env.VAPID_PUBLIC_KEY) for (const s of webSubs) {
            try { await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url })); } catch {}
          }
        } catch {}
      }
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 관리자 답변 저장 + 직원에게 푸시
router.post('/confirmations/reply', requireSuperAdmin, async (req, res) => {
  try {
    const { user_id, year, month, admin_comment } = req.body;
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const pad = n => String(n).padStart(2,'0');
    const now = `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}`;
    await db.prepare(`
      UPDATE timesheet_confirmations SET admin_comment=?, admin_replied_at=?
      WHERE user_id=? AND year=? AND month=?
    `).run(admin_comment, now, parseInt(user_id), parseInt(year), parseInt(month));
    // 이력 기록
    await db.prepare(
      `INSERT INTO timesheet_confirmation_history (user_id, year, month, actor, action, comment, created_at) VALUES (?,?,?,?,?,?,?)`
    ).run(parseInt(user_id), parseInt(year), parseInt(month), req.session.user.name, '📋 관리자 답변', admin_comment, now);

    // 직원에게 푸시 알림
    try {
      const title = `📋 ${year}년 ${month}월 급여 답변이 도착했습니다`;
      const body  = admin_comment ? admin_comment.slice(0, 100) : '관리자가 답변을 남겼습니다.';
      const url   = `/timesheet?year=${year}&month=${month}`;
      const fcmTokens = await db.prepare(`SELECT token FROM fcm_tokens WHERE user_id=?`).all(parseInt(user_id));
      const webSubs   = await db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?`).all(parseInt(user_id));
      let fcm;
      try { const { getMessaging } = require('firebase-admin/messaging'); fcm = getMessaging(); } catch {}
      if (fcm) for (const { token } of fcmTokens) {
        try { await fcm.send({ token, notification: { title, body }, data: { url }, android: { priority: 'high' } }); } catch {}
      }
      let wp;
      try { wp = require('web-push'); } catch {}
      if (wp && process.env.VAPID_PUBLIC_KEY) for (const s of webSubs) {
        try { await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url })); } catch {}
      }
    } catch {}

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 스타일 엑셀 다운로드 ──────────────────────────────────────────────────
router.get('/excel', requireSuperAdmin, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { isHoliday: isHol } = require('../utils/holidays');

    const y = parseInt(req.query.year) || new Date().getFullYear();
    const m = parseInt(req.query.month) || new Date().getMonth() + 1;
    const days = new Date(y, m, 0).getDate();

    // ── 데이터 조회 (GET / 와 동일 로직) ──
    const employees = await db.prepare(
      `SELECT id, name, employee_type, ssn, bank_name, bank_account, hourly_rate, hire_date
       FROM users WHERE status='active' ORDER BY
       CASE name WHEN '조상희' THEN 101 WHEN '조상하' THEN 102 WHEN '정재호' THEN 103 WHEN '소재훈' THEN 104 WHEN '관리자' THEN 105
       ELSE CASE WHEN name LIKE '%TEST%' OR name='T' THEN 106 WHEN name LIKE '%테스트%' THEN 107 ELSE 0 END END,
       hire_date ASC, name`
    ).all();
    const attendance = await db.prepare(
      `SELECT * FROM attendance WHERE strftime('%Y',date)=? AND strftime('%m',date)=?`
    ).all(String(y), String(m).padStart(2,'0'));
    const settingsRows = await db.prepare('SELECT key,value FROM settings').all();
    const cfg = {}; settingsRows.forEach(r => { cfg[r.key] = r.value; });
    const officeStart = cfg.office_start||'10:00';
    const fieldWeekdayStart = cfg.field_weekday_start||'13:00';
    const fieldWeekendStart = cfg.field_weekend_start||'09:30';
    const parseMin = t => { const [h,mm] = (t||'00:00').split(':').map(Number); return h*60+mm; };
    const calcH = (ci,co,et,date,wl) => {
      if(!ci||!co) return 0;
      const dow=new Date(date).getDay(), isWknd=dow===0||dow===6||isHol(date);
      const isField=wl===2||(wl==null&&['주말고정','주말','평일'].includes(et));
      const start=parseMin(isField?(isWknd?fieldWeekendStart:fieldWeekdayStart):officeStart);
      const mins=parseMin(co)-Math.max(parseMin(ci),start);
      return mins<=0?0:Math.round(mins/30)*0.5;
    };
    const manualHours = await db.prepare('SELECT * FROM timesheet_manual_hours WHERE year=? AND month=?').all(y,m);
    const adjustments = await db.prepare('SELECT * FROM timesheet_adjustments WHERE year=? AND month=?').all(y,m);

    // 시급 이력 기반 조회
    const lastDay=`${y}-${String(m).padStart(2,'0')}-31`;
    const rateHistAll = await db.prepare('SELECT user_id,hourly_rate FROM hourly_rate_history WHERE effective_from<=? ORDER BY effective_from ASC').all(lastDay);
    const effectiveRateMap={};
    rateHistAll.forEach(r=>{effectiveRateMap[r.user_id]=r.hourly_rate;});

    // 주주 데이터
    const SH_NAMES = ['조상희','조상하','정재호','소재훈'];
    const SH_FIXED = { '조상희':130, '조상하':80, '정재호':80, '소재훈':200 };
    const SH_FIXED_DAY = 10;
    const shEmployees = employees.filter(e=>SH_NAMES.includes(e.name));
    const shIds = shEmployees.map(e=>e.id);
    const [shParts, shExtras] = shIds.length ? await Promise.all([
      db.prepare(`SELECT user_id,day FROM shareholder_participation WHERE year=? AND month=? AND participated=1`).all(y,m),
      db.prepare(`SELECT user_id,day FROM shareholder_extra WHERE year=? AND month=? AND participated=1`).all(y,m),
    ]) : [[],[]];
    const shMap={}, shExtraMap={};
    shIds.forEach(id=>{shMap[id]=new Set();shExtraMap[id]=new Set();});
    shParts.forEach(p=>{if(shMap[p.user_id])shMap[p.user_id].add(p.day);});
    shExtras.forEach(p=>{if(shExtraMap[p.user_id])shExtraMap[p.user_id].add(p.day);});

    const shRate=(day)=>{
      const dow=new Date(y,m-1,day).getDay();
      const ds=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if(isHol(ds)||dow===0||dow===6) return 30;
      if(dow===5) return 25;
      return 20;
    };
    const shExtraRate=(day)=>{
      const dow=new Date(y,m-1,day).getDay();
      const ds=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if(isHol(ds)||dow===0||dow===6) return 20;
      if(dow===5) return 15;
      return 10;
    };

    const empData = employees.map(emp=>{
      const isSH = SH_NAMES.includes(emp.name);
      const adj=adjustments.find(a=>a.user_id===emp.id);
      const adjAmt=(adj?.adj||0)*10000, adj1Amt=(adj?.adj1||0)*10000;
      const s=(emp.ssn||'').replace(/-/g,'');
      const ssn=s.length===13?s.slice(0,6)+'-'+s.slice(6):(emp.ssn||'');
      const bank=emp.bank_name?(emp.bank_name+' '+(emp.bank_account||'')):emp.bank_account||'';

      if(isSH) {
        const days_sh=[...shMap[emp.id]||[]];
        const days_ex=[...shExtraMap[emp.id]||[]];
        const shTotal=days_sh.reduce((s,d)=>s+shRate(d)*10000,0);
        const exTotal=days_ex.reduce((s,d)=>s+shExtraRate(d)*10000,0);
        const fixedAmt=(SH_FIXED[emp.name]||0)*10000;
        const netPay=Math.round(shTotal+exTotal+fixedAmt+adjAmt+adj1Amt);
        const tax=Math.round(netPay*0.03), localTax=Math.round(netPay*0.003);
        // daily: 참여일 표시용 (금액 표시)
        const daily={};
        days_sh.forEach(d=>{daily[d]={sh:shRate(d), extra:shExtraMap[emp.id].has(d)?shExtraRate(d):0};});
        days_ex.forEach(d=>{if(!daily[d])daily[d]={sh:0,extra:shExtraRate(d)};});
        return { name:emp.name, isSH:true, daily, adj:adj?.adj||0, adj1:adj?.adj1||0,
          totalH:days_sh.length, netPay, tax, localTax, transfer:netPay-tax-localTax, ssn, bank };
      }

      const daily={};
      attendance.filter(a=>a.user_id===emp.id).forEach(a=>{
        if(a.check_in&&a.check_out){const d=parseInt(a.date.split('-')[2]);const h=calcH(a.check_in,a.check_out,emp.employee_type,a.date,a.work_location);if(h>0)daily[d]={hours:(daily[d]?.hours||0)+h};}
      });
      manualHours.filter(h=>h.user_id===emp.id).forEach(h=>{daily[h.day]={hours:h.hours,manual:true};});
      const rate=effectiveRateMap[emp.id]??emp.hourly_rate??0;
      const totalH=Object.values(daily).reduce((s,v)=>s+(v.hours||0),0);
      const netPay=Math.round(totalH*rate+adjAmt+adj1Amt);
      const tax=Math.round(netPay*0.03), localTax=Math.round(netPay*0.003);
      return { name:emp.name, isSH:false, daily, adj:adj?.adj||0, adj1:adj?.adj1||0,
        totalH, netPay, tax, localTax, transfer:netPay-tax-localTax, ssn, bank };
    });

    // ── ExcelJS 워크북 ──
    const wb = new ExcelJS.Workbook();
    wb.creator = '비욘더팜'; wb.created = new Date();
    const ws = wb.addWorksheet(`${m}월 근무표`, { views:[{state:'frozen',xSplit:2,ySplit:2}] });

    // 색상 상수
    const C = {
      darkGreen: '1B4332', white: 'FFFFFF', sunday: 'FF4444', saturday: '4488FF',
      amber: '856404', amberBg: 'FFF3CD', adjFg: 'E67700', adjBg: 'FFFDE7',
      transferFg: '1B4332', transferBg: 'D1FAE5', headerBg: '1B4332',
      rowOdd: 'F8FAFB', rowEven: 'FFFFFF', borderColor: 'CCCCCC',
      totalH: 'EFF6FF', totalFg: '1E40AF', holidayBg: 'FFF5F5', satBg: 'EFF6FF',
    };

    const border = (color=C.borderColor) => ({
      top:{style:'thin',color:{argb:'FF'+color}}, left:{style:'thin',color:{argb:'FF'+color}},
      bottom:{style:'thin',color:{argb:'FF'+color}}, right:{style:'thin',color:{argb:'FF'+color}}
    });
    const fill = color => ({ type:'pattern', pattern:'solid', fgColor:{argb:'FF'+color} });
    const numFmt = '#,##0';

    // ── 컬럼 폭 설정 ──
    // 이름(12), 합계(6), 날짜1~N(4), 상여(5), 조정(5), 합계금액(13), 국세(11), 지방세(11), 이체금액(13), 주민번호(16), 계좌번호(22)
    const colWidths = [12, 6, ...Array(days).fill(4), 5, 5, 13, 11, 11, 13, 16, 22];
    ws.columns = colWidths.map(w => ({ width: w }));

    // ── 1행: 제목 ──
    const totalCols = 2 + days + 2 + 4 + 2; // 이름+합계+날짜+상여조정+금액4개+주민번호+계좌
    const titleRow = ws.addRow([`${y}년 ${m}월 비욘더팜 근무표`]);
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold:true, size:14, color:{argb:'FF'+C.white}, name:'맑은 고딕' };
    titleCell.fill = fill(C.darkGreen);
    titleCell.alignment = { horizontal:'center', vertical:'middle' };
    titleCell.border = border();
    titleRow.height = 28;

    // ── 2행: 헤더 ──
    const headerLabels = ['이름','합계', ...Array.from({length:days},(_,i)=>i+1),
      '상여','조정','합계금액','국세','지방세','이체금액','주민등록번호','계좌번호'];
    const hRow = ws.addRow(headerLabels);
    hRow.height = 20;
    hRow.eachCell((cell, colNum) => {
      const d = colNum - 2; // 날짜 컬럼 인덱스 (1부터)
      const dow = (colNum >= 3 && colNum <= 2+days) ? new Date(y,m-1,d).getDay() : -1;
      const isHolDay = (colNum >= 3 && colNum <= 2+days) ? isHol(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`) : false;
      const isSun = dow === 0 || isHolDay;
      const isSat = dow === 6;
      const isAdj = colNum === 3+days || colNum === 4+days;

      if (isAdj) {
        cell.fill = fill(C.amber);
        cell.font = { bold:true, color:{argb:'FF'+C.white}, name:'맑은 고딕', size:10 };
      } else if (isSun) {
        cell.fill = fill(C.darkGreen);
        cell.font = { bold:true, color:{argb:'FFFF6666'}, name:'맑은 고딕', size:10 };
      } else if (isSat) {
        cell.fill = fill(C.darkGreen);
        cell.font = { bold:true, color:{argb:'FF88BBFF'}, name:'맑은 고딕', size:10 };
      } else {
        cell.fill = fill(C.darkGreen);
        cell.font = { bold:true, color:{argb:'FF'+C.white}, name:'맑은 고딕', size:10 };
      }
      cell.alignment = { horizontal:'center', vertical:'middle' };
      cell.border = border();
    });

    // ── 데이터 행 ──
    empData.forEach((emp, ri) => {
      const rowBg = ri % 2 === 0 ? C.rowOdd : C.rowEven;
      const dailyVals = Array.from({length:days},(_,i)=>{
        const d=i+1, cell=emp.daily[d];
        if(!cell) return '';
        if(emp.isSH) return (cell.sh||0)+(cell.extra||0) || '';
        return cell.hours||'';
      });
      const vals = [emp.name, emp.totalH||'',
        ...dailyVals,
        emp.adj||'', emp.adj1||'',
        emp.netPay||'', emp.netPay?emp.tax:'', emp.netPay?emp.localTax:'',
        emp.netPay?emp.transfer:'', emp.ssn, emp.bank];
      const row = ws.addRow(vals);
      row.height = 18;

      row.eachCell((cell, colNum) => {
        const d = colNum - 2;
        const dow = (colNum >= 3 && colNum <= 2+days) ? new Date(y,m-1,d).getDay() : -1;
        const isHolDay = (colNum >= 3 && colNum <= 2+days) ? isHol(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`) : false;
        const isSun = dow === 0 || isHolDay;
        const isSat = dow === 6;

        cell.border = border();
        cell.font = { name:'맑은 고딕', size:10 };

        if (colNum === 1) { // 이름
          cell.font = { ...cell.font, bold:true };
          cell.fill = fill(rowBg);
          cell.alignment = { horizontal:'left', vertical:'middle', indent:1 };
        } else if (colNum === 2) { // 합계시간
          cell.fill = fill(C.totalH);
          cell.font = { ...cell.font, bold:true, color:{argb:'FF'+C.totalFg} };
          cell.alignment = { horizontal:'center', vertical:'middle' };
          if (typeof cell.value === 'number') cell.numFmt = '#,##0.0';
        } else if (colNum >= 3 && colNum <= 2+days) { // 날짜별
          const bg = isSun ? C.holidayBg : isSat ? C.satBg : rowBg;
          cell.fill = fill(bg);
          cell.alignment = { horizontal:'center', vertical:'middle' };
          if (isSun) cell.font = { ...cell.font, color:{argb:'FFCC3333'} };
          else if (isSat) cell.font = { ...cell.font, color:{argb:'FF3366CC'} };
          if (emp.daily[d]?.manual) cell.font = { ...cell.font, color:{argb:'FFCC0000'}, bold:true };
        } else if (colNum === 3+days || colNum === 4+days) { // 상여·조정
          cell.fill = fill(C.amberBg);
          cell.font = { ...cell.font, color:{argb:'FF'+C.adjFg}, bold:true };
          cell.alignment = { horizontal:'center', vertical:'middle' };
        } else if (colNum === 5+days) { // 합계금액
          cell.fill = fill(rowBg);
          cell.font = { ...cell.font, bold:true };
          cell.alignment = { horizontal:'right', vertical:'middle' };
          if (typeof cell.value === 'number') cell.numFmt = numFmt;
        } else if (colNum === 6+days || colNum === 7+days) { // 국세·지방세
          cell.fill = fill(rowBg);
          cell.font = { ...cell.font, color:{argb:'FF888888'} };
          cell.alignment = { horizontal:'right', vertical:'middle' };
          if (typeof cell.value === 'number') cell.numFmt = numFmt;
        } else if (colNum === 8+days) { // 이체금액
          cell.fill = fill(C.transferBg);
          cell.font = { ...cell.font, bold:true, color:{argb:'FF'+C.transferFg} };
          cell.alignment = { horizontal:'right', vertical:'middle' };
          if (typeof cell.value === 'number') cell.numFmt = numFmt;
        } else { // 주민번호·계좌
          cell.fill = fill(rowBg);
          cell.font = { ...cell.font, size:9 };
          cell.alignment = { horizontal:'left', vertical:'middle' };
        }
      });
    });

    // ── 합계 행 ──
    const totalRow = ws.addRow(
      ['합계', empData.reduce((s,e)=>s+(e.totalH||0),0),
        ...Array(days).fill(''),
        '', '',
        empData.reduce((s,e)=>s+(e.netPay||0),0),
        empData.reduce((s,e)=>s+(e.tax||0),0),
        empData.reduce((s,e)=>s+(e.localTax||0),0),
        empData.reduce((s,e)=>s+(e.transfer||0),0),
        '', '']
    );
    totalRow.height = 20;
    totalRow.eachCell((cell, colNum) => {
      cell.fill = fill(C.darkGreen);
      cell.font = { bold:true, color:{argb:'FF'+C.white}, name:'맑은 고딕', size:10 };
      cell.border = border();
      cell.alignment = { horizontal: colNum===1?'left':'right', vertical:'middle', indent: colNum===1?1:0 };
      if ([2,5+days,6+days,7+days,8+days].includes(colNum) && typeof cell.value==='number') {
        cell.numFmt = colNum===2 ? '#,##0.0' : numFmt;
      }
    });

    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(`${y}년_${m}월_비욘더팜_근무표.xlsx`)}`);
    await wb.xlsx.write(res);
    res.end();
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;

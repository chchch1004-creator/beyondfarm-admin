const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireSuperAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '총괄관리자 권한 필요' });
  next();
}

// 근무표 데이터
router.get('/', requireSuperAdmin, async (req, res) => {
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

    const attendance = await db.prepare(
      `SELECT * FROM attendance WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`
    ).all(String(y), String(m).padStart(2, '0'));

    // 공식 출근 시간 설정 로드
    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const cfg = {};
    settingsRows.forEach(r => { cfg[r.key] = r.value; });
    const officeStart = cfg.office_start || '10:00';
    const fieldWeekdayStart = cfg.field_weekday_start || '13:00';
    const fieldWeekendStart = cfg.field_weekend_start || '09:30';

    const parseMin = t => { const [h,m] = (t||'00:00').split(':').map(Number); return h*60+m; };
    function calcOfficialHours(checkIn, checkOut, employeeType, date) {
      if (!checkIn || !checkOut) return 0;
      const dow = new Date(date).getDay(); // 0=일, 6=토
      const isWeekend = dow === 0 || dow === 6;
      const isField = ['주말고정','주말'].includes(employeeType);
      const officialStartStr = isField ? (isWeekend ? fieldWeekendStart : fieldWeekdayStart) : officeStart;
      const officialStart = parseMin(officialStartStr);
      const actualStart = parseMin(checkIn);
      const end = parseMin(checkOut);
      const effectiveStart = Math.max(actualStart, officialStart);
      const totalMins = end - effectiveStart;
      if (totalMins <= 0) return 0;
      return Math.round(totalMins / 30) * 0.5;
    }

    const manualHours = await db.prepare(
      `SELECT * FROM timesheet_manual_hours WHERE year = ? AND month = ?`
    ).all(y, m);

    const adjustments = await db.prepare(
      `SELECT * FROM timesheet_adjustments WHERE year = ? AND month = ?`
    ).all(y, m);

    const note = await db.prepare(
      `SELECT content FROM timesheet_notes WHERE year = ? AND month = ?`
    ).get(y, m);

    const data = employees.map(emp => {
      // 출근 기록에서 시간 계산
      const attDaily = {};
      attendance.filter(a => a.user_id === emp.id).forEach(att => {
        if (att.check_in && att.check_out) {
          const day = parseInt(att.date.split('-')[2]);
          const hours = calcOfficialHours(att.check_in, att.check_out, emp.employee_type, att.date);
          if (hours > 0) attDaily[day] = hours;
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

module.exports = router;

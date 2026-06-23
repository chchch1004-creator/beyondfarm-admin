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
      `SELECT id, name, employee_type, ssn, bank_name, bank_account, hourly_rate
       FROM users WHERE status = 'active' ORDER BY
       CASE employee_type WHEN '소장' THEN 1 WHEN '주말고정' THEN 2 WHEN '주말' THEN 3 WHEN '주주' THEN 4 ELSE 0 END, name`
    ).all();

    const attendance = await db.prepare(
      `SELECT * FROM attendance WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`
    ).all(String(y), String(m).padStart(2, '0'));

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
          const [ih, im] = att.check_in.split(':').map(Number);
          const [oh, om] = att.check_out.split(':').map(Number);
          const hours = ((oh * 60 + om) - (ih * 60 + im)) / 60;
          attDaily[day] = Math.round(hours * 2) / 2;
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

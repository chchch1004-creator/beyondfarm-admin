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
       CASE employee_type WHEN '평일' THEN 1 WHEN '소장' THEN 2 WHEN '주말고정' THEN 3 WHEN '주말' THEN 4 WHEN '주주' THEN 5 ELSE 6 END, name`
    ).all();

    const attendance = await db.prepare(
      `SELECT * FROM attendance WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`
    ).all(String(y), String(m).padStart(2, '0'));

    const salaries = await db.prepare(
      `SELECT * FROM salaries WHERE year = ? AND month = ?`
    ).all(y, m);

    const note = await db.prepare(
      `SELECT content FROM timesheet_notes WHERE year = ? AND month = ?`
    ).get(y, m);

    const data = employees.map(emp => {
      const empAtt = attendance.filter(a => a.user_id === emp.id);
      const empSal = salaries.find(s => s.user_id === emp.id);

      const daily = {};
      for (const att of empAtt) {
        if (att.check_in && att.check_out) {
          const day = parseInt(att.date.split('-')[2]);
          const [ih, im] = att.check_in.split(':').map(Number);
          const [oh, om] = att.check_out.split(':').map(Number);
          const hours = ((oh * 60 + om) - (ih * 60 + im)) / 60;
          daily[day] = Math.round(hours * 2) / 2;
        }
      }

      const totalHours = Object.values(daily).reduce((s, h) => s + h, 0);

      return {
        id: emp.id,
        name: emp.name,
        employee_type: emp.employee_type || '평일',
        ssn: emp.ssn || '',
        bank_name: emp.bank_name || '',
        bank_account: emp.bank_account || '',
        hourly_rate: emp.hourly_rate || 0,
        daily,
        total_hours: totalHours,
        net_pay: empSal?.net_pay || 0,
        base_salary: empSal?.base_salary || 0,
        deduction: empSal?.deduction || 0,
      };
    });

    res.json({ year: y, month: m, days, employees: data, note: note?.content || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 월별 메모 저장
router.post('/notes', requireSuperAdmin, async (req, res) => {
  try {
    const { year, month, content } = req.body;
    await db.prepare(
      `INSERT INTO timesheet_notes (year, month, content) VALUES (?, ?, ?)
       ON CONFLICT(year, month) DO UPDATE SET content=excluded.content`
    ).run(year, month, content);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

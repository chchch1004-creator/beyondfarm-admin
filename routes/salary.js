const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireLogin(req, res, next) { if (!req.session.user) return res.status(401).json({ error: '로그인 필요' }); next(); }
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const { year, month, user_id, department } = req.query;
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    let query = `SELECT s.*, u.name, u.department, u.position FROM salaries s JOIN users u ON s.user_id = u.id WHERE 1=1`;
    const params = [];
    if (!isAdmin) { query += ' AND s.user_id = ?'; params.push(req.session.user.id); }
    else if (user_id) { query += ' AND s.user_id = ?'; params.push(parseInt(user_id)); }
    if (year) { query += ' AND s.year = ?'; params.push(parseInt(year)); }
    if (month) { query += ' AND s.month = ?'; params.push(parseInt(month)); }
    if (department) { query += ' AND u.department = ?'; params.push(department); }
    query += ' ORDER BY s.year DESC, s.month DESC, u.name';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { user_id, year, month, base_salary, bonus, deduction, note } = req.body;
    const net = (base_salary||0) + (bonus||0) - (deduction||0);
    const result = await db.prepare('INSERT INTO salaries (user_id, year, month, base_salary, overtime_pay, bonus, deduction, net_pay, note) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)')
      .run(user_id, year, month, base_salary||0, bonus||0, deduction||0, net, note);
    res.json({ id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { base_salary, bonus, deduction, note } = req.body;
    const net = (base_salary||0) + (bonus||0) - (deduction||0);
    await db.prepare('UPDATE salaries SET base_salary=?, overtime_pay=0, bonus=?, deduction=?, net_pay=?, note=? WHERE id=?')
      .run(base_salary||0, bonus||0, deduction||0, net, note, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try { await db.prepare('DELETE FROM salaries WHERE id = ?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// 근무표에서 급여 자동 연동
router.post('/sync-from-timesheet', requireAdmin, async (req, res) => {
  try {
    const { year, month } = req.body;
    const employees = await db.prepare('SELECT id, employee_type, hourly_rate FROM users WHERE status = ?').all('active');
    const attendance = await db.prepare(`SELECT * FROM attendance WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`).all(String(year), String(month).padStart(2,'0'));
    const manualHours = await db.prepare('SELECT * FROM timesheet_manual_hours WHERE year = ? AND month = ?').all(year, month);
    const adjustments = await db.prepare('SELECT * FROM timesheet_adjustments WHERE year = ? AND month = ?').all(year, month);

    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const cfg = {};
    settingsRows.forEach(r => { cfg[r.key] = r.value; });
    const officeStart = cfg.office_start || '10:00';
    const fieldWeekdayStart = cfg.field_weekday_start || '13:00';
    const fieldWeekendStart = cfg.field_weekend_start || '09:30';

    const parseMin = t => { const [h,m] = (t||'00:00').split(':').map(Number); return h*60+m; };
    function calcH(ci, co, empType, date) {
      if (!ci || !co) return 0;
      const dow = new Date(date).getDay();
      const isWknd = dow === 0 || dow === 6;
      const isField = ['주말고정','주말'].includes(empType);
      const oStart = parseMin(isField ? (isWknd ? fieldWeekendStart : fieldWeekdayStart) : officeStart);
      const effectiveStart = Math.max(parseMin(ci), oStart);
      const mins = parseMin(co) - effectiveStart;
      return mins <= 0 ? 0 : Math.round(mins / 30) * 0.5;
    }

    let synced = 0;
    for (const emp of employees) {
      const adjRow = adjustments.find(a => a.user_id === emp.id);
      const manH = {};
      manualHours.filter(h => h.user_id === emp.id).forEach(h => { manH[h.day] = h.hours; });

      let totalHours = Object.values(manH).reduce((s,h) => s+h, 0);
      attendance.filter(a => a.user_id === emp.id).forEach(att => {
        const day = parseInt(att.date.split('-')[2]);
        if (manH[day] === undefined) totalHours += calcH(att.check_in, att.check_out, emp.employee_type, att.date);
      });

      const adj = adjRow?.adj || 0;   // 상여
      const adj1 = adjRow?.adj1 || 0; // 조정

      const netPay = Math.round(totalHours * (emp.hourly_rate || 0) + adj * 10000 + adj1 * 10000);
      const bonus = Math.round(adj * 10000);
      const tax = Math.round(netPay * 0.03);
      const localTax = Math.round(netPay * 0.003);
      const deduction = tax + localTax;
      const salaryNetPay = netPay + bonus - deduction;

      if (netPay === 0 && bonus === 0) continue;

      const existing = await db.prepare('SELECT id FROM salaries WHERE user_id = ? AND year = ? AND month = ?').get(emp.id, year, month);
      if (existing) {
        await db.prepare('UPDATE salaries SET base_salary=?, overtime_pay=0, bonus=?, deduction=?, net_pay=?, note=? WHERE id=?')
          .run(netPay, bonus, deduction, salaryNetPay, '근무표 자동 연동', existing.id);
      } else {
        await db.prepare('INSERT INTO salaries (user_id, year, month, base_salary, overtime_pay, bonus, deduction, net_pay, note) VALUES (?,?,?,?,0,?,?,?,?)')
          .run(emp.id, year, month, netPay, bonus, deduction, salaryNetPay, '근무표 자동 연동');
      }
      synced++;
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

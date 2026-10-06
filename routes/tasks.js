const express = require('express');
const router = express.Router();
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

function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getUTCDay() + 6) % 7) / 7);
}

function nowKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getPeriodKey(freq, date) {
  const d = date ? new Date(date.getTime()) : nowKST();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const mStr = String(m).padStart(2, '0');
  const ddStr = String(dd).padStart(2, '0');

  switch (freq) {
    case 'daily':
      return `${y}-${mStr}-${ddStr}`;
    case 'weekly': {
      const w = getISOWeek(d);
      return `${y}-W${String(w).padStart(2, '0')}`;
    }
    case 'biweekly': {
      const w = getISOWeek(d);
      return `${y}-B${Math.ceil(w / 2)}`;
    }
    case 'monthly':
      return `${y}-${mStr}`;
    case 'quarterly':
      return `${y}-Q${Math.ceil(m / 3)}`;
    case 'semiannual':
      return `${y}-H${m <= 6 ? 1 : 2}`;
    default:
      return `${y}-${mStr}-${ddStr}`;
  }
}

// task가 오늘 해당하는지 판단
function isDueToday(task, kst) {
  const dow = kst.getUTCDay(); // 0=일,1=월...6=토
  const dom = kst.getUTCDate();
  const m   = kst.getUTCMonth() + 1;

  switch (task.frequency) {
    case 'daily':
      return true;
    case 'weekly':
    case 'biweekly': {
      if (!task.day_of_week) return true;
      return task.day_of_week.split(',').map(Number).includes(dow);
    }
    case 'monthly': {
      if (!task.day_of_month) return true;
      // 해당 월 day_of_month 이후면 (미완료면) 계속 표시
      return dom >= task.day_of_month;
    }
    case 'quarterly': {
      const qStart = [1, 1, 1, 4, 4, 4, 7, 7, 7, 10, 10, 10][m - 1];
      const dueTs = Date.UTC(kst.getUTCFullYear(), qStart - 1, task.day_of_month || 1);
      return kst.getTime() >= dueTs;
    }
    case 'semiannual': {
      const hStart = m <= 6 ? 1 : 7;
      const dueTs = Date.UTC(kst.getUTCFullYear(), hStart - 1, task.day_of_month || 1);
      return kst.getTime() >= dueTs;
    }
    default:
      return true;
  }
}

// 오늘의 업무 목록 (완료 여부 포함)
router.get('/today', requireLogin, async (req, res) => {
  const db = getDb();
  const tasks = await db.prepare('SELECT * FROM task_templates WHERE active=1 ORDER BY sort_order, id').all();
  const kst = nowKST();
  const result = [];

  for (const task of tasks) {
    const periodKey = getPeriodKey(task.frequency, kst);
    const completion = await db.prepare(
      'SELECT * FROM task_completions WHERE task_id=? AND period_key=?'
    ).get(task.id, periodKey);

    result.push({
      ...task,
      period_key: periodKey,
      completed: !!completion,
      completed_at: completion?.completed_at || null,
      completed_by: completion?.completed_by || null,
      is_due_today: isDueToday(task, kst),
    });
  }

  res.json(result);
});

// 전체 템플릿 목록
router.get('/', requireLogin, async (req, res) => {
  const db = getDb();
  const tasks = await db.prepare('SELECT * FROM task_templates ORDER BY sort_order, id').all();
  res.json(tasks);
});

// 완료 처리
router.post('/:id/complete', requireLogin, async (req, res) => {
  const db = getDb();
  const task = await db.prepare('SELECT * FROM task_templates WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '없음' });
  const periodKey = getPeriodKey(task.frequency, nowKST());
  await db.prepare(`
    INSERT OR REPLACE INTO task_completions (task_id, period_key, completed_by, completed_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
  `).run(task.id, periodKey, req.session.user.name);
  res.json({ ok: true });
});

// 완료 취소
router.delete('/:id/complete', requireLogin, async (req, res) => {
  const db = getDb();
  const task = await db.prepare('SELECT * FROM task_templates WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '없음' });
  const periodKey = getPeriodKey(task.frequency, nowKST());
  await db.prepare('DELETE FROM task_completions WHERE task_id=? AND period_key=?')
    .run(task.id, periodKey);
  res.json({ ok: true });
});

// 템플릿 생성
router.post('/', requireAdmin, async (req, res) => {
  const { title, category, frequency, day_of_week, day_of_month, sort_order = 0 } = req.body;
  if (!title || !frequency) return res.status(400).json({ error: '필수값 누락' });
  const db = getDb();
  const r = await db.prepare(`
    INSERT INTO task_templates (title, category, frequency, day_of_week, day_of_month, sort_order)
    VALUES (?,?,?,?,?,?)
  `).run(title, category || null, frequency, day_of_week || null, day_of_month || null, sort_order);
  res.json({ id: r.lastInsertRowid });
});

// 템플릿 수정
router.put('/:id', requireAdmin, async (req, res) => {
  const { title, category, frequency, day_of_week, day_of_month, active, sort_order } = req.body;
  const db = getDb();
  const fields = [], args = [];
  if (title !== undefined)       { fields.push('title=?');       args.push(title); }
  if (category !== undefined)    { fields.push('category=?');    args.push(category); }
  if (frequency !== undefined)   { fields.push('frequency=?');   args.push(frequency); }
  if (day_of_week !== undefined) { fields.push('day_of_week=?'); args.push(day_of_week); }
  if (day_of_month !== undefined){ fields.push('day_of_month=?');args.push(day_of_month); }
  if (active !== undefined)      { fields.push('active=?');      args.push(active); }
  if (sort_order !== undefined)  { fields.push('sort_order=?');  args.push(sort_order); }
  if (!fields.length) return res.json({ ok: true });
  args.push(req.params.id);
  await db.prepare(`UPDATE task_templates SET ${fields.join(',')} WHERE id=?`).run(...args);
  res.json({ ok: true });
});

// 템플릿 삭제
router.delete('/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  await db.prepare('DELETE FROM task_templates WHERE id=?').run(req.params.id);
  await db.prepare('DELETE FROM task_completions WHERE task_id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

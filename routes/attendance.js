const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireLogin(req, res, next) { if (!req.session.user) return res.status(401).json({ error: '로그인 필요' }); next(); }

function kstDate() {
  return new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '-').replace('.', '');
}
function kstTime() {
  return new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const { year, month, user_id } = req.query;
    const isAdmin = ['admin','superadmin'].includes(req.session.user.role);
    let query = `SELECT a.*, u.name FROM attendance a JOIN users u ON a.user_id = u.id WHERE 1=1`;
    const params = [];
    if (!isAdmin) { query += ' AND a.user_id = ?'; params.push(req.session.user.id); }
    else if (user_id) { query += ' AND a.user_id = ?'; params.push(parseInt(user_id)); }
    if (year && month) { query += ` AND strftime('%Y', a.date) = ? AND strftime('%m', a.date) = ?`; params.push(String(year), String(month).padStart(2,'0')); }
    query += ' ORDER BY a.date DESC, a.created_at DESC';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function checkLocation(req) {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const cfg = {};
  rows.forEach(r => { cfg[r.key] = r.value; });
  const hasLoc1 = cfg.work_lat && cfg.work_lon;
  const hasLoc2 = cfg.work_lat2 && cfg.work_lon2;
  if (!hasLoc1 && !hasLoc2) return { ok: true };
  const { lat, lon } = req.body;
  if (lat == null || lon == null) return { ok: false, error: '위치 정보가 없습니다. 브라우저 위치 권한을 허용해주세요.' };
  const uLat = parseFloat(lat), uLon = parseFloat(lon);
  if (hasLoc1 && calcDistance(uLat, uLon, parseFloat(cfg.work_lat), parseFloat(cfg.work_lon)) <= (parseFloat(cfg.work_radius)||300)) return { ok: true };
  if (hasLoc2 && calcDistance(uLat, uLon, parseFloat(cfg.work_lat2), parseFloat(cfg.work_lon2)) <= (parseFloat(cfg.work_radius2)||300)) return { ok: true };
  const names = [hasLoc1 && (cfg.work_name||'사무실'), hasLoc2 && (cfg.work_name2||'현장')].filter(Boolean).join(' 또는 ');
  return { ok: false, error: `근무지(${names}) 반경 안에 있지 않습니다.` };
}

router.post('/check-in', requireLogin, async (req, res) => {
  try {
    const loc = await checkLocation(req);
    if (!loc.ok) return res.status(400).json({ error: loc.error });
    const today = kstDate();
    const now = kstTime();
    const userId = req.session.user.id;
    const existing = await db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
    if (existing?.check_in) return res.status(400).json({ error: '이미 출근 처리되었습니다.' });
    if (existing) await db.prepare('UPDATE attendance SET check_in = ? WHERE id = ?').run(now, existing.id);
    else await db.prepare('INSERT INTO attendance (user_id, date, check_in) VALUES (?, ?, ?)').run(userId, today, now);
    res.json({ ok: true, time: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/check-out', requireLogin, async (req, res) => {
  try {
    const loc = await checkLocation(req);
    if (!loc.ok) return res.status(400).json({ error: loc.error });
    const today = kstDate();
    const now = kstTime();
    const userId = req.session.user.id;
    const existing = await db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
    if (!existing?.check_in) return res.status(400).json({ error: '출근 기록이 없습니다.' });
    if (existing.check_out) return res.status(400).json({ error: '이미 퇴근 처리되었습니다.' });
    await db.prepare('UPDATE attendance SET check_out = ? WHERE id = ?').run(now, existing.id);
    res.json({ ok: true, time: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireLogin, async (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '권한 없음' });
  try {
    const { user_id, date, check_in, check_out, type, note } = req.body;
    await db.prepare('INSERT INTO attendance (user_id, date, check_in, check_out, type, note) VALUES (?, ?, ?, ?, ?, ?)').run(user_id, date, check_in, check_out, type||'normal', note);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireLogin, async (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '권한 없음' });
  try {
    const { check_in, check_out, type, note } = req.body;
    await db.prepare('UPDATE attendance SET check_in=?, check_out=?, type=?, note=? WHERE id=?').run(check_in, check_out, type, note, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireLogin, async (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '권한 없음' });
  try { await db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/change-requests', requireLogin, async (req, res) => {
  try {
    let query = `SELECT r.*, u.name as user_name, rv.name as reviewer_name FROM attendance_change_requests r JOIN users u ON r.user_id = u.id LEFT JOIN users rv ON r.reviewed_by = rv.id WHERE 1=1`;
    const params = [];
    if (req.session.user.role !== 'superadmin') { query += ' AND r.user_id = ?'; params.push(req.session.user.id); }
    if (req.query.status) { query += ' AND r.status = ?'; params.push(req.query.status); }
    query += ' ORDER BY r.created_at DESC';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/change-requests', requireLogin, async (req, res) => {
  try {
    const { attendance_id, date, requested_check_in, requested_check_out, requested_type, reason } = req.body;
    if (!date) return res.status(400).json({ error: '날짜를 입력하세요' });
    const result = await db.prepare('INSERT INTO attendance_change_requests (attendance_id, user_id, date, requested_check_in, requested_check_out, requested_type, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(attendance_id||null, req.session.user.id, date, requested_check_in, requested_check_out, requested_type||'normal', reason);
    res.json({ id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/change-requests/:id', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '총괄관리자 권한 필요' });
  try {
    const { status } = req.body;
    const cr = await db.prepare('SELECT * FROM attendance_change_requests WHERE id = ?').get(req.params.id);
    if (!cr) return res.status(404).json({ error: '요청을 찾을 수 없습니다' });
    if (status === 'approved') {
      if (cr.attendance_id) await db.prepare('UPDATE attendance SET check_in=?, check_out=?, type=? WHERE id=?').run(cr.requested_check_in, cr.requested_check_out, cr.requested_type, cr.attendance_id);
      else await db.prepare('INSERT INTO attendance (user_id, date, check_in, check_out, type) VALUES (?, ?, ?, ?, ?)').run(cr.user_id, cr.date, cr.requested_check_in, cr.requested_check_out, cr.requested_type);
    }
    await db.prepare(`UPDATE attendance_change_requests SET status=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`).run(status, req.session.user.id, cr.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

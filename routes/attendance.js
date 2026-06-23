const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a) };
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// 출퇴근 기록 조회
router.get('/', requireLogin, (req, res) => {
  const { year, month, user_id } = req.query;
  let targetId = req.session.user.id;
  if (req.session.user.role === 'admin' && user_id) targetId = parseInt(user_id);

  let query = `
    SELECT a.*, u.name FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (req.session.user.role !== 'admin') {
    query += ' AND a.user_id = ?';
    params.push(targetId);
  } else if (user_id) {
    query += ' AND a.user_id = ?';
    params.push(targetId);
  }

  if (year && month) {
    query += ` AND strftime('%Y', a.date) = ? AND strftime('%m', a.date) = ?`;
    params.push(String(year), String(month).padStart(2, '0'));
  }

  query += ' ORDER BY a.date DESC, a.created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// GPS 거리 계산 (미터 단위)
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function checkLocation(req) {
  const settings = db.prepare('SELECT key, value FROM settings').all();
  const cfg = {};
  settings.forEach(r => { cfg[r.key] = r.value; });

  const hasLoc1 = cfg.work_lat && cfg.work_lon;
  const hasLoc2 = cfg.work_lat2 && cfg.work_lon2;

  // 위치 미설정 시 통과
  if (!hasLoc1 && !hasLoc2) return { ok: true };

  const { lat, lon } = req.body;
  if (lat == null || lon == null) return { ok: false, error: '위치 정보가 없습니다. 브라우저 위치 권한을 허용해주세요.' };

  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);

  // 위치1 체크
  if (hasLoc1) {
    const r1 = parseFloat(cfg.work_radius) || 300;
    const d1 = calcDistance(userLat, userLon, parseFloat(cfg.work_lat), parseFloat(cfg.work_lon));
    if (d1 <= r1) return { ok: true, location: cfg.work_name || '사무실' };
  }

  // 위치2 체크
  if (hasLoc2) {
    const r2 = parseFloat(cfg.work_radius2) || 300;
    const d2 = calcDistance(userLat, userLon, parseFloat(cfg.work_lat2), parseFloat(cfg.work_lon2));
    if (d2 <= r2) return { ok: true, location: cfg.work_name2 || '현장' };
  }

  const names = [cfg.work_name || '사무실', cfg.work_name2 || '현장'].filter((_, i) => i === 0 ? hasLoc1 : hasLoc2).join(' 또는 ');
  return { ok: false, error: `근무지(${names}) 반경 안에 있지 않습니다.` };
}

// 출근 기록
router.post('/check-in', requireLogin, (req, res) => {
  const locCheck = checkLocation(req);
  if (!locCheck.ok) return res.status(400).json({ error: locCheck.error });

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toTimeString().slice(0, 5);
  const userId = req.session.user.id;

  const existing = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
  if (existing && existing.check_in) {
    return res.status(400).json({ error: '이미 출근 처리되었습니다.' });
  }

  if (existing) {
    db.prepare('UPDATE attendance SET check_in = ? WHERE id = ?').run(now, existing.id);
  } else {
    db.prepare('INSERT INTO attendance (user_id, date, check_in) VALUES (?, ?, ?)').run(userId, today, now);
  }
  res.json({ ok: true, time: now });
});

// 퇴근 기록
router.post('/check-out', requireLogin, (req, res) => {
  const locCheck = checkLocation(req);
  if (!locCheck.ok) return res.status(400).json({ error: locCheck.error });

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toTimeString().slice(0, 5);
  const userId = req.session.user.id;

  const existing = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
  if (!existing || !existing.check_in) {
    return res.status(400).json({ error: '출근 기록이 없습니다.' });
  }
  if (existing.check_out) {
    return res.status(400).json({ error: '이미 퇴근 처리되었습니다.' });
  }

  db.prepare('UPDATE attendance SET check_out = ? WHERE id = ?').run(now, existing.id);
  res.json({ ok: true, time: now });
});

// 관리자: 출퇴근 기록 직접 입력/수정
router.post('/', requireLogin, (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '권한 없음' });
  const { user_id, date, check_in, check_out, type, note } = req.body;
  db.prepare(`INSERT INTO attendance (user_id, date, check_in, check_out, type, note) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(user_id, date, check_in, check_out, type || 'normal', note);
  res.json({ ok: true });
});

router.put('/:id', requireLogin, (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '권한 없음' });
  const { check_in, check_out, type, note } = req.body;
  db.prepare('UPDATE attendance SET check_in=?, check_out=?, type=?, note=? WHERE id=?')
    .run(check_in, check_out, type, note, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireLogin, (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '권한 없음' });
  db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── 수정 요청 ──────────────────────────────────────────
// 수정 요청 목록 (superadmin: 전체, 나머지: 본인)
router.get('/change-requests', requireLogin, (req, res) => {
  const role = req.session.user.role;
  let query = `
    SELECT r.*, u.name as user_name, rv.name as reviewer_name
    FROM attendance_change_requests r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN users rv ON r.reviewed_by = rv.id
    WHERE 1=1
  `;
  const params = [];
  if (!['superadmin'].includes(role)) {
    query += ' AND r.user_id = ?';
    params.push(req.session.user.id);
  }
  if (req.query.status) { query += ' AND r.status = ?'; params.push(req.query.status); }
  query += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// 수정 요청 제출 (직원/관리자)
router.post('/change-requests', requireLogin, (req, res) => {
  const { attendance_id, date, requested_check_in, requested_check_out, requested_type, reason } = req.body;
  if (!date) return res.status(400).json({ error: '날짜를 입력하세요' });
  const result = db.prepare(`
    INSERT INTO attendance_change_requests (attendance_id, user_id, date, requested_check_in, requested_check_out, requested_type, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(attendance_id || null, req.session.user.id, date, requested_check_in, requested_check_out, requested_type || 'normal', reason);
  res.json({ id: result.lastInsertRowid });
});

// 수정 요청 승인/반려 (superadmin만)
router.put('/change-requests/:id', requireLogin, (req, res) => {
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '총괄관리자 권한 필요' });
  const { status } = req.body;
  const cr = db.prepare('SELECT * FROM attendance_change_requests WHERE id = ?').get(req.params.id);
  if (!cr) return res.status(404).json({ error: '요청을 찾을 수 없습니다' });

  if (status === 'approved') {
    if (cr.attendance_id) {
      db.prepare('UPDATE attendance SET check_in=?, check_out=?, type=? WHERE id=?')
        .run(cr.requested_check_in, cr.requested_check_out, cr.requested_type, cr.attendance_id);
    } else {
      db.prepare('INSERT INTO attendance (user_id, date, check_in, check_out, type) VALUES (?, ?, ?, ?, ?)')
        .run(cr.user_id, cr.date, cr.requested_check_in, cr.requested_check_out, cr.requested_type);
    }
  }

  db.prepare(`UPDATE attendance_change_requests SET status=?, reviewed_by=?, reviewed_at=datetime('now','localtime') WHERE id=?`)
    .run(status, req.session.user.id, cr.id);
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a) };
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

// 설정 조회 (전체)
router.get('/', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  rows.forEach(r => { result[r.key] = r.value; });
  res.json(result);
});

// 설정 저장 (관리자)
router.post('/', requireAdmin, (req, res) => {
  const entries = Object.entries(req.body);
  for (const [key, value] of entries) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, String(value));
  }
  res.json({ ok: true });
});

// 서버 로컬 IP 조회
router.get('/server-ip', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  res.json({ ips });
});

module.exports = router;

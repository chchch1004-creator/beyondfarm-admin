const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a) };
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (!['admin','superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}

// 재고 목록
router.get('/', requireLogin, (req, res) => {
  const rows = db.prepare('SELECT * FROM inventory ORDER BY category, name').all();
  res.json(rows);
});

// 재고 등록 (관리자)
router.post('/', requireAdmin, (req, res) => {
  const { name, category, quantity, unit, min_quantity, location, note } = req.body;
  const result = db.prepare(`
    INSERT INTO inventory (name, category, quantity, unit, min_quantity, location, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, quantity || 0, unit || '개', min_quantity || 0, location, note);
  res.json({ id: result.lastInsertRowid });
});

// 재고 수정 (관리자)
router.put('/:id', requireAdmin, (req, res) => {
  const { name, category, quantity, unit, min_quantity, location, note } = req.body;
  db.prepare(`
    UPDATE inventory SET name=?, category=?, quantity=?, unit=?, min_quantity=?, location=?, note=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(name, category, quantity, unit, min_quantity, location, note, req.params.id);
  res.json({ ok: true });
});

// 재고 입출고 기록
router.post('/:id/log', requireLogin, (req, res) => {
  const { type, quantity, reason } = req.body;
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: '항목 없음' });

  const delta = type === 'in' ? quantity : -quantity;
  const newQty = item.quantity + delta;
  if (newQty < 0) return res.status(400).json({ error: '재고가 부족합니다.' });

  db.prepare(`UPDATE inventory SET quantity=?, updated_at=datetime('now','localtime') WHERE id=?`).run(newQty, item.id);
  db.prepare(`INSERT INTO inventory_logs (inventory_id, type, quantity, reason, created_by) VALUES (?, ?, ?, ?, ?)`)
    .run(item.id, type, quantity, reason, req.session.user.id);
  res.json({ ok: true, quantity: newQty });
});

// 입출고 로그
router.get('/:id/logs', requireLogin, (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, u.name as creator_name FROM inventory_logs l
    LEFT JOIN users u ON l.created_by = u.id
    WHERE l.inventory_id = ? ORDER BY l.created_at DESC LIMIT 50
  `).all(req.params.id);
  res.json(rows);
});

// 재고 삭제 (관리자)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

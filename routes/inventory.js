const express = require('express');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a) };
const router = express.Router();

function requireLogin(req, res, next) { if (!req.session.user) return res.status(401).json({ error: '로그인 필요' }); next(); }
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '총괄관리자 권한 필요' });
  next();
}

router.get('/', requireLogin, async (req, res) => {
  try { res.json(await db.prepare('SELECT * FROM inventory ORDER BY category, name').all()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, category, quantity, unit, min_quantity, location, note } = req.body;
    const result = await db.prepare('INSERT INTO inventory (name, category, quantity, unit, min_quantity, location, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, category, quantity||0, unit||'개', min_quantity||0, location, note);
    res.json({ id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, category, quantity, unit, min_quantity, location, note } = req.body;
    await db.prepare(`UPDATE inventory SET name=?, category=?, quantity=?, unit=?, min_quantity=?, location=?, note=?, updated_at=datetime('now') WHERE id=?`)
      .run(name, category, quantity, unit, min_quantity, location, note, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/log', requireLogin, async (req, res) => {
  try {
    const { type, quantity, reason } = req.body;
    const item = await db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: '항목 없음' });
    const newQty = item.quantity + (type === 'in' ? quantity : -quantity);
    if (newQty < 0) return res.status(400).json({ error: '재고가 부족합니다.' });
    await db.prepare(`UPDATE inventory SET quantity=?, updated_at=datetime('now') WHERE id=?`).run(newQty, item.id);
    await db.prepare('INSERT INTO inventory_logs (inventory_id, type, quantity, reason, created_by) VALUES (?, ?, ?, ?, ?)').run(item.id, type, quantity, reason, req.session.user.id);
    res.json({ ok: true, quantity: newQty });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/logs', requireLogin, async (req, res) => {
  try {
    res.json(await db.prepare(`SELECT l.*, u.name as creator_name FROM inventory_logs l LEFT JOIN users u ON l.created_by = u.id WHERE l.inventory_id = ? ORDER BY l.created_at DESC LIMIT 50`).all(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try { await db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

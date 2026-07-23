const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// GET /api/user-settings/:key
router.get('/:key', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const row = await db.prepare('SELECT value FROM user_settings WHERE user_id=? AND key=?')
      .get(req.session.user.id, req.params.key);
    res.json({ value: row ? JSON.parse(row.value) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/user-settings/:key
router.put('/:key', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const value = JSON.stringify(req.body.value);
    await db.prepare(`
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run(req.session.user.id, req.params.key, value);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

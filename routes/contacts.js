const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function auth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '로그인 필요' });
  next();
}
function db() { return getDb(); }

// ── 그룹 ──────────────────────────────────────────────────────────────

router.get('/groups', auth, async (req, res) => {
  try {
    const groups = await db().prepare(
      `SELECT g.*, COUNT(c.id) as contact_count
       FROM contact_groups g
       LEFT JOIN contacts c ON c.group_id = g.id
       GROUP BY g.id ORDER BY g.name`
    ).all();
    res.json(groups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/groups', auth, async (req, res) => {
  try {
    const { name, category, memo } = req.body;
    if (!name) return res.status(400).json({ error: '그룹명 필수' });
    const r = await db().prepare(
      `INSERT INTO contact_groups (name, category, memo) VALUES (?,?,?)`
    ).run(name, category || null, memo || null);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/groups/:id', auth, async (req, res) => {
  try {
    const { name, category, memo } = req.body;
    await db().prepare(
      `UPDATE contact_groups SET name=?, category=?, memo=? WHERE id=?`
    ).run(name, category || null, memo || null, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/groups/:id', auth, async (req, res) => {
  try {
    await db().prepare(`DELETE FROM contact_groups WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 커스텀 필드 정의 ──────────────────────────────────────────────────

router.get('/groups/:groupId/fields', auth, async (req, res) => {
  try {
    const rows = await db().prepare(
      `SELECT * FROM contact_fields WHERE group_id=? ORDER BY sort_order, id`
    ).all(req.params.groupId);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/groups/:groupId/fields', auth, async (req, res) => {
  try {
    const { label, field_type, sort_order } = req.body;
    if (!label) return res.status(400).json({ error: '필드명 필수' });
    const r = await db().prepare(
      `INSERT INTO contact_fields (group_id, label, field_type, sort_order) VALUES (?,?,?,?)`
    ).run(req.params.groupId, label, field_type || 'text', sort_order || 0);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/fields/:id', auth, async (req, res) => {
  try {
    const { label, field_type, sort_order } = req.body;
    await db().prepare(
      `UPDATE contact_fields SET label=?, field_type=?, sort_order=? WHERE id=?`
    ).run(label, field_type || 'text', sort_order || 0, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/fields/:id', auth, async (req, res) => {
  try {
    await db().prepare(`DELETE FROM contact_fields WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 연락처 ────────────────────────────────────────────────────────────

router.get('/groups/:groupId/contacts', auth, async (req, res) => {
  try {
    const rows = await db().prepare(
      `SELECT * FROM contacts WHERE group_id=? ORDER BY name`
    ).all(req.params.groupId);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/groups/:groupId/contacts', auth, async (req, res) => {
  try {
    const { name, email, phone, address, memo, custom_values } = req.body;
    if (!name) return res.status(400).json({ error: '이름 필수' });
    const cv = typeof custom_values === 'object' ? JSON.stringify(custom_values) : (custom_values || '{}');
    const r = await db().prepare(
      `INSERT INTO contacts (group_id, name, email, phone, address, memo, custom_values)
       VALUES (?,?,?,?,?,?,?)`
    ).run(req.params.groupId, name, email||null, phone||null, address||null, memo||null, cv);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 엑셀 bulk insert
router.post('/groups/:groupId/contacts/bulk', auth, async (req, res) => {
  try {
    const { rows } = req.body; // [{name, email, phone, address, memo, custom_values}]
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: '데이터 없음' });
    let count = 0;
    for (const r of rows) {
      if (!r.name) continue;
      const cv = typeof r.custom_values === 'object' ? JSON.stringify(r.custom_values) : '{}';
      await db().prepare(
        `INSERT INTO contacts (group_id, name, email, phone, address, memo, custom_values)
         VALUES (?,?,?,?,?,?,?)`
      ).run(req.params.groupId, r.name, r.email||null, r.phone||null, r.address||null, r.memo||null, cv);
      count++;
    }
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/contacts/:id', auth, async (req, res) => {
  try {
    const { name, email, phone, address, memo, custom_values } = req.body;
    const cv = typeof custom_values === 'object' ? JSON.stringify(custom_values) : (custom_values || '{}');
    await db().prepare(
      `UPDATE contacts SET name=?,email=?,phone=?,address=?,memo=?,custom_values=?,
       updated_at=datetime('now','localtime') WHERE id=?`
    ).run(name, email||null, phone||null, address||null, memo||null, cv, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/contacts/:id', auth, async (req, res) => {
  try {
    await db().prepare(`DELETE FROM contacts WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 검색 ──────────────────────────────────────────────────────────────
router.get('/search', auth, async (req, res) => {
  try {
    const q = `%${req.query.q || ''}%`;
    const rows = await db().prepare(
      `SELECT c.*, g.name as group_name FROM contacts c
       JOIN contact_groups g ON g.id = c.group_id
       WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?
       ORDER BY g.name, c.name LIMIT 100`
    ).all(q, q, q);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

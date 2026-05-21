const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/audit/:entityType/:entityId
router.get('/:entityType/:entityId', (req, res) => {
  const rows = db.prepare(`
    SELECT id, entity_type, entity_id, action, payload, created_at
    FROM audit_log
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `).all(req.params.entityType, req.params.entityId);
  res.json(rows.map(r => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    payload: tryParse(r.payload),
    createdAt: r.created_at,
  })));
});

// GET /api/audit/recent?limit=50
router.get('/recent', (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10), 1), 200);
  const rows = db.prepare(`
    SELECT id, entity_type, entity_id, action, payload, created_at
    FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(limit);
  res.json(rows.map(r => ({
    id: r.id, entityType: r.entity_type, entityId: r.entity_id, action: r.action,
    payload: tryParse(r.payload), createdAt: r.created_at,
  })));
});

function tryParse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

module.exports = router;

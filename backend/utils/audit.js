const db = require('../database');

function audit(entityType, entityId, action, payload = {}) {
  try {
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, payload)
      VALUES (?, ?, ?, ?)
    `).run(entityType, entityId, action, JSON.stringify(payload));
  } catch (err) {
    console.warn('[audit] errore log:', err.message);
  }
}

module.exports = { audit };

const db = require('../database');

const insertStmt = db.prepare(`
  INSERT INTO audit_log (entity_type, entity_id, action, payload)
  VALUES (?, ?, ?, ?)
`);

/**
 * Logga un'azione su un'entita. Non solleva: in caso di errore stampa warning.
 * @param {string} entityType - es. 'fattura', 'ddt', 'cliente'
 * @param {number} entityId
 * @param {string} action - 'CREATE' | 'UPDATE' | 'DELETE'
 * @param {object} payload - dati rilevanti (snapshot prima della modifica)
 */
function audit(entityType, entityId, action, payload = {}) {
  try {
    insertStmt.run(entityType, entityId, action, JSON.stringify(payload));
  } catch (err) {
    console.warn('[audit] errore log:', err.message);
  }
}

module.exports = { audit };

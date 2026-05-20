const db = require('../database');

/**
 * Trova il prossimo numero libero per un tipo di documento (gap-filling).
 * Non modifica nessun contatore — legge i documenti esistenti.
 * @param {string} tipo   chiave prefissi (es. 'fatture', 'ddt')
 * @param {string} table  nome tabella SQL (es. 'fatture', 'ddt')
 */
function getNextNumero(tipo, table) {
  const az = db.prepare('SELECT numerazione_annuale, numero_prefissi FROM azienda WHERE id=1').get();
  const annuale = (az?.numerazione_annuale ?? 1) !== 0;
  let prefissi = {};
  try { prefissi = JSON.parse(az?.numero_prefissi || '{}'); } catch(_) {}
  const prefisso = prefissi[tipo] || '';
  const anno = new Date().getFullYear();

  const rows = db.prepare(`SELECT numero FROM "${table}"`).all();
  const used = new Set();
  for (const r of rows) {
    const s = String(r.numero ?? '');
    if (annuale) {
      const m = s.match(new RegExp(`${anno}/(\\d+)$`));
      if (m) used.add(parseInt(m[1], 10));
    } else {
      const m = s.replace(prefisso, '').match(/^(\d+)$/);
      if (m) used.add(parseInt(m[1], 10));
    }
  }
  let n = 1;
  while (used.has(n)) n++;

  return annuale
    ? `${prefisso}${anno}/${String(n).padStart(4, '0')}`
    : `${prefisso}${n}`;
}

module.exports = { getNextNumero };

const db = require('../database');

/**
 * Trova il prossimo numero libero per un tipo di documento (gap-filling).
 * Non modifica nessun contatore — legge i documenti esistenti.
 * Accetta offset per gestire retry su UNIQUE constraint.
 * @param {string} tipo   chiave prefissi (es. 'fatture', 'ddt')
 * @param {string} table  nome tabella SQL (es. 'fatture', 'ddt')
 * @param {number} offset salta i primi N numeri liberi (default 0)
 */
function getNextNumero(tipo, table, offset = 0) {
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
  let skipped = 0;
  while (used.has(n) || skipped < offset) {
    if (!used.has(n)) skipped++;
    n++;
  }

  return annuale
    ? `${prefisso}${anno}/${String(n).padStart(4, '0')}`
    : `${prefisso}${n}`;
}

/**
 * Esegue una funzione che assegna un numero documento, ritentando con offset
 * incrementale se l'INSERT fallisce per UNIQUE constraint. Necessario quando
 * più scritture concorrenti possono calcolare lo stesso "next" prima del commit.
 *
 * @param {string} tipo
 * @param {string} table
 * @param {(numero: string) => any} fn  riceve il numero e deve eseguire l'INSERT
 * @param {number} maxRetries
 */
function withNumeroRetry(tipo, table, fn, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const numero = getNextNumero(tipo, table, i);
    try {
      return { numero, result: fn(numero) };
    } catch (err) {
      const isUnique = err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint/i.test(err.message || '');
      if (!isUnique || i === maxRetries - 1) throw err;
    }
  }
}

module.exports = { getNextNumero, withNumeroRetry };

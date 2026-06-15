// Configurazione del backup (edizione offline), persistita come JSON in
// azienda.backup_config. Centralizzata qui per essere condivisa tra la route
// /api/backup e il flusso password (derivazione della chiave di cifratura).
const crypto = require('crypto');
const db = require('../database');

const DEFAULTS = {
  dir: '',                 // cartella di destinazione (anche dentro Drive/Dropbox)
  enabled: false,          // backup giornaliero attivo
  encrypt: false,          // cifra con la password d'accesso
  alertDays: 3,            // dopo quanti giorni senza backup avvisare
  alertDisabled: false,    // "non mostrare più" (riattivabile dalle impostazioni)
  lastAt: null,            // ISO dell'ultimo backup esterno riuscito
  alertDismissedAt: null,  // ISO dell'ultima chiusura dell'alert
  encSalt: null,           // salt (hex) per derivare la chiave dalla password
};

function read() {
  try {
    const row = db.prepare('SELECT backup_config FROM azienda WHERE id=1').get();
    const cfg = row && row.backup_config ? JSON.parse(row.backup_config) : {};
    return { ...DEFAULTS, ...cfg };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function write(cfg) {
  const merged = { ...read(), ...cfg };
  db.prepare('UPDATE azienda SET backup_config=? WHERE id=1').run(JSON.stringify(merged));
  return merged;
}

/** Garantisce un salt persistente (per derivare sempre la stessa chiave). */
function ensureSalt() {
  const cfg = read();
  if (cfg.encSalt) return cfg.encSalt;
  const salt = crypto.randomBytes(16).toString('hex');
  write({ encSalt: salt });
  return salt;
}

module.exports = { read, write, ensureSalt, DEFAULTS };

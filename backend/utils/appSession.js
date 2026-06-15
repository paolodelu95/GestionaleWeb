// Edizione offline: chiave di cifratura dei backup tenuta SOLO in memoria.
// Viene derivata dalla password d'accesso (scrypt) quando l'utente la imposta o
// sblocca l'app, e usata per cifrare i backup mentre il programma è aperto.
// Non viene mai scritta su disco: a programma chiuso sparisce.
const crypto = require('crypto');

let backupKey = null; // Buffer(32) o null

/** Deriva e memorizza la chiave AES-256 dalla password d'accesso + salt persistito. */
function setBackupKeyFromPassword(password, saltHex) {
  if (!password || !saltHex) { backupKey = null; return; }
  try {
    backupKey = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32);
  } catch (_) {
    backupKey = null;
  }
}

function getBackupKey() { return backupKey; }
function clearBackupKey() { backupKey = null; }

module.exports = { setBackupKeyFromPassword, getBackupKey, clearBackupKey };

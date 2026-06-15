const fs = require('fs');
const path = require('path');
const { tenantDbPath, dataDir } = require('./authDb');

// I backup vanno sul volume persistente (dataDir → /data), NON nel filesystem
// effimero del container, altrimenti spariscono ad ogni restart/deploy/auto-stop.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(dataDir(), 'backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '14');

async function runBackup(tenantSlug = 'default') {
  try {
    const src = tenantDbPath(tenantSlug);
    if (!fs.existsSync(src)) return;
    const tenantBackupDir = path.join(BACKUP_DIR, tenantSlug);
    fs.mkdirSync(tenantBackupDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(tenantBackupDir, `gestionale-${ts}.db`);

    // db.backup() è WAL-aware e produce una copia consistente, a differenza di
    // fs.copyFileSync che ignora il file -wal (copie incomplete/corrotte).
    // Esegue la copia a step cedendo all'event loop: niente blocco prolungato.
    const { openTenantDb } = require('./tenantDb');
    const db = openTenantDb(tenantSlug);
    await db.backup(dest);

    console.log(`[Backup] ${tenantSlug}: ${dest}`);
    pruneBackups(tenantBackupDir);
  } catch (err) {
    console.error(`[Backup] Errore (${tenantSlug}):`, err.message);
  }
}

function pruneBackups(dir) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('gestionale-') && f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const f of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(dir, f.name));
      console.log(`[Backup] Rimosso vecchio: ${f.name}`);
    }
  } catch (_) {}
}

// ── Backup esterno (cartella scelta dall'utente, eventualmente sincronizzata su
//    Google Drive/Dropbox) con cifratura AES-256-GCM opzionale ─────────────────
const crypto = require('crypto');
const os = require('os');

const EXT_MAX = parseInt(process.env.BACKUP_EXT_MAX || '30');
const ENC_MAGIC = Buffer.from('ORDEVA1\0'); // header file cifrato: magic(8)|iv(12)|tag(16)|dati

function encryptBuffer(buf, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENC_MAGIC, iv, tag, enc]);
}

function decryptBuffer(buf, key) {
  if (!buf.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)) {
    throw new Error('File non cifrato o formato non riconosciuto');
  }
  let p = ENC_MAGIC.length;
  const iv = buf.subarray(p, p += 12);
  const tag = buf.subarray(p, p += 16);
  const data = buf.subarray(p);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function pruneExternal(dir) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => /^ordeva-.*\.(db|db\.enc)$/.test(f))
      .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const f of files.slice(EXT_MAX)) {
      try { fs.unlinkSync(path.join(dir, f.name)); } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Crea un backup del DB nel `dir` indicato. Se `encrypt` è true e c'è una `key`,
 * il file viene cifrato (estensione .db.enc). Ritorna { file, encrypted }.
 */
async function runExternalBackup(tenantSlug = 'default', { dir, encrypt = false, key = null } = {}) {
  if (!dir) throw new Error('Cartella di backup non impostata');
  if (encrypt && !key) throw new Error('Cifratura richiesta ma password d\'accesso non sbloccata');
  fs.mkdirSync(dir, { recursive: true });

  const src = tenantDbPath(tenantSlug);
  if (!fs.existsSync(src)) throw new Error('Database non trovato');

  // Copia WAL-safe verso un file temporaneo, poi copia/cifra nella destinazione.
  const { openTenantDb } = require('./tenantDb');
  const db = openTenantDb(tenantSlug);
  const tmp = path.join(os.tmpdir(), `ordeva-bk-${Date.now()}.db`);
  await db.backup(tmp);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let dest;
  if (encrypt && key) {
    dest = path.join(dir, `ordeva-${ts}.db.enc`);
    fs.writeFileSync(dest, encryptBuffer(fs.readFileSync(tmp), key));
  } else {
    dest = path.join(dir, `ordeva-${ts}.db`);
    fs.copyFileSync(tmp, dest);
  }
  try { fs.unlinkSync(tmp); } catch (_) {}

  pruneExternal(dir);
  return { file: dest, encrypted: !!(encrypt && key) };
}

/**
 * Ripristina un backup: legge `filePath` (.db o .db.enc), lo decifra se serve e
 * sostituisce il DB del tenant. Crea prima un backup di sicurezza dell'attuale.
 */
async function restoreBackup(tenantSlug = 'default', { filePath, key = null } = {}) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('File di backup non trovato');
  let data = fs.readFileSync(filePath);
  const isEnc = data.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC) || filePath.endsWith('.db.enc');
  if (isEnc) {
    if (!key) throw new Error('Backup cifrato: sblocca con la password d\'accesso per ripristinarlo');
    data = decryptBuffer(data, key);
  }
  // Validazione minima: header SQLite.
  if (data.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') {
    throw new Error('Il file non è un database valido (password errata?)');
  }

  // Backup di sicurezza dell'attuale, poi chiude le connessioni e sovrascrive.
  await runBackup(tenantSlug);
  try { require('./tenantDb').closeAll(); } catch (_) {}

  const target = tenantDbPath(tenantSlug);
  fs.writeFileSync(target, data);
  // Rimuove eventuali file WAL/SHM stantii rispetto al DB ripristinato.
  for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(target + ext); } catch (_) {} }
  return { restored: true };
}

module.exports = { runBackup, runExternalBackup, restoreBackup, encryptBuffer, decryptBuffer };

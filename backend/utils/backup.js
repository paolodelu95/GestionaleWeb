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

module.exports = { runBackup };

// Backup giornaliero su cartella locale/sincronizzata (Drive/Dropbox) con
// cifratura opzionale. Solo edizione offline desktop.
const express = require('express');
const router = express.Router();
const db = require('../database');
const backupConfig = require('../utils/backupConfig');
const appSession = require('../utils/appSession');
const { runExternalBackup, restoreBackup } = require('../utils/backup');
const fs = require('fs');
const path = require('path');

const TENANT = 'default';

function passwordSet() {
  const row = db.prepare('SELECT app_password_hash FROM azienda WHERE id=1').get();
  return !!(row && row.app_password_hash);
}

function daysSince(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / 86400000;
}

/** L'alert è dovuto? (non disabilitato, backup scaduto, e non già chiuso di recente). */
function alertDue(cfg) {
  if (cfg.alertDisabled) return false;
  const overdue = daysSince(cfg.lastAt) >= cfg.alertDays;
  const dismissedRecently = daysSince(cfg.alertDismissedAt) < cfg.alertDays;
  return overdue && !dismissedRecently;
}

function publicCfg(cfg) {
  const { encSalt, ...rest } = cfg;
  return {
    ...rest,
    daysSinceLast: cfg.lastAt ? Math.floor(daysSince(cfg.lastAt)) : null,
    alertDue: alertDue(cfg),
    passwordSet: passwordSet(),
    keyReady: !!appSession.getBackupKey(),
  };
}

// GET /api/backup/config
router.get('/config', (req, res) => {
  res.json(publicCfg(backupConfig.read()));
});

// PUT /api/backup/config — salva le preferenze (non i campi di stato).
router.put('/config', (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (typeof b.dir === 'string') patch.dir = b.dir.trim();
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (typeof b.encrypt === 'boolean') patch.encrypt = b.encrypt;
  if (Number.isFinite(b.alertDays)) patch.alertDays = Math.max(1, Math.min(60, Math.round(b.alertDays)));
  if (typeof b.alertDisabled === 'boolean') patch.alertDisabled = b.alertDisabled;
  res.json(publicCfg(backupConfig.write(patch)));
});

// POST /api/backup/run — esegue subito un backup nella cartella configurata.
router.post('/run', async (req, res) => {
  const cfg = backupConfig.read();
  if (!cfg.dir) return res.status(400).json({ error: 'Imposta prima la cartella di backup.' });
  const key = appSession.getBackupKey();
  if (cfg.encrypt && !key) {
    return res.status(409).json({ error: 'La cifratura è attiva ma manca la password d\'accesso sbloccata. Imposta/inserisci la password e riprova.' });
  }
  try {
    const out = await runExternalBackup(TENANT, { dir: cfg.dir, encrypt: cfg.encrypt, key });
    const updated = backupConfig.write({ lastAt: new Date().toISOString() });
    res.json({ success: true, file: path.basename(out.file), encrypted: out.encrypted, ...publicCfg(updated) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Backup non riuscito.' });
  }
});

// POST /api/backup/alert-dismiss — l'utente ha chiuso l'alert (riappare dopo alertDays).
router.post('/alert-dismiss', (req, res) => {
  res.json(publicCfg(backupConfig.write({ alertDismissedAt: new Date().toISOString() })));
});

// GET /api/backup/list — elenco dei backup presenti nella cartella (per il ripristino).
router.get('/list', (req, res) => {
  const cfg = backupConfig.read();
  if (!cfg.dir || !fs.existsSync(cfg.dir)) return res.json({ files: [] });
  try {
    const files = fs.readdirSync(cfg.dir)
      .filter(f => /^ordeva-.*\.(db|db\.enc)$/.test(f))
      .map(f => {
        const st = fs.statSync(path.join(cfg.dir, f));
        return { name: f, encrypted: f.endsWith('.db.enc'), size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup/restore — ripristina un backup dalla cartella { name } o da { filePath }.
router.post('/restore', async (req, res) => {
  const cfg = backupConfig.read();
  const b = req.body || {};
  const filePath = b.filePath || (b.name && cfg.dir ? path.join(cfg.dir, b.name) : null);
  if (!filePath) return res.status(400).json({ error: 'Backup da ripristinare non indicato.' });
  try {
    await restoreBackup(TENANT, { filePath, key: appSession.getBackupKey() });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Ripristino non riuscito.' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../database');
const { requireRole } = require('../middleware/auth');

function getTransporter() {
  const cfg = db.prepare('SELECT * FROM azienda WHERE id=1').get();
  if (!cfg?.smtp_host || !cfg?.smtp_user) return null;
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port: cfg.smtp_port || 587,
    secure: cfg.smtp_secure === 1,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
  });
}

function getAdminEmail() {
  const cfg = db.prepare('SELECT smtp_from, smtp_user FROM azienda WHERE id=1').get();
  return cfg?.smtp_from || cfg?.smtp_user || null;
}

const prioritaLabel = { BASSA: 'Bassa', MEDIA: 'Media', ALTA: 'Alta ⚠️' };

// POST / – crea nuova segnalazione
router.post('/', async (req, res) => {
  const { titolo, descrizione, pagina, priorita } = req.body;
  if (!titolo || !descrizione) return res.status(400).json({ error: 'titolo e descrizione obbligatori' });

  const prio = ['BASSA', 'MEDIA', 'ALTA'].includes(priorita) ? priorita : 'MEDIA';
  const result = db.prepare(
    'INSERT INTO bug_reports (titolo, descrizione, pagina, priorita) VALUES (?, ?, ?, ?)'
  ).run(titolo, descrizione, pagina || '', prio);

  // Notifica email (non bloccante se SMTP non configurato)
  try {
    const t = getTransporter();
    const dest = getAdminEmail();
    if (t && dest) {
      const html = `
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b;max-width:600px">
          <h2 style="color:#dc2626">🐛 Nuova segnalazione bug</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:6px 12px;font-weight:600;width:120px">Titolo</td><td style="padding:6px 12px">${titolo}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:6px 12px;font-weight:600">Pagina</td><td style="padding:6px 12px">${pagina || '—'}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600">Priorità</td><td style="padding:6px 12px">${prioritaLabel[prio]}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:6px 12px;font-weight:600;vertical-align:top">Descrizione</td><td style="padding:6px 12px;white-space:pre-wrap">${descrizione}</td></tr>
          </table>
          <p style="margin-top:16px;font-size:12px;color:#64748b">Segnalazione #${result.lastInsertRowid} — ${new Date().toLocaleString('it-IT')}</p>
        </div>`;
      await t.sendMail({ from: dest, to: dest, subject: `[Bug] ${titolo}`, html });
    }
  } catch (_) {}

  res.json({ id: result.lastInsertRowid });
});

// GET / – lista tutte le segnalazioni
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM bug_reports ORDER BY created_at DESC').all();
  res.json(rows);
});

// PATCH /:id/risolto – segna come risolto
router.patch('/:id/risolto', (req, res) => {
  const { id } = req.params;
  const row = db.prepare('SELECT id FROM bug_reports WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Non trovato' });
  db.prepare("UPDATE bug_reports SET stato='RISOLTO', resolved_at=datetime('now') WHERE id=?").run(id);
  res.json({ ok: true });
});

// PATCH /:id/riapri – riapri
router.patch('/:id/riapri', (req, res) => {
  const { id } = req.params;
  db.prepare("UPDATE bug_reports SET stato='APERTO', resolved_at=NULL WHERE id=?").run(id);
  res.json({ ok: true });
});

// DELETE /:id  (solo ruoli amministrativi)
router.delete('/:id', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), (req, res) => {
  db.prepare('DELETE FROM bug_reports WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

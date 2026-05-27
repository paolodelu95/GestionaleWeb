const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireRole } = require('../middleware/auth');

const ADMIN_ROLES = ['SUPERADMIN', 'ADMIN'];

router.get('/', (req, res) => {
  const row = db.prepare('SELECT * FROM azienda WHERE id = 1').get();
  if (!row) return res.json({});
  const isAdmin = req.user && ADMIN_ROLES.includes(req.user.ruolo);
  res.json(toDto(row, isAdmin));
});

router.put('/', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), (req, res) => {
  const a = req.body;
  db.prepare(`UPDATE azienda SET ragione_sociale=?, indirizzo=?, cap=?, citta=?, provincia=?, stato=?,
    p_iva=?, cod_fiscale=?, email=?, telefono=?, pec=?, sdi=?, banca=?, iban=?, logo=?,
    smtp_host=?, smtp_port=?, smtp_user=?, smtp_pass=?, smtp_from=?, smtp_secure=?,
    sdi_api_url=?, sdi_api_key=?,
    riordino_automatico=?, multi_utente_attivo=?,
    numerazione_annuale=?, numero_prefissi=?,
    template_config=?, notifiche_config=?, email_corpo_documento=?, email_mode=?,
    lock_documenti_default=?
    WHERE id=1`)
    .run(a.ragioneSociale, a.indirizzo, a.cap, a.citta, a.provincia, a.stato,
         a.pIva, a.codFiscale, a.email, a.telefono, a.pec, a.sdi, a.banca, a.iban, a.logo || '',
         a.smtpHost || '', a.smtpPort || 587, a.smtpUser || '', a.smtpPass || '', a.smtpFrom || '', a.smtpSecure ? 1 : 0,
         a.sdiApiUrl || '', a.sdiApiKey || '',
         a.riordinoAutomatico ? 1 : 0, a.multiUtenteAttivo ? 1 : 0,
         a.numerazioneAnnuale ? 1 : 0, JSON.stringify(a.numeroPrefissi || {}),
         a.templateConfig ? JSON.stringify(a.templateConfig) : null,
         a.notificheConfig ? JSON.stringify(a.notificheConfig) : null,
         a.emailCorpoDocumento ?? null,
         ['SMTP','MAILTO','WEBMAIL_GMAIL','WEBMAIL_OUTLOOK'].includes(a.emailMode) ? a.emailMode : 'SMTP',
         a.lockDocumentiDefault === false ? 0 : 1);
  res.json({ success: true });
});

function toDto(r, includeSecrets = false) {
  const maskedPass = r.smtp_pass ? '••••••••' : '';
  const maskedKey  = r.sdi_api_key ? '••••••••' : '';
  return {
    id: r.id, ragioneSociale: r.ragione_sociale, indirizzo: r.indirizzo,
    cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato,
    pIva: r.p_iva, codFiscale: r.cod_fiscale,
    email: r.email, telefono: r.telefono, pec: r.pec, sdi: r.sdi,
    banca: r.banca, iban: r.iban, logo: r.logo || '',
    smtpHost: r.smtp_host || '', smtpPort: r.smtp_port || 587,
    smtpUser: r.smtp_user || '', smtpPass: includeSecrets ? (r.smtp_pass || '') : maskedPass,
    smtpFrom: r.smtp_from || '', smtpSecure: r.smtp_secure === 1,
    sdiApiUrl: r.sdi_api_url || '', sdiApiKey: includeSecrets ? (r.sdi_api_key || '') : maskedKey,
    riordinoAutomatico: r.riordino_automatico === 1,
    multiUtenteAttivo: r.multi_utente_attivo === 1,
    numerazioneAnnuale: (r.numerazione_annuale ?? 1) !== 0,
    numeroPrefissi: (() => { try { return JSON.parse(r.numero_prefissi || '{}'); } catch(_) { return {}; } })(),
    templateConfig: (() => { try { return r.template_config ? JSON.parse(r.template_config) : null; } catch(_) { return null; } })(),
    notificheConfig: (() => { try { return r.notifiche_config ? JSON.parse(r.notifiche_config) : null; } catch(_) { return null; } })(),
    emailCorpoDocumento: r.email_corpo_documento || '',
    emailMode: ['SMTP','MAILTO','WEBMAIL_GMAIL','WEBMAIL_OUTLOOK'].includes(r.email_mode) ? r.email_mode : 'SMTP',
    lockDocumentiDefault: (r.lock_documenti_default ?? 1) !== 0,
  };
}

module.exports = router;

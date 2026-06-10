const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../database');
const { requireRole } = require('../middleware/auth');

const ROLES_EMAIL_SEND = ['SUPERADMIN', 'ADMIN', 'COMMERCIALE', 'CONTABILE'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function assertSafeRecipient(input) {
  if (!input) throw new Error('Email destinatario mancante');
  const list = Array.isArray(input) ? input : String(input).split(',');
  for (const raw of list) {
    const addr = String(raw).trim();
    if (/[\r\n]/.test(addr)) throw new Error('Indirizzo email non valido (caratteri di controllo)');
    if (!EMAIL_RE.test(addr)) throw new Error(`Indirizzo email non valido: ${addr}`);
  }
}

function getTransporter() {
  const cfg = db.prepare('SELECT * FROM azienda WHERE id=1').get();
  if (!cfg?.smtp_host || !cfg?.smtp_user) throw new Error('SMTP non configurato. Vai in Impostazioni → Email.');
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port: cfg.smtp_port || 587,
    secure: cfg.smtp_secure === 1,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
  });
}

function getFrom() {
  const cfg = db.prepare('SELECT smtp_from, smtp_user, ragione_sociale FROM azienda WHERE id=1').get();
  const name = cfg?.ragione_sociale || '';
  const addr = cfg?.smtp_from || cfg?.smtp_user || '';
  return name ? `"${name}" <${addr}>` : addr;
}

function getDefaultEmailBody() {
  const row = db.prepare('SELECT email_corpo_documento FROM azienda WHERE id=1').get();
  return row?.email_corpo_documento || 'Buongiorno,\nin allegato trovate il documento richiesto.\nRestiamo a disposizione per qualsiasi chiarimento.';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function bodyToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// ── POST /test – test connessione SMTP (solo ADMIN) ──────────────────────────
router.post('/test', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), async (req, res) => {
  try {
    const t = getTransporter();
    await t.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /send – invio generico (solo ADMIN per evitare uso come open relay) ─
router.post('/send', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), async (req, res) => {
  const { to, subject, html, attachments } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'to e subject obbligatori' });
  if (/[\r\n]/.test(String(subject))) return res.status(400).json({ error: 'Subject non valido' });
  try {
    assertSafeRecipient(to);
    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to, subject, html: html || '', attachments: attachments || [] });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.message?.startsWith('Indirizzo') || err.message?.startsWith('Subject') ? 400 : 500)
       .json({ error: err.message });
  }
});

// ── POST /fattura/:id – invia fattura come HTML ───────────────────────────────
router.post('/fattura/:id', async (req, res) => {
  const { to, note } = req.body;
  try {
    const row = db.prepare(`
      SELECT f.*, c.ragione_sociale as c_nome, c.email as c_email
      FROM fatture f LEFT JOIN clienti c ON f.cliente_id = c.id WHERE f.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Fattura non trovata' });
    const dest = to || row.c_email;
    assertSafeRecipient(dest);

    const righe = db.prepare(`SELECT fr.*, p.nome as p_nome FROM fatture_righe fr LEFT JOIN prodotti p ON fr.prodotto_id=p.id WHERE fr.fattura_id=?`).all(row.id);
    const totale = righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto||0)/100) * (1 + r.iva/100), 0);
    const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    const rowsHtml = righe.map(r => `<tr><td>${escapeHtml(r.descrizione)}</td><td style="text-align:right">${r.quantita}</td><td style="text-align:right">${fmt(r.prezzo)}</td><td style="text-align:right">${fmt(r.quantita*r.prezzo*(1-(r.sconto||0)/100)*(1+r.iva/100))}</td></tr>`).join('');
    const bodyText = (note && String(note).trim()) ? note : getDefaultEmailBody();
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b"><h2>Fattura n. ${escapeHtml(row.numero)}</h2><p>${bodyToHtml(bodyText)}</p><table style="width:100%;border-collapse:collapse;margin-top:16px"><thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Descrizione</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Qtà</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Prezzo</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Totale</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3" style="text-align:right;padding:8px;font-weight:700">TOTALE</td><td style="text-align:right;padding:8px;font-weight:700">${fmt(totale)}</td></tr></tfoot></table><p style="margin-top:24px;font-size:12px;color:#64748b">Cordiali saluti</p></body></html>`;

    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject: `Fattura n. ${row.numero}`, html });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /acquisto/:id – invia richiesta/conferma acquisto ───────────────────
router.post('/acquisto/:id', async (req, res) => {
  const { to, note } = req.body;
  try {
    const row = db.prepare(`
      SELECT a.*, f.ragione_sociale as f_nome, f.email as f_email
      FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id = f.id WHERE a.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Acquisto non trovato' });
    const dest = to || row.f_email;
    assertSafeRecipient(dest);

    const righe = db.prepare(`SELECT ar.*, p.nome as p_nome FROM acquisti_righe ar LEFT JOIN prodotti p ON ar.prodotto_id=p.id WHERE ar.acquisto_id=?`).all(row.id);
    const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    const rowsHtml = righe.map(r => `<tr><td>${escapeHtml(r.descrizione)}</td><td style="text-align:right">${r.quantita}</td><td style="text-align:right">${fmt(r.prezzo)}</td></tr>`).join('');
    const bodyText = (note && String(note).trim()) ? note : getDefaultEmailBody();
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b"><h2>Ordine/Acquisto n. ${escapeHtml(row.numero)}</h2><p>${bodyToHtml(bodyText)}</p><table style="width:100%;border-collapse:collapse;margin-top:16px"><thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Descrizione</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Qtà</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Prezzo</th></tr></thead><tbody>${rowsHtml}</tbody></table><p style="margin-top:24px;font-size:12px;color:#64748b">Cordiali saluti</p></body></html>`;

    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject: `Acquisto n. ${row.numero}`, html });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper generico: invia un documento (DDT/ordine/preventivo/nota credito) ──
function sendDocumentoEmail(opts) {
  const { docRow, righe, dest, subject, heading, note, withTotal = true } = opts;
  const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  const totale = withTotal
    ? righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto || 0) / 100) * (1 + (r.iva || 0) / 100), 0)
    : 0;
  const rowsHtml = righe.map(r =>
    `<tr><td>${escapeHtml(r.descrizione || '')}</td><td style="text-align:right">${r.quantita}</td><td style="text-align:right">${fmt(r.prezzo)}</td>${withTotal ? `<td style="text-align:right">${fmt(r.quantita * r.prezzo * (1 - (r.sconto || 0) / 100) * (1 + (r.iva || 0) / 100))}</td>` : ''}</tr>`
  ).join('');
  const bodyText = (note && String(note).trim()) ? note : getDefaultEmailBody();
  const totaleRow = withTotal
    ? `<tfoot><tr><td colspan="3" style="text-align:right;padding:8px;font-weight:700">TOTALE</td><td style="text-align:right;padding:8px;font-weight:700">${fmt(totale)}</td></tr></tfoot>`
    : '';
  const totalHeader = withTotal
    ? '<th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Totale</th>'
    : '';
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b"><h2>${escapeHtml(heading)}</h2><p>${bodyToHtml(bodyText)}</p><table style="width:100%;border-collapse:collapse;margin-top:16px"><thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Descrizione</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Qtà</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Prezzo</th>${totalHeader}</tr></thead><tbody>${rowsHtml}</tbody>${totaleRow}</table><p style="margin-top:24px;font-size:12px;color:#64748b">Cordiali saluti</p></body></html>`;
  return { html, subject, dest };
}

// ── POST /ddt/:id – invia DDT ─────────────────────────────────────────────────
router.post('/ddt/:id', async (req, res) => {
  const { to, note } = req.body;
  try {
    const row = db.prepare(`
      SELECT d.*, c.ragione_sociale as c_nome, c.email as c_email
      FROM ddt d LEFT JOIN clienti c ON d.cliente_id = c.id WHERE d.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Documento di trasporto non trovato' });
    const dest = to || row.c_email;
    assertSafeRecipient(dest);
    const righe = db.prepare(`SELECT * FROM ddt_righe WHERE ddt_id=?`).all(row.id);
    const { html, subject } = sendDocumentoEmail({
      docRow: row, righe, dest, note,
      subject: `Documento di trasporto n. ${row.numero}`,
      heading: `Documento di trasporto n. ${row.numero}`,
      withTotal: false,
    });
    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject, html });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /preventivo/:id – invia preventivo ───────────────────────────────────
router.post('/preventivo/:id', async (req, res) => {
  const { to, note } = req.body;
  try {
    const row = db.prepare(`
      SELECT p.*, c.ragione_sociale as c_nome, c.email as c_email
      FROM preventivi p LEFT JOIN clienti c ON p.cliente_id = c.id WHERE p.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Preventivo non trovato' });
    const dest = to || row.c_email;
    assertSafeRecipient(dest);
    const righe = db.prepare(`SELECT * FROM preventivi_righe WHERE preventivo_id=?`).all(row.id);
    const { html, subject } = sendDocumentoEmail({
      docRow: row, righe, dest, note,
      subject: `Preventivo n. ${row.numero}`,
      heading: `Preventivo n. ${row.numero}`,
    });
    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject, html });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /nota-credito/:id – invia nota di credito ────────────────────────────
router.post('/nota-credito/:id', async (req, res) => {
  const { to, note } = req.body;
  try {
    const row = db.prepare(`
      SELECT n.*, c.ragione_sociale as c_nome, c.email as c_email
      FROM note_credito n LEFT JOIN clienti c ON n.cliente_id = c.id WHERE n.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Nota di credito non trovata' });
    const dest = to || row.c_email;
    assertSafeRecipient(dest);
    const righe = db.prepare(`SELECT * FROM note_credito_righe WHERE nota_credito_id=?`).all(row.id);
    const { html, subject } = sendDocumentoEmail({
      docRow: row, righe, dest, note,
      subject: `Nota di credito n. ${row.numero}`,
      heading: `Nota di credito n. ${row.numero}`,
    });
    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject, html });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /ordine/:id – invia ordine (cliente o fornitore) ─────────────────────
router.post('/ordine/:id', async (req, res) => {
  const { to, note } = req.body;
  try {
    const row = db.prepare(`
      SELECT o.*,
             c.ragione_sociale as c_nome, c.email as c_email,
             f.ragione_sociale as f_nome, f.email as f_email
      FROM ordini o
      LEFT JOIN clienti c ON o.cliente_id = c.id
      LEFT JOIN fornitori f ON o.fornitore_id = f.id
      WHERE o.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Ordine non trovato' });
    const isFornitore = row.tipo === 'FORNITORE' || (!row.cliente_id && row.fornitore_id);
    const dest = to || (isFornitore ? row.f_email : row.c_email);
    assertSafeRecipient(dest);
    const righe = db.prepare(`SELECT * FROM ordini_righe WHERE ordine_id=?`).all(row.id);
    const { html, subject } = sendDocumentoEmail({
      docRow: row, righe, dest, note,
      subject: `Ordine n. ${row.numero}`,
      heading: `Ordine n. ${row.numero}`,
    });
    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject, html });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /sollecito/:tipo/:id – invia sollecito pagamento ─────────────────────
router.post('/sollecito/:tipo/:id', async (req, res) => {
  const { tipo, id } = req.params;
  const { to, note } = req.body;
  try {
    let row, dest, numero, importo, scadenza;
    if (tipo === 'fattura') {
      row = db.prepare(`SELECT f.*, c.ragione_sociale as nome, c.email as email FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.id=?`).get(id);
    } else {
      row = db.prepare(`SELECT a.*, f.ragione_sociale as nome, f.email as email FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id=f.id WHERE a.id=?`).get(id);
    }
    if (!row) return res.status(404).json({ error: 'Documento non trovato' });
    dest = to || row.email;
    assertSafeRecipient(dest);

    const pagatiRow = tipo === 'fattura'
      ? db.prepare(`SELECT COALESCE(SUM(importo),0) as tot FROM pagamenti WHERE fattura_id=?`).get(id)
      : db.prepare(`SELECT COALESCE(SUM(importo),0) as tot FROM pagamenti WHERE acquisto_id=?`).get(id);
    const totaleDoc = db.prepare(
      tipo === 'fattura'
        ? `SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) as t FROM fatture_righe WHERE fattura_id=?`
        : `SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) as t FROM acquisti_righe WHERE acquisto_id=?`
    ).get(id)?.t || 0;
    const rimanente = totaleDoc - (pagatiRow?.tot || 0);
    const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    const tipoLabel = tipo === 'fattura' ? 'Fattura' : 'Acquisto';
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b"><h2>Sollecito di pagamento</h2><p>Gentile ${row.nome || 'Cliente'},<br>la contattamo in merito alla <b>${tipoLabel} n. ${row.numero}</b> del ${row.data_emissione}.</p><p>L'importo residuo da saldare è: <b style="color:#dc2626">${fmt(rimanente)}</b></p>${note ? `<p>${note}</p>` : ''}<p>La invitiamo a provvedere al pagamento quanto prima.<br>Per qualsiasi informazione non esiti a contattarci.</p><p style="margin-top:24px;font-size:12px;color:#64748b">Cordiali saluti</p></body></html>`;

    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject: `Sollecito pagamento – ${tipoLabel} n. ${row.numero}`, html });

    db.prepare(`INSERT INTO solleciti (documento_tipo, documento_id, email_destinatario, data_invio, esito) VALUES (?,?,?,?,?)`)
      .run(tipo.toUpperCase(), id, dest, new Date().toISOString().split('T')[0], 'INVIATO');

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /preview/:tipo/:id – costruisce subject+body plain text per mailto: ─
// tipo ∈ fattura | ddt | preventivo | ordine | nota-credito | acquisto | sollecito-fattura | sollecito-acquisto
router.post('/preview/:tipo/:id', (req, res) => {
  const { tipo, id } = req.params;
  const { to, note } = req.body || {};
  const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  const az = db.prepare('SELECT ragione_sociale FROM azienda WHERE id=1').get();
  const corpo = (note && String(note).trim()) ? note : getDefaultEmailBody();
  const saluti = `Cordiali saluti,\n${az?.ragione_sociale || ''}`.trim();

  try {
    let row, dest, subject, body, righe, totale;

    const docInfo = (heading, numero, data, totale = null) => {
      const lines = [`Documento: ${heading} n. ${numero}`, `Data: ${data || ''}`];
      if (totale !== null) lines.push(`Totale: ${fmt(totale)}`);
      return lines.join('\n');
    };

    const sumTotal = (rows) => rows.reduce(
      (s, r) => s + (r.quantita || 0) * (r.prezzo || 0) * (1 - (r.sconto || 0) / 100) * (1 + (r.iva || 0) / 100), 0
    );

    if (tipo === 'fattura') {
      row = db.prepare(`SELECT f.*, c.email as c_email FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.id=?`).get(id);
      if (!row) return res.status(404).json({ error: 'Fattura non trovata' });
      righe = db.prepare(`SELECT quantita, prezzo, sconto, iva FROM fatture_righe WHERE fattura_id=?`).all(id);
      totale = sumTotal(righe);
      dest = to || row.c_email;
      subject = `Fattura n. ${row.numero}`;
      body = `${corpo}\n\n${docInfo('Fattura', row.numero, row.data_emissione, totale)}\n\n${saluti}`;
    } else if (tipo === 'ddt') {
      row = db.prepare(`SELECT d.*, c.email as c_email FROM ddt d LEFT JOIN clienti c ON d.cliente_id=c.id WHERE d.id=?`).get(id);
      if (!row) return res.status(404).json({ error: 'Documento di trasporto non trovato' });
      dest = to || row.c_email;
      subject = `Documento di trasporto n. ${row.numero}`;
      body = `${corpo}\n\n${docInfo('Documento di trasporto', row.numero, row.data_emissione)}\n\n${saluti}`;
    } else if (tipo === 'preventivo') {
      row = db.prepare(`SELECT p.*, c.email as c_email FROM preventivi p LEFT JOIN clienti c ON p.cliente_id=c.id WHERE p.id=?`).get(id);
      if (!row) return res.status(404).json({ error: 'Preventivo non trovato' });
      righe = db.prepare(`SELECT quantita, prezzo, sconto, iva FROM preventivi_righe WHERE preventivo_id=?`).all(id);
      totale = sumTotal(righe);
      dest = to || row.c_email;
      subject = `Preventivo n. ${row.numero}`;
      body = `${corpo}\n\n${docInfo('Preventivo', row.numero, row.data_emissione, totale)}\n\n${saluti}`;
    } else if (tipo === 'ordine') {
      row = db.prepare(`SELECT o.*, c.email as c_email, f.email as f_email FROM ordini o LEFT JOIN clienti c ON o.cliente_id=c.id LEFT JOIN fornitori f ON o.fornitore_id=f.id WHERE o.id=?`).get(id);
      if (!row) return res.status(404).json({ error: 'Ordine non trovato' });
      const isFornitore = row.tipo === 'FORNITORE' || (!row.cliente_id && row.fornitore_id);
      righe = db.prepare(`SELECT quantita, prezzo, sconto, iva FROM ordini_righe WHERE ordine_id=?`).all(id);
      totale = sumTotal(righe);
      dest = to || (isFornitore ? row.f_email : row.c_email);
      subject = `Ordine n. ${row.numero}`;
      body = `${corpo}\n\n${docInfo('Ordine', row.numero, row.data_ordine, totale)}\n\n${saluti}`;
    } else if (tipo === 'nota-credito') {
      row = db.prepare(`SELECT n.*, c.email as c_email FROM note_credito n LEFT JOIN clienti c ON n.cliente_id=c.id WHERE n.id=?`).get(id);
      if (!row) return res.status(404).json({ error: 'Nota di credito non trovata' });
      righe = db.prepare(`SELECT quantita, prezzo, sconto, iva FROM note_credito_righe WHERE nota_credito_id=?`).all(id);
      totale = sumTotal(righe);
      dest = to || row.c_email;
      subject = `Nota di credito n. ${row.numero}`;
      body = `${corpo}\n\n${docInfo('Nota di credito', row.numero, row.data_emissione, totale)}\n\n${saluti}`;
    } else if (tipo === 'acquisto') {
      row = db.prepare(`SELECT a.*, f.email as f_email FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id=f.id WHERE a.id=?`).get(id);
      if (!row) return res.status(404).json({ error: 'Acquisto non trovato' });
      righe = db.prepare(`SELECT quantita, prezzo, sconto, iva FROM acquisti_righe WHERE acquisto_id=?`).all(id);
      totale = sumTotal(righe);
      dest = to || row.f_email;
      subject = `Acquisto n. ${row.numero}`;
      body = `${corpo}\n\n${docInfo('Acquisto', row.numero, row.data_emissione, totale)}\n\n${saluti}`;
    } else if (tipo === 'sollecito-fattura' || tipo === 'sollecito-acquisto') {
      const isFat = tipo === 'sollecito-fattura';
      row = isFat
        ? db.prepare(`SELECT f.*, c.email as c_email FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.id=?`).get(id)
        : db.prepare(`SELECT a.*, f.email as c_email FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id=f.id WHERE a.id=?`).get(id);
      if (!row) return res.status(404).json({ error: 'Documento non trovato' });
      const pagatiQ = isFat
        ? `SELECT COALESCE(SUM(importo),0) as t FROM pagamenti WHERE fattura_id=?`
        : `SELECT COALESCE(SUM(importo),0) as t FROM pagamenti WHERE acquisto_id=?`;
      const totQ = isFat
        ? `SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) as t FROM fatture_righe WHERE fattura_id=?`
        : `SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) as t FROM acquisti_righe WHERE acquisto_id=?`;
      const pagati = db.prepare(pagatiQ).get(id)?.t || 0;
      const tot = db.prepare(totQ).get(id)?.t || 0;
      const residuo = tot - pagati;
      const label = isFat ? 'Fattura' : 'Acquisto';
      dest = to || row.c_email;
      subject = `Sollecito pagamento – ${label} n. ${row.numero}`;
      body = [
        `${corpo}`,
        '',
        `${label} n. ${row.numero} del ${row.data_emissione}`,
        `Importo residuo da saldare: ${fmt(residuo)}`,
        '',
        saluti,
      ].join('\n');
    } else {
      return res.status(400).json({ error: 'Tipo documento non supportato' });
    }

    res.json({ to: dest || '', subject, body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /solleciti/:tipo/:id – storico solleciti ──────────────────────────────
router.get('/solleciti/:tipo/:id', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM solleciti WHERE documento_tipo=? AND documento_id=? ORDER BY data_invio DESC`
  ).all(req.params.tipo.toUpperCase(), req.params.id);
  res.json(rows);
});

module.exports = router;

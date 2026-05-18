const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../database');

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

// ── POST /test – test connessione SMTP ───────────────────────────────────────
router.post('/test', async (req, res) => {
  try {
    const t = getTransporter();
    await t.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /send – invio generico ───────────────────────────────────────────────
router.post('/send', async (req, res) => {
  const { to, subject, html, attachments } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'to e subject obbligatori' });
  try {
    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to, subject, html: html || '', attachments: attachments || [] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (!dest) return res.status(400).json({ error: 'Email destinatario mancante' });

    const righe = db.prepare(`SELECT fr.*, p.nome as p_nome FROM fatture_righe fr LEFT JOIN prodotti p ON fr.prodotto_id=p.id WHERE fr.fattura_id=?`).all(row.id);
    const totale = righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto||0)/100) * (1 + r.iva/100), 0);
    const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    const rowsHtml = righe.map(r => `<tr><td>${r.descrizione}</td><td style="text-align:right">${r.quantita}</td><td style="text-align:right">${fmt(r.prezzo)}</td><td style="text-align:right">${fmt(r.quantita*r.prezzo*(1-(r.sconto||0)/100)*(1+r.iva/100))}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b"><h2>Fattura n. ${row.numero}</h2><p>Gentile ${row.c_nome || 'Cliente'},<br>in allegato le inviamo la fattura n. <b>${row.numero}</b> del ${row.data_emissione}.</p>${note ? `<p>${note}</p>` : ''}<table style="width:100%;border-collapse:collapse;margin-top:16px"><thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Descrizione</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Qtà</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Prezzo</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Totale</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3" style="text-align:right;padding:8px;font-weight:700">TOTALE</td><td style="text-align:right;padding:8px;font-weight:700">${fmt(totale)}</td></tr></tfoot></table><p style="margin-top:24px;font-size:12px;color:#64748b">Cordiali saluti</p></body></html>`;

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
    if (!dest) return res.status(400).json({ error: 'Email destinatario mancante' });

    const righe = db.prepare(`SELECT ar.*, p.nome as p_nome FROM acquisti_righe ar LEFT JOIN prodotti p ON ar.prodotto_id=p.id WHERE ar.acquisto_id=?`).all(row.id);
    const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    const rowsHtml = righe.map(r => `<tr><td>${r.descrizione}</td><td style="text-align:right">${r.quantita}</td><td style="text-align:right">${fmt(r.prezzo)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:13px;color:#1e293b"><h2>Ordine/Acquisto n. ${row.numero}</h2><p>Gentile ${row.f_nome || 'Fornitore'},<br>vi inviamo conferma dell'acquisto n. <b>${row.numero}</b> del ${row.data_emissione}.</p>${note ? `<p>${note}</p>` : ''}<table style="width:100%;border-collapse:collapse;margin-top:16px"><thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Descrizione</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Qtà</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e2e8f0">Prezzo</th></tr></thead><tbody>${rowsHtml}</tbody></table>${note ? '' : ''}<p style="margin-top:24px;font-size:12px;color:#64748b">Cordiali saluti</p></body></html>`;

    const t = getTransporter();
    await t.sendMail({ from: getFrom(), to: dest, subject: `Acquisto n. ${row.numero}`, html });
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
    if (!dest) return res.status(400).json({ error: 'Email destinatario mancante' });

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

// ── GET /solleciti/:tipo/:id – storico solleciti ──────────────────────────────
router.get('/solleciti/:tipo/:id', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM solleciti WHERE documento_tipo=? AND documento_id=? ORDER BY data_invio DESC`
  ).all(req.params.tipo.toUpperCase(), req.params.id);
  res.json(rows);
});

module.exports = router;

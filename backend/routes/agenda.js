// Modulo Agenda — appuntamenti generici, todo list, vista calendario aggregata.
// Aggrega anche le scadenze pagamenti, attività CRM, fatture ricorrenti dovute.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../database');

/** Token deterministico per il feed ICS pubblico (HMAC del tenant). */
function feedTokenFor(tenantSlug) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET non configurato');
  return crypto.createHmac('sha256', secret).update('ICS_FEED:' + tenantSlug).digest('hex').slice(0, 32);
}

function verifyFeedToken(tenantSlug, token) {
  if (!tenantSlug || !token) return false;
  try {
    const expected = feedTokenFor(tenantSlug);
    if (expected.length !== token.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
  } catch (_) { return false; }
}

// ── Appuntamenti CRUD ───────────────────────────────────────────────────────
function appDto(r) {
  return {
    id: r.id, titolo: r.titolo, descrizione: r.descrizione,
    inizio: r.inizio, fine: r.fine, tuttoGiorno: r.tutto_giorno === 1,
    luogo: r.luogo, clienteId: r.cliente_id, clienteNome: r.cliente_nome || '',
    fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome || '',
    colore: r.colore, promemoria: r.promemoria_min, stato: r.stato,
    createdAt: r.created_at,
  };
}

router.get('/appuntamenti', (req, res) => {
  const da = req.query.dataDa || `${new Date().getFullYear()}-01-01T00:00:00`;
  const a  = req.query.dataA  || `${new Date().getFullYear()}-12-31T23:59:59`;
  const rows = db.prepare(`
    SELECT app.*, c.ragione_sociale AS cliente_nome, f.ragione_sociale AS fornitore_nome
    FROM appuntamenti app
    LEFT JOIN clienti c ON c.id=app.cliente_id
    LEFT JOIN fornitori f ON f.id=app.fornitore_id
    WHERE app.inizio BETWEEN ? AND ?
    ORDER BY app.inizio`).all(da, a);
  res.json(rows.map(appDto));
});

router.post('/appuntamenti', (req, res) => {
  const a = req.body || {};
  if (!a.titolo || !a.inizio) return res.status(400).json({ error: 'titolo e inizio obbligatori' });
  const r = db.prepare(`INSERT INTO appuntamenti
    (titolo, descrizione, inizio, fine, tutto_giorno, luogo, cliente_id, fornitore_id, colore, promemoria_min, stato)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    a.titolo, a.descrizione || '', a.inizio, a.fine || null,
    a.tuttoGiorno ? 1 : 0, a.luogo || '',
    a.clienteId || null, a.fornitoreId || null,
    a.colore || '#3b82f6', a.promemoria || null,
    a.stato || 'PIANIFICATO');
  res.json({ id: r.lastInsertRowid });
});

router.put('/appuntamenti/:id', (req, res) => {
  const a = req.body || {};
  const cur = db.prepare('SELECT * FROM appuntamenti WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Non trovato' });
  db.prepare(`UPDATE appuntamenti SET
    titolo=?, descrizione=?, inizio=?, fine=?, tutto_giorno=?, luogo=?,
    cliente_id=?, fornitore_id=?, colore=?, promemoria_min=?, stato=? WHERE id=?`).run(
    a.titolo ?? cur.titolo, a.descrizione ?? cur.descrizione,
    a.inizio ?? cur.inizio, a.fine ?? cur.fine,
    a.tuttoGiorno !== undefined ? (a.tuttoGiorno ? 1 : 0) : cur.tutto_giorno,
    a.luogo ?? cur.luogo,
    a.clienteId !== undefined ? a.clienteId : cur.cliente_id,
    a.fornitoreId !== undefined ? a.fornitoreId : cur.fornitore_id,
    a.colore ?? cur.colore,
    a.promemoria !== undefined ? a.promemoria : cur.promemoria_min,
    a.stato ?? cur.stato,
    req.params.id);
  res.json({ success: true });
});

router.delete('/appuntamenti/:id', (req, res) => {
  db.prepare('DELETE FROM appuntamenti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Todo CRUD ───────────────────────────────────────────────────────────────
function todoDto(r) {
  return {
    id: r.id, titolo: r.titolo, descrizione: r.descrizione,
    scadenza: r.scadenza, priorita: r.priorita, stato: r.stato,
    categoria: r.categoria, completataAt: r.completata_at, createdAt: r.created_at,
  };
}

router.get('/todo', (req, res) => {
  const stato = req.query.stato;
  const sql = `SELECT * FROM todo
               ${stato ? "WHERE stato=?" : ''}
               ORDER BY
                 CASE stato WHEN 'FATTA' THEN 1 ELSE 0 END,
                 CASE WHEN scadenza IS NULL THEN 1 ELSE 0 END,
                 scadenza, id DESC`;
  const rows = stato ? db.prepare(sql).all(stato) : db.prepare(sql).all();
  res.json(rows.map(todoDto));
});

router.post('/todo', (req, res) => {
  const t = req.body || {};
  if (!t.titolo) return res.status(400).json({ error: 'titolo obbligatorio' });
  const r = db.prepare(`INSERT INTO todo
    (titolo, descrizione, scadenza, priorita, categoria, stato)
    VALUES (?,?,?,?,?,?)`).run(
    t.titolo, t.descrizione || '', t.scadenza || null,
    t.priorita || 'MEDIA', t.categoria || '', t.stato || 'DA_FARE');
  res.json({ id: r.lastInsertRowid });
});

router.put('/todo/:id', (req, res) => {
  const t = req.body || {};
  const cur = db.prepare('SELECT * FROM todo WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Non trovata' });
  const completaOra = (t.stato === 'FATTA' && cur.stato !== 'FATTA');
  const reset = (t.stato && t.stato !== 'FATTA' && cur.stato === 'FATTA');
  db.prepare(`UPDATE todo SET
    titolo=?, descrizione=?, scadenza=?, priorita=?, categoria=?, stato=?, completata_at=?
    WHERE id=?`).run(
    t.titolo ?? cur.titolo, t.descrizione ?? cur.descrizione,
    t.scadenza !== undefined ? t.scadenza : cur.scadenza,
    t.priorita ?? cur.priorita, t.categoria ?? cur.categoria,
    t.stato ?? cur.stato,
    completaOra ? new Date().toISOString() : (reset ? null : cur.completata_at),
    req.params.id);
  res.json({ success: true });
});

router.delete('/todo/:id', (req, res) => {
  db.prepare('DELETE FROM todo WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Calendario aggregato ────────────────────────────────────────────────────
// Restituisce eventi normalizzati { id, source, titolo, inizio, fine?, colore, descrizione, route? }
// dove `source` ∈ APPUNTAMENTO | SCADENZA_FATTURA | SCADENZA_ACQUISTO | CRM | RICORRENTE | TODO
function calendario(dataDa, dataA) {
  const out = [];
  const fmtIso = (s) => s.length === 10 ? s + 'T00:00:00' : s;

  // 1) Appuntamenti
  db.prepare(`
    SELECT app.*, c.ragione_sociale c_nome, f.ragione_sociale f_nome
    FROM appuntamenti app
    LEFT JOIN clienti c ON c.id=app.cliente_id
    LEFT JOIN fornitori f ON f.id=app.fornitore_id
    WHERE app.inizio BETWEEN ? AND ? AND app.stato!='ANNULLATO'
  `).all(dataDa, dataA).forEach(r => {
    out.push({
      id: `app-${r.id}`, source: 'APPUNTAMENTO', sourceId: r.id,
      titolo: r.titolo, inizio: r.inizio, fine: r.fine || null,
      tuttoGiorno: r.tutto_giorno === 1, luogo: r.luogo || '',
      controparte: r.c_nome || r.f_nome || '',
      descrizione: r.descrizione || '',
      colore: r.colore || '#3b82f6',
      stato: r.stato,
      route: '/agenda',
    });
  });

  // 2) Scadenze fatture (calcolate da data_emissione + giorni_scadenza)
  db.prepare(`
    SELECT f.id, f.numero, f.data_emissione, c.ragione_sociale c_nome,
           date(f.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') AS scadenza,
           (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM fatture_righe WHERE fattura_id=f.id)
             - COALESCE((SELECT SUM(importo) FROM pagamenti WHERE fattura_id=f.id),0) AS residuo
    FROM fatture f
    LEFT JOIN clienti c ON c.id=f.cliente_id
    LEFT JOIN tipi_pagamento tp ON tp.id=f.tipo_pagamento_id
    WHERE f.stato='EMESSA'
  `).all().forEach(r => {
    if (r.residuo <= 0.01) return;
    const dt = fmtIso(r.scadenza);
    if (dt < dataDa || dt > dataA) return;
    out.push({
      id: `fat-${r.id}`, source: 'SCADENZA_FATTURA', sourceId: r.id,
      titolo: `Incasso fattura ${r.numero}`,
      inizio: dt, fine: null, tuttoGiorno: true,
      controparte: r.c_nome || '',
      descrizione: `Residuo: € ${r.residuo.toFixed(2)}`,
      colore: '#16a34a',
      route: '/scadenzario',
    });
  });

  // 3) Scadenze acquisti
  db.prepare(`
    SELECT a.id, a.numero, a.data_emissione, fo.ragione_sociale f_nome,
           date(a.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') AS scadenza,
           (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM acquisti_righe WHERE acquisto_id=a.id)
             - COALESCE((SELECT SUM(importo) FROM pagamenti WHERE acquisto_id=a.id),0) AS residuo
    FROM acquisti a
    LEFT JOIN fornitori fo ON fo.id=a.fornitore_id
    LEFT JOIN tipi_pagamento tp ON tp.id=a.tipo_pagamento_id
    WHERE a.stato NOT IN ('PAGATA','ANNULLATA','PAGATO','ANNULLATO')
  `).all().forEach(r => {
    if (r.residuo <= 0.01) return;
    const dt = fmtIso(r.scadenza);
    if (dt < dataDa || dt > dataA) return;
    out.push({
      id: `acq-${r.id}`, source: 'SCADENZA_ACQUISTO', sourceId: r.id,
      titolo: `Pagamento acquisto ${r.numero}`,
      inizio: dt, fine: null, tuttoGiorno: true,
      controparte: r.f_nome || '',
      descrizione: `Residuo: € ${r.residuo.toFixed(2)}`,
      colore: '#dc2626',
      route: '/scadenzario',
    });
  });

  // 4) Attività CRM
  try {
    db.prepare(`
      SELECT a.*, o.titolo AS opp_titolo
      FROM crm_attivita a
      LEFT JOIN crm_opportunita o ON o.id=a.opportunita_id
      WHERE a.data_pianificata IS NOT NULL
        AND a.data_pianificata BETWEEN ? AND ?
        AND a.completata=0
    `).all(dataDa, dataA).forEach(r => {
      out.push({
        id: `crm-${r.id}`, source: 'CRM', sourceId: r.id,
        titolo: `[${r.tipo}] ${r.titolo}`,
        inizio: r.data_pianificata, fine: null, tuttoGiorno: false,
        controparte: r.opp_titolo || '',
        descrizione: r.descrizione || '',
        colore: '#8b5cf6',
        route: '/crm',
      });
    });
  } catch(_) {}

  // 5) Fatture ricorrenti dovute
  try {
    db.prepare(`
      SELECT fr.*, c.ragione_sociale c_nome
      FROM fatture_ricorrenti fr
      LEFT JOIN clienti c ON c.id=fr.cliente_id
      WHERE fr.attiva=1 AND fr.prossima_emissione BETWEEN ? AND ?
    `).all(dataDa, dataA).forEach(r => {
      out.push({
        id: `ric-${r.id}`, source: 'RICORRENTE', sourceId: r.id,
        titolo: `Fattura ricorrente: ${r.descrizione}`,
        inizio: fmtIso(r.prossima_emissione), fine: null, tuttoGiorno: true,
        controparte: r.c_nome || '',
        descrizione: `Frequenza: ${r.frequenza}`,
        colore: '#f59e0b',
        route: '/fatture-ricorrenti',
      });
    });
  } catch(_) {}

  // 6) Todo con scadenza
  try {
    db.prepare(`SELECT * FROM todo WHERE scadenza IS NOT NULL AND stato!='FATTA'`).all().forEach(r => {
      const dt = fmtIso(r.scadenza);
      if (dt < dataDa || dt > dataA) return;
      const colorByPri = { ALTA: '#dc2626', MEDIA: '#f59e0b', BASSA: '#94a3b8' };
      out.push({
        id: `todo-${r.id}`, source: 'TODO', sourceId: r.id,
        titolo: `📋 ${r.titolo}`,
        inizio: dt, fine: null, tuttoGiorno: false,
        controparte: r.categoria || '',
        descrizione: r.descrizione || '',
        colore: colorByPri[r.priorita] || '#94a3b8',
        route: '/agenda',
      });
    });
  } catch(_) {}

  return out.sort((a, b) => a.inizio.localeCompare(b.inizio));
}

router.get('/calendario', (req, res) => {
  const da = req.query.dataDa || new Date(new Date().setDate(1)).toISOString().slice(0, 10) + 'T00:00:00';
  const a  = req.query.dataA  || new Date(new Date().setMonth(new Date().getMonth() + 1, 0)).toISOString().slice(0, 10) + 'T23:59:59';
  res.json(calendario(da, a));
});

// GET /api/agenda/imminenti?giorni=7 — eventi prossimi N giorni (per dashboard)
router.get('/imminenti', (req, res) => {
  const giorni = Math.min(Math.max(parseInt(String(req.query.giorni || '7'), 10), 1), 60);
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const fine = new Date(oggi); fine.setDate(fine.getDate() + giorni);
  const da = oggi.toISOString().slice(0, 19);
  const a  = fine.toISOString().slice(0, 19);
  const eventi = calendario(da, a).slice(0, 30);
  res.json({ da, a, eventi });
});

// ── ICS export ─────────────────────────────────────────────────────────────
function escIcs(s) {
  return String(s ?? '')
    .replace(/[\\;,]/g, m => '\\' + m)
    .replace(/\n/g, '\\n');
}
function toIcsDate(iso, allDay = false) {
  // ISO: 2026-05-26T15:30:00 → 20260526T153000Z (semplificato, in UTC se include 'Z')
  const cleaned = iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
  if (allDay) return cleaned.slice(0, 8);
  return cleaned.length === 8 ? cleaned + 'T000000' : cleaned;
}

/** Genera la stringa ICS per gli eventi nel range. */
function buildIcs(eventi, calName = 'Invoxa Agenda') {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Invoxa//Agenda//IT',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escIcs(calName)}`,
    'X-WR-TIMEZONE:Europe/Rome',
  ];
  for (const e of eventi) {
    const isAllDay = e.tuttoGiorno || !e.inizio.includes('T');
    const dtstart = isAllDay ? `;VALUE=DATE:${toIcsDate(e.inizio, true)}` : `:${toIcsDate(e.inizio)}`;
    const dtend = e.fine
      ? (isAllDay ? `;VALUE=DATE:${toIcsDate(e.fine, true)}` : `:${toIcsDate(e.fine)}`)
      : null;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@invoxa`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART${dtstart}`);
    if (dtend) lines.push(`DTEND${dtend}`);
    lines.push(`SUMMARY:${escIcs(e.titolo)}`);
    if (e.luogo)        lines.push(`LOCATION:${escIcs(e.luogo)}`);
    const desc = [e.descrizione, e.controparte && `Controparte: ${e.controparte}`].filter(Boolean).join('\\n');
    if (desc)           lines.push(`DESCRIPTION:${escIcs(desc).replace(/\\n/g, '\\n')}`);
    lines.push(`CATEGORIES:${e.source}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

router.get('/export.ics', (req, res) => {
  const today = new Date(); today.setMonth(today.getMonth() - 3);
  const future = new Date(); future.setMonth(future.getMonth() + 12);
  const da = req.query.dataDa || today.toISOString().slice(0, 19);
  const a  = req.query.dataA  || future.toISOString().slice(0, 19);
  const eventi = calendario(da, a);
  const ics = buildIcs(eventi);
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="invoxa-agenda.ics"');
  res.send(ics);
});

// GET /api/agenda/feed-url — restituisce l'URL signed del feed pubblico per il tenant corrente
router.get('/feed-url', (req, res) => {
  try {
    const token = feedTokenFor(req.tenant);
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const httpsUrl = `${proto}://${host}/api/agenda/feed.ics?tenant=${encodeURIComponent(req.tenant)}&token=${token}`;
    const webcalUrl = httpsUrl.replace(/^https?:/, 'webcal:');
    res.json({ httpsUrl, webcalUrl, tenant: req.tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Esposto come handler standalone, registrato in server.js PRIMA del middleware
// di autenticazione, perché Google Calendar e altri client non possono inviare Bearer.
// Sicurezza: HMAC del tenant_slug con AUTH_SECRET — non guessable.
function publicFeedHandler(req, res) {
  const tenant = String(req.query.tenant || '');
  const token  = String(req.query.token  || '');
  if (!verifyFeedToken(tenant, token)) return res.status(403).send('Forbidden');

  // ALS non è attivo qui (siamo pre-auth). Apriamo direttamente il tenant DB e
  // facciamo runWithContext per il calendario() che usa il proxy db.
  const { openTenantDb } = require('../utils/tenantDb');
  const { runWithContext } = require('../utils/tenantContext');
  try {
    openTenantDb(tenant); // verifica che esista
  } catch (err) {
    return res.status(404).send('Tenant non trovato');
  }

  runWithContext({ tenant, user: null }, () => {
    try {
      const today = new Date(); today.setMonth(today.getMonth() - 3);
      const future = new Date(); future.setMonth(future.getMonth() + 12);
      const da = today.toISOString().slice(0, 19);
      const a  = future.toISOString().slice(0, 19);
      const eventi = calendario(da, a);
      const ics = buildIcs(eventi, `Invoxa Agenda (${tenant})`);
      res.set('Content-Type', 'text/calendar; charset=utf-8');
      // Cache breve: client come Google ricaricano ogni alcune ore comunque
      res.set('Cache-Control', 'public, max-age=300');
      res.send(ics);
    } catch (err) {
      res.status(500).send('Errore generazione ICS: ' + err.message);
    }
  });
}

module.exports = router;
module.exports.publicFeedHandler = publicFeedHandler;

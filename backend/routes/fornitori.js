const express = require('express');
const router = express.Router();
const db = require('../database');
const { applicaGemelloDaFornitore, scollegaGemelloFornitore } = require('../utils/anagraficaGemello');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM fornitori ORDER BY ragione_sociale').all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/check-piva', (req, res) => {
  const { piva, excludeId } = req.query;
  if (!piva) return res.json({ exists: false });
  const clean = normalizePiva(String(piva));
  if (!/^\d{11}$/.test(clean)) return res.json({ exists: false });
  const row = excludeId
    ? db.prepare('SELECT id FROM fornitori WHERE (p_iva=? OR p_iva=?) AND id!=?').get(clean, 'IT' + clean, Number(excludeId))
    : db.prepare('SELECT id FROM fornitori WHERE p_iva=? OR p_iva=?').get(clean, 'IT' + clean);
  res.json({ exists: !!row, id: row?.id });
});

router.post('/', (req, res) => {
  const f = req.body;
  if (!f.ragioneSociale?.trim()) return res.status(400).json({ error: 'La ragione sociale è obbligatoria' });
  const piva = normalizePiva(f.pIva);
  if (piva) {
    const esiste = db.prepare('SELECT id FROM fornitori WHERE p_iva=? OR p_iva=?').get(piva, 'IT' + piva);
    if (esiste) return res.status(409).json({ error: `Esiste già un fornitore con la P.IVA ${piva}`, duplicateId: esiste.id });
  }
  const result = db.prepare(`INSERT INTO fornitori
    (ragione_sociale, email, telefono, cellulare, via, cap, citta, provincia, stato, p_iva, sdi, pec, estero, anche_cliente)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(f.ragioneSociale, f.email, f.telefono, f.cellulare || '', f.via, f.cap, f.citta, f.provincia, f.stato, piva, f.sdi || '', f.pec || '', f.estero ? 1 : 0, f.ancheCliente ? 1 : 0);
  applicaGemelloDaFornitore(result.lastInsertRowid);
  res.json({ id: result.lastInsertRowid });
});

router.post('/import', (req, res) => {
  const records = Array.isArray(req.body) ? req.body : [];
  let created = 0, updated = 0, skipped = 0;
  for (const f of records) {
    if (!f.ragioneSociale?.trim()) { skipped++; continue; }
    const piva = normalizePiva(f.pIva);
    let existing = null;
    if (piva && /^\d{11}$/.test(piva))
      existing = db.prepare('SELECT * FROM fornitori WHERE p_iva=? OR p_iva=?').get(piva, 'IT'+piva);
    if (!existing)
      existing = db.prepare('SELECT * FROM fornitori WHERE LOWER(TRIM(ragione_sociale))=?').get(f.ragioneSociale.toLowerCase().trim());
    if (existing) {
      const patch = {};
      if (!existing.email && f.email)         patch.email = f.email;
      if (!existing.telefono && f.telefono)   patch.telefono = f.telefono;
      if (!existing.cellulare && f.cellulare) patch.cellulare = f.cellulare;
      if (!existing.via && f.via)             patch.via = f.via;
      if (!existing.cap && f.cap)             patch.cap = f.cap;
      if (!existing.citta && f.citta)         patch.citta = f.citta;
      if (!existing.provincia && f.provincia) patch.provincia = f.provincia;
      if (!existing.p_iva && piva)            patch.p_iva = piva;
      if (!existing.sdi && f.sdi)             patch.sdi = f.sdi;
      if (!existing.pec && f.pec)             patch.pec = f.pec;
      if (Object.keys(patch).length > 0) {
        const sets = Object.keys(patch).map(k => `${k}=?`).join(', ');
        db.prepare(`UPDATE fornitori SET ${sets} WHERE id=?`).run(...Object.values(patch), existing.id);
        updated++;
      } else { skipped++; }
    } else {
      db.prepare(`INSERT INTO fornitori (ragione_sociale,email,telefono,cellulare,via,cap,citta,provincia,stato,p_iva,sdi,pec) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(f.ragioneSociale.trim(), f.email||'', f.telefono||'', f.cellulare||'', f.via||'', f.cap||'', f.citta||'', f.provincia||'', f.stato||'Italia', piva||'', f.sdi||'', f.pec||'');
      created++;
    }
  }
  res.json({ created, updated, skipped });
});

// GET /api/fornitori/:id — dettaglio singolo fornitore
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID non valido' });
  const row = db.prepare('SELECT * FROM fornitori WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Fornitore non trovato' });
  res.json(toDto(row));
});

router.put('/:id', (req, res) => {
  const f = req.body;
  if (!f.ragioneSociale?.trim()) return res.status(400).json({ error: 'La ragione sociale è obbligatoria' });
  const piva = normalizePiva(f.pIva);
  if (piva) {
    const esiste = db.prepare('SELECT id FROM fornitori WHERE (p_iva=? OR p_iva=?) AND id!=?').get(piva, 'IT' + piva, req.params.id);
    if (esiste) return res.status(409).json({ error: `Esiste già un altro fornitore con la P.IVA ${piva}`, duplicateId: esiste.id });
  }
  db.prepare(`UPDATE fornitori SET ragione_sociale=?, email=?, telefono=?, cellulare=?, via=?, cap=?,
    citta=?, provincia=?, stato=?, p_iva=?, sdi=?, pec=?, estero=?, anche_cliente=? WHERE id=?`)
    .run(f.ragioneSociale, f.email, f.telefono, f.cellulare || '', f.via, f.cap, f.citta, f.provincia, f.stato, piva, f.sdi || '', f.pec || '', f.estero ? 1 : 0, f.ancheCliente ? 1 : 0, req.params.id);
  applicaGemelloDaFornitore(Number(req.params.id));
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  scollegaGemelloFornitore(Number(req.params.id));
  db.prepare('DELETE FROM fornitori WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function normalizePiva(piva) {
  if (!piva) return piva;
  let v = String(piva).replace(/\s/g, '').toUpperCase();
  if (v.startsWith('IT')) v = v.slice(2);
  return v;
}

function toDto(r) {
  return {
    id: r.id, ragioneSociale: r.ragione_sociale, email: r.email, telefono: r.telefono, cellulare: r.cellulare,
    via: r.via, cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato, pIva: r.p_iva, sdi: r.sdi, pec: r.pec,
    estero: r.estero === 1,
    ancheCliente: r.anche_cliente === 1,
    clienteCollegatoId: r.cliente_collegato_id || null,
  };
}

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, c.ragione_sociale as cliente_nome,
           f.id as fattura_id, f.numero as fattura_numero
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    LEFT JOIN fatture f ON f.ddt_id = d.id
    ORDER BY d.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, c.ragione_sociale as cliente_nome
    FROM ddt d LEFT JOIN clienti c ON d.cliente_id = c.id
    WHERE d.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const d = req.body;
  const result = db.prepare(`
    INSERT INTO ddt (numero, data_emissione, cliente_id, causale, note, stato,
      data_ora_inizio_trasporto, aspetto_beni, porto, numero_colli, peso_lordo,
      incaricato_trasporto, vettore, destinazione_diversa, note_trasporto)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      d.numero, d.dataEmissione, d.clienteId || null,
      d.causaleTrasporto || '', d.note || '', d.stato || 'BOZZA',
      d.dataOraInizioTrasporto || '', d.aspettoBeni || '',
      d.porto || 'Franco', d.numeroColli || 0, d.pesoLordo || 0,
      d.incaricatoTrasporto || 'Mittente', d.vettore || '',
      d.destinazioneDiversa || '', d.noteTrasporto || ''
    );
  if (d.righe?.length) {
    saveRighe(result.lastInsertRowid, d.righe);
    aggiornaQuantita(d.righe, -1);
  }
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const d = req.body;
  const vecchieRighe = getRighe(req.params.id);
  if (vecchieRighe.length) aggiornaQuantita(vecchieRighe, +1);
  db.prepare(`
    UPDATE ddt SET numero=?, data_emissione=?, cliente_id=?, causale=?, note=?, stato=?,
      data_ora_inizio_trasporto=?, aspetto_beni=?, porto=?, numero_colli=?, peso_lordo=?,
      incaricato_trasporto=?, vettore=?, destinazione_diversa=?, note_trasporto=?
    WHERE id=?`)
    .run(
      d.numero, d.dataEmissione, d.clienteId || null,
      d.causaleTrasporto || '', d.note || '', d.stato,
      d.dataOraInizioTrasporto || '', d.aspettoBeni || '',
      d.porto || 'Franco', d.numeroColli || 0, d.pesoLordo || 0,
      d.incaricatoTrasporto || 'Mittente', d.vettore || '',
      d.destinazioneDiversa || '', d.noteTrasporto || '',
      req.params.id
    );
  db.prepare('DELETE FROM ddt_righe WHERE ddt_id=?').run(req.params.id);
  if (d.righe?.length) {
    saveRighe(req.params.id, d.righe);
    aggiornaQuantita(d.righe, -1);
  }
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const stato = db.prepare('SELECT stato FROM ddt WHERE id=?').get(req.params.id)?.stato;
  if (stato !== 'ANNULLATO') {
    const righe = getRighe(req.params.id);
    if (righe.length) aggiornaQuantita(righe, +1);
  }
  db.prepare('UPDATE fatture SET ddt_id = NULL WHERE ddt_id=?').run(req.params.id);
  db.prepare('DELETE FROM fatture_ddt WHERE ddt_id=?').run(req.params.id);
  db.prepare('DELETE FROM ddt_righe WHERE ddt_id=?').run(req.params.id);
  db.prepare('DELETE FROM ddt WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function aggiornaQuantita(righe, delta) {
  const stmt = db.prepare('UPDATE prodotti SET quantita = quantita + ? WHERE id = ?');
  for (const r of righe) {
    if (r.prodottoId) stmt.run(delta * r.quantita, r.prodottoId);
  }
}

function saveRighe(ddtId, righe) {
  const stmt = db.prepare(`INSERT INTO ddt_righe (ddt_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const r of righe) stmt.run(ddtId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo, r.sconto ?? 0, r.iva, r.unitaMisura || '');
}

function getRighe(ddtId) {
  const rows = db.prepare(`SELECT dr.*, p.nome as prodotto_nome
    FROM ddt_righe dr LEFT JOIN prodotti p ON dr.prodotto_id = p.id
    WHERE dr.ddt_id=?`).all(ddtId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva
  }));
}

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
           c.citta as c_citta, c.provincia as c_provincia, c.stato as c_stato,
           c.p_iva as c_p_iva, c.codice_fiscale as c_cod_fiscale,
           c.email as c_email, c.telefono as c_telefono
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    WHERE d.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  dto.cliente = {
    ragioneSociale: row.c_nome, via: row.c_via, cap: row.c_cap,
    citta: row.c_citta, provincia: row.c_provincia, stato: row.c_stato,
    pIva: row.c_p_iva, codFiscale: row.c_cod_fiscale,
    email: row.c_email, telefono: row.c_telefono,
  };
  res.json(dto);
});

router.patch('/:id/stato', (req, res) => {
  const { stato } = req.body;
  const vecchio = db.prepare('SELECT stato FROM ddt WHERE id=?').get(req.params.id);
  if (stato === 'ANNULLATO' && vecchio?.stato !== 'ANNULLATO') {
    aggiornaQuantita(getRighe(req.params.id), +1);
  } else if (vecchio?.stato === 'ANNULLATO' && stato !== 'ANNULLATO') {
    aggiornaQuantita(getRighe(req.params.id), -1);
  }
  db.prepare('UPDATE ddt SET stato=? WHERE id=?').run(stato, req.params.id);
  res.json({ success: true });
});

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM ddt_righe WHERE ddt_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM ddt_righe WHERE ddt_id=?`).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    causaleTrasporto: r.causale || '',
    note: r.note, stato: r.stato,
    fatturaId: r.fattura_id || null, fatturaNumero: r.fattura_numero || null,
    totale, imponibile,
    dataOraInizioTrasporto: r.data_ora_inizio_trasporto || '',
    aspettoBeni: r.aspetto_beni || '',
    porto: r.porto || 'Franco',
    numeroColli: r.numero_colli || 0,
    pesoLordo: r.peso_lordo || 0,
    incaricatoTrasporto: r.incaricato_trasporto || 'Mittente',
    vettore: r.vettore || '',
    destinazioneDiversa: r.destinazione_diversa || '',
    noteTrasporto: r.note_trasporto || '',
  };
}

module.exports = router;

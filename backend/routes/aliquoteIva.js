const express = require('express');
const router = express.Router();
const db = require('../database');

function toDto(r) {
  return {
    id: r.id,
    nome: r.nome,
    valore: r.valore,
    codice: r.codice || '',
    categoria: r.categoria || '',
    descrizione: r.descrizione || '',
    natura: r.natura || null,
    note: r.note || '',
    predefinito: r.predefinito === 1,
    attiva: r.attiva === 1,
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM aliquote_iva ORDER BY
    CASE categoria
      WHEN 'Imponibile' THEN 1
      WHEN 'Acq. reverse charge' THEN 2
      WHEN 'Split payment' THEN 3
      WHEN 'N1: Escluso art. 15' THEN 4
      WHEN 'N2.1' THEN 5 WHEN 'N2.2' THEN 6
      WHEN 'N3.1' THEN 7 WHEN 'N3.2' THEN 8 WHEN 'N3.3' THEN 9 WHEN 'N3.4' THEN 10 WHEN 'N3.5' THEN 11
      WHEN 'N4: Esente' THEN 12
      WHEN 'N5: Regime del margine' THEN 13
      WHEN 'N6' THEN 14 WHEN 'N6.1' THEN 15 WHEN 'N6.3' THEN 16 WHEN 'N6.4' THEN 17
      WHEN 'N6.5' THEN 18 WHEN 'N6.6' THEN 19 WHEN 'N6.7' THEN 20
      ELSE 99
    END, valore DESC, codice`).all();
  res.json(rows.map(toDto));
});

router.post('/', (req, res) => {
  const { nome, valore, codice, categoria, descrizione, natura, note, predefinito, attiva } = req.body;
  const result = db.prepare(`INSERT INTO aliquote_iva
    (nome, valore, codice, categoria, descrizione, natura, note, predefinito, attiva)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(nome?.trim(), valore, codice||'', categoria||'', descrizione||'',
         natura||null, note||'', predefinito?1:0, attiva?1:0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nome, valore, codice, categoria, descrizione, natura, note, predefinito, attiva } = req.body;
  db.prepare(`UPDATE aliquote_iva SET nome=?, valore=?, codice=?, categoria=?, descrizione=?,
    natura=?, note=?, predefinito=?, attiva=? WHERE id=?`)
    .run(nome?.trim(), valore, codice||'', categoria||'', descrizione||'',
         natura||null, note||'', predefinito?1:0, attiva?1:0, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM aliquote_iva WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

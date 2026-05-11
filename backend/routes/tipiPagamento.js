const express = require('express');
const router = express.Router();
const db = require('../database');

function toDto(r) {
  return {
    id: r.id, nome: r.nome, conto: r.conto,
    giorniScadenza: r.giorni_scadenza, fineMese: r.fine_mese === 1,
    immediato: r.immediato === 1, attivo: r.attivo === 1
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM tipi_pagamento ORDER BY id').all();
  res.json(rows.map(toDto));
});

router.post('/', (req, res) => {
  const t = req.body;
  const result = db.prepare(`INSERT INTO tipi_pagamento (nome,conto,giorni_scadenza,fine_mese,immediato,attivo)
    VALUES (?,?,?,?,?,?)`)
    .run(t.nome, t.conto ?? 'BANCA', t.giorniScadenza ?? 0, t.fineMese ? 1 : 0, t.immediato ? 1 : 0, t.attivo !== false ? 1 : 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const t = req.body;
  db.prepare(`UPDATE tipi_pagamento SET nome=?,conto=?,giorni_scadenza=?,fine_mese=?,immediato=?,attivo=? WHERE id=?`)
    .run(t.nome, t.conto ?? 'BANCA', t.giorniScadenza ?? 0, t.fineMese ? 1 : 0, t.immediato ? 1 : 0, t.attivo !== false ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tipi_pagamento WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const row = db.prepare('SELECT * FROM azienda WHERE id = 1').get();
  res.json(row ? toDto(row) : {});
});

router.put('/', (req, res) => {
  const a = req.body;
  db.prepare(`UPDATE azienda SET ragione_sociale=?, indirizzo=?, cap=?, citta=?, provincia=?, stato=?,
    p_iva=?, cod_fiscale=?, email=?, telefono=?, pec=?, sdi=?, banca=?, iban=?, logo=? WHERE id=1`)
    .run(a.ragioneSociale, a.indirizzo, a.cap, a.citta, a.provincia, a.stato,
         a.pIva, a.codFiscale, a.email, a.telefono, a.pec, a.sdi, a.banca, a.iban, a.logo || '');
  res.json({ success: true });
});

function toDto(r) {
  return {
    id: r.id, ragioneSociale: r.ragione_sociale, indirizzo: r.indirizzo,
    cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato,
    pIva: r.p_iva, codFiscale: r.cod_fiscale,
    email: r.email, telefono: r.telefono, pec: r.pec, sdi: r.sdi,
    banca: r.banca, iban: r.iban, logo: r.logo || '',
  };
}

module.exports = router;

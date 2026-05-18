const express = require('express');
const router = express.Router();

// Lookup P.IVA italiana via VIES (EU VAT validation service)
// Restituisce nome, via, cap, citta, provincia quando disponibili
router.get('/:piva', async (req, res) => {
  let piva = req.params.piva.replace(/\s/g, '').toUpperCase();
  // Rimuovi il prefisso IT se presente
  if (piva.startsWith('IT')) piva = piva.slice(2);
  if (!/^\d{11}$/.test(piva))
    return res.status(400).json({ error: 'P.IVA non valida: deve essere di 11 cifre' });

  try {
    const response = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ countryCode: 'IT', vatNumber: piva }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok)
      return res.status(502).json({ error: 'Servizio VIES non raggiungibile' });

    const data = await response.json();

    if (!data.valid && !data.isValid)
      return res.status(404).json({ error: 'P.IVA non trovata nel registro VIES' });

    const result = {
      pIva: piva,
      ragioneSociale: data.name ? cleanName(data.name) : null,
      via: null, cap: null, citta: null, provincia: null, stato: 'Italia',
    };

    if (data.address && data.address !== '---') {
      parseAddress(data.address, result);
    }

    res.json(result);
  } catch (err) {
    if (err.name === 'TimeoutError')
      return res.status(504).json({ error: 'Timeout: servizio VIES non risponde' });
    console.error('VIES error:', err.message);
    res.status(502).json({ error: 'Errore nella comunicazione con VIES' });
  }
});

function cleanName(name) {
  // VIES restituisce a volte "---" o nomi in caps
  if (!name || name.trim() === '---') return null;
  return name.trim();
}

// Esempio indirizzo VIES IT:
// "VIA ROMA 10\n20100 MILANO MI\nITALY" oppure
// "VIA EXAMPLE 1 CITY MI 12345"
function parseAddress(raw, result) {
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length >= 2) {
    // Riga 1 = via
    result.via = lines[0];

    // Riga 2 = CAP CITTA PROV o CITTA PROV CAP
    const line2 = lines[1].replace(/^ITALY$|^ITALIA$/, '').trim();

    // Pattern: 5 cifre NOME SIGLA
    const m1 = line2.match(/^(\d{5})\s+(.+?)\s+([A-Z]{2})$/);
    if (m1) {
      result.cap = m1[1];
      result.citta = titleCase(m1[2]);
      result.provincia = m1[3];
      return;
    }
    // Pattern: NOME SIGLA 5 cifre
    const m2 = line2.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5})$/);
    if (m2) {
      result.citta = titleCase(m2[1]);
      result.provincia = m2[2];
      result.cap = m2[3];
      return;
    }
    // Pattern: NOME (SIGLA)
    const m3 = line2.match(/^(.+?)\s+\(([A-Z]{2})\)$/);
    if (m3) {
      result.citta = titleCase(m3[1]);
      result.provincia = m3[2];
    }
  } else if (lines.length === 1) {
    result.via = lines[0];
  }
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = router;

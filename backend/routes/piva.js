const express = require('express');
const router = express.Router();

router.get('/search-name', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const openapiKey = process.env.OPENAPI_IT_KEY;
  if (!openapiKey) return res.json([]);

  const endpoints = [
    `https://imprese.openapi.it/ricerca?denominazione=${encodeURIComponent(q)}&dimensione=10`,
    `https://imprese.openapi.it/ricerca?q=${encodeURIComponent(q)}&size=10`,
    `https://imprese.openapi.it/search?q=${encodeURIComponent(q)}&limit=10`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${openapiKey}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const items = data.data || data.items || data.results || (Array.isArray(data) ? data : []);
        if (Array.isArray(items) && items.length > 0) {
          return res.json(items.map(d => ({
            ragioneSociale: cleanName(d.ragione_sociale || d.denominazione || d.nome),
            pIva: (d.codice_fiscale || d.partita_iva || d.p_iva || d.piva || '').replace(/\s/g, ''),
            via:       cleanVia(d.sede_legale?.indirizzo || d.indirizzo || null),
            cap:       d.sede_legale?.cap || d.cap || null,
            citta:     titleCase(d.sede_legale?.comune || d.comune || null),
            provincia: (d.sede_legale?.provincia || d.provincia || '').slice(0, 2).toUpperCase() || null,
            stato: 'Italia',
          })).filter(r => r.ragioneSociale));
        }
      }
    } catch (_) {}
  }
  return res.json([]);
});

router.get('/:piva', async (req, res) => {
  let piva = req.params.piva.replace(/\s/g, '').toUpperCase();
  if (piva.startsWith('IT')) piva = piva.slice(2);
  if (!/^\d{11}$/.test(piva))
    return res.status(400).json({ error: 'P.IVA non valida: deve essere di 11 cifre' });

  // 1. Prova openapi.it (CCIAA - copre tutte le aziende italiane)
  const openapiKey = process.env.OPENAPI_IT_KEY;
  if (openapiKey) {
    try {
      const resp = await fetch(`https://imprese.openapi.it/base/${piva}`, {
        headers: { 'Authorization': `Bearer ${openapiKey}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.success !== false && data) {
          const d = data.data || data;
          const sede = d.sede_legale || d.sede || d.indirizzo_sede || {};
          return res.json({
            pIva: piva,
            ragioneSociale: cleanName(d.ragione_sociale || d.denominazione || d.nome),
            via:       cleanVia(sede.indirizzo || sede.via || sede.toponomastico && `${sede.toponomastico} ${sede.via || ''} ${sede.civico || ''}`.trim() || null),
            cap:       sede.cap || sede.codice_postale || null,
            citta:     titleCase(sede.comune || sede.citta || null),
            provincia: (sede.provincia || sede.sigla_provincia || '').slice(0, 2).toUpperCase() || null,
            stato:     'Italia',
          });
        }
      }
    } catch (_) { /* fallback a VIES */ }
  }

  // 2. Fallback: VIES (solo aziende registrate per IVA intracomunitaria)
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
      return res.status(404).json({ error: 'P.IVA non trovata. Per la copertura completa configura OPENAPI_IT_KEY nel file .env (openapi.it - gratuito)' });

    const result = {
      pIva: piva,
      ragioneSociale: data.name ? cleanName(data.name) : null,
      via: null, cap: null, citta: null, provincia: null, stato: 'Italia',
    };

    if (data.address && data.address !== '---') {
      parseViesAddress(data.address, result);
    }

    res.json(result);
  } catch (err) {
    if (err.name === 'TimeoutError')
      return res.status(504).json({ error: 'Timeout: servizi di lookup non rispondono' });
    console.error('P.IVA lookup error:', err.message);
    res.status(502).json({ error: 'Errore nella comunicazione con i servizi di lookup' });
  }
});

function cleanName(name) {
  if (!name || name.trim() === '---') return null;
  return name.trim();
}

function cleanVia(via) {
  if (!via || via.trim() === '---') return null;
  return titleCase(via.trim());
}

function parseViesAddress(raw, result) {
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    result.via = titleCase(lines[0]);
    const line2 = lines[1].replace(/^ITALY$|^ITALIA$/i, '').trim();
    const m1 = line2.match(/^(\d{5})\s+(.+?)\s+([A-Z]{2})$/);
    if (m1) { result.cap = m1[1]; result.citta = titleCase(m1[2]); result.provincia = m1[3]; return; }
    const m2 = line2.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5})$/);
    if (m2) { result.citta = titleCase(m2[1]); result.provincia = m2[2]; result.cap = m2[3]; return; }
    const m3 = line2.match(/^(.+?)\s+\(([A-Z]{2})\)$/);
    if (m3) { result.citta = titleCase(m3[1]); result.provincia = m3[2]; }
  } else if (lines.length === 1) {
    result.via = titleCase(lines[0]);
  }
}

function titleCase(s) {
  if (!s) return null;
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = router;

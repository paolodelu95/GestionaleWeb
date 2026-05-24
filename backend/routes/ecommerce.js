// Sync e-commerce (WooCommerce / Shopify) — scaffold.
//
// Fornisce solo configurazione e endpoint stub. La logica di sync vera
// (push prodotti, pull ordini, mapping clienti) richiede chiamate REST
// autenticate al provider; per attivare:
//
//   WooCommerce → API REST: GET/POST https://<sito>/wp-json/wc/v3/...
//     auth: Basic con consumer_key:consumer_secret
//
//   Shopify → API REST: https://<store>.myshopify.com/admin/api/2024-10/...
//     auth: header "X-Shopify-Access-Token: <token>"

const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/configs', (req, res) => {
  const rows = db.prepare('SELECT * FROM ecommerce_config ORDER BY id').all();
  res.json(rows.map(r => ({
    id: r.id, provider: r.provider, nome: r.nome, baseUrl: r.base_url,
    apiKey: r.api_key ? '***' : '', // non esporre chiavi
    apiSecret: r.api_secret ? '***' : '',
    attivo: r.attivo === 1, lastSync: r.last_sync, createdAt: r.created_at,
  })));
});

router.post('/configs', (req, res) => {
  const c = req.body || {};
  if (!c.provider || !c.nome || !c.baseUrl) return res.status(400).json({ error: 'provider, nome, baseUrl obbligatori' });
  const r = db.prepare(`INSERT INTO ecommerce_config
    (provider, nome, base_url, api_key, api_secret, attivo) VALUES (?,?,?,?,?,?)`).run(
    c.provider, c.nome, c.baseUrl, c.apiKey || '', c.apiSecret || '', c.attivo === false ? 0 : 1);
  res.json({ id: r.lastInsertRowid });
});

router.put('/configs/:id', (req, res) => {
  const c = req.body || {};
  const cur = db.prepare('SELECT * FROM ecommerce_config WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Configurazione non trovata' });
  db.prepare(`UPDATE ecommerce_config SET nome=?, base_url=?, api_key=?, api_secret=?, attivo=? WHERE id=?`)
    .run(c.nome ?? cur.nome, c.baseUrl ?? cur.base_url,
         (c.apiKey && c.apiKey !== '***') ? c.apiKey : cur.api_key,
         (c.apiSecret && c.apiSecret !== '***') ? c.apiSecret : cur.api_secret,
         c.attivo === false ? 0 : 1, req.params.id);
  res.json({ success: true });
});

router.delete('/configs/:id', (req, res) => {
  db.prepare('DELETE FROM ecommerce_config WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// POST /configs/:id/sync-prodotti — push prodotti locali verso il provider
router.post('/configs/:id/sync-prodotti', (req, res) => {
  res.status(501).json({
    error: 'Sync prodotti non ancora implementata',
    hint: 'Richiede integrazione REST API verso WooCommerce/Shopify. Vedere routes/ecommerce.js per dettagli.',
  });
});

// POST /configs/:id/pull-ordini — importa nuovi ordini dal provider come DDT/fatture
router.post('/configs/:id/pull-ordini', (req, res) => {
  res.status(501).json({
    error: 'Pull ordini non ancora implementato',
    hint: 'Richiede integrazione REST API verso WooCommerce/Shopify. Vedere routes/ecommerce.js per dettagli.',
  });
});

module.exports = router;

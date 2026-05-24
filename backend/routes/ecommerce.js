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
const { pushProdotti, pullOrdini } = require('../utils/ecommerceClients');

router.post('/configs/:id/sync-prodotti', async (req, res) => {
  const cfg = db.prepare('SELECT * FROM ecommerce_config WHERE id=? AND attivo=1').get(req.params.id);
  if (!cfg) return res.status(404).json({ error: 'Configurazione non trovata o disattivata' });
  if (!cfg.api_secret) return res.status(400).json({ error: 'API key/secret mancanti nella configurazione' });

  // Selezione prodotti: tutti, o solo gli `ids` passati nel body
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  const prodotti = ids
    ? db.prepare(`SELECT * FROM prodotti WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare('SELECT * FROM prodotti').all();

  try {
    const r = await pushProdotti(cfg, prodotti, db);
    db.prepare(`UPDATE ecommerce_config SET last_sync=datetime('now') WHERE id=?`).run(cfg.id);
    res.json({ ...r, totali: prodotti.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/configs/:id/pull-ordini', async (req, res) => {
  const cfg = db.prepare('SELECT * FROM ecommerce_config WHERE id=? AND attivo=1').get(req.params.id);
  if (!cfg) return res.status(404).json({ error: 'Configurazione non trovata o disattivata' });
  if (!cfg.api_secret) return res.status(400).json({ error: 'API key/secret mancanti nella configurazione' });

  const since = req.body?.since || cfg.last_sync || null;
  try {
    const r = await pullOrdini(cfg, since, db);
    db.prepare(`UPDATE ecommerce_config SET last_sync=datetime('now') WHERE id=?`).run(cfg.id);
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

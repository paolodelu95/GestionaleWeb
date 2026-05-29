// Client REST minimali per WooCommerce e Shopify.
//
// WooCommerce REST API v3:
//   - Base URL: https://<sito>/wp-json/wc/v3
//   - Auth: Basic con consumer_key:consumer_secret
//   - Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
//
// Shopify Admin REST API:
//   - Base URL: https://<shop>.myshopify.com/admin/api/2024-10
//   - Auth: header X-Shopify-Access-Token: <token>
//   - Docs: https://shopify.dev/docs/api/admin-rest

function authHeader(provider, key, secret) {
  if (provider === 'WOOCOMMERCE') {
    const token = Buffer.from(`${key}:${secret}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  // Shopify usa solo l'access token (key non usata)
  return { 'X-Shopify-Access-Token': secret };
}

function endpointBase(provider, baseUrl) {
  if (provider === 'WOOCOMMERCE') {
    return baseUrl.replace(/\/$/, '') + '/wp-json/wc/v3';
  }
  // Shopify: baseUrl atteso = "https://shop.myshopify.com"
  return baseUrl.replace(/\/$/, '') + '/admin/api/2024-10';
}

async function call(provider, baseUrl, key, secret, path, opts = {}) {
  const url = endpointBase(provider, baseUrl) + path;
  const headers = { 'Content-Type': 'application/json', ...authHeader(provider, key, secret) };
  const r = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { _raw: text }; }
  if (!r.ok) throw new Error(`${provider} ${r.status}: ${data?.message || data?.errors || text || r.statusText}`);
  return data;
}

// ── Sync prodotti: push locale → remoto ──────────────────────────────────────
async function pushProdotti(config, prodotti, db) {
  const { provider, base_url, api_key, api_secret, id: configId } = config;
  let creati = 0, aggiornati = 0;
  const errori = [];

  for (const p of prodotti) {
    try {
      // Cerca mapping esistente
      const map = db.prepare(
        'SELECT remote_id FROM ecommerce_mapping WHERE config_id=? AND tipo=? AND local_id=?'
      ).get(configId, 'PRODOTTO', p.id);

      if (provider === 'WOOCOMMERCE') {
        const body = {
          name: p.nome,
          sku: p.codice || `INV-${p.id}`,
          regular_price: String(p.prezzo || 0),
          stock_quantity: p.quantita || 0,
          manage_stock: true,
          description: p.descrizione || '',
        };
        if (map?.remote_id) {
          await call(provider, base_url, api_key, api_secret, `/products/${map.remote_id}`, { method: 'PUT', body });
          aggiornati++;
        } else {
          const r = await call(provider, base_url, api_key, api_secret, '/products', { method: 'POST', body });
          db.prepare(`INSERT OR REPLACE INTO ecommerce_mapping (config_id, tipo, remote_id, local_id) VALUES (?,?,?,?)`)
            .run(configId, 'PRODOTTO', String(r.id), p.id);
          creati++;
        }
      } else { // SHOPIFY
        if (map?.remote_id) {
          await call(provider, base_url, api_key, api_secret, `/products/${map.remote_id}.json`, {
            method: 'PUT',
            body: { product: { id: map.remote_id, title: p.nome, body_html: p.descrizione || '' } },
          });
          aggiornati++;
        } else {
          const r = await call(provider, base_url, api_key, api_secret, '/products.json', {
            method: 'POST',
            body: {
              product: {
                title: p.nome, body_html: p.descrizione || '',
                variants: [{ price: String(p.prezzo || 0), sku: p.codice || `INV-${p.id}`, inventory_quantity: p.quantita || 0 }],
              },
            },
          });
          if (r?.product?.id) {
            db.prepare(`INSERT OR REPLACE INTO ecommerce_mapping (config_id, tipo, remote_id, local_id) VALUES (?,?,?,?)`)
              .run(configId, 'PRODOTTO', String(r.product.id), p.id);
            creati++;
          }
        }
      }
    } catch (err) {
      errori.push({ prodottoId: p.id, nome: p.nome, errore: err.message });
    }
  }

  return { creati, aggiornati, errori };
}

// ── Pull ordini: importa ordini come acquisti/ddt locali ──────────────────────
async function pullOrdini(config, sinceIso, db) {
  const { provider, base_url, api_key, api_secret, id: configId } = config;
  let path, items = [];

  if (provider === 'WOOCOMMERCE') {
    const q = sinceIso ? `?after=${encodeURIComponent(sinceIso)}&status=processing,completed&per_page=50` : '?status=processing,completed&per_page=50';
    const orders = await call(provider, base_url, api_key, api_secret, '/orders' + q);
    items = (orders || []).map(o => ({
      remoteId: String(o.id),
      data: (o.date_created || '').slice(0, 10),
      cliente: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim() || o.billing?.company || 'Cliente web',
      email: o.billing?.email || '',
      totale: parseFloat(o.total || 0),
      righe: (o.line_items || []).map(l => ({
        descrizione: l.name || '', quantita: l.quantity || 1, prezzo: parseFloat(l.price || 0), iva: 22,
      })),
    }));
  } else { // SHOPIFY
    const q = sinceIso ? `?updated_at_min=${encodeURIComponent(sinceIso)}&status=any&limit=50` : '?status=any&limit=50';
    const j = await call(provider, base_url, api_key, api_secret, '/orders.json' + q);
    items = (j?.orders || []).map(o => ({
      remoteId: String(o.id),
      data: (o.created_at || '').slice(0, 10),
      cliente: `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.trim() || 'Cliente Shopify',
      email: o.email || o.customer?.email || '',
      totale: parseFloat(o.total_price || 0),
      righe: (o.line_items || []).map(l => ({
        descrizione: l.name || l.title || '', quantita: l.quantity || 1, prezzo: parseFloat(l.price || 0), iva: 22,
      })),
    }));
  }

  let creati = 0, saltati = 0;
  const errori = [];
  for (const it of items) {
    try {
      // Skip se già importato
      const existing = db.prepare(
        'SELECT local_id FROM ecommerce_mapping WHERE config_id=? AND tipo=? AND remote_id=?'
      ).get(configId, 'ORDINE', it.remoteId);
      if (existing) { saltati++; continue; }

      // Crea (o recupera) cliente
      let cliente = db.prepare('SELECT id FROM clienti WHERE LOWER(TRIM(ragione_sociale))=?').get(it.cliente.toLowerCase().trim());
      if (!cliente) {
        const r = db.prepare(`INSERT INTO clienti (ragione_sociale, email) VALUES (?,?)`).run(it.cliente, it.email);
        cliente = { id: r.lastInsertRowid };
      }

      // Crea un ordine cliente (tipo CLIENTE)
      const { getNextNumero } = require('./nextNumero');
      const numero = getNextNumero('ordini', 'ordini');
      const ord = db.prepare(`INSERT INTO ordini (numero, data_ordine, cliente_id, tipo, stato, note)
                              VALUES (?,?,?,?,?,?)`)
        .run(numero, it.data || new Date().toISOString().slice(0, 10), cliente.id, 'CLIENTE', 'CONFERMATO',
             `Importato da ${provider} (order #${it.remoteId})`);
      const ordineId = ord.lastInsertRowid;
      const stmt = db.prepare(`INSERT INTO ordini_righe
        (ordine_id, descrizione, quantita, prezzo, iva) VALUES (?,?,?,?,?)`);
      for (const r of it.righe) stmt.run(ordineId, r.descrizione, r.quantita, r.prezzo, r.iva);

      db.prepare(`INSERT INTO ecommerce_mapping (config_id, tipo, remote_id, local_id) VALUES (?,?,?,?)`)
        .run(configId, 'ORDINE', it.remoteId, ordineId);
      creati++;
    } catch (err) {
      errori.push({ remoteId: it.remoteId, errore: err.message });
    }
  }

  return { creati, saltati, errori, totali: items.length };
}

module.exports = { pushProdotti, pullOrdini };

const express = require('express');
const router = express.Router();
const db = require('../database');
const { applicaRigheStock } = require('../utils/stock');

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM vendite_banco ORDER BY data DESC, id DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM vendite_banco WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`SELECT * FROM vendite_banco WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const v = req.body;
  const dup = db.prepare('SELECT id FROM vendite_banco WHERE numero=?').get(v.numero);
  if (dup) return res.status(409).json({ error: `Il numero ${v.numero} è già utilizzato da un altro documento` });

  // Determina il valore di metodo_pagamento da salvare
  const pagamentiMisti = Array.isArray(v.pagamenti) && v.pagamenti.length > 0 ? v.pagamenti : null;
  const metodoToStore = pagamentiMisti
    ? [...new Set(pagamentiMisti.map(p => p.metodo))].join('+')
    : (v.metodoPagamento || 'CONTANTI');

  const noteBase = `Vendita al banco N. ${v.numero}${v.clienteNome ? ' – ' + v.clienteNome : ''}`;

  // Atomico: testata + righe + scarico magazzino + pagamenti in un'unica
  // transazione. Senza, un errore a metà lasciava il magazzino scaricato senza
  // incasso registrato (cassa/banca falsate).
  try {
    const vendita_id = db.transaction(() => {
      const result = db.prepare(
        `INSERT INTO vendite_banco (numero, data, cliente_nome, metodo_pagamento, note, stato)
         VALUES (?,?,?,?,?,?)`
      ).run(v.numero, v.data, v.clienteNome || '', metodoToStore, v.note || '', 'EMESSA');
      const vendita_id = result.lastInsertRowid;

      if (v.righe?.length) {
        saveRighe(vendita_id, v.righe);
        aggiornaQuantita(v.righe, -1, {
          data: v.data, causale: 'VENDITA_BANCO', documentoTipo: 'VENDITA_BANCO',
          documentoId: vendita_id, documentoNumero: v.numero, clienteNome: v.clienteNome || ''
        });
      }

      if (pagamentiMisti) {
        // Pagamento misto: inserisce un record per ogni metodo
        for (const p of pagamentiMisti) {
          const conto = p.metodo === 'CONTANTI' ? 'CASSA' : 'BANCA';
          db.prepare(
            `INSERT INTO pagamenti (data_pagamento, importo, metodo, tipo, conto, vendita_banco_id, note)
             VALUES (?,?,?,?,?,?,?)`
          ).run(v.data, p.importo, p.metodo, 'ENTRATA', conto, vendita_id, noteBase);
        }
      } else {
        // Pagamento singolo
        const totale = calcolaTotale(vendita_id);
        const conto = v.metodoPagamento === 'CONTANTI' ? 'CASSA' : 'BANCA';
        db.prepare(
          `INSERT INTO pagamenti (data_pagamento, importo, metodo, tipo, conto, vendita_banco_id, note)
           VALUES (?,?,?,?,?,?,?)`
        ).run(v.data, totale, v.metodoPagamento || 'CONTANTI', 'ENTRATA', conto, vendita_id, noteBase);
      }
      return vendita_id;
    })();
    res.json({ id: vendita_id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/genera-fattura', (req, res) => {
  const { clienteId } = req.body;
  const vendita = db.prepare('SELECT * FROM vendite_banco WHERE id=?').get(req.params.id);
  if (!vendita) return res.status(404).json({ error: 'Vendita non trovata' });

  const { getNextNumero } = require('../utils/nextNumero');

  try {
    const out = db.transaction(() => {
      const righe = getRighe(req.params.id);
      const numero = getNextNumero('fatture', 'fatture');
      // Crea fattura subito come PAGATA (il pagamento è già in pagamenti tramite vendita al banco)
      const result = db.prepare(`
        INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato, tipo_pagamento_id)
        VALUES (?,?,?,?,?,?,?)
      `).run(numero, vendita.data, clienteId || null, null, vendita.note || '', 'PAGATA', null);
      const fatturaId = result.lastInsertRowid;

      // Copia righe nella fattura (NO movimenti magazzino: già registrati dalla vendita al banco)
      const stmtRiga = db.prepare(`
        INSERT INTO fatture_righe
        (fattura_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const r of righe) {
        stmtRiga.run(fatturaId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
                     r.sconto ?? 0, r.iva, r.unitaMisura || '',
                     r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '');
      }
      return { id: fatturaId, numero };
    })();
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.transaction(() => {
      const vendita = db.prepare(`SELECT numero, cliente_nome FROM vendite_banco WHERE id=?`).get(req.params.id);
      const righe = getRighe(req.params.id);
      if (righe.length) {
        aggiornaQuantita(righe, +1, {
          causale: 'ELIMINAZIONE', documentoTipo: 'VENDITA_BANCO', documentoId: req.params.id,
          documentoNumero: vendita?.numero || '', clienteNome: vendita?.cliente_nome || ''
        });
      }
      db.prepare('DELETE FROM pagamenti WHERE vendita_banco_id=?').run(req.params.id);
      db.prepare(`DELETE FROM vendite_banco WHERE id=?`).run(req.params.id);
    })();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function saveRighe(vendita_id, righe) {
  const stmt = db.prepare(
    `INSERT INTO vendite_banco_righe
     (vendita_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura,
      variante_id, variante_taglia, variante_colore)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const r of righe) {
    stmt.run(vendita_id, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '');
  }
}

function getRighe(vendita_id) {
  return db.prepare(
    `SELECT vr.*, p.nome as prodotto_nome FROM vendite_banco_righe vr
     LEFT JOIN prodotti p ON vr.prodotto_id = p.id WHERE vr.vendita_id=?`
  ).all(vendita_id).map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva,
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia, varianteColore: r.variante_colore,
  }));
}

function calcolaTotale(vendita_id) {
  const r = db.prepare(
    `SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t
     FROM vendite_banco_righe WHERE vendita_id=?`
  ).get(vendita_id);
  return r?.t || 0;
}

// Movimentazione scorte centralizzata (utils/stock.js).
const aggiornaQuantita = applicaRigheStock;

function toDto(r) {
  const totale = calcolaTotale(r.id);
  return {
    id: r.id, numero: r.numero, data: r.data,
    clienteNome: r.cliente_nome, metodoPagamento: r.metodo_pagamento,
    note: r.note, stato: r.stato, totale,
  };
}

module.exports = router;

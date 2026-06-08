// Movimentazione di magazzino centralizzata: un unico punto che aggiorna
//  - le giacenze PER DEPOSITO (tabella giacenze, con lotto/scadenza),
//  - i totali denormalizzati su prodotti.quantita / prodotto_varianti.quantita,
//  - il registro movimenti_magazzino (con magazzino_id / lotto / scadenza).
// Sostituisce le 5 copie di `aggiornaQuantita` sparse nei vari router.

const db = require('../database');

/** Id del deposito predefinito (o il primo attivo/esistente). Null se nessuno. */
function magazzinoDefaultId() {
  const r = db.prepare('SELECT id FROM magazzini WHERE predefinito=1').get()
    || db.prepare('SELECT id FROM magazzini WHERE attivo=1 ORDER BY id LIMIT 1').get()
    || db.prepare('SELECT id FROM magazzini ORDER BY id LIMIT 1').get();
  return r ? r.id : null;
}

/** Aggiusta (upsert) la giacenza per la chiave prodotto/variante/deposito/lotto/scadenza. */
function adjGiacenza(prodottoId, varianteId, magazzinoId, lotto, scadenza, delta) {
  if (!magazzinoId || !delta) return;
  const row = db.prepare(`SELECT id FROM giacenze
    WHERE prodotto_id=? AND IFNULL(variante_id,0)=IFNULL(?,0) AND magazzino_id=? AND lotto=? AND scadenza=?`)
    .get(prodottoId, varianteId || null, magazzinoId, lotto || '', scadenza || '');
  if (row) {
    db.prepare('UPDATE giacenze SET quantita = quantita + ? WHERE id=?').run(delta, row.id);
  } else {
    db.prepare(`INSERT INTO giacenze (prodotto_id, variante_id, magazzino_id, lotto, scadenza, quantita)
      VALUES (?,?,?,?,?,?)`).run(prodottoId, varianteId || null, magazzinoId, lotto || '', scadenza || '', delta);
  }
}

function insMov() {
  return db.prepare(`INSERT INTO movimenti_magazzino
    (data,prodotto_id,prodotto_nome,tipo,quantita,causale,documento_tipo,documento_id,documento_numero,
     cliente_id,cliente_nome,fornitore_id,fornitore_nome,note,variante_id,variante_taglia,variante_colore,
     magazzino_id,magazzino_dest_id,lotto,scadenza)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
}

/**
 * Applica un movimento di stock per una lista di righe documento.
 * delta = -1 (scarico, merce in uscita) | +1 (carico, merce in entrata).
 * Le righe possono specificare magazzinoId/lotto/scadenza; in mancanza si usa
 * il deposito predefinito (e nessun lotto). Salta le righe senza prodotto,
 * con quantità 0 o con scaricaMagazzino === false.
 */
function applicaRigheStock(righe, delta, ctx = {}) {
  const oggi = new Date().toISOString().split('T')[0];
  const magDef = ctx.magazzinoId || magazzinoDefaultId();
  const stmtQ = db.prepare('UPDATE prodotti SET quantita = quantita + ? WHERE id = ?');
  const stmtV = db.prepare('UPDATE prodotto_varianti SET quantita = quantita + ? WHERE id = ?');
  const stmtNome = db.prepare('SELECT nome FROM prodotti WHERE id=?');
  const mov = insMov();
  for (const r of righe || []) {
    if (!r.prodottoId) continue;
    if (r.scaricaMagazzino === false) continue;     // riga esclusa dallo scarico scorte
    const qty = +r.quantita || 0;
    if (!qty) continue;
    const mag = r.magazzinoId || magDef;
    const lotto = r.lotto || ctx.lotto || '';
    const scad = r.scadenza || ctx.scadenza || '';
    const signed = delta * qty;
    stmtQ.run(signed, r.prodottoId);
    if (r.varianteId) stmtV.run(signed, r.varianteId);
    adjGiacenza(r.prodottoId, r.varianteId || null, mag, lotto, scad, signed);
    const nome = stmtNome.get(r.prodottoId)?.nome || r.descrizione || '';
    mov.run(
      ctx.data || oggi, r.prodottoId, nome,
      delta > 0 ? 'CARICO' : 'SCARICO', Math.abs(signed),
      ctx.causale || '', ctx.documentoTipo || '', ctx.documentoId || null,
      ctx.documentoNumero || '', ctx.clienteId || null, ctx.clienteNome || '',
      ctx.fornitoreId || null, ctx.fornitoreNome || '', ctx.note || '',
      r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
      mag, null, lotto, scad,
    );
  }
}

/**
 * Riallinea le giacenze ai totali "master" (prodotti.quantita / varianti.quantita)
 * quando questi vengono impostati direttamente dal form prodotto, riversando la
 * differenza nel deposito predefinito. Mantiene l'invariante somma(giacenze)==totale.
 */
function riallineaGiacenze(prodottoId) {
  const mag = magazzinoDefaultId();
  if (!mag) return;
  const varianti = db.prepare('SELECT id, quantita FROM prodotto_varianti WHERE prodotto_id=?').all(prodottoId);
  if (varianti.length) {
    for (const v of varianti) {
      const somma = db.prepare('SELECT COALESCE(SUM(quantita),0) AS s FROM giacenze WHERE prodotto_id=? AND variante_id=?').get(prodottoId, v.id).s;
      const diff = (v.quantita || 0) - somma;
      if (diff) adjGiacenza(prodottoId, v.id, mag, '', '', diff);
    }
  } else {
    const tot = db.prepare('SELECT quantita FROM prodotti WHERE id=?').get(prodottoId)?.quantita || 0;
    const somma = db.prepare('SELECT COALESCE(SUM(quantita),0) AS s FROM giacenze WHERE prodotto_id=? AND variante_id IS NULL').get(prodottoId).s;
    const diff = tot - somma;
    if (diff) adjGiacenza(prodottoId, null, mag, '', '', diff);
  }
}

module.exports = { applicaRigheStock, adjGiacenza, magazzinoDefaultId, riallineaGiacenze };

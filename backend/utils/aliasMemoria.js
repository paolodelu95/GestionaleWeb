// Memoria abbinamenti "identificativo del fornitore" -> prodotto interno.
// Condivisa tra import listino (codice), OCR e SDI passive (codice articolo o
// descrizione). La chiave normalizzata e' LOWER(TRIM(...)).
//
// La tabella fornitore_codice_alias e' creata in utils/tenantDb.js.

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

// Ritorna il prodotto_id memorizzato per (fornitore, chiave) oppure null.
function lookup(db, fornitoreId, chiave) {
  const k = norm(chiave);
  if (!fornitoreId || !k) return null;
  const row = db.prepare(
    'SELECT prodotto_id FROM fornitore_codice_alias WHERE fornitore_id=? AND codice_norm=?'
  ).get(fornitoreId, k);
  return row ? row.prodotto_id : null;
}

// Mappa { codice_norm -> prodotto_id } di tutti gli alias del fornitore (per loop efficienti).
function mappaFornitore(db, fornitoreId) {
  const m = new Map();
  if (!fornitoreId) return m;
  for (const r of db.prepare(
    'SELECT prodotto_id, codice_norm FROM fornitore_codice_alias WHERE fornitore_id=?'
  ).all(fornitoreId)) m.set(r.codice_norm, r.prodotto_id);
  return m;
}

// Memorizza/aggiorna l'abbinamento (idempotente). chiave = codice o descrizione del fornitore.
function save(db, fornitoreId, prodottoId, chiave) {
  const k = norm(chiave);
  if (!fornitoreId || !prodottoId || !k) return;
  db.prepare(`INSERT INTO fornitore_codice_alias (fornitore_id, prodotto_id, codice, codice_norm)
    VALUES (?,?,?,?)
    ON CONFLICT(fornitore_id, codice_norm) DO UPDATE SET prodotto_id=excluded.prodotto_id, codice=excluded.codice`)
    .run(fornitoreId, prodottoId, String(chiave).trim(), k);
}

module.exports = { norm, lookup, mappaFornitore, save };

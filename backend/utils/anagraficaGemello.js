// Doppio ruolo anagrafica: un cliente può essere "anche fornitore" e viceversa.
// Modello a record gemello collegato: ogni entità resta nella sua tabella (così le
// chiavi esterne dei documenti — fatture→clienti, acquisti→fornitori — restano
// integre), e quando si attiva il flag si crea/collega un'anagrafica speculare
// nell'altra tabella, tenuta in sync sui campi condivisi.
//
// Niente ricorsione: le funzioni scrivono direttamente sulla riga gemella, non
// passano dalle route, quindi non si richiamano a vicenda.
const db = require('../database');

// Campi presenti in entrambe le tabelle, copiati sul gemello a ogni salvataggio.
const SHARED = ['ragione_sociale', 'email', 'telefono', 'cellulare', 'via', 'cap',
  'citta', 'provincia', 'stato', 'p_iva', 'sdi', 'pec'];

const validPiva = (p) => p && /^\d{11}$/.test(String(p));
const setList = SHARED.map(k => `${k}=?`).join(', ');
const colList = SHARED.join(', ');
const phList = SHARED.map(() => '?').join(', ');

/** Allinea il gemello FORNITORE dopo create/update di un CLIENTE. */
function applicaGemelloDaCliente(clienteId) {
  const c = db.prepare('SELECT * FROM clienti WHERE id=?').get(clienteId);
  if (!c) return;
  if (c.anche_fornitore) {
    const vals = SHARED.map(k => c[k] ?? '');
    let fid = c.fornitore_collegato_id;
    let f = fid ? db.prepare('SELECT id FROM fornitori WHERE id=?').get(fid) : null;
    // Non ancora collegato: riusa un fornitore esistente con la stessa P.IVA, se libero.
    if (!f && validPiva(c.p_iva)) {
      f = db.prepare(`SELECT id FROM fornitori WHERE (p_iva=? OR p_iva=?)
        AND (cliente_collegato_id IS NULL OR cliente_collegato_id=?) LIMIT 1`)
        .get(c.p_iva, 'IT' + c.p_iva, clienteId);
      if (f) fid = f.id;
    }
    if (f) {
      db.prepare(`UPDATE fornitori SET ${setList}, anche_cliente=1, cliente_collegato_id=? WHERE id=?`)
        .run(...vals, clienteId, fid);
    } else {
      const r = db.prepare(`INSERT INTO fornitori (${colList}, anche_cliente, cliente_collegato_id)
        VALUES (${phList}, 1, ?)`).run(...vals, clienteId);
      fid = r.lastInsertRowid;
    }
    db.prepare('UPDATE clienti SET fornitore_collegato_id=? WHERE id=?').run(fid, clienteId);
  } else if (c.fornitore_collegato_id) {
    // Flag disattivato: scollega il gemello (resta come fornitore autonomo).
    db.prepare('UPDATE fornitori SET anche_cliente=0, cliente_collegato_id=NULL WHERE id=?')
      .run(c.fornitore_collegato_id);
    db.prepare('UPDATE clienti SET fornitore_collegato_id=NULL WHERE id=?').run(clienteId);
  }
}

/** Allinea il gemello CLIENTE dopo create/update di un FORNITORE. */
function applicaGemelloDaFornitore(fornitoreId) {
  const f = db.prepare('SELECT * FROM fornitori WHERE id=?').get(fornitoreId);
  if (!f) return;
  if (f.anche_cliente) {
    const vals = SHARED.map(k => f[k] ?? '');
    let cid = f.cliente_collegato_id;
    let c = cid ? db.prepare('SELECT id FROM clienti WHERE id=?').get(cid) : null;
    if (!c && validPiva(f.p_iva)) {
      c = db.prepare(`SELECT id FROM clienti WHERE (p_iva=? OR p_iva=?)
        AND (fornitore_collegato_id IS NULL OR fornitore_collegato_id=?) LIMIT 1`)
        .get(f.p_iva, 'IT' + f.p_iva, fornitoreId);
      if (c) cid = c.id;
    }
    if (c) {
      db.prepare(`UPDATE clienti SET ${setList}, anche_fornitore=1, fornitore_collegato_id=? WHERE id=?`)
        .run(...vals, fornitoreId, cid);
    } else {
      const r = db.prepare(`INSERT INTO clienti (${colList}, anche_fornitore, fornitore_collegato_id)
        VALUES (${phList}, 1, ?)`).run(...vals, fornitoreId);
      cid = r.lastInsertRowid;
    }
    db.prepare('UPDATE fornitori SET cliente_collegato_id=? WHERE id=?').run(cid, fornitoreId);
  } else if (f.cliente_collegato_id) {
    db.prepare('UPDATE clienti SET anche_fornitore=0, fornitore_collegato_id=NULL WHERE id=?')
      .run(f.cliente_collegato_id);
    db.prepare('UPDATE fornitori SET cliente_collegato_id=NULL WHERE id=?').run(fornitoreId);
  }
}

/** Prima di eliminare un cliente: stacca l'eventuale gemello fornitore. */
function scollegaGemelloCliente(clienteId) {
  db.prepare('UPDATE fornitori SET anche_cliente=0, cliente_collegato_id=NULL WHERE cliente_collegato_id=?').run(clienteId);
}
/** Prima di eliminare un fornitore: stacca l'eventuale gemello cliente. */
function scollegaGemelloFornitore(fornitoreId) {
  db.prepare('UPDATE clienti SET anche_fornitore=0, fornitore_collegato_id=NULL WHERE fornitore_collegato_id=?').run(fornitoreId);
}

module.exports = {
  applicaGemelloDaCliente, applicaGemelloDaFornitore,
  scollegaGemelloCliente, scollegaGemelloFornitore,
};

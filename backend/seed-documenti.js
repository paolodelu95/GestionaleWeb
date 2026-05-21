const db = require('./database');

const clienti = db.prepare('SELECT id FROM clienti').all().map(r => r.id);
const prodotti = db.prepare('SELECT id, prezzo, iva, unita_misura FROM prodotti').all();

if (!clienti.length || !prodotti.length) {
  console.error('Nessun cliente/prodotto. Esegui prima: node seed.js');
  process.exit(1);
}

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[rand(0, arr.length - 1)];
const dataIso = (giorniFa) => {
  const d = new Date();
  d.setDate(d.getDate() - giorniFa);
  return d.toISOString().slice(0, 10);
};

const anno = new Date().getFullYear();

// reset documenti
db.exec(`
  DELETE FROM pagamenti;
  DELETE FROM fatture_righe;
  DELETE FROM fatture;
  DELETE FROM ddt_righe;
  DELETE FROM ddt;
  DELETE FROM ordini_righe;
  DELETE FROM ordini;
  DELETE FROM preventivi_righe;
  DELETE FROM preventivi;
  DELETE FROM contatori;
`);

const setContatore = db.prepare(`
  INSERT INTO contatori (tipo, anno, contatore) VALUES (?, ?, ?)
  ON CONFLICT(tipo, anno) DO UPDATE SET contatore = excluded.contatore
`);

function generaRighe(insRiga, docId) {
  const n = rand(1, 4);
  const usati = new Set();
  for (let i = 0; i < n; i++) {
    let p;
    do { p = pick(prodotti); } while (usati.has(p.id));
    usati.add(p.id);
    insRiga.run(
      docId, p.id, '', rand(1, 5), p.prezzo, p.iva,
      p.unita_misura || 'pz', 0, null, '', '', 'PRODOTTO', ''
    );
  }
}

// ===== PREVENTIVI =====
const insPrev = db.prepare(`INSERT INTO preventivi (numero, data_emissione, cliente_id, validita, stato, note) VALUES (?,?,?,?,?,?)`);
const insPrevR = db.prepare(`INSERT INTO preventivi_righe (preventivo_id, prodotto_id, descrizione, quantita, prezzo, iva, unita_misura, sconto, variante_id, variante_taglia, variante_colore, tipo, codice_iva) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const statiPrev = ['BOZZA', 'INVIATO', 'ACCETTATO', 'RIFIUTATO'];
const NUM_PREV = 6;
for (let i = 1; i <= NUM_PREV; i++) {
  const id = insPrev.run(
    `P-${anno}-${String(i).padStart(4, '0')}`,
    dataIso(rand(1, 60)), pick(clienti), 30, pick(statiPrev), ''
  ).lastInsertRowid;
  generaRighe(insPrevR, id);
}
setContatore.run('preventivo', anno, NUM_PREV);

// ===== ORDINI CLIENTE =====
const insOrd = db.prepare(`INSERT INTO ordini (numero, data_ordine, cliente_id, fornitore_id, tipo, stato, note) VALUES (?,?,?,?,?,?,?)`);
const insOrdR = db.prepare(`INSERT INTO ordini_righe (ordine_id, prodotto_id, descrizione, quantita, prezzo, iva, unita_misura, sconto, variante_id, variante_taglia, variante_colore, tipo, codice_iva) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const statiOrd = ['APERTO', 'IN LAVORAZIONE', 'EVASO'];
const NUM_ORD = 5;
for (let i = 1; i <= NUM_ORD; i++) {
  const id = insOrd.run(
    `O-${anno}-${String(i).padStart(4, '0')}`,
    dataIso(rand(1, 45)), pick(clienti), null, 'CLIENTE', pick(statiOrd), ''
  ).lastInsertRowid;
  generaRighe(insOrdR, id);
}
setContatore.run('ordine', anno, NUM_ORD);

// ===== DDT =====
const insDdt = db.prepare(`INSERT INTO ddt (numero, data_emissione, cliente_id, causale, note, stato, aspetto_beni, porto, numero_colli, peso_lordo, incaricato_trasporto) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insDdtR = db.prepare(`INSERT INTO ddt_righe (ddt_id, prodotto_id, descrizione, quantita, prezzo, iva, unita_misura, sconto, variante_id, variante_taglia, variante_colore, tipo, codice_iva) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const NUM_DDT = 4;
const ddtIds = [];
for (let i = 1; i <= NUM_DDT; i++) {
  const id = insDdt.run(
    `D-${anno}-${String(i).padStart(4, '0')}`,
    dataIso(rand(1, 40)), pick(clienti),
    'Vendita', '', 'EMESSO', 'Cartoni', 'Franco',
    rand(1, 6), rand(2, 30), 'Mittente'
  ).lastInsertRowid;
  generaRighe(insDdtR, id);
  ddtIds.push(id);
}
setContatore.run('ddt', anno, NUM_DDT);

// ===== FATTURE =====
const insFat = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato) VALUES (?,?,?,?,?,?)`);
const insFatR = db.prepare(`INSERT INTO fatture_righe (fattura_id, prodotto_id, descrizione, quantita, prezzo, iva, unita_misura, sconto, variante_id, variante_taglia, variante_colore, tipo, codice_iva) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const statiFat = ['EMESSA', 'PAGATA'];
const NUM_FAT = 8;
const fattureCreate = [];
for (let i = 1; i <= NUM_FAT; i++) {
  const stato = pick(statiFat);
  const ddt = i <= ddtIds.length ? ddtIds[i - 1] : null;
  const id = insFat.run(
    `F-${anno}-${String(i).padStart(4, '0')}`,
    dataIso(rand(1, 35)), pick(clienti), ddt, '', stato
  ).lastInsertRowid;
  generaRighe(insFatR, id);
  fattureCreate.push({ id, stato });
}
setContatore.run('fattura', anno, NUM_FAT);

// ===== PAGAMENTI (per fatture PAGATA + qualcuna parziale) =====
const insPag = db.prepare(`INSERT INTO pagamenti (fattura_id, data_pagamento, importo, metodo, note, tipo, conto) VALUES (?,?,?,?,?,?,?)`);
const totaleFattura = db.prepare(`
  SELECT COALESCE(SUM(quantita * prezzo * (1 + iva/100.0)), 0) AS tot
  FROM fatture_righe WHERE fattura_id = ?
`);
const metodi = ['Bonifico', 'Contanti', 'Carta'];
let numPag = 0;
for (const f of fattureCreate) {
  if (f.stato === 'PAGATA') {
    const tot = totaleFattura.get(f.id).tot;
    insPag.run(f.id, dataIso(rand(0, 20)), Math.round(tot * 100) / 100, pick(metodi), '', 'ENTRATA', 'BANCA');
    numPag++;
  } else if (f.stato === 'EMESSA' && Math.random() < 0.4) {
    const tot = totaleFattura.get(f.id).tot;
    insPag.run(f.id, dataIso(rand(0, 15)), Math.round(tot * 0.5 * 100) / 100, pick(metodi), 'Acconto', 'ENTRATA', 'BANCA');
    numPag++;
  }
}

console.log('Documenti generati:');
console.log(`  ${NUM_PREV} preventivi`);
console.log(`  ${NUM_ORD} ordini cliente`);
console.log(`  ${NUM_DDT} DDT`);
console.log(`  ${NUM_FAT} fatture`);
console.log(`  ${numPag} pagamenti`);

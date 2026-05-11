const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'gestionale.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS azienda (
    id INTEGER PRIMARY KEY DEFAULT 1,
    ragione_sociale TEXT DEFAULT '',
    indirizzo TEXT DEFAULT '',
    p_iva TEXT DEFAULT '',
    cod_fiscale TEXT DEFAULT '',
    email TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    banca TEXT DEFAULT '',
    iban TEXT DEFAULT ''
  );
  INSERT OR IGNORE INTO azienda (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS prodotti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT DEFAULT '',
    descrizione TEXT DEFAULT '',
    prezzo REAL DEFAULT 0,
    quantita INTEGER DEFAULT 0,
    soglia_minima INTEGER DEFAULT 0,
    unita_misura TEXT DEFAULT 'pz',
    codice TEXT DEFAULT '',
    iva REAL DEFAULT 22
  );

  CREATE TABLE IF NOT EXISTS clienti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ragione_sociale TEXT NOT NULL,
    email TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    via TEXT DEFAULT '',
    cap TEXT DEFAULT '',
    citta TEXT DEFAULT '',
    provincia TEXT DEFAULT '',
    stato TEXT DEFAULT 'Italia',
    codice_fiscale TEXT DEFAULT '',
    p_iva TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS fornitori (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ragione_sociale TEXT NOT NULL,
    email TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    via TEXT DEFAULT '',
    cap TEXT DEFAULT '',
    citta TEXT DEFAULT '',
    provincia TEXT DEFAULT '',
    stato TEXT DEFAULT 'Italia',
    p_iva TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS ddt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    data_emissione TEXT NOT NULL,
    cliente_id INTEGER,
    causale TEXT DEFAULT '',
    note TEXT DEFAULT '',
    stato TEXT DEFAULT 'BOZZA',
    FOREIGN KEY (cliente_id) REFERENCES clienti(id)
  );

  CREATE TABLE IF NOT EXISTS ddt_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ddt_id INTEGER NOT NULL,
    prodotto_id INTEGER,
    descrizione TEXT DEFAULT '',
    quantita REAL DEFAULT 1,
    prezzo REAL DEFAULT 0,
    iva REAL DEFAULT 22,
    FOREIGN KEY (ddt_id) REFERENCES ddt(id) ON DELETE CASCADE,
    FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
  );

  CREATE TABLE IF NOT EXISTS fatture (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    data_emissione TEXT NOT NULL,
    cliente_id INTEGER,
    ddt_id INTEGER,
    note TEXT DEFAULT '',
    stato TEXT DEFAULT 'BOZZA',
    FOREIGN KEY (cliente_id) REFERENCES clienti(id),
    FOREIGN KEY (ddt_id) REFERENCES ddt(id)
  );

  CREATE TABLE IF NOT EXISTS fatture_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fattura_id INTEGER NOT NULL,
    prodotto_id INTEGER,
    descrizione TEXT DEFAULT '',
    quantita REAL DEFAULT 1,
    prezzo REAL DEFAULT 0,
    iva REAL DEFAULT 22,
    FOREIGN KEY (fattura_id) REFERENCES fatture(id) ON DELETE CASCADE,
    FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
  );

  CREATE TABLE IF NOT EXISTS note_credito (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    data_emissione TEXT NOT NULL,
    cliente_id INTEGER,
    fattura_id INTEGER,
    note TEXT DEFAULT '',
    stato TEXT DEFAULT 'BOZZA',
    FOREIGN KEY (cliente_id) REFERENCES clienti(id),
    FOREIGN KEY (fattura_id) REFERENCES fatture(id)
  );

  CREATE TABLE IF NOT EXISTS note_credito_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nota_credito_id INTEGER NOT NULL,
    prodotto_id INTEGER,
    descrizione TEXT DEFAULT '',
    quantita REAL DEFAULT 1,
    prezzo REAL DEFAULT 0,
    iva REAL DEFAULT 22,
    FOREIGN KEY (nota_credito_id) REFERENCES note_credito(id) ON DELETE CASCADE,
    FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
  );

  CREATE TABLE IF NOT EXISTS ordini (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    data_ordine TEXT NOT NULL,
    cliente_id INTEGER,
    fornitore_id INTEGER,
    tipo TEXT DEFAULT 'CLIENTE',
    stato TEXT DEFAULT 'APERTO',
    note TEXT DEFAULT '',
    FOREIGN KEY (cliente_id) REFERENCES clienti(id),
    FOREIGN KEY (fornitore_id) REFERENCES fornitori(id)
  );

  CREATE TABLE IF NOT EXISTS ordini_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ordine_id INTEGER NOT NULL,
    prodotto_id INTEGER,
    descrizione TEXT DEFAULT '',
    quantita REAL DEFAULT 1,
    prezzo REAL DEFAULT 0,
    iva REAL DEFAULT 22,
    FOREIGN KEY (ordine_id) REFERENCES ordini(id) ON DELETE CASCADE,
    FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
  );

  CREATE TABLE IF NOT EXISTS preventivi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    data_emissione TEXT NOT NULL,
    cliente_id INTEGER,
    validita INTEGER DEFAULT 30,
    stato TEXT DEFAULT 'BOZZA',
    note TEXT DEFAULT '',
    FOREIGN KEY (cliente_id) REFERENCES clienti(id)
  );

  CREATE TABLE IF NOT EXISTS preventivi_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preventivo_id INTEGER NOT NULL,
    prodotto_id INTEGER,
    descrizione TEXT DEFAULT '',
    quantita REAL DEFAULT 1,
    prezzo REAL DEFAULT 0,
    iva REAL DEFAULT 22,
    FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE,
    FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
  );

  CREATE TABLE IF NOT EXISTS pagamenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fattura_id INTEGER,
    data_pagamento TEXT NOT NULL,
    importo REAL NOT NULL,
    metodo TEXT DEFAULT 'Bonifico',
    note TEXT DEFAULT '',
    FOREIGN KEY (fattura_id) REFERENCES fatture(id)
  );

  CREATE TABLE IF NOT EXISTS tipi_pagamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    conto TEXT DEFAULT 'BANCA',
    giorni_scadenza INTEGER DEFAULT 0,
    fine_mese INTEGER DEFAULT 0,
    immediato INTEGER DEFAULT 0,
    attivo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS categorie_prodotto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS unita_misura (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    simbolo TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS aliquote_iva (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    valore REAL NOT NULL,
    attiva INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS acquisti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    data_emissione TEXT NOT NULL,
    fornitore_id INTEGER,
    tipo_pagamento_id INTEGER,
    note TEXT DEFAULT '',
    stato TEXT DEFAULT 'RICEVUTA',
    FOREIGN KEY (fornitore_id) REFERENCES fornitori(id),
    FOREIGN KEY (tipo_pagamento_id) REFERENCES tipi_pagamento(id)
  );

  CREATE TABLE IF NOT EXISTS acquisti_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acquisto_id INTEGER NOT NULL,
    prodotto_id INTEGER,
    descrizione TEXT DEFAULT '',
    quantita REAL DEFAULT 1,
    prezzo REAL DEFAULT 0,
    iva REAL DEFAULT 22,
    FOREIGN KEY (acquisto_id) REFERENCES acquisti(id) ON DELETE CASCADE,
    FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
  );
`);

// Extend azienda table with additional fields (safe on existing DBs)
const aziendaExtras = [
  'ALTER TABLE azienda ADD COLUMN cap TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN citta TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN provincia TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN stato TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN pec TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN sdi TEXT DEFAULT ""',
];
for (const sql of aziendaExtras) { try { db.exec(sql); } catch(_) {} }

// Extend existing tables (safe migrations)
const migrations = [
  'ALTER TABLE pagamenti ADD COLUMN tipo TEXT DEFAULT "ENTRATA"',
  'ALTER TABLE pagamenti ADD COLUMN tipo_pagamento_id INTEGER',
  'ALTER TABLE pagamenti ADD COLUMN acquisto_id INTEGER',
  'ALTER TABLE pagamenti ADD COLUMN conto TEXT DEFAULT "BANCA"',
  'ALTER TABLE fatture ADD COLUMN tipo_pagamento_id INTEGER',
  'ALTER TABLE ddt_righe ADD COLUMN unita_misura TEXT DEFAULT ""',
  'ALTER TABLE fatture_righe ADD COLUMN unita_misura TEXT DEFAULT ""',
  'ALTER TABLE note_credito_righe ADD COLUMN unita_misura TEXT DEFAULT ""',
  'ALTER TABLE ordini_righe ADD COLUMN unita_misura TEXT DEFAULT ""',
  'ALTER TABLE preventivi_righe ADD COLUMN unita_misura TEXT DEFAULT ""',
  'ALTER TABLE acquisti_righe ADD COLUMN unita_misura TEXT DEFAULT ""',
];
for (const sql of migrations) { try { db.exec(sql); } catch(_) {} }

// Seed aliquote IVA standard italiane
try {
  db.exec(`
    INSERT OR IGNORE INTO aliquote_iva (id, nome, valore, attiva) VALUES
      (1, 'Esente', 0, 1),
      (2, 'Prima necessità', 4, 1),
      (3, 'Agevolata', 10, 1),
      (4, 'Ordinaria', 22, 1)
  `);
} catch(_) {}

// Seed unità di misura standard
try {
  db.exec(`
    INSERT OR IGNORE INTO unita_misura (id, nome, simbolo) VALUES
      (1, 'Pezzo', 'pz'),
      (2, 'Chilogrammo', 'kg'),
      (3, 'Litro', 'lt'),
      (4, 'Metro', 'mt'),
      (5, 'Ora', 'h'),
      (6, 'Metro quadro', 'm²'),
      (7, 'Metro cubo', 'm³'),
      (8, 'Set', 'set')
  `);
} catch(_) {}

// Seed default tipi_pagamento
try {
  db.exec(`
    INSERT OR IGNORE INTO tipi_pagamento (id,nome,conto,giorni_scadenza,fine_mese,immediato,attivo) VALUES
      (1,'Contanti','CASSA',0,0,1,1),
      (2,'POS','BANCA',0,0,1,1),
      (3,'Bonifico anticipato','BANCA',0,0,1,1),
      (4,'Bonifico vista fattura','BANCA',0,0,0,1),
      (5,'Bonifico 30gg','BANCA',30,0,0,1),
      (6,'Bonifico 30gg FM','BANCA',30,1,0,1),
      (7,'Bonifico 60gg','BANCA',60,0,0,1),
      (8,'Bonifico 60gg FM','BANCA',60,1,0,1)
  `);
} catch(_) {}

module.exports = db;

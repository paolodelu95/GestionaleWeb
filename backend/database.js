const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'gestionale.db');
const db = new Database(dbPath);

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
  'ALTER TABLE azienda ADD COLUMN regime_fiscale TEXT DEFAULT "RF01"',
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
  'ALTER TABLE ddt_righe ADD COLUMN sconto REAL DEFAULT 0',
  'ALTER TABLE fatture_righe ADD COLUMN sconto REAL DEFAULT 0',
  'ALTER TABLE note_credito_righe ADD COLUMN sconto REAL DEFAULT 0',
  'ALTER TABLE ordini_righe ADD COLUMN sconto REAL DEFAULT 0',
  'ALTER TABLE preventivi_righe ADD COLUMN sconto REAL DEFAULT 0',
  'ALTER TABLE acquisti_righe ADD COLUMN sconto REAL DEFAULT 0',
  // DDT trasporto
  'ALTER TABLE ddt ADD COLUMN data_ora_inizio_trasporto TEXT DEFAULT ""',
  'ALTER TABLE ddt ADD COLUMN aspetto_beni TEXT DEFAULT ""',
  'ALTER TABLE ddt ADD COLUMN porto TEXT DEFAULT "Franco"',
  'ALTER TABLE ddt ADD COLUMN numero_colli INTEGER DEFAULT 0',
  'ALTER TABLE ddt ADD COLUMN peso_lordo REAL DEFAULT 0',
  'ALTER TABLE ddt ADD COLUMN incaricato_trasporto TEXT DEFAULT "Mittente"',
  'ALTER TABLE ddt ADD COLUMN vettore TEXT DEFAULT ""',
  'ALTER TABLE ddt ADD COLUMN destinazione_diversa TEXT DEFAULT ""',
  'ALTER TABLE ddt ADD COLUMN note_trasporto TEXT DEFAULT ""',
  'ALTER TABLE clienti ADD COLUMN sdi TEXT DEFAULT ""',
  'ALTER TABLE clienti ADD COLUMN pec TEXT DEFAULT ""',
  'ALTER TABLE clienti ADD COLUMN tipo_pagamento_id INTEGER',
  'ALTER TABLE fornitori ADD COLUMN sdi TEXT DEFAULT ""',
  'ALTER TABLE fornitori ADD COLUMN pec TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN logo TEXT DEFAULT ""',
  // Barcode e varianti prodotti
  'ALTER TABLE prodotti ADD COLUMN barcode TEXT DEFAULT ""',
  'ALTER TABLE prodotti ADD COLUMN ha_varianti INTEGER DEFAULT 0',
  // Vendite al banco → pagamenti
  'ALTER TABLE pagamenti ADD COLUMN vendita_banco_id INTEGER',
  // Righe vendita banco: variante
  'ALTER TABLE vendite_banco_righe ADD COLUMN variante_id INTEGER',
  'ALTER TABLE vendite_banco_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE vendite_banco_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
  // DDT causale
  'ALTER TABLE ddt ADD COLUMN causale_trasporto TEXT DEFAULT ""',
  // Variante in tutte le righe documento
  'ALTER TABLE ddt_righe ADD COLUMN variante_id INTEGER',
  'ALTER TABLE ddt_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE ddt_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
  'ALTER TABLE fatture_righe ADD COLUMN variante_id INTEGER',
  'ALTER TABLE fatture_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE fatture_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
  'ALTER TABLE note_credito_righe ADD COLUMN variante_id INTEGER',
  'ALTER TABLE note_credito_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE note_credito_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
  'ALTER TABLE ordini_righe ADD COLUMN variante_id INTEGER',
  'ALTER TABLE ordini_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE ordini_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
  'ALTER TABLE preventivi_righe ADD COLUMN variante_id INTEGER',
  'ALTER TABLE preventivi_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE preventivi_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
  'ALTER TABLE acquisti_righe ADD COLUMN variante_id INTEGER',
  'ALTER TABLE acquisti_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE acquisti_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
  // Variante nei movimenti magazzino
  'ALTER TABLE movimenti_magazzino ADD COLUMN variante_id INTEGER',
  'ALTER TABLE movimenti_magazzino ADD COLUMN variante_taglia TEXT DEFAULT ""',
  'ALTER TABLE movimenti_magazzino ADD COLUMN variante_colore TEXT DEFAULT ""',
  // Codice fornitore sul prodotto
  'ALTER TABLE prodotti ADD COLUMN codice_fornitore TEXT DEFAULT ""',
  // Riordino automatico per prodotto
  'ALTER TABLE prodotti ADD COLUMN fornitore_id_preferito INTEGER',
  'ALTER TABLE prodotti ADD COLUMN riordino_quantita REAL DEFAULT 0',
  // Email/SMTP config azienda
  'ALTER TABLE azienda ADD COLUMN smtp_host TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN smtp_port INTEGER DEFAULT 587',
  'ALTER TABLE azienda ADD COLUMN smtp_user TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN smtp_pass TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN smtp_from TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN smtp_secure INTEGER DEFAULT 0',
  // SDI intermediario
  'ALTER TABLE azienda ADD COLUMN sdi_api_url TEXT DEFAULT ""',
  'ALTER TABLE azienda ADD COLUMN sdi_api_key TEXT DEFAULT ""',
  // Funzionalità opzionali azienda
  'ALTER TABLE azienda ADD COLUMN riordino_automatico INTEGER DEFAULT 0',
  'ALTER TABLE azienda ADD COLUMN multi_utente_attivo INTEGER DEFAULT 0',
  // SDI tracking su fatture
  'ALTER TABLE fatture ADD COLUMN stato_sdi TEXT DEFAULT ""',
  'ALTER TABLE fatture ADD COLUMN data_invio_sdi TEXT DEFAULT ""',
  'ALTER TABLE fatture ADD COLUMN id_trasmissione_sdi TEXT DEFAULT ""',
  // Collegamento preventivo → documenti catena
  'ALTER TABLE ddt ADD COLUMN preventivo_id INTEGER',
  'ALTER TABLE ordini ADD COLUMN preventivo_id INTEGER',
  // Numerazione progressiva annuale
  'ALTER TABLE azienda ADD COLUMN numerazione_annuale INTEGER DEFAULT 1',
  'ALTER TABLE azienda ADD COLUMN numero_prefissi TEXT DEFAULT "{}"',
  // Prima Nota
  `CREATE TABLE IF NOT EXISTS prima_nota (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('ENTRATA','USCITA')),
  causale TEXT NOT NULL,
  importo REAL NOT NULL CHECK(importo > 0),
  conto TEXT DEFAULT 'CASSA' CHECK(conto IN ('CASSA','BANCA')),
  riferimento_tipo TEXT DEFAULT '',
  riferimento_id INTEGER DEFAULT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
)`,
  // Allegati documenti
  `CREATE TABLE IF NOT EXISTS allegati (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_tipo TEXT NOT NULL,
  documento_id INTEGER NOT NULL,
  nome_file TEXT NOT NULL,
  percorso TEXT NOT NULL,
  dimensione INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
)`,
  // Tipo riga documento (PRODOTTO | NOTA)
  'ALTER TABLE ddt_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
  'ALTER TABLE fatture_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
  'ALTER TABLE note_credito_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
  'ALTER TABLE ordini_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
  'ALTER TABLE preventivi_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
  'ALTER TABLE acquisti_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
  // Note rapide (testi predefiniti per note tra righe)
  `CREATE TABLE IF NOT EXISTS note_rapide (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  testo TEXT NOT NULL,
  ordine INTEGER DEFAULT 0
)`,
  'ALTER TABLE clienti ADD COLUMN cellulare TEXT DEFAULT ""',
  'ALTER TABLE fornitori ADD COLUMN cellulare TEXT DEFAULT ""',
  'ALTER TABLE prodotti ADD COLUMN prezzo_acquisto REAL DEFAULT NULL',
  // Indirizzi multipli per cliente
  `CREATE TABLE IF NOT EXISTS clienti_indirizzi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nome TEXT NOT NULL DEFAULT 'Sede',
    via TEXT DEFAULT '',
    cap TEXT DEFAULT '',
    citta TEXT DEFAULT '',
    provincia TEXT DEFAULT '',
    stato TEXT DEFAULT 'Italia',
    FOREIGN KEY (cliente_id) REFERENCES clienti(id) ON DELETE CASCADE
  )`,
  'ALTER TABLE ddt ADD COLUMN destinazione_id INTEGER',
  'ALTER TABLE azienda ADD COLUMN template_config TEXT DEFAULT NULL',
];
for (const sql of migrations) { try { db.exec(sql); } catch(_) {} }

// Fatturazione ricorrente
try {
  db.exec(`CREATE TABLE IF NOT EXISTS fatture_ricorrenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    descrizione TEXT NOT NULL,
    frequenza TEXT NOT NULL CHECK(frequenza IN ('MENSILE','BIMESTRALE','TRIMESTRALE','SEMESTRALE','ANNUALE')),
    giorno_emissione INTEGER DEFAULT 1,
    prossima_emissione TEXT NOT NULL,
    attiva INTEGER DEFAULT 1,
    righe TEXT NOT NULL DEFAULT '[]',
    tipo_pagamento_id INTEGER,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
} catch(_) {}

// Varianti prodotto (taglie / colori)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prodotto_varianti (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      prodotto_id INTEGER NOT NULL,
      taglia      TEXT DEFAULT '',
      colore      TEXT DEFAULT '',
      quantita    REAL DEFAULT 0,
      barcode     TEXT DEFAULT '',
      FOREIGN KEY (prodotto_id) REFERENCES prodotti(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_var_prodotto ON prodotto_varianti(prodotto_id);
    CREATE INDEX IF NOT EXISTS idx_var_barcode  ON prodotto_varianti(barcode);
  `);
} catch(_) {}

// Vendite al banco
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendite_banco (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      numero            TEXT NOT NULL,
      data              TEXT NOT NULL,
      cliente_nome      TEXT DEFAULT '',
      metodo_pagamento  TEXT DEFAULT 'CONTANTI',
      note              TEXT DEFAULT '',
      stato             TEXT DEFAULT 'EMESSA'
    );
    CREATE TABLE IF NOT EXISTS vendite_banco_righe (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      vendita_id  INTEGER NOT NULL,
      prodotto_id INTEGER,
      descrizione TEXT DEFAULT '',
      quantita    REAL DEFAULT 1,
      prezzo      REAL DEFAULT 0,
      sconto      REAL DEFAULT 0,
      iva         REAL DEFAULT 22,
      unita_misura TEXT DEFAULT '',
      FOREIGN KEY (vendita_id)  REFERENCES vendite_banco(id) ON DELETE CASCADE,
      FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
    );
  `);
} catch(_) {}

// Movimenti di magazzino (audit trail completo)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS movimenti_magazzino (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      data             TEXT NOT NULL,
      prodotto_id      INTEGER NOT NULL,
      prodotto_nome    TEXT DEFAULT '',
      tipo             TEXT NOT NULL,
      quantita         REAL NOT NULL,
      causale          TEXT DEFAULT '',
      documento_tipo   TEXT DEFAULT '',
      documento_id     INTEGER,
      documento_numero TEXT DEFAULT '',
      cliente_id       INTEGER,
      cliente_nome     TEXT DEFAULT '',
      fornitore_id     INTEGER,
      fornitore_nome   TEXT DEFAULT '',
      note             TEXT DEFAULT '',
      FOREIGN KEY (prodotto_id)  REFERENCES prodotti(id)  ON DELETE CASCADE,
      FOREIGN KEY (cliente_id)   REFERENCES clienti(id)   ON DELETE SET NULL,
      FOREIGN KEY (fornitore_id) REFERENCES fornitori(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mov_data        ON movimenti_magazzino(data);
    CREATE INDEX IF NOT EXISTS idx_mov_prodotto    ON movimenti_magazzino(prodotto_id);
    CREATE INDEX IF NOT EXISTS idx_mov_cliente     ON movimenti_magazzino(cliente_id);
  `);
} catch(_) {}

// Tabella molti-a-molti fatture ↔ ddt (supporta più DDT per fattura)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fatture_ddt (
      fattura_id INTEGER NOT NULL REFERENCES fatture(id) ON DELETE CASCADE,
      ddt_id     INTEGER NOT NULL REFERENCES ddt(id),
      PRIMARY KEY (fattura_id, ddt_id)
    );
    INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id)
      SELECT id, ddt_id FROM fatture WHERE ddt_id IS NOT NULL;
  `);
} catch(_) {}

// Utenti (multi-utente opzionale)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS utenti (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nome          TEXT DEFAULT '',
      email         TEXT DEFAULT '',
      ruolo         TEXT DEFAULT 'OPERATORE',
      attivo        INTEGER DEFAULT 1
    );
  `);
} catch(_) {}

// Solleciti pagamento (log invii)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS solleciti (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      documento_tipo      TEXT NOT NULL,
      documento_id        INTEGER NOT NULL,
      email_destinatario  TEXT DEFAULT '',
      data_invio          TEXT NOT NULL,
      esito               TEXT DEFAULT 'INVIATO'
    );
    CREATE INDEX IF NOT EXISTS idx_sol_doc ON solleciti(documento_tipo, documento_id);
  `);
} catch(_) {}

// Contatori numerazione progressiva annuale
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contatori (
      tipo     TEXT NOT NULL,
      anno     INTEGER NOT NULL,
      contatore INTEGER DEFAULT 0,
      PRIMARY KEY (tipo, anno)
    );
  `);
  // Inizializza contatori da documenti esistenti (per anno)
  const tipi = [
    { tipo: 'fatture',       table: 'fatture',       dateCol: 'data_emissione' },
    { tipo: 'ddt',           table: 'ddt',           dateCol: 'data_emissione' },
    { tipo: 'acquisti',      table: 'acquisti',      dateCol: 'data_emissione' },
    { tipo: 'ordini',        table: 'ordini',        dateCol: 'data_ordine' },
    { tipo: 'preventivi',    table: 'preventivi',    dateCol: 'data_emissione' },
    { tipo: 'note_credito',  table: 'note_credito',  dateCol: 'data_emissione' },
    { tipo: 'vendite_banco', table: 'vendite_banco', dateCol: 'data' },
    { tipo: 'arrivi_merce',  table: 'arrivi_merce',  dateCol: 'data' },
  ];
  for (const t of tipi) {
    try {
      const rows = db.prepare(
        `SELECT strftime('%Y', ${t.dateCol}) as anno, COUNT(*) as n FROM "${t.table}" GROUP BY anno`
      ).all();
      for (const r of rows) {
        if (r.anno) db.prepare(
          'INSERT OR IGNORE INTO contatori (tipo, anno, contatore) VALUES (?,?,?)'
        ).run(t.tipo, parseInt(r.anno), r.n);
      }
    } catch(_) {}
  }
} catch(_) {}

// Arrivi merce (entrata merci a magazzino)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arrivi_merce (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      numero                   TEXT NOT NULL,
      data                     TEXT NOT NULL,
      fornitore_id             INTEGER,
      acquisto_id              INTEGER,
      numero_documento_fornitore TEXT DEFAULT '',
      note                     TEXT DEFAULT '',
      stato                    TEXT DEFAULT 'RICEVUTO',
      FOREIGN KEY (fornitore_id) REFERENCES fornitori(id),
      FOREIGN KEY (acquisto_id)  REFERENCES acquisti(id)
    );
    CREATE TABLE IF NOT EXISTS arrivi_merce_righe (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      arrivo_merce_id  INTEGER NOT NULL,
      prodotto_id      INTEGER,
      variante_id      INTEGER,
      descrizione      TEXT DEFAULT '',
      codice_fornitore TEXT DEFAULT '',
      quantita         REAL DEFAULT 1,
      unita_misura     TEXT DEFAULT '',
      prezzo_acquisto  REAL DEFAULT 0,
      variante_taglia  TEXT DEFAULT '',
      variante_colore  TEXT DEFAULT '',
      FOREIGN KEY (arrivo_merce_id) REFERENCES arrivi_merce(id) ON DELETE CASCADE,
      FOREIGN KEY (prodotto_id)     REFERENCES prodotti(id),
      FOREIGN KEY (variante_id)     REFERENCES prodotto_varianti(id)
    );
    CREATE INDEX IF NOT EXISTS idx_arr_fornitore ON arrivi_merce(fornitore_id);
    CREATE INDEX IF NOT EXISTS idx_arr_data      ON arrivi_merce(data);
  `);
} catch(_) {}

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

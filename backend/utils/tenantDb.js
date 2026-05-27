const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { tenantDbPath } = require('./authDb');

const cache = new Map();

function openTenantDb(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const file = tenantDbPath(slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initTenantSchema(db);
  cache.set(slug, db);
  return db;
}

function getCachedTenantDb(slug) {
  return cache.get(slug) || null;
}

function initTenantSchema(db) {
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
      stato TEXT DEFAULT 'EMESSO',
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
      stato TEXT DEFAULT 'EMESSA',
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
      stato TEXT DEFAULT 'EMESSA',
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
      stato TEXT DEFAULT 'INVIATO',
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
    'ALTER TABLE prodotti ADD COLUMN barcode TEXT DEFAULT ""',
    'ALTER TABLE prodotti ADD COLUMN ha_varianti INTEGER DEFAULT 0',
    'ALTER TABLE pagamenti ADD COLUMN vendita_banco_id INTEGER',
    'ALTER TABLE vendite_banco_righe ADD COLUMN variante_id INTEGER',
    'ALTER TABLE vendite_banco_righe ADD COLUMN variante_taglia TEXT DEFAULT ""',
    'ALTER TABLE vendite_banco_righe ADD COLUMN variante_colore TEXT DEFAULT ""',
    'ALTER TABLE ddt ADD COLUMN causale_trasporto TEXT DEFAULT ""',
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
    'ALTER TABLE movimenti_magazzino ADD COLUMN variante_id INTEGER',
    'ALTER TABLE movimenti_magazzino ADD COLUMN variante_taglia TEXT DEFAULT ""',
    'ALTER TABLE movimenti_magazzino ADD COLUMN variante_colore TEXT DEFAULT ""',
    'ALTER TABLE prodotti ADD COLUMN codice_fornitore TEXT DEFAULT ""',
    'ALTER TABLE prodotti ADD COLUMN fornitore_id_preferito INTEGER',
    'ALTER TABLE prodotti ADD COLUMN riordino_quantita REAL DEFAULT 0',
    'ALTER TABLE azienda ADD COLUMN smtp_host TEXT DEFAULT ""',
    'ALTER TABLE azienda ADD COLUMN smtp_port INTEGER DEFAULT 587',
    'ALTER TABLE azienda ADD COLUMN smtp_user TEXT DEFAULT ""',
    'ALTER TABLE azienda ADD COLUMN smtp_pass TEXT DEFAULT ""',
    'ALTER TABLE azienda ADD COLUMN smtp_from TEXT DEFAULT ""',
    'ALTER TABLE azienda ADD COLUMN smtp_secure INTEGER DEFAULT 0',
    'ALTER TABLE azienda ADD COLUMN sdi_api_url TEXT DEFAULT ""',
    'ALTER TABLE azienda ADD COLUMN sdi_api_key TEXT DEFAULT ""',
    'ALTER TABLE azienda ADD COLUMN riordino_automatico INTEGER DEFAULT 0',
    'ALTER TABLE azienda ADD COLUMN multi_utente_attivo INTEGER DEFAULT 0',
    'ALTER TABLE fatture ADD COLUMN stato_sdi TEXT DEFAULT ""',
    'ALTER TABLE fatture ADD COLUMN data_invio_sdi TEXT DEFAULT ""',
    'ALTER TABLE fatture ADD COLUMN id_trasmissione_sdi TEXT DEFAULT ""',
    'ALTER TABLE ddt ADD COLUMN preventivo_id INTEGER',
    'ALTER TABLE ordini ADD COLUMN preventivo_id INTEGER',
    'ALTER TABLE azienda ADD COLUMN numerazione_annuale INTEGER DEFAULT 1',
    'ALTER TABLE azienda ADD COLUMN numero_prefissi TEXT DEFAULT "{}"',
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
    'ALTER TABLE ddt_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
    'ALTER TABLE fatture_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
    'ALTER TABLE note_credito_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
    'ALTER TABLE ordini_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
    'ALTER TABLE preventivi_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
    'ALTER TABLE acquisti_righe ADD COLUMN tipo TEXT DEFAULT "PRODOTTO"',
    `CREATE TABLE IF NOT EXISTS note_rapide (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      testo TEXT NOT NULL,
      ordine INTEGER DEFAULT 0
    )`,
    'ALTER TABLE clienti ADD COLUMN cellulare TEXT DEFAULT ""',
    'ALTER TABLE fornitori ADD COLUMN cellulare TEXT DEFAULT ""',
    'ALTER TABLE prodotti ADD COLUMN prezzo_acquisto REAL DEFAULT NULL',
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
    `CREATE TABLE IF NOT EXISTS bug_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titolo TEXT NOT NULL,
      descrizione TEXT NOT NULL,
      pagina TEXT DEFAULT '',
      priorita TEXT DEFAULT 'MEDIA' CHECK(priorita IN ('BASSA','MEDIA','ALTA')),
      stato TEXT DEFAULT 'APERTO' CHECK(stato IN ('APERTO','RISOLTO')),
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT DEFAULT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS listini (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      descrizione TEXT DEFAULT '',
      sconto_default REAL DEFAULT 0,
      attivo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS listini_prezzi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listino_id INTEGER NOT NULL,
      prodotto_id INTEGER NOT NULL,
      prezzo REAL,
      sconto REAL,
      FOREIGN KEY (listino_id) REFERENCES listini(id) ON DELETE CASCADE,
      FOREIGN KEY (prodotto_id) REFERENCES prodotti(id) ON DELETE CASCADE,
      UNIQUE(listino_id, prodotto_id)
    )`,
    'ALTER TABLE clienti ADD COLUMN listino_id INTEGER REFERENCES listini(id)',
    "ALTER TABLE clienti ADD COLUMN tipo_soggetto TEXT DEFAULT 'PRIVATO'",
    'ALTER TABLE clienti ADD COLUMN cig TEXT DEFAULT ""',
    'ALTER TABLE clienti ADD COLUMN cup TEXT DEFAULT ""',
    'ALTER TABLE clienti ADD COLUMN aliquota_iva_id INTEGER REFERENCES aliquote_iva(id)',
    `CREATE TABLE IF NOT EXISTS fatture_riferimenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fattura_id INTEGER NOT NULL REFERENCES fatture(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      numero TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '',
      cig TEXT DEFAULT '',
      cup TEXT DEFAULT '',
      commessa TEXT DEFAULT '',
      ordine INTEGER DEFAULT 0
    )`,
    'ALTER TABLE fatture_righe ADD COLUMN codice_iva TEXT DEFAULT ""',
    'ALTER TABLE ddt_righe ADD COLUMN codice_iva TEXT DEFAULT ""',
    'ALTER TABLE note_credito_righe ADD COLUMN codice_iva TEXT DEFAULT ""',
    'ALTER TABLE ordini_righe ADD COLUMN codice_iva TEXT DEFAULT ""',
    'ALTER TABLE preventivi_righe ADD COLUMN codice_iva TEXT DEFAULT ""',
    'ALTER TABLE acquisti_righe ADD COLUMN codice_iva TEXT DEFAULT ""',
    'ALTER TABLE fatture ADD COLUMN cig TEXT DEFAULT ""',
    'ALTER TABLE fatture ADD COLUMN cup TEXT DEFAULT ""',
    'ALTER TABLE aliquote_iva ADD COLUMN codice TEXT DEFAULT ""',
    'ALTER TABLE aliquote_iva ADD COLUMN categoria TEXT DEFAULT ""',
    'ALTER TABLE aliquote_iva ADD COLUMN descrizione TEXT DEFAULT ""',
    'ALTER TABLE aliquote_iva ADD COLUMN natura TEXT DEFAULT NULL',
    'ALTER TABLE aliquote_iva ADD COLUMN note TEXT DEFAULT ""',
    'ALTER TABLE aliquote_iva ADD COLUMN predefinito INTEGER DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS conti_acquisto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      predefinito_per TEXT DEFAULT '',
      attivo INTEGER DEFAULT 1
    )`,
    'ALTER TABLE acquisti ADD COLUMN conto_acquisto_id INTEGER REFERENCES conti_acquisto(id)',
    'ALTER TABLE categorie_prodotto ADD COLUMN aliquota_iva_id INTEGER REFERENCES aliquote_iva(id)',
    'ALTER TABLE ordini_righe ADD COLUMN codice_fornitore TEXT DEFAULT ""',
    "ALTER TABLE azienda ADD COLUMN email_mode TEXT DEFAULT 'SMTP'",
    'ALTER TABLE fornitori ADD COLUMN estero INTEGER DEFAULT 0',
    'ALTER TABLE clienti   ADD COLUMN estero INTEGER DEFAULT 0',
    // Agenda: appuntamenti generici + todo list
    `CREATE TABLE IF NOT EXISTS appuntamenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titolo TEXT NOT NULL,
      descrizione TEXT DEFAULT '',
      inizio TEXT NOT NULL,
      fine TEXT,
      tutto_giorno INTEGER DEFAULT 0,
      luogo TEXT DEFAULT '',
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      fornitore_id INTEGER REFERENCES fornitori(id) ON DELETE SET NULL,
      colore TEXT DEFAULT '#3b82f6',
      promemoria_min INTEGER,
      stato TEXT NOT NULL DEFAULT 'PIANIFICATO' CHECK(stato IN ('PIANIFICATO','COMPLETATO','ANNULLATO')),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_appuntamenti_inizio ON appuntamenti(inizio)',
    // Multi-utente: user_id = autore (FK soft verso auth.db.users.id);
    // condiviso = visibile ai membri dei gruppi dell'autore.
    'ALTER TABLE appuntamenti ADD COLUMN user_id INTEGER',
    'ALTER TABLE appuntamenti ADD COLUMN condiviso INTEGER DEFAULT 0',
    'CREATE INDEX IF NOT EXISTS idx_appuntamenti_user ON appuntamenti(user_id)',
    `CREATE TABLE IF NOT EXISTS todo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titolo TEXT NOT NULL,
      descrizione TEXT DEFAULT '',
      scadenza TEXT,
      priorita TEXT NOT NULL DEFAULT 'MEDIA' CHECK(priorita IN ('BASSA','MEDIA','ALTA')),
      stato TEXT NOT NULL DEFAULT 'DA_FARE' CHECK(stato IN ('DA_FARE','IN_CORSO','FATTA')),
      categoria TEXT DEFAULT '',
      completata_at TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_todo_scadenza ON todo(scadenza)',
    'ALTER TABLE todo ADD COLUMN user_id INTEGER',
    'CREATE INDEX IF NOT EXISTS idx_todo_user ON todo(user_id)',
    // CRM: stage + opportunità + attività
    `CREATE TABLE IF NOT EXISTS crm_stage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ordine INTEGER DEFAULT 0,
      colore TEXT DEFAULT '#6366f1',
      vinto INTEGER DEFAULT 0,
      perso INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS crm_opportunita (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titolo TEXT NOT NULL,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      contatto TEXT DEFAULT '',
      email TEXT DEFAULT '',
      telefono TEXT DEFAULT '',
      stage_id INTEGER REFERENCES crm_stage(id) ON DELETE SET NULL,
      valore REAL DEFAULT 0,
      probabilita INTEGER DEFAULT 50,
      data_prevista TEXT DEFAULT '',
      assegnatario TEXT DEFAULT '',
      note TEXT DEFAULT '',
      ordine INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS crm_attivita (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunita_id INTEGER REFERENCES crm_opportunita(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK(tipo IN ('CHIAMATA','EMAIL','RIUNIONE','TASK','NOTA')),
      titolo TEXT NOT NULL,
      descrizione TEXT DEFAULT '',
      data_pianificata TEXT,
      data_completamento TEXT,
      completata INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    // Timesheet / Commesse / Progetti
    `CREATE TABLE IF NOT EXISTS progetti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descrizione TEXT DEFAULT '',
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      stato TEXT DEFAULT 'APERTO' CHECK(stato IN ('APERTO','IN_CORSO','SOSPESO','CHIUSO')),
      data_inizio TEXT DEFAULT '',
      data_fine TEXT DEFAULT '',
      budget REAL DEFAULT 0,
      tariffa_oraria REAL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS timesheet_voci (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      progetto_id INTEGER REFERENCES progetti(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      ore REAL NOT NULL CHECK(ore > 0),
      descrizione TEXT DEFAULT '',
      utente TEXT DEFAULT '',
      fatturata INTEGER DEFAULT 0,
      fattura_id INTEGER REFERENCES fatture(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    // E-commerce sync (WooCommerce / Shopify)
    `CREATE TABLE IF NOT EXISTS ecommerce_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('WOOCOMMERCE','SHOPIFY')),
      nome TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT DEFAULT '',
      api_secret TEXT DEFAULT '',
      attivo INTEGER DEFAULT 1,
      last_sync TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS ecommerce_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER REFERENCES ecommerce_config(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK(tipo IN ('PRODOTTO','CLIENTE','ORDINE')),
      remote_id TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      last_sync TEXT DEFAULT (datetime('now')),
      UNIQUE(config_id, tipo, remote_id)
    )`,
    'ALTER TABLE ddt_righe ADD COLUMN codice_prodotto TEXT DEFAULT ""',
    'ALTER TABLE fatture_righe ADD COLUMN codice_prodotto TEXT DEFAULT ""',
    'ALTER TABLE note_credito_righe ADD COLUMN codice_prodotto TEXT DEFAULT ""',
    'ALTER TABLE preventivi_righe ADD COLUMN codice_prodotto TEXT DEFAULT ""',
    'ALTER TABLE ordini_righe ADD COLUMN codice_prodotto TEXT DEFAULT ""',
  ];
  for (const sql of migrations) { try { db.exec(sql); } catch(_) {} }

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
        variante_id      INTEGER,
        variante_taglia  TEXT DEFAULT '',
        variante_colore  TEXT DEFAULT '',
        FOREIGN KEY (prodotto_id)  REFERENCES prodotti(id)  ON DELETE CASCADE,
        FOREIGN KEY (cliente_id)   REFERENCES clienti(id)   ON DELETE SET NULL,
        FOREIGN KEY (fornitore_id) REFERENCES fornitori(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mov_data        ON movimenti_magazzino(data);
      CREATE INDEX IF NOT EXISTS idx_mov_prodotto    ON movimenti_magazzino(prodotto_id);
      CREATE INDEX IF NOT EXISTS idx_mov_cliente     ON movimenti_magazzino(cliente_id);
    `);
    // ALTER idempotenti per DB pre-esistenti (creati prima dell'aggiunta delle colonne).
    const movMigrations = [
      'ALTER TABLE movimenti_magazzino ADD COLUMN variante_id INTEGER',
      'ALTER TABLE movimenti_magazzino ADD COLUMN variante_taglia TEXT DEFAULT ""',
      'ALTER TABLE movimenti_magazzino ADD COLUMN variante_colore TEXT DEFAULT ""',
    ];
    for (const sql of movMigrations) { try { db.exec(sql); } catch(_) {} }
  } catch(_) {}

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

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contatori (
        tipo     TEXT NOT NULL,
        anno     INTEGER NOT NULL,
        contatore INTEGER DEFAULT 0,
        PRIMARY KEY (tipo, anno)
      );
    `);
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

  try {
    db.exec(`
      INSERT OR IGNORE INTO aliquote_iva (id, nome, valore, attiva) VALUES
        (1, 'Esente', 0, 1),
        (2, 'Prima necessità', 4, 1),
        (3, 'Agevolata', 10, 1),
        (4, 'Ordinaria', 22, 1)
    `);
  } catch(_) {}

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

  try {
    db.exec(`
      UPDATE tipi_pagamento SET nome='Bonifico 30 gg.'    WHERE id=5 AND nome='Bonifico 30gg';
      UPDATE tipi_pagamento SET nome='Bonifico 30 gg F.M.' WHERE id=6 AND nome='Bonifico 30gg FM';
      UPDATE tipi_pagamento SET nome='Bonifico 60 gg.'    WHERE id=7 AND nome='Bonifico 60gg';
      UPDATE tipi_pagamento SET nome='Bonifico 60 gg F.M.' WHERE id=8 AND nome='Bonifico 60gg FM';
    `);
  } catch(_) {}

  try {
    const insTP = db.prepare(`
      INSERT INTO tipi_pagamento (nome, conto, giorni_scadenza, fine_mese, immediato, attivo)
      SELECT ?, ?, ?, ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM tipi_pagamento WHERE nome=?)`);
    const imm = (nome, conto) => insTP.run(nome, conto, 0, 0, 1, nome);
    const def = (nome, conto, gg, fm) => insTP.run(nome, conto, gg, fm ? 1 : 0, 0, nome);
    imm('Assegno', 'BANCA');
    imm('Assegno circolare', 'BANCA');
    imm('Bancomat', 'BANCA');
    imm('Carta di pagamento', 'BANCA');
    imm('Contanti presso Tesoreria', 'CASSA');
    imm('Contrassegno', 'CASSA');
    imm('Incasso corrispettivi', 'CASSA');
    imm('PayPal', 'BANCA');
    imm('Satispay', 'BANCA');
    imm('TeamSystem Pay', 'BANCA');
    def('BONIFICO', 'BANCA', 0, false);
    def('Bonifico F.M.', 'BANCA', 0, true);
    def('Da definire', 'BANCA', 0, false);
    def('Pagato come da relativi documenti sopra indicati', 'BANCA', 0, false);
    def('RIMESSA DIRETTA', 'BANCA', 0, false);
    def('Segue fattura', 'BANCA', 0, false);
    def('Trattenuta su somme già riscosse', 'BANCA', 0, false);
    def('30 gg. F.M.', 'BANCA', 30, true);
    def('BONIFICO 30 gg D.F.F.M.', 'BANCA', 30, true);
    def('BONIFICO 30-60 gg. D.F.F.M.', 'BANCA', 30, true);
    def('BONIFICO 60 gg D.F.F.M.', 'BANCA', 60, true);
    def('BONIFICO 90 gg. F.M.', 'BANCA', 90, true);
    def('Domiciliazione bancaria', 'BANCA', 30, false);
    def('RIBA 30 gg F.M.', 'BANCA', 30, true);
    def('RIBA 30-60 gg F.M.', 'BANCA', 30, true);
    def('RIBA 30-60-90 gg F.M.', 'BANCA', 30, true);
    def('RIBA 60 gg F.M.', 'BANCA', 60, true);
    def('RIBA 90 gg F.M.', 'BANCA', 90, true);
    def('Rid', 'BANCA', 30, false);
    def('Rim. diretta 120gg. DFFM', 'BANCA', 120, true);
    def('SDD B2B', 'BANCA', 30, false);
    def('SDD Core', 'BANCA', 30, false);
  } catch(_) {}

  try {
    db.prepare("UPDATE aliquote_iva SET nome='Imponibile 22%',  codice='22',  categoria='Imponibile',  descrizione='Imponibile 22%',  predefinito=1 WHERE id=4").run();
    db.prepare("UPDATE aliquote_iva SET nome='Imponibile 10%',  codice='10',  categoria='Imponibile',  descrizione='Imponibile 10%'                     WHERE id=3").run();
    db.prepare("UPDATE aliquote_iva SET nome='Imponibile 4%',   codice='4',   categoria='Imponibile',  descrizione='Imponibile 4%'                      WHERE id=2").run();
    db.prepare("UPDATE aliquote_iva SET nome='Esente art. 10',  codice='E10', categoria='N4: Esente',  descrizione='Esente art. 10 DPR 633/72', natura='N4' WHERE id=1").run();

    const ins = db.prepare(`INSERT INTO aliquote_iva (nome,valore,codice,categoria,descrizione,natura,note,predefinito,attiva)
      SELECT ?,?,?,?,?,?,?,0,1 WHERE NOT EXISTS (SELECT 1 FROM aliquote_iva WHERE codice=?)`);
    const imp = (c,v,d,n) => ins.run(d,v,c,'Imponibile',d,null,n??'',c);
    const arc = (c,v,d) => ins.run(d,v,c,'Acq. reverse charge',d,null,'',c);
    const sp = (c,v,d) => ins.run(d,v,c,'Split payment',d,null,'Split payment verso P.A.',c);
    const nat = (c,v,cat,d,natura,n) => ins.run(d,v,c,cat,d,natura,n??'',c);
    imp('22d', 22, 'Imp. 22% detr. al 50%', '50% indetraibile');
    imp('22d40', 22, 'Imp. 22% detr. al 40%', '40% indetraibile');
    imp('22i', 22, 'Imp. 22% indetraibile', 'IVA totalmente indetraibile');
    imp('5', 5, 'Imponibile 5%');
    arc('22r', 22, 'Imp. 22% acquisti rev. charge art. 17');
    arc('22r74', 22, 'Imp. 22% acquisti rev. charge art. 74');
    arc('22u', 22, 'Imp. 22% acquisti UE');
    arc('22x', 22, 'Imp. 22% acquisti extra-UE');
    arc('10u', 10, 'Imp. 10% acquisti UE');
    arc('10x', 10, 'Imp. 10% acquisti extra-UE');
    arc('4u', 4, 'Imp. 4% acquisti UE');
    arc('4x', 4, 'Imp. 4% acquisti extra-UE');
    sp('22sp', 22, 'Imp. 22% con scissione pagamenti');
    sp('10sp', 10, 'Imp. 10% con scissione pagamenti');
    sp('5sp', 5, 'Imp. 5% con scissione pagamenti');
    sp('4sp', 4, 'Imp. 4% con scissione pagamenti');
    nat('X15', 0, 'N1: Escluso art. 15', 'Escluso art. 15 DPR 633/72', 'N1', 'Spese per conto dei clienti');
    nat('NS7u', 0, 'N2.1', 'Inv. contabile art. 7-ter DPR 633/72 UE', 'N2.1', 'Prestaz. servizi UE');
    nat('NS7x', 0, 'N2.1', 'Non sogg. art. 7-ter DPR 633/72 extra-UE', 'N2.1', 'Prestaz. servizi extra-UE');
    nat('FC', 0, 'N2.2', 'Fuori campo IVA', 'N2.2', 'Riservato alle Spese fuori campo IVA');
    nat('FC13', 0, 'N2.2', 'Fuori campo art. 13 c. 5 DPR 633/72', 'N2.2', 'Cessione acquisti con IVA parz. indetraibile');
    nat('NS26', 0, 'N2.2', 'Non sogg. art. 26 c. 3 DPR 633/72', 'N2.2', 'Nota di credito del solo imponibile');
    nat('NS74', 0, 'N2.2', 'Non sogg. art. 74 c. 1 DPR 633/72', 'N2.2', 'Tabacchi, editoria, ric. telefoniche');
    nat('RF', 0, 'N2.2', 'Art. 1 c.54-89 L.190/2014 Reg. forfettario', 'N2.2', 'Regime forfettario');
    nat('N8a', 0, 'N3.1', 'Non imp. art. 8 c. 1 lett. a DPR 633/72', 'N3.1', 'Cessioni extra-UE');
    nat('N8b', 0, 'N3.1', 'Non imp. art. 8 c. 1 lett. b DPR 633/72', 'N3.1', 'Cessioni extra-UE (trasp. a cura del cliente)');
    nat('N41', 0, 'N3.2', 'Non imp. art. 41 D.L. 331/93', 'N3.2', 'Cessioni UE');
    nat('N71', 0, 'N3.3', 'Non imp. art. 71 DPR 633/72 San Marino', 'N3.3', 'Cessioni San Marino');
    nat('N9', 0, 'N3.4', 'Non imp. art. 9 DPR 633/72', 'N3.4', 'Trasporti extra-UE');
    nat('N8c', 0, 'N3.5', "Non imp. art. 8 c. 1 lett. c DPR 633/72", 'N3.5', "Dichiarazione d'intento");
    nat('E10/72/49', 0, 'N4: Esente', 'Esente D.Lgs n. 504/95 e D.Lgs n. 398/95 art. 10', 'N4', '');
    nat('E124', 0, 'N4: Esente', 'Esente art. 124 D.L. 34/2020', 'N4', 'Cessione beni emergenza Covid-19');
    nat('Ei', 0, 'N4: Esente', 'Esente art. 74 Comma 7 e 8 DPR 633/72', 'N4', '');
    nat('OMG', 0, 'N4: Esente', 'Omaggi art. 2 c. 2 n. 4 DPR 633/72', 'N4', "Cessione gratuita beni oggetto dell'attività");
    nat('RM', 0, 'N5: Regime del margine', 'Regime del margine art. 36 DL 41/95', 'N5', 'Regime del margine');
    nat('EiRc', 0, 'N6', 'Esente art. 74 Comma 7 e 8 DPR 633/72', 'N6', '');
    nat('R74', 0, 'N6.1', 'Rev. charge art. 74 c. 7-8 DPR 633/72', 'N6.1', 'Cessione rottami');
    nat('R17a', 0, 'N6.3', 'Rev. charge art. 17 c. 6/a DPR 633/72', 'N6.3', 'Subappalto edilizia');
    nat('R17ab', 0, 'N6.4', 'Rev. charge art. 17 c. 6/a-bis DPR 633/72', 'N6.4', 'Cessione fabbricati');
    nat('R17b', 0, 'N6.5', 'Rev. charge art. 17 c. 6/b DPR 633/72', 'N6.5', 'Cessione cellulari');
    nat('R17c', 0, 'N6.6', 'Rev. charge art. 17 c. 6/c DPR 633/72', 'N6.6', 'Cessione microprocessori');
    nat('R17t', 0, 'N6.7', 'Rev. charge art. 17 c. 6/a-ter DPR 633/72', 'N6.7', 'Prestazioni servizi su edifici');
  } catch(e) { console.error('Seed aliquote IVA:', e.message); }

  try {
    const insC = db.prepare(`INSERT INTO conti_acquisto (nome, predefinito_per)
      SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM conti_acquisto WHERE nome=?)`);
    const c = (nome, pred='') => insC.run(nome, pred, nome);
    c('Abbonamenti riviste, giornali');
    c('Abbuoni e arrot. attivi');
    c('Abbuoni e arrot. passivi');
    c('Acquisto carburanti');
    c('Acquisto imballaggi');
    c('Acquisto libri e giornali');
    c('Acquisto ricariche, biglietti, bollo');
    c('Acquisto valori bollati');
    c('Altri costi del personale');
    c('Altri costi per servizi');
    c('Assicurazioni auto');
    c('Autocarri/autovetture');
    c('Autovetture (inded. 80%)');
    c('Bolli auto');
    c('Cancelleria e stampati');
    c('Canone affitto');
    c('Canone di manutenzione');
    c('Canoni di leasing veicoli');
    c('Carburanti e lubrificanti');
    c('Consulenze commercialisti');
    c('Consulenze del lavoro');
    c('Contributi enasarco');
    c('Costi di ampliamento');
    c('Diritti camerali');
    c('Fabbricati Ind.li e comm.li');
    c('Fitti passivi');
    c('Impianti generici');
    c('Imposte e tasse deducibili');
    c('Imposte e tasse indeducibili');
    c('Indumenti di lavoro');
    c('Interessi passivi v/fornitori');
    c('Lavorazioni di terzi p/produzione di beni');
    c('Licenze d\'uso software');
    c('Macchine elettromec. d\'ufficio');
    c('Manutenzione e rip. veicoli parz. ded.');
    c('Materiale pubblicitario');
    c('Materie di consumo c/acquisti');
    c('Materie prime c/acquisti');
    c('Materie prime c/acquisti per produzione servizi');
    c('Materie sussidiarie c/acquisti');
    c('Merci c/acquisti', 'Acquisti / Prestaz. servizi');
    c('Merci c/acquisti per produzione servizi');
    c('Mobili e arredi ufficio');
    c('Multe e sanzioni indeducibili');
    c('Note spese amministratori');
    c('Note spese dipendenti');
    c('Omaggi da fornitori');
    c('Oneri bancari');
    c('Oneri sociali cassa edile');
    c('Oneri sociali INAIL');
    c('Oneri sociali INPS');
    c('Pedaggi autostradali');
    c('Provvigioni a intermediari');
    c('Rit. d\'acconto', 'Rit. d\'acconto');
    c('Sconti e abbuoni su acquisti merci');
    c('Servizi di pulizia');
    c('Servizi internet');
    c('Spese condominiali');
    c('Spese di pubblicità');
    c('Spese di rappresentanza');
    c('Spese di trasferta');
    c('Spese legali e notarili');
    c('Spese postali');
    c('Spese recupero crediti (insoluti, protesti..)');
    c('Spese telefoniche');
    c('Stipendi');
    c('Tassa sui rifiuti');
    c('Terreni');
    c('TFR');
    c('TFR destinato a fondi pensione (-50 dip.)');
    c('Trasporti su acquisti');
    c('Trasporti su vendite');
    c('Utenze acqua');
    c('Utenze energia elettrica');
    c('Utenze gas riscaldamento');
    c('Vigilanza');
  } catch(e) { console.error('Seed conti acquisto:', e.message); }

  try { db.exec('ALTER TABLE azienda ADD COLUMN notifiche_config TEXT DEFAULT NULL'); } catch(_) {}
  try { db.exec("ALTER TABLE azienda ADD COLUMN email_corpo_documento TEXT DEFAULT NULL"); } catch(_) {}
  try {
    const row = db.prepare('SELECT email_corpo_documento FROM azienda WHERE id=1').get();
    if (row && (row.email_corpo_documento == null || row.email_corpo_documento === '')) {
      db.prepare('UPDATE azienda SET email_corpo_documento=? WHERE id=1')
        .run('Buongiorno,\nin allegato trovate il documento richiesto.\nRestiamo a disposizione per qualsiasi chiarimento.');
    }
  } catch(_) {}

  const docTables = ['fatture', 'ddt', 'ordini', 'preventivi', 'note_credito', 'acquisti', 'vendite_banco', 'arrivi_merce'];
  for (const t of docTables) {
    try {
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${t}_numero ON ${t}(numero)`);
    } catch (err) {
      console.warn(`[migrate] indice UNIQUE su ${t}.numero non creato (probabili duplicati esistenti): ${err.message}`);
    }
  }

  // Seed default CRM stages
  try {
    const cnt = db.prepare('SELECT COUNT(*) as n FROM crm_stage').get().n;
    if (cnt === 0) {
      const ins = db.prepare('INSERT INTO crm_stage (nome, ordine, colore, vinto, perso) VALUES (?,?,?,?,?)');
      ins.run('Lead',          1, '#94a3b8', 0, 0);
      ins.run('Qualificato',   2, '#6366f1', 0, 0);
      ins.run('Proposta',      3, '#f59e0b', 0, 0);
      ins.run('Trattativa',    4, '#8b5cf6', 0, 0);
      ins.run('Vinto',         5, '#16a34a', 1, 0);
      ins.run('Perso',         6, '#dc2626', 0, 1);
    }
  } catch(_) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        payload TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    `);
  } catch (err) {
    console.warn('[migrate] audit_log non creata:', err.message);
  }
}

module.exports = { openTenantDb, getCachedTenantDb, initTenantSchema };

/**
 * Applica una migrazione SQL a tutti i DB tenant esistenti e al template.
 *
 * Uso:
 *   MIGRATION="ALTER TABLE clienti ADD COLUMN pec TEXT DEFAULT ''" node scripts/migrate.js
 *
 * Oppure definisci MIGRATION direttamente nel codice (vedi sezione CONFIGURA QUI).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ── CONFIGURA QUI le migrazioni da applicare ──────────────────────────────────
// Puoi mettere più statement separati da ";" o usare la variabile d'ambiente MIGRATION.
const MIGRATION = process.env.MIGRATION || `
  -- Esempio: ALTER TABLE clienti ADD COLUMN pec TEXT DEFAULT '';
`;
// ─────────────────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');

function applica(filePath) {
  let db;
  try {
    db = new Database(filePath);
    db.pragma('journal_mode = WAL');
    // Ogni statement separato da ";" viene eseguito individualmente
    // in modo da poter saltare quelli già applicati (es. "duplicate column")
    const statements = MIGRATION
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        db.exec(stmt + ';');
        console.log(`  ✓ "${stmt.substring(0, 60)}..." su ${path.basename(filePath)}`);
      } catch (e) {
        // Errori comuni già applicati: duplicate column, table already exists
        const msg = e.message.toLowerCase();
        if (msg.includes('duplicate column') || msg.includes('already exists')) {
          console.log(`  ⊘ Già applicato: "${stmt.substring(0, 50)}..." (${path.basename(filePath)})`);
        } else {
          console.error(`  ✗ Errore su ${path.basename(filePath)}: ${e.message}`);
        }
      }
    }
  } finally {
    if (db) db.close();
  }
}

console.log('=== Migrazione tenant DB ===');
console.log(`DATA_DIR: ${DATA_DIR}`);
console.log(`TENANTS_DIR: ${TENANTS_DIR}`);
console.log('Migration:');
console.log(MIGRATION);
console.log('');

// Applica al template.db se esiste
const templatePath = path.join(DATA_DIR, 'template.db');
if (fs.existsSync(templatePath)) {
  console.log('→ template.db');
  applica(templatePath);
}

// Applica a tutti i DB tenant
if (!fs.existsSync(TENANTS_DIR)) {
  console.log('Nessuna directory tenants trovata, uscita.');
  process.exit(0);
}

const files = fs.readdirSync(TENANTS_DIR).filter(f => f.endsWith('.db') && !f.endsWith('-shm') && !f.endsWith('-wal'));
if (files.length === 0) {
  console.log('Nessun DB tenant trovato.');
  process.exit(0);
}

for (const f of files) {
  console.log(`→ tenants/${f}`);
  applica(path.join(TENANTS_DIR, f));
}

console.log('\n=== Fine migrazione ===');

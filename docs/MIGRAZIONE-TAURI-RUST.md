# Migrazione Electron → Tauri (riscrittura backend in Rust)

> Stato: **Fase 6 COMPLETA** · Avviata 2026-06-16 · Branch: `offline-electron`
>
> Avanzamento:
> - ✅ Fase 0 completata e verificata (app apre, /healthz, /api/me, serve SPA, DB+schema).
> - ✅ Fase 1 COMPLETA: infrastruttura (error.rs, web.rs, gemello.rs, stock.rs,
>   match_prodotti.rs, seed.sql) + 6 tabelle base + azienda + clienti(+indirizzi+stats)
>   + fornitori + **prodotti** (varianti, fornitori, alias, import, import-listino con
>   **fuzzy matching**) + **listini** (sanitizer, upsert, sezioni, resolve).
>   **Tutto verificato byte-identico a Node** con scenari CRUD diffati endpoint per endpoint.
> - ✅ Fase 2 COMPLETA: stock.rs (applicaRigheStock con movimenti+giacenze), magazzini
>   (depositi, giacenze, trasferimento, scadenze), movimenti-magazzino, arrivi-merce
>   (carico/storno PUT/PATCH/DELETE), riordino (proposte/genera), audit.rs.
>   Verificato byte-identico a Node (carico, storno, trasferimento, movimenti, ordini RO).
> - ✅ Fase 3 COMPLETA: numerazione (get_next_numero), riordino auto, e i 7 documenti
>   (ddt, preventivi, ordini, acquisti, vendite_banco, fatture, note_credito) con
>   conversioni, scarico/storno, campi fiscali (fiscale.rs: ritenuta/cassa/bollo),
>   pagamento immediato, da-ddt, stato-sdi. Verificato byte-identico a Node + tabelle.
>   Corretto un bug Node preesistente: colonne variante_* mancanti in
>   vendite_banco_righe su DB nuovo (ALTER prima del CREATE) — fix in entrambi i backend.
> - ✅ Fase 4 COMPLETA: xml.rs (build_fattura_pa TD01/TD04) + fattura_xml.rs
>   (XML, validate con 40+ regole SDI, invia-sdi via reqwest). **XML byte-identico
>   a Node** (fattura e nota credito confrontate carattere per carattere); validate identico.
> - ✅ Fase 5 COMPLETA: pagamenti, scadenzario, prima nota, riconciliazione (OFX/CSV),
>   stats (14 endpoint, incl. LIPE-XML e esterometro-CSV byte-identici, cashflow
>   timezone-aware) e reports (8 template). Verificato byte-identico a Node.
> - ✅ Fase 6 COMPLETA: **tutti i 54 mount offline** portati e verificati contro Node.
>   Domini DB: audit, notifications, note-rapide, bug-reports, prodotto-varianti,
>   moduli (catalogo+seed in auth.db), gruppi, utenti (bcrypt), fatture-ricorrenti
>   (quirk setUTCMonth), setup (demo+password), agenda (CRUD+calendario+ICS+feed HMAC),
>   allegati (multipart upload/download), crm, timesheet (genera-fattura), sdi-passive
>   (import FatturaPA via roxmltree), comandi (parser NLP IT, fancy-regex+valuta it-IT).
>   **Backup cifrato cross-compatibile col formato Node** (scrypt+AES-256-GCM ORDEVA2,
>   verificato in entrambe le direzioni con test) + run-if-due all'avvio.
>   Moduli network (email SMTP via lettre, piva openapi/VIES via reqwest, ecommerce):
>   path deterministici (config/validazione/preview-mailto/error) verificati; le sole
>   chiamate di rete reali (invio SMTP, lookup, sync store) non sono byte-verificabili
>   offline ma sono implementate (lettre/reqwest) o documentate come fuori scope.
>   Corretto un secondo bug Fase 0: nome utente locale 'Locale' → 'Utente locale'
>   (parità con LOCAL_USER + seed di server.js), emerso portando /api/utenti.
> - 🔨 Fase 7: packaging Tauri, misura RAM, dismissione Electron.
>
> Background job ancora da pianificare (cron in Node): emissione fatture ricorrenti
> dovute (7:00) e solleciti automatici (8:00). Il backup giornaliero è già coperto
> da run-if-due all'avvio; gli altri due richiedono uno scheduler nel runtime Tauri.
>
> Metodo di verifica adottato: avviare Node e Rust sugli stessi dati seed e diffare
> le risposte JSON degli endpoint (script in cronologia). Aggiunto helper `web::num()`
> per la parità di formattazione dei REAL (4.0 → 4, come better-sqlite3+JSON.stringify).

## Obiettivo
Ridurre la RAM dell'edizione desktop offline (oggi ~350-450 MB: Chromium + Node)
sostituendo il guscio Electron con **Tauri** (WebView di sistema) e riscrivendo il
backend Node/Express (~23k righe) in **Rust**. RAM attesa: ~80-150 MB.

Motivazione misurata: il backend Node consuma ~90 MB a DB vuoto (cresce con dati
reali); Chromium è il resto. Il rewrite Rust elimina entrambi.

## Decisione architetturale
**Un solo binario Tauri (Rust) che incorpora un server HTTP axum su `127.0.0.1:PORT`.**

- axum serve sia `/api/*` (logica riscritta) sia la SPA Angular (asset statici),
  esattamente come oggi fa Express. La WebView di Tauri punta a `http://127.0.0.1:PORT/`.
- **Il frontend Angular resta invariato**: stesso `apiUrl`, stesso interceptor auth,
  stesso token in localStorage. Cambia solo il bridge desktop (`window.ordevaDesktop`,
  4 funzioni) che passa ai comandi nativi Tauri (dialog/shell).
- Scartata la strada "comandi `invoke()` per ogni chiamata": 75 endpoint REST già
  esistenti renderebbero il refactor del data-layer Angular enorme e inutile.

### Stack Rust
| Node | Rust |
|---|---|
| express | axum + tower-http |
| better-sqlite3 | rusqlite (bundled) |
| AsyncLocalStorage (tenant) | task-local / extension axum |
| bcryptjs | bcrypt |
| token HMAC custom | hmac + sha2 |
| fast-xml-parser (FatturaPA) | quick-xml (build manuale, ordine elementi critico) |
| nodemailer | lettre |
| node-cron | tokio + scheduler |
| AES-256-GCM backup | aes-gcm + scrypt |
| calcoli fiscali | rust_decimal (evita errori float, 2 decimali half-up) |
| reqwest per SDI/OCR/ecommerce/PIVA | reqwest |

## Roadmap a fasi (ogni fase è verificabile contro la UI reale)
- **Fase 0** — Toolchain + scaffold Tauri/axum/rusqlite, schema DB completo (auth.db +
  tenant.db), auth offline (utente `local`/OWNER), serve la SPA. Gate: app si apre,
  `/api/me` risponde.
- **Fase 1** — Anagrafiche: azienda, clienti(+indirizzi), fornitori, prodotti(+varianti,
  fornitori, alias), listini, tabelle base (aliquote_iva, unita_misura, tipi_pagamento,
  causali, conti_acquisto, categorie).
- **Fase 2** — Magazzino: giacenze, movimenti, `applicaRigheStock` (invariante!),
  magazzini, arrivi merce, riordino.
- **Fase 3** — Documenti: ddt, ordini, preventivi, acquisti, vendite_banco, fatture,
  note_credito + numerazione (`getNextNumero`/retry) + conversioni (ordine→ddt, ddt→fattura).
- **Fase 4** — 🔴 FatturaPA: `buildFatturaPA` (TD01/TD04), validazione SDI (40+ regole),
  utils/fiscale (ritenuta/cassa/bollo/riepiloghi), invio SDI, import SDI passive.
- **Fase 5** — Contabilità: pagamenti, scadenzario, prima_nota, riconciliazione (OFX/CSV),
  stats, reports.
- **Fase 6** — Trasversali offline: backup cifrato, email SMTP, agenda(+ICS), audit,
  notifiche, OCR (Mindee online + eventuale fallback locale). Integrazioni cloud
  (Stripe billing/paylink, ecommerce) degradate offline.
- **Fase 7** — Packaging Tauri (dmg/nsis/AppImage), misura RAM reale, dismissione Electron.

## Fase 7 — Misure e packaging (2026-06-16)

**Build release** `cargo build --release` (LTO, opt-level "s", strip): OK in ~2m41s.

**Footprint su disco**
| | Tauri + Rust | Electron + Node |
|---|---|---|
| Binario/app | **13 MB** (binario, SQLite incluso) | Chromium bundled ~150 MB+ |
| Dipendenze dev | rust target (cache) | `electron/node_modules` **538 MB** + `backend/node_modules` 31 MB |
| Modulo nativo | nessuno (SQLite compilato nel binario) | `better-sqlite3` da ricompilare per l'ABI (`electron-rebuild`) — fragile |

**RAM (RSS misurato lanciando l'app, macOS, WKWebView)**
- processo `ordeva-desktop` (Rust backend + host WebView): **~98 MB**
- WKWebView (rendering SPA Angular): WebContent ~111 MB, GPU ~38 MB, Networking ~24 MB —
  **XPC di sistema, in larga parte condivisi** tra le app che usano WKWebView.

Nota onesta: su macOS il rendering usa il WebView di sistema (come WebView2 su Windows e
WebKitGTK su Linux), quindi l'RSS "doppio-conta" framework condivisi e il confronto a
runtime è meno netto del disco. I guadagni certi: **niente runtime Node/V8 in-process,
niente Chromium impacchettato, niente ricompilazione di moduli nativi**, binario 13 MB.
L'app Electron legacy non si è nemmeno avviata pulita in questo ambiente (richiede
`electron-rebuild`), a riprova del costo di manutenzione che il port elimina.

**Packaging (passo manuale, sulla macchina dell'utente o in CI)**
```bash
cargo install tauri-cli      # una volta
cd src-tauri && cargo tauri build   # → target/release/bundle (.dmg / .nsis / .AppImage)
```
macOS/Windows richiedono firma per la distribuzione (come oggi per Electron).

**Fatti dopo le misure:**
- ✅ Workflow CI `tauri-release.yml` (matrix Win/macOS Intel+ARM/Linux, build frontend
  offline + `tauri-action`, draft release su tag `v*`).
- ✅ Scheduler offline `jobs.rs` (catch-up all'avvio + ogni 6h): emissione fatture
  ricorrenti dovute (verificato e2e) e solleciti automatici via SMTP (no-op senza config).
  Insieme a `run_if_due`, copre tutti e tre i cron di Node.

Resta solo, lato utente: `cargo tauri build` per produrre i bundle firmati (o un push
di tag `v*` per farli generare dalla CI), e la dismissione fisica della cartella
`electron/` una volta pubblicato e validato il primo bundle Tauri.

## Fase 8 — "App vera": niente server, dati visibili, sync Dropbox (2026-06-23, v1.2.15)

Tre cambi per far sembrare l'edizione offline un'app installata e non un sito locale.

1. **Niente porta TCP.** Il server axum non è più in ascolto su `127.0.0.1:3000`: si registra
   un **custom URI scheme** `ordeva://` (`register_asynchronous_uri_scheme_protocol`) e ogni
   richiesta della WebView viene instradata **in-process** nel `Router` axum via
   `ServiceExt::oneshot` (`server::handle_request`). `build_router` è invariato (riuso totale
   delle 54 route). La WebView carica `ordeva://localhost/?v=…` (Windows: `http://ordeva.localhost`).
   `environment.offline.ts` usa `apiUrl: '/api'` (same-origin). `capabilities/default.json`:
   `remote.urls` aggiornate allo scheme. Verificato a runtime: nessuna porta in LISTEN, SPA+API
   funzionanti (screenshot dashboard).
   - NB: l'origin cambia (localhost:3000 → ordeva://localhost), quindi il `localStorage`
     pre-esistente (preferenze UI, sblocco di sessione) riparte da zero una tantum. I **dati**
     (SQLite) non sono in localStorage: restano intatti.

2. **Cartella dati visibile e spostabile** (`config.rs`). Risoluzione: `DATA_DIR` env >
   `app_config_dir/ordeva.json` > **default `Documenti/Ordeva`**. Migrazione one-time: al primo
   avvio i dati della vecchia cartella nascosta (`app_data_dir/data`) vengono **copiati** nella
   nuova (la vecchia resta come backup). `LEGGIMI.txt` nella cartella. UI in Impostazioni →
   "Dati e sincronizzazione" (`routes/sistema.rs`: GET `percorsi`, POST `data-dir`).

3. **Dropbox-safe** (`db.rs` + `lock.rs`). `AppState::flush()` = `wal_checkpoint(TRUNCATE)` su
   tutte le connessioni → sincronizza un solo `.db` pulito; chiamato all'uscita
   (`RunEvent::ExitRequested`), sul blur della finestra, e da "Chiudi in sicurezza"
   (POST `sistema/flush` + exit). `ordeva.lock` (host/pid/heartbeat ogni 30s) → all'avvio, se
   risulta una sessione viva su un ALTRO host, avviso nella SPA (GET `sistema/lock`). Uso
   sequenziale (un PC alla volta); il simultaneo resta sconsigliato.

## Note di parità critiche (non regredire)
- **XML FatturaPA byte-compatibile**: ordine elementi e formattazione numeri devono
  combaciare con l'output Node; testare con fatture reali e XMLValidator/SDI.
- **Invariante stock**: `somma(giacenze per deposito) == prodotti.quantita`. Tutte le
  mutazioni documento dentro transazioni.
- **Schema DB invariato**: il Rust apre gli STESSI file auth.db / tenants/<slug>.db con
  lo stesso schema → backup esistenti e dati utente restano validi (no migrazione dati).
- **Token/sessione**: in OFFLINE_MODE l'auth è bypassata (utente `local`, OWNER, tenant
  `default`), come oggi.

## Riferimenti recon
Mappa completa endpoint/tabelle prodotta il 2026-06-16 (vedi cronologia chat / agenti
di esplorazione). File chiave Node: `server.js`, `utils/{tenantDb,authDb,tenantContext,
authToken,fiscale,nextNumero,stock,backup}.js`, `routes/{fatturaXml,fatture,prodotti,
stats,email,agenda}.js`.

# Migrazione Electron → Tauri (riscrittura backend in Rust)

> Stato: **Fase 1 in corso** (tabelle base fatte) · Avviata 2026-06-16 · Branch: `offline-electron`
>
> Avanzamento:
> - ✅ Fase 0 completata e verificata (app apre, /healthz, /api/me, serve SPA, DB+schema).
> - 🔨 Fase 1: infrastruttura route (error.rs, web.rs, seed.sql) + 6 tabelle base
>   (unita-misura, aliquote-iva, causali, conti-acquisto, categorie-prodotto,
>   tipi-pagamento) — **output JSON byte-identico a Node** (diff verificato su dati seed).
>   Restano: azienda, clienti(+indirizzi), fornitori, prodotti(+varianti,fornitori,alias), listini.
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

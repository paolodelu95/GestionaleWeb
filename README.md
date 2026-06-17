# Ordeva — Gestionale (edizione desktop offline)

Gestionale completo per piccole imprese: anagrafiche, magazzino, ciclo attivo e
passivo, fatturazione elettronica, listini, contabilità e report.
**Versione locale, single-user, senza login né cloud** — i dati restano sul PC.
**Angular 21 + backend Rust (axum) + SQLite, impacchettato con Tauri** — riscrittura
del backend (prima Node/Express su Electron) per ridurre drasticamente la RAM.
Il backend Rust replica byte-per-byte le risposte di quello Node (verificato
endpoint per endpoint). Il packaging Electron è stato **rimosso**; i sorgenti
restano recuperabili dalla storia git (vedi [`electron/README.md`](electron/README.md)).

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

> Repo: `Ordeva` · Prodotto: **Ordeva** · Branch: `offline-electron`
> (la versione Cloud/SaaS vive sul branch `main`).

---

> ### 🧪 Progetto in *vibecoding*
> Questo software è sviluppato in **vibecoding**: il codice è scritto quasi
> interamente tramite assistenti AI, guidati a conversazione e iterati passo
> passo. Non lo nascondo — anzi, è parte dell'esperimento. Di conseguenza
> possono esserci scelte non convenzionali: usalo tenendolo presente, leggi il
> codice prima di metterlo in produzione e segnala pure ciò che non torna.

---

## Indice
- [Cos'è l'edizione offline](#cosè-ledizione-offline)
- [Download](#-download)
- [Funzionalità](#funzionalità)
- [Novità recenti](#novità-recenti)
- [Avvio rapido (sviluppo)](#avvio-rapido-sviluppo)
- [Creare una release scaricabile](#creare-una-release-scaricabile)
- [Dove sono i dati / backup](#dove-sono-i-dati--backup)
- [Stack tecnico](#stack-tecnico)
- [Licenza](#licenza)

---

## Cos'è l'edizione offline

App desktop che gira **tutta in locale**, pensata per chi vuole il gestionale sul
proprio computer senza account, abbonamenti o server:

- **Nessun login**: si apre già pronta (utente locale, tutti i moduli sbloccati).
- **Dati sul tuo PC**: un file SQLite nella cartella utente; nessun dato esce dal
  computer (a parte le integrazioni online che attivi tu, es. OCR).
- **Email** tramite il **client di posta del sistema** (`mailto:`): niente SMTP da
  configurare.
- **Backup automatico cifrato** su cartella locale o cloud sincronizzato.
- Distribuita come **installer** o **eseguibile portatile** per Windows, macOS, Linux.

---

## ⬇️ Download

Versioni pronte all'uso dalla pagina
**[Releases](https://github.com/paolodelu95/Ordeva/releases)**:

| Sistema | Installer | Portatile (senza installazione) |
|---|---|---|
| Windows | `Ordeva-Setup-x.y.z.exe` | `Ordeva-x.y.z.exe` (doppio clic, niente setup) |
| macOS | `Ordeva-x.y.z.dmg` | `Ordeva-x.y.z-mac.zip` |
| Linux | `ordeva_x.y.z_amd64.deb` | `Ordeva-x.y.z.AppImage` |

---

## Funzionalità

### Anagrafiche
- **Clienti** e **fornitori** con validazione P.IVA/Codice Fiscale, autocompletamento
  città, indirizzi multipli, ricerca azienda per ragione sociale.
- **Doppio ruolo**: un cliente può essere anche fornitore (e viceversa) tramite un
  record "gemello" sincronizzato.
- Scorciatoia rapida: **fatture del cliente** / **acquisti del fornitore** (lista già
  filtrata). Import da **Excel** con mappatura colonne assistita.

### Prodotti & Magazzino
- Prodotti con **varianti** (taglia/colore), barcode (+ scanner da fotocamera), più
  **fornitori** con codice e prezzo dedicato, prezzo d'acquisto e **margine**.
- **Peso, dimensioni e immagine** per prodotto (usati in DDT, listini e preventivi).
- **Duplica prodotto**, inserimento rapido, import Excel, **import listino fornitore**
  con abbinamento automatico (match fuzzy su descrizione + memoria codici).
- **Magazzini multipli** con giacenze per deposito, **lotti e scadenze**,
  **trasferimenti** tra depositi e alert scadenze.
- Soglie minime, **riordino automatico** / proposte d'ordine, rettifica giacenza e
  inventario a scansione, **movimenti** e **arrivi merce** (con storno/ricarico).
- **Creazione rapida prodotto** al volo da dentro un documento.

### Vendite (ciclo attivo)
- **Preventivi** con **margine di guadagno interno** (a video, non stampato),
  conversione in DDT/ordine, toggle immagini prodotto nella stampa.
- **Ordini cliente**, **Documenti di trasporto** (colli/peso calcolati dai prodotti,
  dati trasporto, firme; anche **reso a fornitore**).
- **Fatture** (con generazione da DDT, pagamento immediato), **Note di credito**,
  **Fatture ricorrenti**, **Vendita al banco** (cassa veloce, pagamenti misti).
- **Listini** prezzi per cliente: editor a colonne personalizzabili, sconti, prezzi
  override, peso/dimensioni, sezioni, creazione rapida e stampa PDF a temi.

### Fatturazione elettronica
- **Fatture elettroniche emesse** (XML FatturaPA, TD01) e **note di credito** (TD04).
- **Fatture passive (SDI)**: import dell'XML del fornitore con creazione bozza acquisto.
- **OCR fatture** PDF (opzionale, via Mindee — richiede connessione).

### Acquisti (ciclo passivo)
- **Acquisti**, **ordini fornitore**, carico magazzino, abbinamento prezzi e
  generazione arrivo merce dall'acquisto.

### Contabilità
- **Pagamenti**, **scadenzario**, **prima nota**, **riconciliazione bancaria**
  (import OFX/CSV), strumenti di **compliance** lato applicazione.

### Trasversali
- **Dashboard** con KPI, **Report** (andamento + tabellari).
- **Agenda** con promemoria, **Storico** (audit log delle modifiche).
- **Stampe PDF personalizzabili**: editor della grafica documento con **temi/preset**
  e **anteprima live** (colonne, numero riga disattivabile, logo, piè di pagina).
- **Ricerca globale / palette comandi** (⌘K), inserimento "tutto da tastiera"
  (codice + Invio sulle righe), filtri lista che si **azzerano** al cambio schermata,
  tema chiaro/scuro.
- **Impostazioni**: dati azienda, numerazione documenti, tipi pagamento, categorie,
  unità di misura, aliquote IVA, note rapide, causali.

---

## Novità recenti

- **Backup automatico giornaliero cifrato** (AES-256-GCM) su cartella locale o cloud
  (Drive/Dropbox), con avvisi se il backup manca da troppi giorni.
- **Ripristino backup** dall'app: da file (anche `.enc` cifrato) e al **primo avvio**,
  con **restore cross-PC** (decifratura tramite password d'accesso).
- **Password d'accesso** opzionale all'apertura dell'app.
- **Segnalazioni / bug report via email** direttamente dall'app.
- **Controllo aggiornamenti**: all'avvio l'app confronta la versione installata
  (esposta da `/healthz`) con l'ultima release su GitHub e, se più recente, mostra
  un avviso in alto con il link per scaricarla.
- Icona app nativa (incluso lo stile macOS).

---

## Aggiornamenti

L'app **controlla all'avvio** se c'è una versione più recente sulla pagina
[Releases](https://github.com/paolodelu95/Ordeva/releases) e mostra un
avviso con il pulsante **Scarica** (apre la release su GitHub). È attivo da subito,
non richiede configurazione.

### (Opzionale) Auto-aggiornamento in-app "che sostituisce i file"
Per far sì che l'app **scarichi e installi** la nuova versione da sola (senza
reinstallare a mano), Tauri offre l'updater firmato. Attivazione una tantum:

1. Genera la coppia di chiavi: `npm create tauri-app` non serve — usa
   `cargo tauri signer generate -w ~/.tauri/ordeva.key` (oppure `npx @tauri-apps/cli signer generate`).
2. Metti la **chiave pubblica** in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
   e abilita `bundle.createUpdaterArtifacts: true`; aggiungi l'endpoint
   `https://github.com/paolodelu95/Ordeva/releases/latest/download/latest.json`.
3. Aggiungi il crate `tauri-plugin-updater` e registralo in `main.rs`.
4. Salva su GitHub (Settings → Secrets → Actions) `TAURI_SIGNING_PRIVATE_KEY` e
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; `tauri-action` genererà `latest.json` e i
   file `.sig` nella release automaticamente.

> Richiede la chiave di firma (passo 1) perché Tauri **rifiuta** aggiornamenti non
> firmati: è una misura di sicurezza, non aggirabile. Su macOS l'auto-install
> richiede inoltre un'app firmata Apple.

---

## Avvio rapido (sviluppo)

Prerequisiti: **Node.js 20+**.

### Backend + Frontend (web, per sviluppo)
```bash
cd backend  && npm install && node server.js     # http://localhost:3000
cd frontend && npm install && ng serve            # http://localhost:4200
```
Il database SQLite viene creato al primo avvio.

### App desktop (Tauri + Rust) — edizione corrente
```bash
cd frontend && ng build --configuration offline   # SPA → frontend/dist/frontend/browser
cd ../src-tauri
cargo build                # build di sviluppo del backend Rust + finestra Tauri
cargo install tauri-cli    # una volta sola
cargo tauri build          # genera il pacchetto (.dmg / .nsis / .AppImage) in target/release/bundle
```
Il backend Rust (axum) gira in-process su `127.0.0.1:3000` e serve sia `/api/*`
sia la SPA; la WebView di sistema (WKWebView/WebView2/WebKitGTK) carica da lì.

> L'edizione **Electron** (backend Node/Express + Chromium bundled) è stata
> rimossa a favore di Tauri. Storia e ripristino in [`electron/README.md`](electron/README.md).

---

## Creare una release scaricabile

Gli eseguibili si pubblicano come **GitHub Releases**, generate da un **tag**:

```bash
git checkout offline-electron
git tag v1.0.0
git push origin v1.0.0
```

Il workflow [`.github/workflows/tauri-release.yml`](.github/workflows/tauri-release.yml)
builda su **Windows, macOS (Intel + Apple Silicon) e Linux** (matrix), compila il
frontend offline + il backend Rust e crea una **Release in bozza** con i bundle
(NSIS/MSI, `.dmg`, `.deb`/`.AppImage`). Controlli e premi **Publish**. Nessun modulo
nativo da ricompilare: SQLite è dentro il binario.

> macOS e Linux si compilano **solo** sui rispettivi runner: per questo la build gira
> in CI. Richiede *Settings → Actions → General → Workflow permissions* = **Read and write**.
> La firma (macOS/Windows) va aggiunta come secret se serve la distribuzione fuori CI.

---

## Dove sono i dati / backup

I database vivono nella cartella utente del sistema:
- Windows: `%APPDATA%/Ordeva/data`
- macOS: `~/Library/Application Support/Ordeva/data`
- Linux: `~/.config/Ordeva/data`

Per un backup manuale basta copiare quella cartella (contiene `auth.db` e
`tenants/*.db`). In più l'app fa un **backup automatico cifrato** nella cartella che
imposti (anche su cloud), ripristinabile dalle Impostazioni.

---

## Stack tecnico

- **Frontend**: Angular 21 standalone, Angular Material
- **Backend**: Node.js + Express, better-sqlite3 (SQLite file-based)
- **Desktop**: Electron + electron-builder
- **PDF**: jsPDF · **Crittografia backup**: AES-256-GCM + scrypt

> 🚧 **In sperimentazione**: è in corso una riscrittura del guscio desktop da
> **Electron a Tauri** con backend in **Rust** (axum + rusqlite), per ridurre RAM e
> dimensione dell'eseguibile mantenendo il frontend Angular invariato. Lavoro
> incrementale e verificato (vedi [`docs/MIGRAZIONE-TAURI-RUST.md`](docs/MIGRAZIONE-TAURI-RUST.md));
> l'edizione Electron resta quella di riferimento per ora.

---

## Licenza

**AGPL-3.0-or-later** — © Paolo De Luca. Vedi [`LICENSE`](LICENSE).

Chi distribuisce il software o lo offre come servizio in rete deve rendere disponibile
il codice sorgente, modifiche incluse. Per usi commerciali senza gli obblighi della
AGPL è disponibile una **licenza commerciale separata** (dual-licensing): contatta
l'autore.

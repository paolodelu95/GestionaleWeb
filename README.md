# Ordeva — Gestionale

Gestionale completo per piccole imprese: anagrafiche, magazzino, ciclo attivo e
passivo, fatturazione elettronica, listini, contabilità e report.
**Angular 21 + Node.js (Express) + SQLite.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

> Repo: `GestionaleWeb` · Prodotto: **Ordeva**

---

## Indice
- [Due edizioni](#due-edizioni)
- [Download (desktop)](#-download-edizione-desktop)
- [Funzionalità](#funzionalità)
- [Avvio rapido (sviluppo)](#avvio-rapido-sviluppo)
- [Edizione desktop offline](#edizione-desktop-offline)
- [Creare una release scaricabile](#creare-una-release-scaricabile)
- [Dove sono i dati / backup](#dove-sono-i-dati--backup)
- [Configurazione (.env)](#configurazione-env)
- [Stack tecnico](#stack-tecnico)
- [Licenza](#licenza)

---

## Due edizioni

| | **Cloud / SaaS** (branch `main`) | **Offline desktop** (branch `offline-electron`) |
|---|---|---|
| Accesso | login multi-utente, multi-tenant | nessun login, single-user |
| Dati | sul server | sul PC dell'utente (SQLite locale) |
| Email | SMTP configurabile | client di posta del sistema (`mailto:`) |
| Distribuzione | web app | app desktop (Electron): installer **o** portable |
| Costi di gestione | hosting | nessuno (gira in locale) |

## ⬇️ Download (edizione desktop)

Versioni pronte all'uso dalla pagina
**[Releases](https://github.com/paolodelu95/GestionaleWeb/releases)**:

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
- Scorciatoia rapida dal menu: **fatture del cliente** / **acquisti del fornitore**
  (apre la lista già filtrata).
- Import da **Excel** con mappatura colonne assistita.

### Prodotti & Magazzino
- Prodotti con **varianti** (taglia/colore), barcode (+ scanner da fotocamera),
  più **fornitori** con codice e prezzo dedicato, prezzo d'acquisto e **margine**.
- **Peso, dimensioni e immagine** per prodotto (usati in DDT, listini e preventivi).
- **Duplica prodotto**, inserimento rapido, import Excel, import listino fornitore.
- Soglie minime, riordino automatico, rettifica giacenza, **movimenti** e
  **arrivi merce**, magazzini multipli.
- **Creazione rapida prodotto** al volo da dentro un documento.

### Vendite (ciclo attivo)
- **Preventivi** con **margine di guadagno interno** (a video, non stampato),
  conversione in DDT/ordine, toggle immagini prodotto nella stampa.
- **Ordini cliente**, **Documenti di trasporto** (colli/peso calcolati dai prodotti,
  dati trasporto, firme; anche **reso a fornitore**).
- **Fatture** (con generazione da DDT, pagamento immediato), **Note di credito**,
  **Fatture ricorrenti**, **Vendita al banco** (cassa veloce).
- **Listini** prezzi per cliente: editor a colonne personalizzabili, sconti,
  prezzi override, peso/dimensioni, creazione rapida e stampa PDF a temi.

### Fatturazione elettronica
- **Fatture elettroniche emesse e ricevute (SDI)**, generazione XML.
- **OCR fatture** PDF (opzionale, via Mindee).

### Acquisti (ciclo passivo)
- **Acquisti**, **ordini fornitore**, carico magazzino, abbinamento prezzi.

### Contabilità
- **Pagamenti**, **scadenzario**, **prima nota**, **riconciliazione bancaria**
  (import OFX/CSV), **compliance** (LIPE, esterometro, export).

### Trasversali
- **Dashboard** con KPI, **Report** (andamento + tabellari).
- **Agenda** con promemoria, **Storico** (audit log delle modifiche).
- **Stampe PDF** personalizzabili: grafica, temi, colonne (numero riga
  disattivabile), logo, piè di pagina.
- **Ricerca globale / palette comandi** (⌘K), filtri lista che si **azzerano** al
  cambio schermata, **PWA** installabile, tema chiaro/scuro.
- **Impostazioni**: dati azienda, numerazione documenti, tipi pagamento, categorie,
  unità di misura, aliquote IVA, note rapide, causali. *(SaaS: moduli, utenti
  multi-ruolo, console amministrazione.)*

---

## Avvio rapido (sviluppo)

Prerequisiti: **Node.js 20+**.

### Backend
```bash
cd backend
npm install
node server.js          # http://localhost:3000
```
Configurazione tramite `.env` (vedi [`backend/.env.example`](backend/.env.example)).
Il database SQLite viene creato automaticamente al primo avvio.

### Frontend
```bash
cd frontend
npm install
ng serve                # http://localhost:4200
```

---

## Edizione desktop offline

App locale, single-user, senza login né cloud (Electron). Dettagli completi in
[`electron/README.md`](electron/README.md).

```bash
cd electron
npm install      # scarica Electron + ricompila better-sqlite3 per il suo ABI
npm run build    # compila il frontend (config "offline") in backend/public
npm start        # avvia l'app desktop
npm run dist     # genera installer + portatili in electron/dist/
```

Differenze rispetto alla SaaS: nessun login (utente locale OWNER), tutti i moduli
sbloccati, email tramite il client di sistema (`mailto:`), niente trial/abbonamenti.

---

## Creare una release scaricabile

Gli eseguibili si pubblicano come **GitHub Releases**, generate da un **tag** —
indipendente dal branch (puoi taggare `offline-electron` senza toccare `main`):

```bash
git checkout offline-electron
git tag v1.0.0
git push origin v1.0.0
```

Il workflow [`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml)
builda su **Windows, macOS e Linux** (matrix), ricompila `better-sqlite3` per
Electron su ciascun OS e crea una **Release in bozza** con tutti i file allegati
(installer + portatili). Controlli gli allegati e premi **Publish**.

> Richiede *Settings → Actions → General → Workflow permissions* = **Read and write**.
> macOS e Linux si possono compilare **solo** sui rispettivi runner: questo è il
> motivo della build in CI (da una sola macchina non è possibile).

---

## Dove sono i dati / backup

**Sviluppo / server**: file SQLite in `backend/` (`auth.db`, `tenants/*.db`).

**App desktop**: nella cartella utente del sistema —
- Windows: `%APPDATA%/Ordeva/data`
- macOS: `~/Library/Application Support/Ordeva/data`
- Linux: `~/.config/Ordeva/data`

Per il **backup** basta copiare quella cartella (contiene tutto il database).

---

## Configurazione (.env)

Copia `backend/.env.example` in `backend/.env`. Variabili principali:

| Variabile | Descrizione |
|---|---|
| `PORT` | porta del server (default 3000) |
| `OFFLINE_MODE` | `1` = edizione offline (no login, single-tenant) |
| `DATA_DIR` | cartella dei database (auto in Electron) |
| `AUTH_SECRET` | segreto per i token (obbligatorio fuori da OFFLINE_MODE) |
| `AUTH_USER` / `AUTH_PASS` | admin iniziale (modalità SaaS) |
| `MINDEE_API_KEY` | OCR fatture (opzionale) |

---

## Stack tecnico

- **Frontend**: Angular 21 standalone, Angular Material, PWA
- **Backend**: Node.js + Express, better-sqlite3 (SQLite file-based),
  multi-tenant via AsyncLocalStorage
- **Desktop**: Electron + electron-builder
- **PDF**: jsPDF

---

## Licenza

**AGPL-3.0-or-later** — © Paolo De Luca. Vedi [`LICENSE`](LICENSE).

Chi distribuisce il software o lo offre come servizio in rete deve rendere
disponibile il codice sorgente, modifiche incluse. Per usi commerciali senza gli
obblighi della AGPL è disponibile una **licenza commerciale separata**
(dual-licensing): contatta l'autore.

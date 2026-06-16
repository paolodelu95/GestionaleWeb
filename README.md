# Ordeva — Gestionale (edizione Cloud / SaaS)

Gestionale completo per piccole imprese: anagrafiche, magazzino, ciclo attivo e
passivo, fatturazione elettronica, listini, contabilità e report.
**Multi-utente e multi-tenant**, accessibile da browser.
**Angular 21 + Node.js (Express) + SQLite.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

> Repo: `GestionaleWeb` · Prodotto: **Ordeva** · Branch: `main` (edizione Cloud/SaaS).
> Esiste anche un'**edizione desktop offline** sul branch `offline-electron`.

---

> ### 🧪 Progetto in *vibecoding*
> Questo software è sviluppato in **vibecoding**: il codice è scritto quasi
> interamente tramite assistenti AI, guidati a conversazione e iterati passo
> passo. Non lo nascondo — anzi, è parte dell'esperimento. Di conseguenza
> possono esserci scelte non convenzionali: usalo tenendolo presente, leggi il
> codice prima di metterlo in produzione e segnala pure ciò che non torna.

---

## Indice
- [Due edizioni](#due-edizioni)
- [Funzionalità](#funzionalità)
- [Avvio rapido (sviluppo)](#avvio-rapido-sviluppo)
- [Deploy (produzione)](#deploy-produzione)
- [Configurazione (.env)](#configurazione-env)
- [Multi-tenant & dati](#multi-tenant--dati)
- [Stack tecnico](#stack-tecnico)
- [Licenza](#licenza)

---

## Due edizioni

| | **Cloud / SaaS** (branch `main`) | **Offline desktop** (branch `offline-electron`) |
|---|---|---|
| Accesso | login multi-utente, multi-tenant | nessun login, single-user |
| Dati | sul server (un DB SQLite per tenant) | sul PC dell'utente (SQLite locale) |
| Email | SMTP configurabile | client di posta del sistema (`mailto:`) |
| Pagamenti/abbonamenti | Stripe (trial + Pro) | n/d (tutto sbloccato) |
| Distribuzione | web app (Docker / Fly.io) | app desktop (Electron): installer **o** portable |

---

## Funzionalità

### Anagrafiche
- **Clienti** e **fornitori** con validazione P.IVA/Codice Fiscale, autocompletamento
  città, indirizzi multipli, ricerca azienda per ragione sociale.
- **Doppio ruolo**: un cliente può essere anche fornitore (e viceversa) tramite un
  record "gemello" sincronizzato.
- Import da **Excel** con mappatura colonne assistita.

### Prodotti & Magazzino
- Prodotti con **varianti** (taglia/colore), barcode (+ scanner da fotocamera), più
  **fornitori** con codice e prezzo dedicato, prezzo d'acquisto e **margine**.
- **Peso, dimensioni e immagine** per prodotto (usati in DDT, listini e preventivi).
- **Import listino fornitore** con abbinamento automatico (match fuzzy + memoria codici).
- **Magazzini multipli** con giacenze per deposito, **lotti e scadenze**, trasferimenti
  e alert scadenze. Soglie minime, **riordino automatico**, rettifica/inventario,
  **movimenti** e **arrivi merce**.

### Vendite (ciclo attivo)
- **Preventivi** con **margine interno** (a video, non stampato), conversione in DDT/ordine.
- **Ordini cliente**, **DDT** (colli/peso, dati trasporto, firme; anche reso a fornitore).
- **Fatture** (generazione da DDT, pagamento immediato), **Note di credito**,
  **Fatture ricorrenti**, **Vendita al banco** (cassa veloce, pagamenti misti).
- **Listini** prezzi per cliente: editor a colonne personalizzabili, sconti, override,
  sezioni e stampa PDF a temi.

### Fatturazione elettronica
- **Fatture elettroniche emesse** (XML FatturaPA TD01) e **note di credito** (TD04),
  invio **SDI** via provider configurabile.
- **Fatture passive (SDI)**: import dell'XML del fornitore con bozza acquisto.
- **OCR fatture** PDF (opzionale, via Mindee).

### Acquisti (ciclo passivo)
- **Acquisti**, **ordini fornitore**, carico magazzino, abbinamento prezzi e arrivo merce.

### Contabilità
- **Pagamenti**, **scadenzario**, **prima nota**, **riconciliazione bancaria** (OFX/CSV),
  strumenti di **compliance** lato applicazione.

### Funzioni SaaS (solo edizione Cloud)
- **Login multi-utente** e **multi-tenant** (un'azienda = un tenant isolato), con
  registrazione, verifica email e reset password.
- **Utenti e ruoli** (OWNER/OPERATORE…), **gruppi** e visibilità condivisa (agenda).
- **Moduli attivabili** per tenant e **console super-admin**.
- **Abbonamenti Stripe** (trial + piano Pro) e **link di pagamento** per incassare le
  fatture online; **sincronizzazione e-commerce** (WooCommerce/Shopify).
- Email transazionali via **SMTP** (verifica account, reset, solleciti automatici).

### Trasversali
- **Dashboard** con KPI, **Report**, **Agenda** con promemoria e feed **ICS**,
  **Storico** (audit log).
- **Stampe PDF personalizzabili**: editor della grafica documento con temi/preset e
  anteprima live (colonne, logo, piè di pagina).
- **Ricerca globale / palette comandi** (⌘K), inserimento "tutto da tastiera",
  **PWA** installabile, tema chiaro/scuro.
- **Impostazioni**: dati azienda, numerazione, tipi pagamento, categorie, unità di
  misura, aliquote IVA, note rapide, causali.

---

## Avvio rapido (sviluppo)

Prerequisiti: **Node.js 20+**.

```bash
# dall'intera repo
npm run install:all        # installa backend + frontend
npm run dev                # backend (3000) + frontend (4200) in parallelo
```

Oppure separatamente:
```bash
cd backend  && npm install && node server.js     # http://localhost:3000
cd frontend && npm install && ng serve            # http://localhost:4200
```
Copia [`backend/.env.example`](backend/.env.example) in `backend/.env`. Il database
SQLite viene creato al primo avvio.

---

## Deploy (produzione)

Immagine **Docker** pronta ([`Dockerfile`](Dockerfile)) — builda il frontend e serve la
SPA dal backend Express:

```bash
docker build -t ordeva .
docker run -p 3000:3000 --env-file backend/.env -v ordeva-data:/data ordeva
```

Deploy su **Fly.io** tramite [`fly.toml`](fly.toml):
```bash
fly deploy
```

In produzione: imposta `NODE_ENV=production`, `AUTH_SECRET`, e — se usi Stripe —
`STRIPE_SECRET_KEY` **e** `STRIPE_WEBHOOK_SECRET` (obbligatorio, fail-closed). I dati
persistono sul volume montato in `DATA_DIR` (es. `/data`).

---

## Configurazione (.env)

| Variabile | Descrizione |
|---|---|
| `PORT` | porta del server (default 3000) |
| `NODE_ENV` | `production` in produzione |
| `DATA_DIR` | cartella dei database (`auth.db`, `tenants/*.db`) |
| `AUTH_SECRET` | segreto hex per i token (obbligatorio fuori da OFFLINE_MODE) |
| `AUTH_USER` / `AUTH_PASS` | admin iniziale |
| `CORS_ORIGIN` | origini consentite (CSV) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | abbonamenti e pay-link (Stripe) |
| `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` | price id dei piani |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | email di sistema |
| `APP_BASE_URL` | URL pubblico (link nelle email, redirect Stripe) |
| `MINDEE_API_KEY` | OCR fatture (opzionale) |
| `OFFLINE_MODE` | `1` solo per l'edizione desktop (no login) |

---

## Multi-tenant & dati

Ogni azienda è un **tenant** isolato: `auth.db` contiene tenant, utenti, ruoli e
moduli; ciascun tenant ha il proprio file `tenants/<slug>.db` con tutti i suoi dati.
Il tenant corrente è risolto per richiesta via **AsyncLocalStorage**. Per il backup
basta copiare `DATA_DIR`.

---

## Stack tecnico

- **Frontend**: Angular 21 standalone, Angular Material, PWA
- **Backend**: Node.js + Express, better-sqlite3 (SQLite file-based),
  multi-tenant via AsyncLocalStorage, token HMAC, cron (backup/solleciti/ricorrenti)
- **Integrazioni**: Stripe, Nodemailer (SMTP), Mindee (OCR), WooCommerce/Shopify
- **PDF**: jsPDF · **Deploy**: Docker / Fly.io

---

## Licenza

**AGPL-3.0-or-later** — © Paolo De Luca. Vedi [`LICENSE`](LICENSE).

Chi distribuisce il software o lo offre come servizio in rete deve rendere disponibile
il codice sorgente, modifiche incluse. Per usi commerciali senza gli obblighi della
AGPL è disponibile una **licenza commerciale separata** (dual-licensing): contatta
l'autore.

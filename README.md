# Ordeva — Gestionale

Gestionale completo per piccole imprese: anagrafiche, magazzino, preventivi, ordini,
documenti di trasporto, fatture (anche elettroniche/SDI), listini, pagamenti,
scadenzario e report. **Angular 21 + Node.js (Express) + SQLite.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

> Repo: `GestionaleWeb` · Prodotto: **Ordeva**

## Due edizioni

| | **Cloud / SaaS** (branch `main`) | **Offline desktop** (branch `offline-electron`) |
|---|---|---|
| Accesso | login multi-utente, multi-tenant | nessun login, single-user |
| Dove girano i dati | server | sul PC dell'utente (SQLite locale) |
| Email | SMTP configurabile | client di posta del sistema (`mailto:`) |
| Distribuzione | web app | app desktop (Electron): installer **o** portable |

## ⬇️ Download (edizione desktop)

Le versioni pronte all'uso si scaricano dalla pagina
**[Releases](https://github.com/paolodelu95/GestionaleWeb/releases)**:

| Sistema | Installer | Portatile (senza installazione) |
|---|---|---|
| Windows | `Ordeva-Setup-x.y.z.exe` | `Ordeva-x.y.z.exe` (doppio clic, niente setup) |
| macOS | `Ordeva-x.y.z.dmg` | `Ordeva-x.y.z-mac.zip` |
| Linux | `ordeva_x.y.z_amd64.deb` | `Ordeva-x.y.z.AppImage` |

I dati restano in locale nella cartella utente del sistema (vedi
[`electron/README.md`](electron/README.md)); per il backup basta copiarla.

## Funzionalità principali

- **Anagrafiche** clienti e fornitori (con doppio ruolo cliente↔fornitore)
- **Magazzino**: prodotti con varianti, peso/dimensioni/immagine, soglie e movimenti
- **Vendite**: preventivi (con margine interno), ordini, documenti di trasporto
  (anche resi a fornitore), fatture, note di credito, ricorrenti, vendita al banco
- **Listini** prezzi per cliente con sconti e colonne personalizzabili
- **Fatturazione elettronica (SDI)** emesse e ricevute
- **Contabilità**: pagamenti, scadenzario, prima nota, riconciliazione
- **Stampe PDF** personalizzabili (grafica, colonne, loghi)
- **Report** e dashboard con KPI

## Sviluppo (da sorgente)

### Backend
```bash
cd backend && npm install && node server.js     # http://localhost:3000
```
Configurazione tramite `.env` (vedi [`backend/.env.example`](backend/.env.example)).

### Frontend
```bash
cd frontend && npm install && ng serve           # http://localhost:4200
```

### Edizione desktop offline
```bash
cd electron && npm install      # scarica Electron + ricompila better-sqlite3
npm run build                   # compila il frontend (config offline) in backend/public
npm start                       # avvia l'app desktop
npm run dist                    # genera installer + portatili in electron/dist/
```
Dettagli completi in [`electron/README.md`](electron/README.md).

## Stack tecnico

- **Frontend**: Angular 21 standalone, Angular Material, PWA
- **Backend**: Node.js + Express, better-sqlite3 (SQLite, file-based)
- **Desktop**: Electron + electron-builder
- **PDF**: jsPDF

## Licenza

**AGPL-3.0-or-later** — © Paolo De Luca. Vedi [`LICENSE`](LICENSE).

Chi distribuisce il software o lo offre come servizio in rete deve rendere
disponibile il codice sorgente, modifiche incluse. Per usi commerciali senza gli
obblighi della AGPL è disponibile una **licenza commerciale separata**
(dual-licensing): contatta l'autore.

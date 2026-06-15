# GestionaleWeb

Gestionale magazzino web — Angular 21 + Node.js + SQLite.

## Struttura

```
GestionaleWeb/
├── backend/       Node.js (Express 5) + better-sqlite3
└── frontend/      Angular 21 + Angular Material
```

## Avvio rapido

### Backend

```bash
cd backend
npm install
node server.js
```

Il server parte su **http://localhost:3000**.  
Il database SQLite viene creato automaticamente come `backend/gestionale.db` al primo avvio.

### Frontend

```bash
cd frontend
npm install
ng serve
```

L'app parte su **http://localhost:4200**.

## Sezioni disponibili

| Sezione | Percorso |
|---|---|
| Dashboard | `/dashboard` |
| Prodotti | `/prodotti` |
| Clienti | `/clienti` |
| Fornitori | `/fornitori` |
| DDT | `/ddt` |
| Fatture | `/fatture` |
| Note di Credito | `/note-credito` |
| Ordini | `/ordini` |
| Preventivi | `/preventivi` |
| Scadenzario | `/scadenzario` |
| Pagamenti | `/pagamenti` |
| Report | `/report` |
| Impostazioni | `/impostazioni` |

## Note tecniche

- Il backend espone REST API su `/api/*` (CORS abilitato per localhost:4200)
- Lo stato delle fatture si aggiorna automaticamente a `PAGATA` quando i pagamenti coprono il totale
- Lo scadenzario mostra solo fatture con stato `EMESSA` e saldo rimanente > 0
- I campi città nella scheda clienti/fornitori supportano autocomplete con normalizzazione degli accenti

## Edizione offline (desktop)

Il branch `offline-electron` contiene una versione **locale, single-user, senza login né cloud** (Electron) — backend + frontend sul PC dell'utente, dati in un file SQLite locale, email tramite il client di sistema. Vedi [`electron/README.md`](electron/README.md).

## Licenza

**AGPL-3.0-or-later** — © Paolo De Luca. Vedi [`LICENSE`](LICENSE).

Se distribuisci il software o lo offri come servizio in rete, devi rendere disponibile il codice sorgente (modifiche incluse). Per usi commerciali senza gli obblighi della AGPL è disponibile una **licenza commerciale separata** (dual-licensing): contatta l'autore.

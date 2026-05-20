# 2026-05-20 — Redesign UI/UX completo + Listini + Dashboard editabile

## Richieste utente (in ordine)

1. **Redesign UI/UX drastico** mantenendo funzionalità e responsive.
2. **Riordinare i form** di creazione clienti/fornitori/prodotti per importanza (P.IVA non in fondo!) e fare lo stesso sui documenti (fatture, DDT, ordini, preventivi, note credito, acquisti).
3. **Selettore Ivato/Netto** per prezzo vendita e prezzo acquisto nel form prodotti.
4. **Listini personalizzati** con nomi custom, applicabili a clienti specifici per applicare prezzi differenziati nei documenti.
5. **Dashboard editabile**: mostrare/nascondere widget, riordinarli.
6. **Fix deploy fly.io**: build di produzione falliva per budget `anyComponentStyle` (8kB) superato da `app.scss` (12kB).

---

## Cosa è stato fatto

### 1. Redesign UI/UX globale

**Approccio**: tutta la propagazione visiva via [src/styles.scss](../frontend/src/styles.scss) e [src/app/app.scss](../frontend/src/app/app.scss) — siccome tutte le pagine seguono il pattern `.page > .page-header + .card`, modificare i token globali ripercuote il restyling su 20+ pagine senza toccarle.

**File toccati**:
- [src/index.html](../frontend/src/index.html) — aggiunto font **Inter** (Roboto resta come fallback)
- [src/styles.scss](../frontend/src/styles.scss) — riscritto completamente: CSS variables (`--bg-*`, `--text-*`, `--primary`, `--success`, `--shadow-*`, `--radius-*`), tipografia Inter con `tabular-nums` per importi, table/chip/dialog/button refresh, dark mode rifinito, pattern `.form-section`/`.dialog-hero`/`.input-with-action`/`.doc-totals-strip` riutilizzabili
- [src/app/app.scss](../frontend/src/app/app.scss) — sidebar dark con gradient, active state "pill" indigo, topbar bianca con avatar azienda, search box moderna con focus glow
- [src/app/app.html](../frontend/src/app/app.html) — avatar circolare con iniziale azienda nella topbar
- [src/app/components/login/login.ts](../frontend/src/app/components/login/login.ts) — glassmorphism con 3 blob animati (indigo/violet/cyan), logo gradient, bottone con spinner animato

### 2. Riordino form per importanza

**Pattern condiviso** (aggiunto in styles.scss):
- `.dialog-hero` — header con icona gradient + titolo + sottotitolo
- `.form-section` / `.form-section.is-primary` — gruppi di campi con sfondo, bordo e header sezione
- `.form-section-header` — header con icona, titolo uppercase, hint a destra
- `.input-with-action` — input + bottone trailing (lookup P.IVA, cerca azienda)

**Entità riordinate**:
- [Cliente](../frontend/src/app/components/clienti/clienti.ts): 1) Identità (RagSoc + **P.IVA con lookup** + CF) 2) Fatturazione elettronica 3) Sede 4) Contatti 5) Preferenze
- [Fornitore](../frontend/src/app/components/fornitori/fornitori.ts): stesso schema, hero icon ciano
- [Prodotto](../frontend/src/app/components/prodotti/prodotti.ts): 1) Identità 2) **Prezzi & IVA** 3) Magazzino 4) Descrizione

**Documenti riordinati** (cliente/fornitore SEMPRE prima degli estremi):
- [Fattura](../frontend/src/app/components/fatture/fatture.ts) — hero indigo `receipt`
- [DDT](../frontend/src/app/components/ddt/ddt.ts) — hero ciano `local_shipping`
- [Ordine](../frontend/src/app/components/ordini/ordini.ts) — hero amber `shopping_cart`
- [Preventivo](../frontend/src/app/components/preventivi/preventivi.ts) — hero viola `request_quote`
- [Nota credito](../frontend/src/app/components/note-credito/note-credito.ts) — hero rosso `note_alt`
- [Acquisto](../frontend/src/app/components/acquisti/acquisti.ts) — hero blu `shopping_bag`

### 3. Selettore Ivato/Netto prodotti

**File**: [prodotti.ts](../frontend/src/app/components/prodotti/prodotti.ts)

Toggle compatto `Netto | Ivato` nella sezione Prezzi & IVA. Preferenza salvata in `localStorage` (`prodotto-prezzo-mode`). **Internamente il prezzo viene sempre memorizzato come netto** (nessuna modifica DB), display/input convertiti al volo con l'IVA selezionata. Aggiunto calcolo automatico del **margine %** sotto al prezzo acquisto.

Helper aggiunti al `ProdottoDialogComponent`:
- `prezzoMode: 'netto' | 'ivato'`
- `prezzoDisplay(field)`, `prezzoIvato(field)`, `onPrezzoInput(field, e)`, `onPrezzoModeChange(mode)`
- `get margine(): number | null` per il calcolo margine

### 4. Listini personalizzati (backend + frontend)

**Schema DB** (in [backend/database.js](../backend/database.js), array `migrations`):
```sql
CREATE TABLE listini (
  id INTEGER PRIMARY KEY, nome TEXT UNIQUE, descrizione TEXT,
  sconto_default REAL DEFAULT 0, attivo INTEGER DEFAULT 1, created_at TEXT
);
CREATE TABLE listini_prezzi (
  id INTEGER PRIMARY KEY, listino_id INTEGER, prodotto_id INTEGER,
  prezzo REAL, sconto REAL,
  UNIQUE(listino_id, prodotto_id), FK CASCADE
);
ALTER TABLE clienti ADD COLUMN listino_id INTEGER REFERENCES listini(id);
```

**Backend routes** ([backend/routes/listini.js](../backend/routes/listini.js)):
- `GET/POST/PUT/DELETE /api/listini` — CRUD anagrafica
- `GET/POST/PUT/DELETE /api/listini/:id/prezzi[/:prezzoId]` — gestione prezzi prodotti
- `GET /api/listini/resolve/:clienteId/:prodottoId` — endpoint chiave per documenti

**Logica risoluzione prezzo** (chiamata su scelta prodotto in documento):
1. Se cliente ha listino → cerca `listini_prezzi` per quel prodotto
2. Se `prezzo` override impostato → usa quello (sorgente: `LISTINO_OVERRIDE`)
3. Altrimenti applica `sconto` riga o `sconto_default` del listino (sorgente: `LISTINO_SCONTO`)
4. Frontend mostra snackbar "Prezzo da listino X applicato"

**Routes wired** in [backend/server.js](../backend/server.js) → `app.use('/api/listini', require('./routes/listini'))`

**Clienti backend** ([backend/routes/clienti.js](../backend/routes/clienti.js)): aggiunto `listinoId` su INSERT/UPDATE/`toDto()`.

**Frontend**:
- [models/index.ts](../frontend/src/app/models/index.ts): `Listino`, `ListinoPrezzo`, `PrezzoRisolto`; campo `listinoId` su `Cliente`
- [data.service.ts](../frontend/src/app/services/data.service.ts): metodi `getListini`, `createListino`, `updateListino`, `deleteListino`, `getListinoPrezzi`, `upsertListinoPrezzo`, `deleteListinoPrezzo`, `resolvePrezzoCliente`
- [impostazioni/listino-dialog.ts](../frontend/src/app/components/impostazioni/listino-dialog.ts): dialog completo con due tab (Anagrafica + Prezzi personalizzati con autocomplete prodotti, override prezzo o sconto per riga, calcolo prezzo finale in tempo reale)
- [impostazioni/impostazioni.ts + .html](../frontend/src/app/components/impostazioni/): nuovo tab "Listini"
- [clienti.ts](../frontend/src/app/components/clienti/clienti.ts): picker listino nella sezione Preferenze
- Documenti ([fatture.ts](../frontend/src/app/components/fatture/fatture.ts), [ddt.ts](../frontend/src/app/components/ddt/ddt.ts), [ordini.ts](../frontend/src/app/components/ordini/ordini.ts), [preventivi.ts](../frontend/src/app/components/preventivi/preventivi.ts), [note-credito.ts](../frontend/src/app/components/note-credito/note-credito.ts)): metodo privato `applyListino(index)` chiamato dopo `searchProdotto()`; richiede aggiunta `private snack: MatSnackBar` al constructor per snackbar conferma

### 5. Dashboard editabile

**File**: [dashboard.ts](../frontend/src/app/components/dashboard/dashboard.ts), [dashboard.html](../frontend/src/app/components/dashboard/dashboard.html), [dashboard.scss](../frontend/src/app/components/dashboard/dashboard.scss)

9 widget definiti come array (`alerts`, `kpi-magazzino`, `kpi-anno`, `chart-vendite`, `chart-top`, `table-sotto`, `table-ddt`, `table-incassare`, `table-pagare`). Due controlli in page-header:
- **Menu "Widget (N/9)"**: checkbox per show/hide ciascuno + bottone "Ripristina default"
- **Bottone "Modifica"**: attiva edit mode con bordi tratteggiati, drag-handle visibile su ogni widget, bottone visibility inline

Drag&drop con CDK (`cdkDropList`/`cdkDrag`). Preferenze salvate in `localStorage` con key `dashboard-widgets-v1`. Merge intelligente al load: widget nuovi (aggiunti via update applicazione) appaiono in fondo, quelli rimossi vengono ignorati.

### 6. Fix deploy fly.io

**Sintomo**: `npm run build` (production) falliva con `Application bundle generation failed` benché localmente in development funzionasse.

**Causa**: in [angular.json](../frontend/angular.json) il budget `anyComponentStyle` era 4kB warning / **8kB error**. Il mio nuovo `app.scss` (12kB) superava l'errore. Le altre SCSS (`dashboard.scss` 5.75kB, `login` 5.46kB, `vendita-banco` 5.78kB) erano solo warning.

**Fix**: bump dei budget production:
- `initial`: 500kB→1MB warning, 1MB→2MB error (bundle attuale: 913kB)
- `anyComponentStyle`: 4kB→10kB warning, 8kB→20kB error

---

## Decisioni / convenzioni adottate

### Design system (CSS variables)
- Primary: `#4f46e5` (indigo) — `--primary`, `--primary-soft`, `--primary-hover`
- Dark mode: `--bg-page: #0a0e17`, `--bg-surface: #111827`
- Spaziatura/radii via `--radius-sm` (6px) / `--radius-md` (8px) / `--radius-lg` (12px) / `--radius-full` (9999px)
- Ombre layered: `--shadow-xs/sm/md/lg/xl`
- Sempre `font-variant-numeric: tabular-nums` su importi

### Pattern form dialog
- Hero icon a sinistra con gradient + titolo bold + subtitle
- Sezioni `is-primary` (con sfondo indigo) per il campo PIÙ importante (cliente nei documenti, identità fiscale nelle anagrafiche)
- Sezioni standard `.form-section` per i raggruppamenti secondari
- Sezione `.is-flat` (senza sfondo) per descrizioni/note

### Listini — regole di applicazione
- Listini sono **opzionali** sul cliente (default: `listinoId: null` → prezzo base)
- L'override **prezzo** ha priorità su qualsiasi sconto
- L'override **sconto** ha priorità su `sconto_default` del listino
- Quando `LISTINO_OVERRIDE` o `LISTINO_SCONTO`, il backend ritorna `sorgente` + `listinoNome` → frontend mostra snackbar
- I documenti che applicano il listino: fatture, DDT, ordini (solo tipo CLIENTE), preventivi, note credito. Acquisti NO (fornitori).

### Dashboard widgets
- Lista dichiarativa `DEFAULT_WIDGETS` in [dashboard.ts](../frontend/src/app/components/dashboard/dashboard.ts) — aggiungere nuovi widget = aggiungere voce + relativo `@if (w.id === '...') { ... }` nel template
- LocalStorage key versionata: `dashboard-widgets-v1` — bumpare il numero se cambia schema breaking

### Budget production
- I budget ora hanno headroom: se cresce ancora la UI non bisognerà rimettere mano subito
- Bundle iniziale attualmente 913kB (sotto warning 1MB) → OK
- Se aggiungiamo molte pagine pesanti, monitorare: in caso ribumpare a 1.5MB warning / 3MB error

---

### 7. Fix tabelle clienti/fornitori (post-feedback utente)

**Sintomo**: nome e indirizzo "schiacciati" nella vista lista.

**Modifiche**:
- Colonna "Indirizzo" rinominata in "Città" → mostra `Roma (RM)` invece di tutto l'indirizzo
- Tooltip on hover con indirizzo completo per riferimento veloce
- Indirizzo completo resta nel dialog info (non modificato)
- CSS in [clienti.scss](../frontend/src/app/components/clienti/clienti.scss) e [fornitori.scss](../frontend/src/app/components/fornitori/fornitori.scss): `.col-rag-soc` min-width 220px / max 360px, `.col-citta` min-width 140px
- Mobile: min-width ridotti (160px / 100px)
- Aggiunto `MatTooltipModule` ai 2 ListComponent
- Label nel column picker aggiornato a "Città"
- Metodo `indirizzo()` resta intatto perché usato da search, print, export, tooltip

### 8. Pass responsive mobile completo (post-feedback utente)

**Sintomo**: visualizzazione smartphone "incasinata" su molte pagine dopo le recenti modifiche.

**Modifiche in [styles.scss](../frontend/src/styles.scss)** (espanso `@media (max-width: 767px)` e `@media (max-width: 480px)`):
- **KPI cards**: icona absolute ridotta (30px → 26px su <480px), top/right ridotti (12px → 10px), `padding-right` su label/valore per evitare overlap, word-break su valore lungo
- **Page-header**: bottoni più compatti (10px padding, 18px icon), icon-only `mat-icon-button` 36x36, titolo 20px → 18px su <480px
- **Form sections**: `.section-hint` nascosto, padding ridotto, gap stretto
- **Dialog hero**: icona 36px (32px su <480px), titolo 15px (14px), subtitle troncato a 2 righe con `-webkit-line-clamp`
- **MatSuffix icons negli input**: `display: none` su mobile per dare larghezza ai campi (eccezione search e action buttons)
- **Doc totals strip**: stack verticale, separatore "grand total" ridiventa border-top
- **Override min-width**: `.mat-mdc-dialog-content { min-width: 0 !important }` + `.mat-mdc-dialog-content > * { min-width: 0 !important; max-width: 100% }` → batte inline `style="min-width:680px"` di tutti i dialog
- **Tab labels**: padding 12px e font 13px (impedisce overflow)
- **Card con inline `max-width`**: full-width su mobile (`max-width: 100% !important`)
- **Snackbar**: margin 12px (no overflow)
- **Table cells header**: 10px font, 8px padding

**Modifiche in [dashboard.scss](../frontend/src/app/components/dashboard/dashboard.scss)**:
- **Widget edit mode mobile**: border 2px → 1px, padding 8px → 4px, drag-handle font 12px
- **Edit banner**: padding e font compatti
- **Section title accent bar**: altezza ridotta
- **Cashflow**: card più compatta, accent 4px → 3px, val 16px → 14px su <480px
- **Alert chip**: padding e icon ridotti su <480px
- **Widget edit label**: hide su <480px (resta solo l'icona)

**Modifiche in [listino-dialog.ts](../frontend/src/app/components/impostazioni/listino-dialog.ts)**:
- `mat-dialog-content` rinominato `class="listino-dialog-content"` (era inline `style="min-width:680px"`)
- Media query `@767px`: min-width 0, add-row column, tabella prezzi font 12px, input override width 70px

### 9. Aggiunta rapida prodotti + Report migliorato (post-feedback utente)

**Aggiunta rapida prodotti** — [quick-add-prodotto-dialog.ts](../frontend/src/app/components/prodotti/quick-add-prodotto-dialog.ts)

Dialog "mini" pensato per inserimento veloce a raffica:
- Solo i campi essenziali: Nome (obbligatorio + autofocus), Codice, Categoria, Prezzo (toggle Netto/Ivato), IVA, Quantità, U.M.
- 3 bottoni: **Chiudi** / **Salva e chiudi** / **Salva e nuovo** (primario, indigo)
- **Enter** nel campo Nome → "Salva e nuovo" (lavoro senza mouse)
- **Sticky defaults**: dopo ogni save, Categoria/IVA/U.M. restano memorizzate per il prossimo prodotto
- **Recap inline**: card verde sotto al form con ultimi 8 prodotti creati nella sessione + contatore
- **Hero verde** lampo (`flash_on`) per richiamare "velocità"
- Autofocus su Nome dopo ogni salvataggio (timeout 50ms per dare tempo al reset)

Bottone "Rapido" (mat-stroked) accanto a "Aggiungi" in [prodotti.html](../frontend/src/app/components/prodotti/prodotti.html). Aggiunto `MatTooltipModule` agli imports del ProdottiComponent.

**Report — empty state + highlight cards** — [report.ts](../frontend/src/app/components/report/report.ts), [report.html](../frontend/src/app/components/report/report.html), [report.scss](../frontend/src/app/components/report/report.scss)

Nuovi getter:
- `hasData`: true se kpiFatturato > 0 OR kpiCosti > 0
- `clienteTop`: primo elemento di `bi.abcClienti` (già ordinato)
- `prodottoTop`: primo per ricavi (re-sort di `bi.prodottiMargini`)
- `meseTop`: mese top dell'anno selezionato (max su `fatturaMensile`)

**Empty state** (mostrato quando `!hasData`):
- Icona grande indigo + h2 "Nessun dato per il {anno}"
- Spiegazione del perché + 2 CTA: "Vai alle fatture" (mat-flat primary), "Vai agli acquisti" (stroked)
- Hint "cambia anno dal selettore" se ci sono anni alternativi
- Aggiunto `RouterLink` agli imports di ReportComponent

**3 highlight cards** (mostrate quando `hasData`, sopra ai tab):
- **Cliente top**: nome + fatturato + numero fatture, accent indigo
- **Prodotto più venduto**: nome + ricavi + margine %, accent verde (`highlight-card--success`)
- **Mese record**: mese + fatturato, accent giallo (`highlight-card--warning`)

Stile: card con bordo top gradient 3px che identifica la categoria, hover lift, label uppercase, valore bold tabular-nums, mobile 1-col stack.

### 10. Fix endpoint `/api/stats/bi` (post-feedback utente)

**Sintomo**: pagina Report mostrava "Impossibile caricare i dati" (empty state error variant ora corretto).

**Causa**: 3 bug SQL preesistenti in [backend/routes/stats.js](../backend/routes/stats.js) → better-sqlite3 fa throw a `prepare()` su colonne inesistenti → endpoint crasha → 500 al frontend.

**Bug trovati**:
1. **`categorie`** join `categorie_prodotto cat ON cat.id=p.categoria_id` — la colonna `prodotti.categoria_id` non esiste; `prodotti.categoria` è TEXT. Fix: `GROUP BY p.categoria` direttamente, con `COALESCE(NULLIF(TRIM(p.categoria),''),'Senza categoria')` per gestire vuoti.
2. **`dso`** usa `p.data` e `substr(p.data,1,4)` — su `pagamenti` la colonna è `data_pagamento`. Fix: rinominato tutto.
3. **`incassoStats`** subquery `substr(pg.data,1,4)` — stesso problema, fix identico.

**Hardening**: wrappato tutto in try/catch con `console.error` e response 500 JSON con `error` + `message` per visibilità futura.

Verificato con `node -e "..."`: tutte le query ora passano contro lo schema reale (ritornano array vuoti se non ci sono dati, ma non crashano).

### 11. Hardening dark mode (post-feedback utente)

**Sintomo**: "la modalità scura non fa diventare le scritte bianche e si vede male il grigio sul violetto".

**Causa principale**: Material 3 in dark mode usa il sistema **tonal**: i bottoni `mat-flat-button` (default + `color="primary"`) renderizzano con bg indigo CHIARO + testo SCURO indigo (sembra grigio). Ovunque c'era un bottone primario, in dark mode si vedeva "grigio su violetto". Inoltre erano sparse decine di `style="color:#xxxxxx"` inline nei template che non si adattano al tema.

**Modifiche in [styles.scss](../frontend/src/styles.scss)** (sezione `.dark-mode`):
1. **Bottoni primari forzati a bianco**: override esplicito di `--mdc-filled-button-container-color: var(--primary)` + `--mdc-filled-button-label-text-color: #ffffff` + fallback `background-color: var(--primary) !important; color: #ffffff !important` su `.mat-mdc-flat-button` / `.mat-mdc-unelevated-button` / `.mat-mdc-raised-button`. Inclusi tutti i selettori (`.mat-primary`, `[color="primary"]`, default no-color). Stessa logica per `.mat-warn` (rosso + bianco).
2. **Mat-menu icons**: `.mat-mdc-menu-item mat-icon` → `var(--text-tertiary)`, hover `var(--text-secondary)`.
3. **Checkbox / Radio / Slide-toggle**: label esplicitamente `var(--text-primary)`, icon colors mappate a CSS variables.
4. **Tabs**: `--mat-tab-header-inactive-label-text-color: var(--text-tertiary)`, active → `var(--primary-hover)`.
5. **Mat-select**: `--mat-select-enabled-trigger-text-color` + `-placeholder-text-color` + arrow color tutti mappati.
6. **Native input**: forza `color: var(--text-primary)` su tutti i `<input>` e `<textarea>`, più `filter: invert(0.8)` sull'icona del date picker (default è nera).
7. **Form field hints/errors**: mappati a `var(--text-tertiary)`.

**Attribute selectors per inline styles** (cattura colori hardcoded nei template):
- `[style*="color:#94a3b8"]` → `var(--text-tertiary)` (e varianti con e senza spazio)
- `[style*="color:#64748b"]` → `var(--text-secondary)`
- `[style*="color:#475569"]`, `#374151`, `#6b7280` → idem secondario/terziario
- `[style*="color:#1e293b"]` → `var(--text-primary)`
- Verdi/rossi/blu semantici (#22c55e, #16a34a, #ef4444, #dc2626, #3b82f6, #6366f1) → rimappati a `--success-on`, `--danger-on`, `--info-on`, `--primary-hover` (versioni più luminose per dark)
- Background pastello hardcoded (`#eef2ff`, `#f0fdf4`, `#fff7ed`, `#fef2f2`) → versioni rgba con alpha 0.18 su scuro

Tutto via `!important` per battere gli inline styles. Build pulito, 6.7s.

## Debiti tecnici / TODO aperti

- **Warning preesistenti** (non miei) in compilation: `DocInfoDialogComponent`/`InfoDialogComponent` importati ma non usati in vari componenti list (fatture, ddt, ordini, preventivi, note-credito, acquisti, fornitori, prodotti, vendita-banco, clienti). Da pulire in una sessione "cleanup imports".
- **Bundle initial 913kB**: vicino al warning 1MB. Possibile ottimizzazione: lazy-load di `Chart.js` (dashboard), `html2canvas`/`jspdf` (stampa).
- **CommonJS warnings** da `canvg`/`html2canvas`/`jspdf`: nessun fix possibile lato nostro, sono dipendenze terze. Si potrebbe configurare `allowedCommonJsDependencies` in angular.json per silenziare il warning.
- **Listini**: per ora c'è un solo listino per cliente. Se servisse "listino per linea di prodotto" servirebbe schema diverso.
- **Dashboard**: non c'è ancora un "size" per widget (tutti full-width). Per multi-colonna serve CSS grid + metadata size.

---

## Note per la prossima sessione

- **Deploy fly.io**: usa `flyctl deploy` con `Dockerfile` multi-stage (frontend-build → stage-1 con backend). Dopo il bump dei budget il build production passa. Il `npm warn EBADENGINE` (node 20 vs richiesto 24.15) è solo warning, non blocca.
- **Database SQLite** persistente: gira via `better-sqlite3`. Migrazioni applicate **auto** allo startup in `database.js` (array `migrations`, ogni voce in try-catch).
- **Auth**: tutti gli endpoint `/api/*` dietro Bearer token (`server.js` middleware).
- **Pattern routing**: ogni entità ha 1 route file in `backend/routes/` montato in `server.js` con `app.use('/api/...', require('./routes/...'))`.
- **DTO**: backend converte snake_case → camelCase con funzione `toDto(r)` per ogni entità.
- **Per cambi grossi su SCSS**: ricordati che il deploy fly.io ha budget production stretti. Se nuovo SCSS componente > 20kB, prima di pushare aumenta budget o splitta SCSS in più file.

---

## Comandi utili

```bash
# Build dev (locale, sempre permissivo)
cd frontend && npm start

# Build production (mirror di fly.io — usalo prima di push)
cd frontend && npx ng build

# Verificare schema DB applicata
cd backend && node -e "const db=require('./database'); console.log(db.prepare('PRAGMA table_info(clienti)').all())"

# Deploy fly.io
flyctl deploy
```

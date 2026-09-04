# HANDOFF — Qualità UI/UX e caccia ai bug (in corso)

Ripresa lavoro su un altro PC. Branch: **`ui-ux-quality`** (partito da `offline-electron`).
Riguarda **solo l'edizione offline desktop**; la versione Cloud su `main` non è toccata.

Documento di metodo e piano: [`docs/UI-UX-QUALITY-WORKFLOW.md`](docs/UI-UX-QUALITY-WORKFLOW.md).
Questo file dice **dove siamo** e **cosa fare dopo**. (Da non confondere con
[`HANDOFF.md`](HANDOFF.md), che riguarda il lavoro multi-archivio su `offline-electron`.)

---

## Come ripartire da zero su un altro PC

```bash
git fetch origin
git checkout ui-ux-quality
cd frontend
npm install --engine-strict=false     # vedi trappola #1
npx ng serve --configuration preview --port 4300
```

Poi apri <http://localhost:4300> — è la **galleria schermate**: elenco di tutte le rotte a
sinistra, l'app vera dentro un iframe, e in alto i selettori dati / schermo / tema / attesa.
Istruzioni complete: [`frontend/src/preview/README.md`](frontend/src/preview/README.md).

**Prima di ogni commit** verifica che la build spedita compili, gira lo smoke test e il
presidio:

```bash
npx ng build --configuration offline     # da frontend/
node scripts/preview-smoke.mjs           # da root — vedi §B.10 sotto
./scripts/ui-guard.sh --all              # da root
```

---

## Stato: 17 commit, tutti verificati, working tree pulito

| Commit | Cosa |
|---|---|
| `feat(preview)` | **Galleria schermate** con backend finto: da 9 a **49 rotte** (poi 47, vedi rotte morte) ispezionabili senza il backend Rust, in 4 stati dei dati e 4 larghezze |
| `docs` | Il workflow: contratto anti-regressione, tre lenti, ciclo a 7 passi, backlog di 43 schermate, metriche misurate |
| `fix(mobile)` | **B.11** — la casella di selezione non copre più il numero documento a 375 px (6 liste) |
| `fix(errori)` | **B.1** — gli errori HTTP che nessuna schermata gestisce ora si vedono |
| `fix(dialog)` | **B.2 (parziale)** — `confirm.alert()` e `confirm.askTyping()` aggiunti; **ma non era finita**, vedi sotto |
| `fix(rotte)` | **B.12** — rotta jolly `**` → Home |
| `fix(a11y)` | **B.6** — nessun bottone-icona senza nome su tutte e 48 le rotte |
| `feat(ux)` | **B.3** — deep-link "nuovo" sulle azioni rapide (Home + barra comandi): riusa `nuovaBozza`/`prefill` già esistenti |
| `fix(rotte)` | Rimossi **CRM e Timesheet**, codice morto (rotta viva ma fuori menu). **Login non è dead code** (vedi correzione sotto) |
| `test(preview)` | **B.10** — smoke test automatico (`scripts/preview-smoke.mjs`), tutte le rotte × 4 stati dati. Ha trovato e corretto **6 fixture** della galleria con forma sbagliata |
| `fix(dashboard)` | Crash reale trovato dallo smoke test: Dashboard esplodeva se le API dei KPI annuali fallivano |
| `feat(ux)` | **B.7 (parziale)** — stato di caricamento standard (`app-loading-skeleton`) su Fatture, Clienti, Prodotti, Dashboard |
| `feat(ux)` | **B.8** — paginazione su Pagamenti, Movimenti magazzino, Ordini fornitore; **B16** risolto di riflesso (empty-state su Movimenti magazzino) |
| `fix(dialog)` | **B.2 (completato)** — 9 popup nativi non coperti dal primo giro (autosalvataggio bozze, successivo a quell'audit): 6 `window.confirm()` + 3 `window.prompt()`. Aggiunto `ConfirmService.prompt()` (mancava, `askTyping()` non è un sostituto) |
| `chore(ci)` | **Presidio** — `scripts/ui-guard.sh`, agganciato a `tauri-release.yml` come job che blocca la release se rientra un popup nativo |

Controllo ripetuto a ogni commit: build `offline` verde, smoke test verde su tutti e 4 gli
stati dati, nessun popup nativo residuo.

### Due correzioni importanti a quanto scritto qui in precedenza

1. **Il componente Login NON è codice morto.** La decisione presa in questa sessione era di
   rimuoverlo insieme a CRM/Timesheet, ma un controllo dei riferimenti ha mostrato che è la
   schermata di autenticazione **reale**: montata condizionalmente in `app.html`
   (`<app-login (loggedIn)="onLogin()" />`) e non tramite router — per questo sembrava "senza
   rotta". Rimosso **solo** CRM e Timesheet (rotta viva, voce di menu commentata: quelli sì
   erano davvero irraggiungibili).
2. **B.2 non era a 0 come dichiarato.** Il grep del primo audit contava solo i 4 file già
   noti; 9 punti in più (6 `window.confirm()` per la ripresa bozza nei dialog documento, 3
   `window.prompt()` per password/nome) erano stati introdotti dall'autosalvataggio bozze
   (v1.2.34), **dopo** quell'audit, e nessuno li aveva ricontati. Sistemato e ora presidiato
   da `ui-guard.sh` in CI — non dovrebbe più poter rientrare senza far fallire la release.

### B.9 — investigato, nessuna modifica necessaria

La metrica "16/80 componenti con `ngOnDestroy`" non si traduce in un bug reale: verificato
ogni `setInterval` (6, tutti nell'autosalvataggio bozze) ha già il cleanup corretto via
`destroyRef.onDestroy(() => clearInterval(t))`; nessun `setTimeout` ricorsivo/polling; nessuna
sottoscrizione a stream condivisi (`Router.events`, `fromEvent`, servizi `providedIn:'root'`)
senza pulizia. Le `valueChanges` senza `takeUntil` sono su `FormGroup`/`FormControl` di
proprietà del componente stesso: si esauriscono da sole alla distruzione, non un leak. Stessa
lezione di M5 ("il grep propone, la schermata dispone") — misura sbagliata, non bug.
Unico punto a rischio minimo, non un leak: `searchTimer`/`previewTimer` (debounce ricerca) in
`clienti.ts`, `fornitori.ts`, `impostazioni.ts` non cancellati in `ngOnDestroy` — un singolo
`setTimeout` residuo potrebbe scattare dopo la chiusura se l'utente digita e chiude entro
250-400ms. Rischio pratico basso; da sistemare se si tocca comunque quella schermata.

---

## Cosa manca, in ordine

### 1. B.5 — formattazione uniforme (più complesso di come sembrava)
27 `toFixed(2)` e 7 `toLocaleString` contro 192 `| currency`; 16 `slice(0,10)`/`split('T')`
contro 79 `| date`. **Attenzione**: la maggior parte dei `toFixed(2)` NON sono candidati a un
semplice swap col pipe `currency`:
- Molti sono arrotondamenti per un **valore** (`+(...).toFixed(2)` dentro `[value]` di un
  campo prezzo editabile, o `+this.totale.toFixed(2)` prima di un `createX()`): **non
  toccare**, sono calcolo non resa a schermo.
- Altri sono dentro **stringhe TS** (messaggi di conferma, snackbar, tooltip Chart.js): il
  pipe `currency`/`date` **non è utilizzabile lì** (i pipe funzionano solo nel template
  Angular). Vanno sostituiti iniettando `CurrencyPipe`/`DatePipe` come servizio
  (`inject(CurrencyPipe)` poi `.transform(...)`) — `reports.ts:177` lo fa già per il caso
  `'eur'`, è il modello da seguire.
- I candidati veri (messaggi/tooltip) individuati: `fatture.ts:1871,1919`,
  `vendita-banco.ts:513,516`, `sdi-passive.ts:266`, `acquisti.ts:800` (currency); tooltip
  Chart.js in `dashboard.ts:332,361` e `report.ts:240`; date in `storico.ts:120`,
  `impostazioni.ts:1340` (probabilmente candidati, da verificare se già dentro un binding di
  template o costruiti come stringa TS).
**Non toccare i valori inviati al backend, solo la resa.**

### 2. B.4 — token colore (il più grande e rischioso)
**171 esadecimali nei file `.scss` dei componenti** (misurato ora, era ~200) — ma il numero
vero è molto più alto se si contano gli `style="color:#..."` inline nei template `.ts`
(~1200+, mai misurati prima): la home ha ~20 gradienti cablati (`home-app.ts` righe 329+), e
moltissimi componenti hanno colori di stato (verde/rosso/arancio) scritti a mano invece che coi
token `--success`/`--danger`/`--warning` di `styles.scss`. **Va verificato a vista in chiaro
e in scuro**, non solo compilato — è la modifica con il rischio più alto di tutta la Fase B.
Consiglio: partire dai gradienti Home (più visibili, isolati in un unico file) prima di
affrontare i colori di stato sparsi in tutti i componenti.

### 3. Presidio — completare quando B.4/M3 saranno a 0
`scripts/ui-guard.sh --all` mostra oggi come informativi: bottoni-icona sospetti (61, da
verificare a video — il grep sovrastima come già successo con M5), colori esadecimali nei
`.scss` (8 file), `.subscribe(() => …)` senza `error:` su una riga (60, mitigato da B.1 ma non
zero). Quando questi arriveranno a 0 (o a un livello accettabile), passarli da informativi a
bloccanti nello script.

### 4. Onda 1 — resta da fare
- **Vendita al banco**: non ha ricevuto lo stato di caricamento (B.7) — è un flusso cassa
  veloce con un solo fetch di catalogo in background, l'impatto è basso ma va comunque
  guardato col ciclo a 7 passi.
- Il giro vero e proprio a 7 passi (§5 del workflow: inventario → osserva → caccia ai bug →
  audit UI/UX → ripara → verifica → registra) **non è ancora stato fatto per nessuna
  schermata** — quanto fatto finora sono le bonifiche globali di Fase B, che lo precedono per
  design. Prossimo passo naturale: Home, Fatture, Clienti, Prodotti, Vendita al banco,
  Dashboard, con le schede di audit in `docs/audit/`.

### Poi: Onda 2-6
Come da backlog originale (§6 del workflow) — Preventivi, Ordini cliente, DDT, ecc.

---

## Decisione presa questa sessione

**CRM e Timesheet rimossi** (codice morto: rotta viva, voce di menu commentata). **Login
lasciato intatto** — non era dead code, è l'autenticazione reale (vedi correzione sopra). Le
rotte backend equivalenti (`src-tauri/src/routes/crm.rs`, `timesheet.rs`) **non sono state
toccate**: superficie API, decisione distinta da questa pulizia di UI.

---

## Trappole già incontrate (non ripercorrerle)

1. **`npm install` fallisce senza `--engine-strict=false`.** Il `.npmrc` di root ha
   `engine-strict=true` e `frontend/package.json` pretende node 24.15.0 / npm 11.12.1.
   `frontend/node_modules` non è versionato: su una macchina nuova va installato.
2. **Il dev server ha smesso di ricompilare** dopo un `ng build` lanciato in parallelo.
   Se una modifica non compare nell'anteprima, controlla l'orario dell'ultimo
   "bundle generation complete" nei log e riavvia il server.
3. **Niente `cargo` in locale**: il backend Rust si valida solo sul CI (vedi `HANDOFF.md`).
   La galleria esiste proprio per non dipenderne.
4. **Le fixture mancanti non rompono niente** ma fanno sembrare una schermata più vuota del
   vero. `window.__fixtureMancanti` le elenca. **Trappola più insidiosa, trovata da B.10**:
   una fixture PRESENTE ma con la **forma sbagliata** (oggetto vs array, o campi con nome
   diverso da quello che il componente si aspetta — es. `stats/cashflow` doveva essere
   `{daIncassare,daPagare}` e restituiva un array di 12 mesi) non si nota da un giro visivo
   superficiale: il componente sembra caricare ma poi esplode silenziosamente o mostra
   `[object Object]`. Lo smoke test automatico (`scripts/preview-smoke.mjs`) le cattura
   perché controlla anche gli errori in console, non solo che la pagina "sembri piena".
   Trappola dentro la trappola: alcune schermate filtrano lato client una collezione
   condivisa (Ordini fornitore legge `ordini` e tiene solo `tipo === 'FORNITORE'`), quindi
   la fixture deve contenere entrambi i tipi.
5. **Fuori dalla galleria** restano il primo avvio (`welcome-offline`) e il selettore
   archivi: vivono fuori dal router Angular. Da aggiungere quando si arriva all'Onda 6.
6. **Le metriche da `grep` vanno confermate a video.** Vale per M5 (bottoni senza nome: 169
   dal grep, 62 reali) e ora anche per **B.9** (16/80 senza `ngOnDestroy`: zero leak reali
   dopo verifica puntuale) e per lo stesso **B.2** (dichiarato "0" due volte, in realtà
   rientrato entrambe le volte). Un intervento dimensionato sul grep rischia di essere enorme
   e inutile, o — peggio — di dare per risolto qualcosa che non lo è.
7. **Il window bound del test runner conta ~2 minuti**: `scripts/preview-smoke.mjs` su un
   singolo stato dati (47 rotte) impiega circa 45-60s per via del riavvio di `ng serve` a
   ogni esecuzione; lanciare tutti e 4 gli stati in sequenza in un solo comando va oltre i
   timeout di shell tipici. Lanciarli uno alla volta (`STATE=full|empty|error|error-load node
   scripts/preview-smoke.mjs`).

---

## Sonde da incollare nella console della galleria

Vanno eseguite sulla **pagina esterna** (la galleria, non l'iframe). Caricano ogni rotta in
un iframe nascosto e misurano il DOM vero. Tenerle a blocchi di ~12 rotte: oltre, la console
va in timeout. **Nota**: per un controllo strutturale su tutte le rotte è ormai più comodo
`node scripts/preview-smoke.mjs` (§B.10) — automatico, ripetibile, gira nei 4 stati dati.
Queste sonde restano utili per controlli mirati (nomi accessibili, righe rese) senza dover
estendere lo script.

**Smoke — la schermata monta e ha contenuto:**

```js
window.__smoke = async (rotte) => {
  const out = [];
  for (const r of rotte) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1440px;height:900px';
    f.src = `/${r}?app=1&state=full&latency=0&dark=0`;
    document.body.appendChild(f);
    await new Promise(res => { f.onload = res; setTimeout(res, 10000); });
    await new Promise(res => setTimeout(res, 1200));
    const d = f.contentDocument;
    const v = d?.querySelector('router-outlet')?.nextElementSibling;
    const snack = d?.querySelectorAll('.mat-mdc-snack-bar-container').length ?? -1;
    if (!v || (d.body.innerText || '').length < 400 || snack > 0)
      out.push({ rotta: r, componente: v?.tagName?.toLowerCase() || '(nessuno)',
                 caratteri: (d?.body?.innerText || '').length, snackbarInattese: snack });
    f.remove();
  }
  return out.length ? out : 'tutte ok';
};
await window.__smoke(['app','dashboard','clienti','fornitori','prodotti','fatture']);
```

**Nomi accessibili dei bottoni-icona:** stessa impalcatura, dentro il ciclo:

```js
const bott = [...d.querySelectorAll('button.mat-mdc-icon-button')];
const nome = (b) => b.getAttribute('aria-label')?.trim() || b.getAttribute('title')?.trim()
  || [...b.childNodes].filter(n => n.getAttribute?.('aria-hidden') !== 'true')
       .map(n => n.textContent || '').join('').trim() || null;
const senza = bott.filter(b => !nome(b));
```

**Righe rese e paginatore** (per B.8), stessa impalcatura:

```js
const v = d.querySelector('router-outlet').nextElementSibling;
({ righe: v.querySelectorAll('tbody tr, mat-row, tr.mat-mdc-row').length,
   paginator: v.querySelectorAll('mat-paginator').length,
   emptyState: v.querySelectorAll('app-empty-state').length });
```

**Guidare un componente** (per provare un percorso senza cliccare): la build di anteprima
gira in devMode, quindi `window.ng` è disponibile.

```js
const c = window.ng.getComponent(document.querySelector('app-agenda'));
c.toggleTodo(c.todoList[0], true);   // con stato dati "Scritture KO" → snackbar rossa
```

---

## Il vincolo che vale sempre

Un commit non mescola mai grafica e logica; prima di toccare una schermata si scrive
l'inventario di cosa fa, e alla fine lo si riprova punto per punto; nessuna rinomina di
campi, chiavi, endpoint o payload; ogni modifica va vista in chiaro, in scuro e a 375 px.
Se sistemare un difetto richiede cambiare un comportamento e non solo l'aspetto, quella
modifica **non si fa**: si annota e si decide insieme. Dettagli in §0 del workflow.

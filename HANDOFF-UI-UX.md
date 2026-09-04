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

**Prima di ogni commit** verifica che la build spedita compili:

```bash
npx ng build --configuration offline
```

---

## Stato: 7 commit, tutti verificati, working tree pulito

| Commit | Cosa |
|---|---|
| `feat(preview)` | **Galleria schermate** con backend finto: da 9 a **49 rotte** ispezionabili senza il backend Rust, in 4 stati dei dati e 4 larghezze |
| `docs` | Il workflow: contratto anti-regressione, tre lenti, ciclo a 7 passi, backlog di 43 schermate, metriche misurate |
| `fix(mobile)` | **B.11** — la casella di selezione non copre più il numero documento a 375 px (6 liste) |
| `fix(errori)` | **B.1** — gli errori HTTP che nessuna schermata gestisce ora si vedono |
| `fix(dialog)` | **B.2** — zero popup di sistema; aggiunti `confirm.alert()` e `confirm.askTyping()` |
| `fix(rotte)` | **B.12** — rotta jolly `**` → Home |
| `fix(a11y)` | **B.6** — nessun bottone-icona senza nome su tutte e 48 le rotte |

Controllo finale già fatto: tutte le rotte montano il componente, nessun errore in console,
nessuna snackbar spuria, build `offline` verde.

---

## Cosa manca, in ordine

### 1. B.10 — smoke test automatici
Oggi la verifica è una **sonda manuale** da eseguire nella console della galleria (§
"Sonde" qui sotto): funziona bene ma va lanciata a mano. Non esiste alcun test nel
progetto (`*.spec.ts` = 0, nessun framework nelle devDependencies).

Due strade: aggiungere Vitest/Karma e montare ogni componente coi mock, oppure trasformare
la sonda in uno script Node+Playwright in `scripts/`. La seconda riusa quello che c'è già
e verifica l'app assemblata davvero; la prima è più veloce da eseguire in CI.

### 2. B.7 — stato di caricamento standard
**105 componenti su 126** non mostrano nulla mentre caricano: "vuoto" e "sto caricando"
sono indistinguibili. Serve un componente/direttiva unico (skeleton per le liste, spinner
per i dialog) applicato alle viste che fanno fetch.
Si osserva mettendo l'**attesa a 1,5 s** nella galleria.

### 3. B.8 — paginazione sulle liste lunghe
Misurato con dati realistici (~200 righe per collezione):

| Schermata | Righe rese in una volta | Paginatore |
|---|---|---|
| Pagamenti | **280** | no |
| Movimenti magazzino | **200** | no |
| Ordini fornitore | **200** | no |

Per confronto Fatture, Clienti, Prodotti, Preventivi, Scadenzario e Arrivi merce ne mostrano
25 con paginatore. **Attenzione**: verificare che i filtri restino corretti dopo
l'aggiunta — è il punto in cui è più facile rompere qualcosa.

Collegato: **Movimenti magazzino non ha stato vuoto** (B16) — a database vuoto resta una
tabella con le sole intestazioni. Le altre 11 liste controllate hanno `app-empty-state`.

### 4. B.3 — deep-link "nuovo"
"Nuova fattura", "Nuovo cliente", "Nuovo preventivo" in `app.ts:147` e `home-app.ts:312`
**non aprono niente**: fanno `router.navigate` alla lista. L'etichetta promette un'azione,
l'app cambia pagina. Serve un `?nuovo=1` sulle liste documenti e anagrafiche, gestito in
`ngOnInit` come già avviene per `openId` (che però esiste solo per Clienti, Fornitori e
Prodotti — vedi `consumePrefill`).

### 5. B.5 — formattazione uniforme
27 `toFixed(2)` e 7 `toLocaleString` contro 192 `| currency`; 16 `slice(0,10)`/`split('T')`
contro 79 `| date`. Stessi importi e stesse date resi in modi diversi da schermata a
schermata. **Toccare solo la resa a schermo, mai i valori inviati al backend.**

### 6. B.4 — token colore
200 esadecimali negli SCSS dei componenti, più ~20 gradienti cablati sulle card della Home
(`home-app.ts:329` e seguenti): palette arcobaleno che ignora il tema scuro.
**Va verificato a vista in chiaro e in scuro**, non solo compilato.

### 7. B.9 — cleanup sottoscrizioni
Solo 16 componenti su 80 hanno `ngOnDestroy` / `takeUntilDestroyed`. Timer e polling
sopravvivono all'uscita dalla schermata.

### 8. Presidio (§7 del workflow)
`scripts/ui-guard.sh` che fallisca su: popup nativi, colori esadecimali negli SCSS dei
componenti, bottoni-icona senza nome. Da agganciare a `.github/workflows/tauri-release.yml`,
che oggi si limita a compilare. Senza questo le bonifiche si disfano da sole — è già
successo con i popup nativi (43 → 0 → 8 → 0).

### Poi: Onda 1 schermata per schermata
Home, Fatture, Clienti, Prodotti, Vendita al banco, Dashboard, col ciclo a 7 passi (§5 del
workflow) e un commit per lente.

---

## Decisione aperta (serve una tua risposta)

**Login, `/crm` e `/timesheet` sono codice vivo ma irraggiungibile.** Il componente Login
(676 righe) non ha nemmeno una rotta; CRM e Timesheet hanno la rotta ma sono commentati fuori
dal menu (`app.ts:973-974`). Vanno rimessi in navigazione o rimossi? Finché restano sono
superficie che continuiamo a compilare e auditare per niente.

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
   vero. `window.__fixtureMancanti` le elenca. Ne restano da colmare su **Prima nota** e
   **Storico** (una ciascuna).
   Trappola dentro la trappola: alcune schermate filtrano lato client una collezione
   condivisa (Ordini fornitore legge `ordini` e tiene solo `tipo === 'FORNITORE'`), quindi
   la fixture deve contenere entrambi i tipi.
5. **Fuori dalla galleria** restano il primo avvio (`welcome-offline`) e il selettore
   archivi: vivono fuori dal router Angular. Da aggiungere quando si arriva all'Onda 6.
6. **Le metriche da `grep` vanno confermate a video.** M5 diceva "169 bottoni senza
   `aria-label`": misurando il DOM vero erano **62**, perché `title` fornisce anch'esso un
   nome accessibile. Un intervento dimensionato sul grep sarebbe stato tre volte più grande
   del necessario.

---

## Sonde da incollare nella console della galleria

Vanno eseguite sulla **pagina esterna** (la galleria, non l'iframe). Caricano ogni rotta in
un iframe nascosto e misurano il DOM vero. Tenerle a blocchi di ~12 rotte: oltre, la console
va in timeout.

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

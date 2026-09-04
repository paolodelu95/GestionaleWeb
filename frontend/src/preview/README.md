# Galleria schermate (harness di anteprima)

Serve a **guardare ogni schermata dell'app senza backend**: niente Rust da compilare,
niente database, niente dati reali da sporcare. È lo strumento su cui poggia
[`docs/UI-UX-QUALITY-WORKFLOW.md`](../../../docs/UI-UX-QUALITY-WORKFLOW.md) (Fase A).

Nessun file di questa cartella finisce nell'app di produzione: li compila solo la
configurazione `preview` di `angular.json`, che ha un `main` tutto suo
(`src/main.preview.ts`). I componenti dell'app non sono stati toccati.

## Avvio

```bash
npm start -- --configuration preview --port 4300
```

Poi apri <http://localhost:4300>. (In Claude Code: la configurazione `frontend-preview`
di `.claude/launch.json`.)

## Cosa vedi

A sinistra l'elenco di tutte le schermate; in alto i selettori; al centro **l'app vera**
dentro un iframe. L'iframe non è un dettaglio: le media query rispondono alla sua
larghezza, quindi l'anteprima a 375 px è mobile per davvero, non una simulazione.

### I quattro stati dei dati

| Stato | Cosa fa | A cosa serve |
|---|---|---|
| **Pieni** | ~200 righe per collezione | scroll, prestazioni, overflow |
| **Vuoti** | tutte le collezioni vuote | gli empty state |
| **Scritture KO** | letture ok, **ogni salvataggio fallisce con 500** | verifica il bug B1: se dopo il clic non compare nulla, la schermata non gestisce l'errore |
| **Letture KO** | ogni caricamento fallisce con 500 | reazione al fetch fallito |

I dati sono **deterministici** (PRNG con seed fisso): due esecuzioni producono le stesse
righe, quindi gli screenshot prima/dopo sono confrontabili.

Nei dati "Pieni" ci sono casi limite deliberati, **da non togliere**:
la prima anagrafica ha una ragione sociale lunghissima, la seconda è ridotta ai soli campi
obbligatori, un prodotto ha un prezzo fuori scala e un documento ha un totale a sette cifre.

### Gli altri selettori

- **Schermo** — 1440 / 1280 / 768 / 375 px, più "Adatta" (tutta la finestra).
- **Tema** — chiaro/scuro (scrive la stessa chiave `dark-mode` che usa l'app).
- **Attesa** — ritardo artificiale delle risposte: con 1,5 s si vede se la schermata
  mostra un indicatore di caricamento o resta bianca.

## Come funziona

| File | Ruolo |
|---|---|
| `main.preview.ts` | tre modalità secondo l'URL: galleria (default), `?app=1` app reale con HTTP finto, `?doc=` vecchio harness dei dialog |
| `gallery.ts` | il chrome esterno. DOM puro, senza Angular: non può interferire col change detection dell'app sotto test |
| `mock-http.interceptor.ts` | risponde a ogni `/api/…`. Sta **in coda** ad `authInterceptor`, che resta quindi esercitato |
| `fixtures.ts` | i dati finti e la mappa endpoint → risposta |
| `mock-data.ts`, `preview-host.ts` | harness storico dei dialog documento (`?doc=`), invariato |

L'intercettazione avviene a livello **HTTP**, non mockando i servizi: `DataService` è un
involucro sottile su `ApiService` → `HttpClient`, e vari componenti chiamano `ApiService`
direttamente. A questo livello si coprono tutti i casi con un solo punto di controllo.

## Aggiungere dati mancanti

Un endpoint non modellato non rompe niente: si degrada a lista vuota. Per sapere quali
mancano su una schermata, aprila e leggi in console:

```js
window.__fixtureMancanti
```

È l'elenco dei path serviti dal fallback generico. Aggiungi il caso in `COLLEZIONI` o
`AGGREGATI` dentro `fixtures.ts`.

Attenzione a una trappola: alcune schermate **filtrano lato client** una collezione
condivisa (Ordini fornitore legge `ordini` e tiene solo `tipo === 'FORNITORE'`). Se
la fixture non contiene quel tipo, la schermata sembra vuota per colpa dei dati finti e
non dell'app. In quei casi la collezione deve contenere entrambi i tipi.

# Workflow — Semplificazione UX & UI di Ordeva

> **Obiettivo strategico:** rendere la facilità d'uso il nostro principale punto di forza.
> Ordeva deve essere utilizzabile **senza tutorial, senza manuale, senza formazione** — anche
> da una persona che non ha mai visto un gestionale in vita sua.

Questo documento è sia il **metodo** (come lavoriamo, schermata per schermata) sia il
**piano** (in che ordine, con quale backlog). È vivo: si aggiorna mentre procediamo.

---

## 1. La stella polare

Una sola frase guida ogni decisione:

> **"Un utente nuovo deve capire cosa fare e farlo correttamente al primo tentativo,
> senza chiedere aiuto."**

Tre test concreti che usiamo per validare ogni schermata:

- **Test dei 5 secondi** — apro la schermata: in 5 secondi capisco *dove sono*, *a cosa serve*
  e *qual è l'azione principale*?
- **Test della nonna** — una persona non tecnica riesce a completare il compito principale
  senza che nessuno le stia accanto?
- **Test del primo documento** — un cliente appena registrato riesce a emettere la sua
  prima fattura entro 10 minuti, partendo da zero dati?

Se la risposta a uno di questi è "no", la schermata non è pronta.

---

## 2. Cosa intendiamo per "semplice" (definizione misurabile)

"Semplice" non è un'opinione: è una checklist. Una schermata è semplice quando rispetta
**tutti** questi 10 principi. Questa è la **rubrica di audit** (vedi §5).

1. **Una sola azione primaria evidente.** C'è un bottone principale, colorato, inequivocabile.
   Tutto il resto è secondario (testuale/outline) o nascosto in un menu "Altro".
2. **Linguaggio umano, non da commercialista.** Niente sigle non spiegate. "SDI", "P.IVA",
   "PEC", "esterometro", "DDT" hanno sempre un micro-aiuto o un'etichetta in chiaro accanto.
3. **Campi guidati.** Ogni campo non ovvio ha un *placeholder con esempio* e/o un *hint*
   sotto. I campi obbligatori sono distinti da quelli opzionali. L'opzionale è collassato.
4. **Default intelligenti.** Tutto ciò che possiamo precompilare lo precompiliamo
   (data = oggi, numerazione automatica, IVA standard, pagamento di default, paese = Italia).
5. **Errori che insegnano.** Mai "errore generico". L'errore dice *cosa* è sbagliato e
   *come* sistemarlo, vicino al campo, in italiano.
6. **Niente vicoli ciechi: empty state utile.** Lista vuota = non un foglio bianco, ma
   "Non hai ancora clienti. [+ Crea il primo cliente]" con spiegazione di 1 riga.
7. **Conferme coerenti e rassicuranti.** Niente popup di sistema del browser. Dialog
   coerente, con descrizione chiara delle conseguenze e bottone d'azione etichettato
   ("Elimina fattura", non "OK").
8. **Progressive disclosure.** Mostriamo prima il minimo indispensabile; il dettaglio
   avanzato è dietro "Mostra altro" / sezioni collassabili / tab.
9. **Feedback immediato.** Ogni azione produce una reazione visibile entro 1 secondo
   (spinner, snackbar di conferma, riga che appare). L'utente non resta mai a chiedersi
   "ha funzionato?".
10. **Coerenza assoluta.** Stessa cosa = stesso posto, stesso nome, stesso colore, stesso
    comportamento in *tutte* le schermate. Zero sorprese.

---

## 3. Stato attuale (fotografia, giugno 2026)

Buona notizia: **la base è solida.** C'è già un design system maturo in `styles.scss`
(~2000 righe): design token completi, dark mode, componenti condivisi (`dialog-hero`,
`form-section`, `doc-totals-strip`, `stato-chip`), helper responsive, focus accessibile.
Non dobbiamo ricostruire le fondamenta — dobbiamo **applicarle in modo coerente e abbassare
il carico cognitivo**.

I problemi reali, misurati sul codice:

| Problema | Evidenza | Impatto sul novizio |
|---|---|---|
| **Conferme native del browser** | **43 chiamate `confirm()`** in 24 file | Popup grigi, fuori tema, "spaventosi", testo del bottone generico ("OK"/"Annulla") |
| **Aiuto in-context quasi assente** | Solo **19 `matHint`** in 10 file (su ~30 schermate con form) | Form fiscali densi senza spiegazioni: l'utente non sa cosa scrivere |
| **Nessun onboarding / wizard** | **0 `mat-stepper`**, 0 first-run | Nessuna guida al primo accesso né alla creazione del primo documento |
| **Form molto densi** | `fatture.ts` 1626 righe, `clienti.ts` 984, `ddt.ts` 1057 | Troppi campi visibili insieme; nessuna gerarchia "essenziale vs avanzato" |
| **Gergo fiscale non spiegato** | SDI, PEC, P.IVA, CF, esterometro, LIPE, DDT ovunque | Barriera per chi non è del settore |
| **Navigazione profonda** | Sidebar con gruppi + sotto-voci espandibili (40+ rotte) | Difficile trovare le cose; troppe scelte tutte insieme |
| **Empty state generici** | `.empty-msg` = solo testo "Nessun…" | Vicoli ciechi: non dicono cosa fare dopo |

---

## 4. Fondamenta globali da costruire PRIMA (Fase 0)

Queste 6 cose si fanno **una volta sola** e migliorano *tutte* le schermate insieme.
Sono il moltiplicatore: vanno fatte prima dell'audit schermata-per-schermata.

- **F0.1 — `ConfirmDialog` condiviso.** Un unico componente di conferma a tema (titolo,
  descrizione delle conseguenze, bottone d'azione etichettato + variante "pericolosa" rossa).
  Poi **sostituire tutte le 43 `confirm()`** native con questo. → coerenza + §2.7.
- **F0.2 — Componente `FieldHelp` / convenzione hint.** Standard per micro-aiuto su campo
  (placeholder-esempio + hint + tooltip "?" per le sigle). Un glossario centralizzato dei
  termini fiscali (SDI, PEC, …) riusabile ovunque. → §2.2, §2.3.
- **F0.3 — `EmptyState` condiviso.** Icona + titolo + 1 riga + bottone azione primaria.
  Sostituisce gli `.empty-msg` testuali nelle liste. → §2.6.
- **F0.4 — Onboarding di primo accesso.** Checklist guidata post-registrazione
  ("1. Dati azienda → 2. Primo cliente → 3. Primo prodotto → 4. Prima fattura"), con stato
  e progressi. Niente tutorial passivo: azioni reali. → Test del primo documento.
- **F0.5 — Revisione navigazione & Home.** La Home (`home-app`) diventa il vero punto di
  partenza orientato ai *compiti* ("Cosa vuoi fare?"), non alle *sezioni*. Sidebar
  semplificata, raggruppamento logico, nomi in chiaro. → §2.1, §2.8.
- **F0.6 — Pass sul linguaggio (microcopy).** Glossario UI unico: ogni etichetta, bottone,
  messaggio rivisto in italiano semplice e coerente (verbi all'imperativo: "Crea",
  "Salva", "Invia"; mai abbreviazioni oscure). → §2.2, §2.10.

> Ordine consigliato Fase 0: **F0.1 → F0.3 → F0.2 → F0.6 → F0.5 → F0.4.**
> (Prima gli strumenti riusabili, poi il linguaggio, poi navigazione e onboarding.)

---

## 5. La rubrica di audit (si applica a OGNI schermata/form/dialog)

Per ogni elemento dell'interfaccia compiliamo questa scheda. Ogni criterio: ✅ / ⚠️ / ❌.
Una schermata è **"Pronta"** solo con 10/10 ✅.

```
SCHERMATA: ____________________            Data audit: ______   Autore: ______

  1. Azione primaria unica ed evidente        [ ]  note:
  2. Linguaggio umano, sigle spiegate          [ ]  note:
  3. Campi guidati (esempi + hint, req/opz)    [ ]  note:
  4. Default intelligenti                       [ ]  note:
  5. Errori che insegnano                       [ ]  note:
  6. Empty state utile                          [ ]  note:
  7. Conferme coerenti (no confirm nativo)      [ ]  note:
  8. Progressive disclosure                     [ ]  note:
  9. Feedback immediato                         [ ]  note:
 10. Coerenza con il resto dell'app             [ ]  note:

  PUNTEGGIO: __/10        STATO: [ ] Da fare [ ] In corso [ ] Pronta
  PROBLEMA PIÙ GRAVE (1 frase): ____________________________________
  AZIONE CONCRETA: _________________________________________________
```

> Le schede compilate vivono in `docs/audit/<schermata>.md` (una per schermata).

---

## 6. Il workflow ripetibile (per ogni schermata)

Ciclo a 6 passi, sempre lo stesso. Una schermata alla volta, fino a "Pronta".

1. **OSSERVA** — apri la schermata nell'app reale (preview), con dati e *senza* dati
   (per vedere l'empty state). Screenshot prima.
2. **AUDIT** — compila la rubrica §5. Assegna punteggio. Identifica *il singolo problema
   più grave* (non disperdersi).
3. **DISEGNA** — definisci le modifiche minime per portarla a 10/10. Privilegia
   componenti condivisi (Fase 0). Niente redesign gratuiti: solo ciò che serve alla semplicità.
4. **IMPLEMENTA** — applica. Riusa token e componenti esistenti. Una schermata = un commit
   piccolo e isolato.
5. **VERIFICA** — riapri nell'app. Rifai i 3 test (§1). Screenshot dopo. Controlla
   light + dark + mobile.
6. **REGISTRA** — aggiorna la scheda di audit a "Pronta" e spunta il backlog §7.

**Regole d'oro durante il lavoro:**
- Un commit per schermata (o per fondazione di Fase 0). Messaggi chiari.
- Mai introdurre un nuovo pattern se ne esiste già uno: prima si cerca in `shared/` e `styles.scss`.
- Ogni nuovo testo passa dal glossario (F0.6): coerenza prima di creatività.
- Se durante una schermata emerge un bisogno ricorrente → diventa un componente condiviso,
  non una soluzione locale.

---

## 7. Backlog completo — ogni schermata, form e dialog

Priorità = **frequenza d'uso × impatto sul novizio**. Le onde si eseguono in ordine.
"Pronta" = 10/10 sulla rubrica §5.

### Fase 0 — Fondamenta globali (sbloccano tutto)
| # | Elemento | Tipo | File | Stato |
|---|---|---|---|---|
| F0.1 | ConfirmDialog condiviso + sostituite tutte le `confirm()` native (43→0) | componente | `shared/confirm-dialog.ts` + 23 file | ✅ Fatto |
| F0.2 | FieldHelp + glossario termini fiscali (applicato a dialog Clienti/Fornitori) | componente | `shared/field-help.ts`, `shared/glossario.ts` | 🔄 Foundation fatta; rollout form in corso |
| F0.3 | EmptyState condiviso (+ Clienti, Prodotti, Fornitori, Fatture, Preventivi, Ordini, DDT, Note credito, Acquisti) | componente | `shared/empty-state.ts` | 🔄 Componente + 9 liste; restano sotto-liste minori |
| F0.4 | Onboarding primo accesso (checklist in Home) | feature | `shared/onboarding-checklist.ts` | ✅ Fatto |
| F0.5 | Home orientata ai compiti (riga "Cosa vuoi fare?") + sidebar | schermata | `home-app`, `app.html` | 🔄 Azioni rapide in Home fatte; revisione sidebar da fare |
| F0.6 | Pass linguaggio / microcopy + glossario UI | trasversale | tutti | ☐ |

### Onda 1 — Flussi quotidiani core (il 90% dell'uso reale)
| # | Schermata | Perché prioritaria | File | Stato |
|---|---|---|---|---|
| 1 | **Home / Dashboard** | prima cosa che si vede ogni giorno | `home-app`, `dashboard` | ☐ |
| 2 | **Fatture** (lista + dialog documento) | la funzione n.1, la più complessa (1626 righe) | `fatture` | ☐ |
| 3 | **Clienti** (lista + dialog + import) | dato di base per tutto il resto | `clienti` | ☐ |
| 4 | **Prodotti** (lista + dialog + quick-add) | dato di base per i documenti | `prodotti` | ☐ |
| 5 | **Vendita al banco** | flusso veloce, deve essere a prova di errore | `vendita-banco` | ☐ |

### Onda 2 — Ciclo documenti attivi
| # | Schermata | File | Stato |
|---|---|---|---|
| 6 | Preventivi (lista + dialog) | `preventivi` | ☐ |
| 7 | Ordini cliente (lista + dialog) | `ordini` | ☐ |
| 8 | DDT (lista + dialog) | `ddt` | ☐ |
| 9 | Note di credito (lista + dialog) | `note-credito` | ☐ |
| 10 | Fatture ricorrenti (lista + dialog) | `fatture-ricorrenti` | ☐ |
| 11 | Fatture elettroniche (SDI) | `fatture-elettroniche` | ☐ |

### Onda 3 — Acquisti & magazzino
| # | Schermata | File | Stato |
|---|---|---|---|
| 12 | Acquisti (lista + dialog + magazzino-dialog) | `acquisti` | ☐ |
| 13 | Arrivi merce | `arrivi-merce` | ☐ |
| 14 | OCR fatture (PDF) | `ocr-fatture` | ☐ |
| 15 | SDI ricezione (passive) | `sdi-passive` | ☐ |
| 16 | Fornitori (lista + dialog) | `fornitori` | ☐ |
| 17 | Magazzino / movimenti | `magazzino` | ☐ |

### Onda 4 — Contabilità & incassi
| # | Schermata | File | Stato |
|---|---|---|---|
| 18 | Pagamenti (lista + dialog) | `pagamenti` | ☐ |
| 19 | Scadenzario | `scadenzario` | ☐ |
| 20 | Prima nota | `prima-nota` | ☐ |
| 21 | Riconciliazione bancaria | `riconciliazione` | ☐ |
| 22 | Compliance fiscale | `compliance` | ☐ |

### Onda 5 — Strumenti & sistema
| # | Schermata | File | Stato |
|---|---|---|---|
| 23 | Agenda (calendario + todo) | `agenda` | ☐ |
| 24 | Report (dashboard analitica) | `report` | ☐ |
| 25 | Report tabellari | `reports` | ☐ |
| 26 | Impostazioni (4 file, molte sotto-sezioni) | `impostazioni` | ☐ |
| 27 | Account | `account` | ☐ |
| 28 | Abbonamento / Billing | `billing` | ☐ |
| 29 | Storico | `storico` | ☐ |
| 30 | E-commerce | `ecommerce` | ☐ |

### Onda 6 — Accesso, pubbliche & admin
| # | Schermata | File | Stato |
|---|---|---|---|
| 31 | Login | `login` | ☐ |
| 32 | Reset password | `reset-password` | ☐ |
| 33 | Verifica email | `verify-email` | ☐ |
| 34 | Trial scaduto | `trial-expired` | ☐ |
| 35 | Aiuto / Guida | `aiuto` | ☐ |
| 36 | FAQ (landing) | `faq` | ☐ |
| 37 | Legale | `legal` | ☐ |
| 38 | Amministrazione | `admin` | ☐ |
| 39 | Console SaaS (super-admin) | `super-admin` | ☐ |

### Dialog condivisi (audit trasversale, in parallelo alle onde)
| # | Dialog | File | Stato |
|---|---|---|---|
| D1 | Picker prodotto | `shared/prodotto-picker.ts` | ☐ |
| D2 | Import mapping (CSV/Excel) | `shared/import-mapping-dialog.ts` | ☐ |
| D3 | Copia righe | `shared/copia-righe-dialog.ts` | ☐ |
| D4 | Email (invio documenti) | `shared/email-dialog.ts` | ☐ |
| D5 | Info documento / doc-info | `shared/doc-info-dialog.ts` | ☐ |
| D6 | Column picker | `shared/column-picker.ts` | ☐ |
| D7 | Barcode scanner | `shared/barcode-scanner-dialog.ts` | ☐ |
| D8 | Fatture insolute | `shared/fatture-insolute-dialog.ts` | ☐ |
| D9 | Allegati | `shared/allegati/` | ☐ |
| D10 | Info / generico | `shared/info-dialog.ts` | ☐ |
| D11 | Bug report | `shared/bug-report-dialog.ts` | ☐ |
| D12 | Quick-add prodotto | `prodotti/quick-add-prodotto-dialog.ts` | ☐ |
| D13 | Listino | `impostazioni/listino-dialog.ts` | ☐ |
| D14 | Acquisto→magazzino | `acquisti/acquisto-magazzino-dialog.ts` | ☐ |

**Totale:** 6 fondamenta + 39 schermate + 14 dialog ≈ **59 elementi**.

---

## 8. Come misuriamo i progressi

- **Copertura rubrica:** % di elementi a "Pronta" (10/10). Obiettivo Onda 1 = 100% prima di
  passare oltre.
- **`confirm()` nativi residui:** da 43 → **0 ✅** (fatto in F0.1; metrica binaria, tracciabile con grep).
- **Densità di aiuto:** n. di `matHint`/FieldHelp sui campi non ovvi (da 19 → copertura piena).
- **Time-to-first-invoice:** tempo per emettere la prima fattura da account nuovo
  (target < 10 min, misurato a mano su un tester non tecnico).
- **Test della nonna:** ad ogni onda completata, un test reale con una persona non del settore.

---

## 9. Prossime azioni concrete

1. **Approvare questo workflow** (o correggere priorità/principi).
2. **Partire dalla Fase 0**, nell'ordine consigliato — il primo passo naturale è
   **F0.1 ConfirmDialog**: alto impatto, basso rischio, tocca 24 file e dà subito coerenza.
3. Poi **Onda 1 schermata per schermata** con il ciclo §6, un commit ciascuna.

> Suggerimento operativo: procediamo **una schermata per volta**, con audit + screenshot
> prima/dopo, così vedi il miglioramento concreto ad ogni passo e mantieni il controllo
> sulle scelte di design.

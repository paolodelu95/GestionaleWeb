# Session Recaps

Cartella di archivio dei lavori fatti con Claude (o altri assistenti) sul progetto Invoxa.

## Scopo

Ogni file documenta una sessione di lavoro: cosa è stato chiesto, cosa è stato fatto, quali file sono stati toccati e perché. Serve a:

1. **Dare contesto rapido** ad un assistente AI all'inizio di una nuova chat — basta linkargli l'ultimo recap
2. **Ricordarti** decisioni prese, convenzioni adottate, motivazioni dietro scelte tecniche
3. **Tracciare** features aggiunte e debiti tecnici accumulati

## Convenzione di naming

Un file per sessione, formato:

```
YYYY-MM-DD-titolo-breve.md
```

Esempi: `2026-05-20-redesign-ui.md`, `2026-05-22-fix-stampa-pdf.md`.

Se in un singolo giorno si fanno più sessioni distinte, suffisso con `-2`, `-3`, ecc.

## Struttura consigliata di ogni recap

```markdown
# YYYY-MM-DD — Titolo

## Richieste utente
Bullet list di cosa è stato chiesto, in ordine.

## Cosa è stato fatto
Per ogni feature/fix: descrizione + file toccati + motivazione di scelte non ovvie.

## Decisioni / convenzioni adottate
Pattern, naming, scelte architetturali da rispettare in futuro.

## Debiti tecnici / TODO aperti
Cose lasciate in sospeso o da rifinire.

## Note per la prossima sessione
Contesto utile a chi riprende il lavoro (es. "il deploy fly.io ha budget stretti, attenzione").
```

## Indice sessioni

- [2026-05-20 — Redesign UI/UX completo + nuove feature](./2026-05-20-redesign-ui-listini-dashboard.md)

# HANDOFF — Multi-archivio (in corso)

Ripresa lavoro su un altro PC. Branch: **offline-electron**.

## Obiettivo
Più "archivi" (database indipendenti) scelti all'avvio. La vecchia password-programma
sparisce: la password ora protegge/cifra il singolo archivio (richiesta alla sua apertura).
Controlli: crea, duplica, elimina, rinomina, imposta/rimuovi password, importa, esporta,
cambia archivio. Archivio A = prodotti 1-2-3, archivio B = 4-5-6 (DB separati → backup separati).

## Stato: BACKEND + UI scritti, da VALIDARE sul CI (qui manca il compilatore Rust)
Tutto committato e pushato sul branch (nessuna release finché non si tagga).

**Modello:** ogni archivio è una cartella `Documenti/Ordeva/archivi/<slug>/` con dentro lo
stesso layout dell'archivio singolo (`ordeva.db`/`.enc`, `backups/`, allegati). L'archivio
attivo = quella cartella usata come data_dir → tutta la macchina esistente (db/atrest/backup)
funziona per-archivio senza modifiche. `archivi/index.json` elenca archivi + corrente.

**Fatto:**
- `src-tauri/src/archivi.rs` — modello + list/crea/duplica/rinomina/elimina/importa/esporta/
  migra_da_singolo + risincronizza_cifrati. Con test (slug, crea, elimina, migrazione).
- `src-tauri/src/main.rs` — avvio: `migra_da_singolo` poi apre l'archivio corrente (se in
  chiaro) altrimenti mostra il **selettore archivi** (ex pagina sblocco): `PICKER_HTML` +
  `handle_locked` con POST `/__archivi` `/__apri` `/__crea`. `LockedCtx{root,config_path}`.
  Sigillo cifratura alla chiusura ora guidato da `atrest_password` (per-archivio).
- `src-tauri/src/routes/archivi.rs` + registrazione in `routes/mod.rs` (`/api/archivi`):
  GET `/`, POST `/` (crea), `/importa`, `/password` (POST set / DELETE remove),
  `/:slug/duplica|rinomina|cambia|esporta|elimina`.
- Frontend: `components/archivi/archivi.ts` (UI gestione), metodi in `services/data.service.ts`,
  `pickSaveDb` in `services/desktop.service.ts`, rotta `/archivi` in `app.routes.ts`,
  voce nav "Archivi" + **lock-screen in-app disattivato** (`locked=false`) in `app.ts`.
- Frontend compila pulito (`cd frontend && npx ng build --configuration offline`).

## PROSSIMI PASSI per finire
1. **Rilascio/validazione Rust**: bump versione in `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (campo `ordeva-desktop`), poi
   `git tag -a vX.Y.Z -m "…"; git push origin vX.Y.Z`. Il workflow builda e, se verde,
   pubblica da solo. **Se il build fallisce** (Rust scritto alla cieca), leggi gli errori
   dei job e correggi. Punti da verificare per primi:
   - rotte axum 0.7 in `routes/archivi.rs`: statiche `/importa` `/password` + param `/:slug/...`
     (matchit 0.7 dovrebbe accettarle).
   - `ApiError::Internal(anyhow::Error)` esiste (usato in setup.rs) — ok.
   - `crate::config::copy_dir_all`, `crate::backup::is_encrypted`, `crate::db::DB_FILE` pubblici — ok.
2. **Test migrazione** su una COPIA dei dati reali prima di fidarsi (sposta `ordeva.db` →
   `archivi/il-mio-archivio/` via rename atomico; niente copia in chiaro lasciata in giro).
3. **Pulizia vecchia password (rimandata)**: togliere i resti dell'app-password ora inutile —
   step "password" in `welcome-offline.ts`, controlli in `Impostazioni → Sicurezza`,
   route `setup.rs` `/password`, `sistema.rs` `/cifratura` (sostituiti da `/api/archivi/password`).
   Il lock-screen è già neutralizzato; questi sono residui.

## Note
- Nessun `cargo` in locale: il Rust si valida solo sul CI (~20 min/giro). I tag a build
  fallita NON pubblicano (il job `publish` richiede build verde), quindi taggare è sicuro.
- Cambio archivio = `set_corrente` + `desktop.relaunch()` (riavvio).

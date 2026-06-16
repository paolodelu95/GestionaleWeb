# Ordeva — edizione offline Electron · ❌ RIMOSSA

L'edizione offline non usa più **Electron + Node/Express**: è stata riscritta con
backend in **Rust (axum)** impacchettato con **Tauri**, in [`../src-tauri`](../src-tauri),
per ridurre la RAM ed eliminare i moduli nativi da ricompilare (`better-sqlite3`).

I sorgenti Electron (`main.js`, `preload.js`, `build.mjs`, `afterPack.cjs`,
`package.json`, icone) e il workflow `desktop-release.yml` sono stati rimossi in
questa fase. Restano **recuperabili dalla storia git** se servisse:

```bash
git log --oneline -- electron/        # trova il commit prima della rimozione
git checkout <commit>^ -- electron/   # ripristina la cartella da quel commit
```

## Come si builda oggi l'app desktop

```bash
cd frontend && ng build --configuration offline
cd ../src-tauri && cargo install tauri-cli && cargo tauri build
```

Oppure push di un tag `v*`: il workflow
[`.github/workflows/tauri-release.yml`](../.github/workflows/tauri-release.yml)
genera i bundle (Win/macOS/Linux) e una GitHub Release in bozza.

Dettagli della migrazione: [`../docs/MIGRAZIONE-TAURI-RUST.md`](../docs/MIGRAZIONE-TAURI-RUST.md).

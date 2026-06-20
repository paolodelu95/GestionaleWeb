// Ordeva — edizione offline desktop (Tauri + backend Rust).
// Niente console su Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audit;
mod auth;
mod backup;
mod db;
mod error;
mod fiscale;
mod gemello;
mod jobs;
mod match_prodotti;
mod moduli;
mod numerazione;
mod routes;
mod server;
mod stock;
mod web;
mod xml;

use std::path::PathBuf;

use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::{StateFlags, WindowExt};

use db::AppState;

fn main() {
    tracing_subscriber::fmt().init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // I dati vivono fuori dall'app (persistono tra aggiornamenti), come
            // faceva main.js con app.getPath('userData')/data. Override via DATA_DIR.
            let data_dir = resolve_data_dir(app)?;
            tracing::info!("DATA_DIR = {:?}", data_dir);

            let state = AppState::init(data_dir)
                .map_err(|e| format!("init database: {e:#}"))?;

            // SPA: nell'app impacchettata i file Angular sono una risorsa del
            // bundle (vedi bundle.resources). Puntiamo il server lì via
            // ORDEVA_SPA_DIR; in sviluppo la var resta vuota e il server usa il
            // percorso del repo. Senza questo, nel pacchetto localhost:3000 non
            // troverebbe la SPA (errore all'avvio su un PC diverso da quello di build).
            if std::env::var_os("ORDEVA_SPA_DIR").is_none() {
                if let Ok(res) = app.path().resource_dir() {
                    for cand in ["spa", "spa/browser", "browser", "."] {
                        let dir = res.join(cand);
                        if dir.join("index.html").is_file() {
                            std::env::set_var("ORDEVA_SPA_DIR", &dir);
                            tracing::info!("ORDEVA_SPA_DIR = {:?}", dir);
                            break;
                        }
                    }
                }
            }
            // Backup esterno automatico se "dovuto" (parità con runExternalBackupIfDue
            // all'avvio di server.js in OFFLINE_MODE). In un thread per non bloccare.
            let bk_state = state.clone();
            std::thread::spawn(move || backup::run_if_due(&bk_state));
            // Scheduler job offline (fatture ricorrenti dovute, solleciti automatici):
            // catch-up all'avvio + ogni 6h (parità con i cron 7:00/8:00 di server.js).
            jobs::spawn_scheduler(state.clone());
            server::spawn(state).map_err(|e| format!("avvio server: {e:#}"))?;

            // La WebView carica la SPA servita da axum (niente file://, niente CORS).
            let url = format!("http://localhost:{}/", server::PORT);
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("url valido")),
            )
            .title("Ordeva")
            .inner_size(1440.0, 900.0)
            .min_inner_size(360.0, 600.0)
            .maximized(true)
            .build()?;

            // Ripristina dimensione/posizione/stato salvati dalla sessione
            // precedente (il plugin window-state li salva alla chiusura). Al
            // primo avvio non c'è nulla da ripristinare: resta massimizzata.
            let _ = window.restore_state(StateFlags::all());

            // ── Menu nativo dell'applicazione ──────────────────────────────
            // Le voci app-specifiche NON hanno acceleratore (le scorciatoie
            // Cmd+N/Cmd+S sono già gestite dalla SPA): qui il menu serve da via
            // mouse/discoverability. Al click emettono l'evento "menu" che il
            // frontend traduce nell'azione corrispondente.
            if let Err(e) = setup_menu(app) {
                tracing::warn!("menu nativo non disponibile: {e}");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("errore nell'avvio di Ordeva");
}

/// Costruisce e installa il menu nativo (File / Modifica / Visualizza / Aiuto).
/// Le voci custom emettono l'evento "menu" con il proprio id verso la WebView.
fn setup_menu(app: &tauri::App) -> tauri::Result<()> {
    let file = SubmenuBuilder::new(app, "File")
        .text("new", "Nuovo documento")
        .text("save", "Salva")
        .separator()
        .text("backup", "Backup dati…")
        .separator()
        .quit()
        .build()?;

    let edit = SubmenuBuilder::new(app, "Modifica")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view = SubmenuBuilder::new(app, "Visualizza")
        .text("density", "Densità: Comoda / Compatta")
        .separator()
        .minimize()
        .build()?;

    let help = SubmenuBuilder::new(app, "Aiuto")
        .text("help", "Guida")
        .text("about", "Informazioni su Ordeva")
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&file, &edit, &view, &help])
        .build()?;
    app.set_menu(menu)?;

    app.on_menu_event(move |app, event| {
        let id = event.id().as_ref().to_string();
        // Le voci predefinite (copy/paste/quit…) sono gestite dal sistema; per
        // quelle custom inoltriamo l'id alla SPA che esegue l'azione.
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.emit("menu", id);
        }
    });

    Ok(())
}

fn resolve_data_dir(app: &tauri::App) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Ok(p) = std::env::var("DATA_DIR") {
        return Ok(PathBuf::from(p));
    }
    let base = app.path().app_data_dir()?;
    Ok(base.join("data"))
}

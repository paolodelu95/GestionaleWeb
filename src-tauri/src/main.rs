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

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use db::AppState;

fn main() {
    tracing_subscriber::fmt().init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // I dati vivono fuori dall'app (persistono tra aggiornamenti), come
            // faceva main.js con app.getPath('userData')/data. Override via DATA_DIR.
            let data_dir = resolve_data_dir(app)?;
            tracing::info!("DATA_DIR = {:?}", data_dir);

            let state = AppState::init(data_dir)
                .map_err(|e| format!("init database: {e:#}"))?;
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
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("url valido")),
            )
            .title("Ordeva")
            .inner_size(1440.0, 900.0)
            .min_inner_size(360.0, 600.0)
            .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("errore nell'avvio di Ordeva");
}

fn resolve_data_dir(app: &tauri::App) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Ok(p) = std::env::var("DATA_DIR") {
        return Ok(PathBuf::from(p));
    }
    let base = app.path().app_data_dir()?;
    Ok(base.join("data"))
}

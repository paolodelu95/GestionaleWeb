// Ordeva — edizione offline desktop (Tauri + backend Rust).
// Niente console su Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audit;
mod auth;
mod backup;
mod config;
mod db;
mod error;
mod fiscale;
mod gemello;
mod jobs;
mod lock;
mod match_prodotti;
mod migrate;
mod moduli;
mod numerazione;
mod routes;
mod server;
mod stock;
mod web;
mod xml;

// Menu nativo solo su macOS (barra globale in cima allo schermo): su Windows e
// Linux non lo creiamo, quindi questi import servono solo lì.
#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::{StateFlags, WindowExt};

use db::AppState;

fn main() {
    tracing_subscriber::fmt().init();

    tauri::Builder::default()
        // Istanza singola (va registrato per primo): se l'app è già aperta, il secondo
        // avvio non parte e riporta in primo piano la finestra esistente.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        // Autostart: avvio col login del sistema. Il toggle in Impostazioni abilita/disabilita.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // Protocollo custom `ordeva://`: invece di un server in ascolto su una porta TCP,
        // ogni richiesta della WebView (SPA e /api/*) viene instradata in-process nel
        // Router axum. Niente porta aperta, niente firewall, niente conflitti di porta.
        // Il Router è custodito come managed state da setup() (SharedRouter); qui lo
        // recuperiamo via l'app handle del contesto.
        .register_asynchronous_uri_scheme_protocol(server::SCHEME, |ctx, request, responder| {
            let router = ctx
                .app_handle()
                .state::<server::SharedRouter>()
                .inner()
                .0
                .clone();
            tauri::async_runtime::spawn(async move {
                let resp = server::handle_request(router, request).await;
                responder.respond(resp);
            });
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // Cartella dati VISIBILE e spostabile (default: Documenti/Ordeva), con
            // priorità env DATA_DIR > config ordeva.json > default. Vedi config.rs.
            let data_dir = config::resolve_data_dir(&handle)
                .map_err(|e| format!("risoluzione cartella dati: {e:#}"))?;
            // Migrazione one-time dalla vecchia cartella nascosta (app_data_dir/data),
            // così aggiornando non si "perdono" i dati passando alla cartella visibile.
            if let Err(e) = config::migrate_legacy_if_needed(&handle, &data_dir) {
                tracing::warn!("migrazione dati legacy fallita: {e:#}");
            }
            // Migrazione one-time dal vecchio formato a due file (auth.db + tenants/) al
            // file unico ordeva.db. Se fallisce è meglio fermarsi (i vecchi file restano).
            db::flatten_to_single_file(&data_dir)
                .map_err(|e| format!("migrazione a file unico: {e:#}"))?;
            config::write_readme(&data_dir);
            let config_path = config::config_path(&handle)
                .map_err(|e| format!("percorso config: {e:#}"))?;
            tracing::info!("DATA_DIR = {:?}", data_dir);

            let state = AppState::init(data_dir, config_path)
                .map_err(|e| format!("init database: {e:#}"))?;
            // Heartbeat del lock di sessione (per l'avviso uso Dropbox su due PC).
            state.spawn_heartbeat();

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

            // Costruisco il Router axum una volta sola e lo rendo managed state: la
            // closure del protocollo `ordeva://` (registrata sopra) lo recupera da qui.
            let router = server::build_router(state.clone());
            app.manage(server::SharedRouter(router));
            // AppState anche come managed state: lo recupera l'handler d'uscita (flush +
            // rilascio lock) in app.run(), oltre alle route via with_state.
            app.manage(state.clone());

            // La WebView carica la SPA via lo scheme custom `ordeva://` (servito in-process
            // dal Router, niente porta). Aggancio la versione dell'app come query param: a
            // ogni aggiornamento l'URL cambia (es. /?v=1.2.12) e la cache della WebView
            // (WebView2 su Windows in primis) fa "miss" sulla index.html, ricaricando
            // l'interfaccia nuova invece di servire quella vecchia in cache. Insieme a
            // Cache-Control: no-cache (vedi server.rs) elimina i disallineamenti UI dopo
            // un update. Il query param non cambia l'origin: localStorage, preferenze e
            // mapping memorizzati restano intatti.
            let url = format!("{}://localhost/?v={}", server::SCHEME, env!("CARGO_PKG_VERSION"));
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("url valido")),
            )
            .title("Ordeva")
            .inner_size(1440.0, 900.0)
            .min_inner_size(360.0, 600.0)
            .maximized(true)
            // Sfondo finestra = colore chiaro dell'app (#f8fafc): evita il
            // "lampo" bianco del WebView prima che la SPA dipinga, così l'avvio
            // sembra quello di un programma nativo e non di una pagina che carica.
            .background_color(tauri::window::Color(0xf8, 0xfa, 0xfc, 0xff))
            .build()?;

            // Eventi finestra:
            // - Focused(false): checkpoint del WAL (se il DB è su Dropbox, riduce la
            //   finestra in cui un `.db`+`-wal` disallineato verrebbe sincronizzato).
            // - CloseRequested: NON esce, ma nasconde nella tray (app in background, come
            //   un'app vera). Prima fa un checkpoint così Dropbox sincronizza pulito. Si
            //   esce davvero dalla tray ("Chiudi in sicurezza") o dal pulsante in app.
            let ev_state = state.clone();
            let ev_win = window.clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::Focused(false) => ev_state.flush(),
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    ev_state.flush();
                    let _ = ev_win.hide();
                }
                _ => {}
            });

            // Icona nell'area di notifica / menu bar, con menu rapido.
            if let Err(e) = setup_tray(app, state.clone()) {
                tracing::warn!("tray non disponibile: {e}");
            }

            // Ripristina dimensione/posizione/stato salvati dalla sessione
            // precedente (il plugin window-state li salva alla chiusura). Al
            // primo avvio non c'è nulla da ripristinare: resta massimizzata.
            let _ = window.restore_state(StateFlags::all());

            // ── Menu nativo dell'applicazione (solo macOS) ─────────────────
            // Su macOS il menu è la barra globale in cima allo schermo: standard
            // e attesa (Copia/Incolla, Esci…). Su Windows e Linux sarebbe invece
            // una barra DENTRO la finestra (File/Modifica/Visualizza/Aiuto),
            // fuori posto per un gestionale: lì non la creiamo affatto.
            // Le voci custom emettono l'evento "menu" che il frontend traduce
            // nell'azione corrispondente.
            #[cfg(target_os = "macos")]
            if let Err(e) = setup_menu(app) {
                tracing::warn!("menu nativo non disponibile: {e}");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("errore nell'avvio di Ordeva")
        .run(|app_handle, event| {
            // All'uscita reale (anche via app.exit dalla tray/pulsante): checkpoint finale
            // (un solo .db pulito da sincronizzare) e rilascio del lock di sessione, così
            // l'altro PC può aprire senza avvisi.
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    state.flush();
                    state.release_lock();
                }
            }
        });
}

/// Icona nell'area di notifica (Windows/Linux) / menu bar (macOS) con menu rapido.
/// Chiudendo la finestra l'app resta qui in background; da qui la si riapre o si esce
/// in sicurezza (checkpoint + rilascio lock).
fn setup_tray(app: &tauri::App, state: AppState) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let mostra = MenuItemBuilder::with_id("tray_mostra", "Mostra Ordeva").build(app)?;
    let chiudi =
        MenuItemBuilder::with_id("tray_chiudi", "Chiudi in sicurezza").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&mostra, &chiudi]).build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Ordeva")
        .menu(&menu)
        .show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder = builder.on_menu_event(move |app, event| match event.id().as_ref() {
        "tray_mostra" => show_main(app),
        "tray_chiudi" => {
            state.flush();
            state.release_lock();
            app.exit(0);
        }
        _ => {}
    });

    builder = builder.on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            show_main(tray.app_handle());
        }
    });

    builder.build(app)?;
    Ok(())
}

/// Mostra e porta in primo piano la finestra principale (dalla tray o da single-instance).
fn show_main<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Costruisce e installa il menu nativo (File / Modifica / Visualizza / Aiuto).
/// Le voci custom emettono l'evento "menu" con il proprio id verso la WebView.
/// Solo macOS: su Windows/Linux il menu resta assente (vedi setup()).
#[cfg(target_os = "macos")]
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

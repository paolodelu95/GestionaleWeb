// Ordeva — edizione offline desktop (Tauri + backend Rust).
// Niente console su Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archivi;
mod atrest;
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
use tauri_plugin_dialog::DialogExt;
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
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                // Se il Router è pronto (app sbloccata) instradiamo le richieste in axum;
                // altrimenti il DB è cifrato e in attesa di sblocco: serviamo la pagina di
                // sblocco e gestiamo il POST /__unlock (decifra e avvia l'app).
                let resp = if let Some(router) = app.try_state::<server::SharedRouter>() {
                    server::handle_request(router.0.clone(), request).await
                } else {
                    handle_locked(&app, request).await
                };
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

            // SPA: nell'app impacchettata i file Angular sono una risorsa del bundle
            // (indipendente dal DB, quindi qui prima di tutto).
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

            // Finestra principale (sempre creata). Se il DB è cifrato e bloccato il
            // protocollo serve la pagina di sblocco; altrimenti la SPA. Vedi sotto.
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
            // - CloseRequested: chiede conferma e, se confermato, esce davvero.
            //   La conferma è gestita QUI (Rust) e non più in JS: su Windows la
            //   versione JS (onCloseRequested) non bloccava in tempo, così la
            //   finestra si chiudeva prima della conferma e "Annulla" non la
            //   riapriva. prevent_close() blocca sempre; poi: "Chiudi" → uscita
            //   pulita (checkpoint + rilascio lock nell'handler di run), "Annulla"
            //   → la finestra resta aperta.
            // Eventi finestra. Lo stato si recupera a runtime (in fase di sblocco non
            // esiste ancora): Focused(false) → checkpoint WAL; CloseRequested → conferma
            // e uscita (se l'app è avviata), altrimenti lascia chiudere la schermata di
            // sblocco.
            let ev_win = window.clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::Focused(false) => {
                    if let Some(state) = ev_win.app_handle().try_state::<AppState>() {
                        state.flush();
                    }
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let app = ev_win.app_handle().clone();
                    if app.try_state::<AppState>().is_none() {
                        return; // schermata di sblocco: chiudi senza confermare
                    }
                    api.prevent_close();
                    ev_win.dialog()
                        .message("Vuoi chiudere Ordeva?")
                        .title("Conferma chiusura")
                        .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
                        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                            "Chiudi".to_string(),
                            "Annulla".to_string(),
                        ))
                        .show(move |chiudi| {
                            if chiudi {
                                app.exit(0);
                            }
                        });
                }
                _ => {}
            });

            // Ripristina dimensione/posizione/stato salvati dalla sessione precedente.
            let _ = window.restore_state(StateFlags::all());

            // Avvio: se il DB è cifrato e bloccato, attendiamo lo sblocco (il protocollo
            // serve la pagina di sblocco e gestisce /__unlock → bring_up). Altrimenti
            // portiamo su l'app subito.
            // Multi-archivio: migra l'eventuale DB singolo nel primo archivio, poi decidi.
            archivi::migra_da_singolo(&data_dir)
                .map_err(|e| format!("migrazione archivi: {e:#}"))?;
            // Apri direttamente l'archivio corrente SOLO se esiste ed è in chiaro (non
            // cifrato/bloccato). Altrimenti (nessun archivio o archivio cifrato) mostra il
            // selettore, che elenca/apre/crea gli archivi (vedi handle_locked).
            let apri = archivi::corrente(&data_dir)
                .map(|slug| archivi::archivio_dir(&data_dir, &slug))
                .filter(|adir| !atrest::is_locked(adir));
            match apri {
                Some(adir) => {
                    bring_up(&handle, adir, config_path, None)
                        .map_err(|e| format!("avvio app: {e:#}"))?;
                }
                None => {
                    tracing::info!("selettore archivi (nessun archivio aperto in chiaro)");
                    app.manage(LockedCtx { root: data_dir, config_path });
                }
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
                    // Cifratura a riposo: se attiva e sbloccata, ricifra il file e rimuove
                    // il chiaro. Senza password (avvio non pulito mai sbloccato) si lascia
                    // com'è (il file cifrato precedente resta valido).
                    // Cifratura a riposo per-archivio: se questo archivio è stato aperto/creato
                    // con una password (atrest_password presente), ricifra e rimuovi il chiaro.
                    let pw = state.atrest_password.lock().unwrap().clone();
                    if let Some(pw) = pw {
                        state.close_all();
                        if let Err(e) = atrest::seal_on_close(&state.data_dir, &pw) {
                            tracing::error!("ricifratura alla chiusura fallita: {e:#}");
                        }
                    }
                }
            }
        });
}

/// Stato gestito quando nessun archivio è ancora aperto: il selettore servito dal
/// protocollo elenca gli archivi (sotto `root/archivi`), ne apre uno (sbloccandolo con la
/// password se cifrato) o ne crea uno nuovo, e poi avvia l'app.
struct LockedCtx {
    /// Radice dati (contiene `archivi/`).
    root: std::path::PathBuf,
    config_path: std::path::PathBuf,
}

/// Avvia l'app vera e propria: apre il DB, avvia thread/scheduler, costruisce e registra
/// il Router, la tray e il menu. Chiamata sia all'avvio normale sia dopo lo sblocco.
fn bring_up(
    app: &tauri::AppHandle,
    data_dir: std::path::PathBuf,
    config_path: std::path::PathBuf,
    atrest_pw: Option<String>,
) -> anyhow::Result<()> {
    let state = AppState::init(data_dir, config_path)?;
    if let Some(pw) = atrest_pw {
        *state.atrest_password.lock().unwrap() = Some(pw);
    }
    state.spawn_heartbeat();

    let bk_state = state.clone();
    std::thread::spawn(move || backup::run_if_due(&bk_state));
    jobs::spawn_scheduler(state.clone());

    let router = server::build_router(state.clone());
    app.manage(server::SharedRouter(router));
    app.manage(state.clone());

    if let Err(e) = setup_tray(app, state.clone()) {
        tracing::warn!("tray non disponibile: {e}");
    }
    #[cfg(target_os = "macos")]
    if let Err(e) = setup_menu(app) {
        tracing::warn!("menu nativo non disponibile: {e}");
    }
    Ok(())
}

/// Gestisce le richieste finché nessun archivio è aperto. Endpoint (POST):
/// - `__archivi`: elenco archivi (con flag cifrato);
/// - `__apri` {slug,password}: apre (sblocca se cifrato) e avvia l'app;
/// - `__crea` {nome,password}: crea un nuovo archivio e avvia l'app.
/// Ogni altra richiesta riceve la pagina del selettore.
async fn handle_locked(
    app: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<std::borrow::Cow<'static, [u8]>> {
    use std::borrow::Cow;
    let path = request.uri().path().to_string();
    let is_post = request.method() == tauri::http::Method::POST;
    let json = |v: serde_json::Value| {
        tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", "application/json")
            .body(Cow::Owned(serde_json::to_vec(&v).unwrap_or_default()))
            .expect("risposta json valida")
    };
    let body_json = |req: &tauri::http::Request<Vec<u8>>| -> serde_json::Value {
        serde_json::from_slice(req.body()).unwrap_or(serde_json::Value::Null)
    };

    if is_post && path.contains("__archivi") {
        let ctx = app.state::<LockedCtx>();
        return json(serde_json::json!({ "archivi": archivi::list(&ctx.root) }));
    }

    if is_post && path.contains("__apri") {
        let b = body_json(&request);
        let slug = b.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let password = b.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ctx = app.state::<LockedCtx>();
        let (root, config_path) = (ctx.root.clone(), ctx.config_path.clone());
        let adir = archivi::archivio_dir(&root, &slug);
        let ok = if atrest::is_locked(&adir) {
            match atrest::unlock(&adir, &password) {
                Ok(()) => {
                    let _ = archivi::set_corrente(&root, &slug);
                    bring_up(app, adir, config_path, Some(password)).is_ok()
                }
                Err(_) => false,
            }
        } else {
            let _ = archivi::set_corrente(&root, &slug);
            bring_up(app, adir, config_path, None).is_ok()
        };
        return json(serde_json::json!({ "ok": ok }));
    }

    if is_post && path.contains("__crea") {
        let b = body_json(&request);
        let nome = b.get("nome").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
        let password = b.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ctx = app.state::<LockedCtx>();
        let (root, config_path) = (ctx.root.clone(), ctx.config_path.clone());
        if nome.is_empty() {
            return json(serde_json::json!({ "ok": false }));
        }
        let ok = match archivi::crea(&root, &nome) {
            Ok(a) => {
                let _ = archivi::set_corrente(&root, &a.slug);
                let adir = archivi::archivio_dir(&root, &a.slug);
                let pw = if password.is_empty() { None } else { Some(password) };
                bring_up(app, adir, config_path, pw).is_ok()
            }
            Err(_) => false,
        };
        return json(serde_json::json!({ "ok": ok }));
    }

    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-cache")
        .body(Cow::Borrowed(PICKER_HTML.as_bytes()))
        .expect("pagina selettore valida")
}

/// Pagina del selettore archivi (standalone, niente Angular): elenca gli archivi, ne apre
/// uno (chiedendo la password se cifrato) o ne crea uno nuovo; al successo ricarica.
const PICKER_HTML: &str = r#"<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ordeva — Archivi</title>
<style>
 :root{--brand:#11769b;--brand2:#15a4a2}
 *{box-sizing:border-box} html,body{height:100%}
 body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
   background:#f8fafc;color:#0e2a38;display:flex;align-items:center;justify-content:center;padding:20px}
 .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;width:430px;max-width:100%;
   box-shadow:0 10px 30px rgba(2,32,52,.08)}
 .logo{width:48px;height:48px;border-radius:13px;margin:0 0 14px;
   background:linear-gradient(135deg,var(--brand),var(--brand2))}
 h1{font-size:20px;margin:0 0 2px} .sub{color:#64748b;font-size:13px;margin:0 0 18px}
 .arc{padding:11px 12px;border:1px solid #e2e8f0;border-radius:11px;margin-bottom:8px;background:#fafbfd}
 .arc .head{display:flex;align-items:center;gap:10px;cursor:pointer}
 .arc:hover{border-color:var(--brand)}
 .arc .nome{flex:1;font-weight:600} .arc .lock{color:#94a3b8;font-size:15px}
 .row{display:flex;gap:8px;margin-top:8px}
 input{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;outline:none}
 input:focus{border-color:var(--brand)}
 button{padding:10px 14px;border:0;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;
   background:linear-gradient(135deg,var(--brand),var(--brand2));white-space:nowrap}
 button:disabled{opacity:.6;cursor:default}
 .sep{border:0;border-top:1px solid #eef0f4;margin:18px 0 14px}
 .lbl{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px}
 .err{color:#dc2626;font-size:13px;min-height:16px;margin-top:8px}
</style></head><body>
 <div class="card">
  <div class="logo"></div>
  <h1>Scegli un archivio</h1>
  <p class="sub">Ogni archivio è un gestionale a sé, con i suoi dati e la sua password.</p>
  <div id="lista"></div>
  <hr class="sep">
  <p class="lbl">Nuovo archivio</p>
  <input id="nome" placeholder="Nome (es. La mia azienda)">
  <div class="row">
   <input id="npw" type="password" autocomplete="new-password" placeholder="Password (opzionale)">
   <button id="crea">Crea</button>
  </div>
  <div class="err" id="e"></div>
 </div>
<script>
 const lista=document.getElementById('lista'),e=document.getElementById('e');
 const post=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(r=>r.json());
 function apri(slug,pw,btn){
   e.textContent=''; if(btn){btn.disabled=true;btn.textContent='Apro…';}
   post('/__apri',{slug:slug,password:pw||''}).then(j=>{
     if(j&&j.ok){location.reload();return;}
     e.textContent='Password errata o apertura non riuscita.';
     if(btn){btn.disabled=false;btn.textContent='Apri';}
   }).catch(()=>{e.textContent='Errore di apertura.';if(btn){btn.disabled=false;btn.textContent='Apri';}});
 }
 function render(archivi){
   lista.innerHTML='';
   if(!archivi.length){lista.innerHTML='<p class="sub">Nessun archivio ancora: creane uno qui sotto.</p>';return;}
   for(const a of archivi){
     const row=document.createElement('div');row.className='arc';
     const head=document.createElement('div');head.className='head';
     head.innerHTML='<span class="nome"></span><span class="lock">'+(a.cifrato?'🔒':'')+'</span>';
     head.querySelector('.nome').textContent=a.nome;
     row.appendChild(head);
     if(a.cifrato){
       head.onclick=()=>{
         if(row.dataset.open)return; row.dataset.open='1';
         const wrap=document.createElement('div');wrap.className='row';
         wrap.innerHTML='<input type="password" placeholder="Password"><button>Apri</button>';
         const inp=wrap.querySelector('input'),btn=wrap.querySelector('button');
         btn.onclick=()=>{ if(!inp.value){inp.focus();return;} apri(a.slug,inp.value,btn); };
         inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')btn.click();});
         row.appendChild(wrap); inp.focus();
       };
     } else {
       head.onclick=()=>apri(a.slug,'',null);
     }
     lista.appendChild(row);
   }
 }
 post('/__archivi').then(j=>render((j&&j.archivi)||[])).catch(()=>{e.textContent='Impossibile leggere gli archivi.';});
 document.getElementById('crea').onclick=()=>{
   const nome=document.getElementById('nome').value.trim(),pw=document.getElementById('npw').value||'';
   if(!nome){e.textContent='Dai un nome all\'archivio.';return;}
   const b=document.getElementById('crea');e.textContent='';b.disabled=true;b.textContent='Creo…';
   post('/__crea',{nome:nome,password:pw}).then(j=>{
     if(j&&j.ok){location.reload();return;}
     e.textContent='Creazione non riuscita.';b.disabled=false;b.textContent='Crea';
   }).catch(()=>{e.textContent='Errore di creazione.';b.disabled=false;b.textContent='Crea';});
 };
</script></body></html>"#;

/// Icona nell'area di notifica (Windows/Linux) / menu bar (macOS) con menu rapido.
/// Chiudendo la finestra l'app resta qui in background; da qui la si riapre o si esce
/// in sicurezza (checkpoint + rilascio lock).
fn setup_tray(app: &tauri::AppHandle, state: AppState) -> tauri::Result<()> {
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
fn setup_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
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

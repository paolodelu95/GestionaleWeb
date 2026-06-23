// Edizione offline (desktop Tauri): backend locale in-process, nessun login né SaaS.
// apiUrl relativo: la WebView carica lo scheme custom `ordeva://localhost/`, quindi le
// chiamate a `/api/...` restano same-origin e vengono instradate dal Router axum senza
// alcuna porta TCP. Vedi src-tauri/src/server.rs e main.rs.
export const environment = {
  production: true,
  apiUrl: '/api',
  offline: true,
};

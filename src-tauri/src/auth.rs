//! Autenticazione. In edizione offline (come authMiddleware con OFFLINE_MODE)
//! l'auth è bypassata: ogni richiesta è l'utente "local" OWNER sul tenant "default".
//! Quando in futuro servirà il multi-utente locale, qui si reintrodurrà la verifica
//! del token HMAC (utils/authToken.js → hmac + sha2).

use serde::Serialize;

use crate::db::DEFAULT_TENANT;

/// Utente corrente della richiesta (in offline: sempre lo stesso).
#[derive(Clone, Serialize)]
pub struct CurrentUser {
    pub id: i64,
    pub username: String,
    pub nome: String,
    pub email: String,
    pub ruolo: String,
    pub tenant: String,
}

impl CurrentUser {
    /// Utente locale dell'edizione offline (parità con LOCAL_USER di middleware/auth.js).
    pub fn local() -> Self {
        CurrentUser {
            id: 1,
            username: "local".into(),
            nome: "Utente locale".into(),
            email: "".into(),
            ruolo: "OWNER".into(),
            tenant: DEFAULT_TENANT.into(),
        }
    }
}

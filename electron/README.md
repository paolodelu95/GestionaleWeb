# Ordeva — edizione offline (desktop)

Versione **locale e single-user** di Ordeva: backend + frontend girano sul PC
dell'utente, i dati restano in un file SQLite locale. Niente login, niente
account/abbonamenti, niente cloud. L'invio email usa il **client di posta del
sistema** (`mailto:`), non SMTP.

È il contenuto del branch `offline-electron`. La versione SaaS resta su `main`.

## Come funziona
- `OFFLINE_MODE=1` nel backend: ogni richiesta è autenticata come utente locale
  `OWNER` sul tenant `default` (nessun token richiesto), trial/billing disattivati.
- Il frontend è compilato con la configuration `offline`
  (`environment.offline = true`): salta la schermata di login, sblocca tutti i
  moduli e instrada le email sul client di sistema.
- Electron avvia il backend in-process e mostra la SPA servita da
  `http://localhost:3000`.

## Prerequisiti (una volta sola)
```bash
# dipendenze backend e frontend (dalle rispettive cartelle)
cd backend  && npm install
cd ../frontend && npm install
# dipendenze desktop (ricompila better-sqlite3 sull'ABI di Electron via postinstall)
cd ../electron && npm install
```
> `better-sqlite3` è un modulo nativo: `npm install` qui lancia `@electron/rebuild`
> per ricompilarlo per Electron. Se cambi versione di Electron, rilancia
> `npm run rebuild`.

## Avvio (sviluppo)
```bash
cd electron
npm run build   # compila il frontend (config offline) e lo copia in backend/public
npm start       # avvia l'app desktop
```

## Creare gli installer
```bash
cd electron
npm run dist     # genera in electron/dist/ (NSIS su Windows, dmg su mac, AppImage su Linux)
```
Nota: per **non** mostrare l'avviso "editore sconosciuto" serve firmare il codice
(certificato a pagamento). Senza firma l'app funziona ugualmente, con un avviso al
primo avvio.

## Dove sono i dati
Nella cartella `userData` di Electron:
- Windows: `%APPDATA%/Ordeva/data`
- macOS: `~/Library/Application Support/Ordeva/data`
- Linux: `~/.config/Ordeva/data`

Contiene `auth.db` e `tenants/default.db`. Per il backup basta copiare questa cartella.

## Cosa resta opzionale / connesso
- **Fattura elettronica (SDI)**: la creazione dell'XML è offline; l'*invio* reale
  richiede un intermediario online (funzione opzionale).
- **OCR fatture**: richiede una chiave Mindee (`MINDEE_API_KEY`), opzionale.

## Prima di pubblicare come open source
- Scegliere la **licenza** (in `package.json` è indicata `AGPL-3.0-or-later` come
  ipotesi: AGPL mantiene aperte le modifiche, MIT massimizza l'adozione). Aggiungere
  un file `LICENSE`.
- Verificare che nessun **segreto** sia finito nella history dei commit
  (`.env` è in `.gitignore` e non risulta committato).

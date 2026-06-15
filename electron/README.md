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

## Creare gli pacchetti
```bash
cd electron
npm run dist     # genera in electron/dist/
```
Per ogni sistema vengono prodotti **sia l'installer sia una versione portatile**:

| OS | Installer | Portatile (senza installazione) |
|----|-----------|---------------------------------|
| Windows | `Ordeva Setup x.y.z.exe` (NSIS) | `Ordeva x.y.z.exe` (**portable**: un singolo .exe, doppio clic) |
| macOS | `Ordeva-x.y.z.dmg` | `Ordeva-x.y.z-mac.zip` (estrai e avvia il `.app`) |
| Linux | `ordeva_x.y.z_amd64.deb` | `Ordeva-x.y.z.AppImage` (rendi eseguibile e avvia) |

> La versione **portatile** non installa nulla: si avvia direttamente. I dati restano
> comunque nella cartella utente del sistema (vedi sotto), quindi sono condivisi tra
> versione portatile e installata.

Nota firma: per **non** mostrare l'avviso "editore sconosciuto" serve firmare il codice
(certificato a pagamento). Senza firma l'app funziona ugualmente, con un avviso al
primo avvio.

#### macOS — primo avvio
Il `.app` viene firmato **ad-hoc** (vedi `afterPack.cjs`): è una firma valida ma
**non notarizzata** (la notarizzazione richiede un account Apple Developer). Per
questo macOS, su un'app **scaricata**, mostra al primo avvio l'avviso
"sviluppatore non identificato". Per aprirla:

- **tasto destro sull'app → Apri** (poi conferma), oppure
- da terminale rimuovi la quarantena una volta sola:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Ordeva.app
  ```

> Se compare invece *«"Ordeva" è danneggiato e dovresti spostarlo nel Cestino»*
> significa che il bundle è stato impacchettato **senza** la ri-firma ad-hoc
> (firma invalida). Il comando `xattr` qui sopra risolve comunque; le build
> prodotte dal workflow corrente sono già ri-firmate.

### Build multi-OS automatica (GitHub Actions)
macOS e Linux non si possono compilare da Windows. Il workflow
`.github/workflows/desktop-release.yml` builda tutti i formati (installer +
portatili) su Windows/macOS/Linux a ogni tag `v*`:
```bash
git tag v1.0.0 && git push origin v1.0.0
```

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

## Licenza
**AGPL-3.0-or-later** — © Paolo De Luca. Vedi il file [`LICENSE`](../LICENSE).
Chi distribuisce il software o lo offre come servizio in rete deve rendere
disponibile il codice sorgente (incluse le modifiche). Per usi commerciali senza
gli obblighi AGPL è possibile una **licenza commerciale separata** (dual-licensing):
contatta l'autore.

> Prima di rendere pubblico il repo, verifica che nessun **segreto** sia finito nella
> history dei commit (`.env` è in `.gitignore` e non risulta committato).

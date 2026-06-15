// Bridge sicuro renderer ↔ main: espone solo le poche funzioni desktop che
// servono al frontend (scelta/apertura cartella di backup). contextIsolation
// resta attivo: niente accesso a Node dal renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ordevaDesktop', {
  isDesktop: true,
  /** Apre il selettore di cartelle del sistema. Ritorna il percorso scelto o null. */
  pickFolder: () => ipcRenderer.invoke('ordeva:pick-folder'),
  /** Apre una cartella nel file manager del sistema. */
  openPath: (p) => ipcRenderer.invoke('ordeva:open-path', p),
});

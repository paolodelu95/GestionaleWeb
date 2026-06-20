import { Injectable } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { open as openShell } from '@tauri-apps/plugin-shell';

/**
 * Ponte verso le funzionalità desktop. Nell'edizione offline gira su Tauri e usa
 * i dialoghi/sistema nativi (plugin-dialog / plugin-shell). Su web `isDesktop` è
 * false e i metodi degradano a no-op, così l'UI nasconde i pulsanti che servono
 * solo nell'app desktop (es. "Sfoglia" cartella di backup).
 *
 * NB: storicamente questo ponte usava `window.ordevaDesktop` (preload Electron).
 * Con la migrazione a Tauri quel bridge non esiste più: i percorsi nativi qui
 * sotto lo sostituiscono; il vecchio ramo resta solo come fallback difensivo.
 */
@Injectable({ providedIn: 'root' })
export class DesktopService {
  private get legacy(): any {
    return (window as any).ordevaDesktop || null;
  }

  get isDesktop(): boolean {
    return isTauri() || !!this.legacy?.isDesktop;
  }

  /** Apre il selettore cartelle del sistema; ritorna il percorso scelto o null. */
  async pickFolder(): Promise<string | null> {
    if (isTauri()) {
      try {
        const sel = await openDialog({ directory: true, multiple: false });
        return typeof sel === 'string' ? sel : null;
      } catch { return null; }
    }
    if (!this.legacy?.pickFolder) return null;
    try { return await this.legacy.pickFolder(); } catch { return null; }
  }

  /** Apre il selettore di un file di backup (.db / .db.enc); ritorna il percorso o null. */
  async pickBackupFile(): Promise<string | null> {
    if (isTauri()) {
      try {
        const sel = await openDialog({
          multiple: false,
          filters: [{ name: 'Backup Ordeva', extensions: ['db', 'enc'] }],
        });
        return typeof sel === 'string' ? sel : null;
      } catch { return null; }
    }
    if (!this.legacy?.pickBackupFile) return null;
    try { return await this.legacy.pickBackupFile(); } catch { return null; }
  }

  /** Apre una cartella nel file manager del sistema. */
  async openPath(path: string): Promise<void> {
    if (!path) return;
    if (isTauri()) {
      try { await openShell(path); } catch { /* no-op */ }
      return;
    }
    if (!this.legacy?.openPath) return;
    try { await this.legacy.openPath(path); } catch { /* no-op */ }
  }
}

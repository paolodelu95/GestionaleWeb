import { Injectable } from '@angular/core';

/**
 * Ponte verso le funzionalità desktop esposte da Electron (preload.js).
 * In ambiente web `window.ordevaDesktop` è assente: i metodi degradano a no-op
 * e `isDesktop` è false, così l'UI può nascondere i pulsanti che servono solo
 * nell'app desktop (es. "Sfoglia" cartella).
 */
@Injectable({ providedIn: 'root' })
export class DesktopService {
  private get api(): any {
    return (window as any).ordevaDesktop || null;
  }

  get isDesktop(): boolean {
    return !!this.api?.isDesktop;
  }

  /** Apre il selettore cartelle del sistema; ritorna il percorso scelto o null. */
  async pickFolder(): Promise<string | null> {
    if (!this.api?.pickFolder) return null;
    try { return await this.api.pickFolder(); } catch { return null; }
  }

  /** Apre il selettore di un file di backup; ritorna il percorso scelto o null. */
  async pickBackupFile(): Promise<string | null> {
    if (!this.api?.pickBackupFile) return null;
    try { return await this.api.pickBackupFile(); } catch { return null; }
  }

  /** Apre una cartella nel file manager del sistema. */
  async openPath(path: string): Promise<void> {
    if (!this.api?.openPath || !path) return;
    try { await this.api.openPath(path); } catch { /* no-op */ }
  }
}

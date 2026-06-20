import { Injectable } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Titolo della finestra desktop (Tauri). Su web è un no-op.
 * Compone "Ordeva — <azienda>" così la barra del titolo / la taskbar di sistema
 * mostrano a colpo d'occhio di che azienda si tratta (utile con più finestre).
 */
@Injectable({ providedIn: 'root' })
export class WindowTitleService {
  private readonly base = 'Ordeva';
  private azienda = '';

  /** Imposta il nome azienda mostrato nel titolo della finestra. */
  setAzienda(nome: string | null | undefined): void {
    this.azienda = (nome ?? '').trim();
    this.apply();
  }

  private apply(): void {
    if (!isTauri()) return;
    const title = this.azienda ? `${this.base} — ${this.azienda}` : this.base;
    getCurrentWindow().setTitle(title).catch(() => { /* no-op */ });
  }
}

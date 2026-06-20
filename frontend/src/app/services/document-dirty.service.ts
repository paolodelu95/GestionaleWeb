import { Injectable, signal } from '@angular/core';

/**
 * Tiene traccia se un editor di documento attualmente aperto ha modifiche non
 * salvate. Gli editor (dialog) chiamano `setDirty(form.dirty)` ai cambi del form
 * e `setDirty(false)` alla chiusura. L'App lo consulta alla richiesta di chiusura
 * della finestra (Tauri) per avvisare prima di perdere i dati.
 *
 * Un singolo flag è sufficiente: di norma è aperto un solo editor alla volta.
 */
@Injectable({ providedIn: 'root' })
export class DocumentDirtyService {
  readonly dirty = signal(false);

  setDirty(v: boolean): void {
    this.dirty.set(v);
  }

  isDirty(): boolean {
    return this.dirty();
  }
}

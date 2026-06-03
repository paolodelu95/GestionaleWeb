import { Component, Inject, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

/**
 * Conferma coerente e a tema per tutta l'app.
 * Sostituisce le `window.confirm()` native (popup grigi, fuori tema, bottoni "OK/Annulla").
 *
 * Uso tipico (drop-in del vecchio `if (!confirm('...')) return;`):
 *
 *   async delete(x) {
 *     if (!await this.confirm.delete(`Eliminare ${x.nome}?`)) return;
 *     ...azione...
 *   }
 *
 * Oppure conferma generica:
 *   if (!await this.confirm.ask('Procedere con l\'invio?')) return;
 */
export interface ConfirmOptions {
  /** Testo principale. Supporta gli a-capo (\n). */
  message: string;
  /** Titolo del dialog. Default: "Conferma" (o "Confermi l'azione?" se danger). */
  title?: string;
  /** Etichetta del bottone d'azione. Default: "Conferma". */
  confirmText?: string;
  /** Etichetta del bottone di annullamento. Default: "Annulla". */
  cancelText?: string;
  /** Azione distruttiva: bottone rosso + icona di avviso. */
  danger?: boolean;
  /** Icona Material da mostrare. Default: "delete" se danger, altrimenti "help". */
  icon?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div mat-dialog-title class="cd-head">
      <span class="cd-icon" [class.danger]="data.danger"><mat-icon>{{ icon }}</mat-icon></span>
      <span class="cd-title">{{ title }}</span>
    </div>
    <mat-dialog-content>
      <p class="cd-message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="false">{{ cancelText }}</button>
      <button mat-flat-button [color]="data.danger ? 'warn' : 'primary'"
              [mat-dialog-close]="true" cdkFocusInitial>{{ confirmText }}</button>
    </mat-dialog-actions>`,
  styles: [`
    .cd-head { display: flex; align-items: center; gap: 12px; padding-bottom: 4px; }
    .cd-icon {
      width: 40px; height: 40px; border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      background: var(--primary-soft); color: var(--primary); flex-shrink: 0;
    }
    .cd-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .cd-icon.danger { background: var(--danger-soft); color: var(--danger-on); }
    .cd-title { font-size: 18px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
    .cd-message {
      font-size: 14px; line-height: 1.55; color: var(--text-secondary);
      margin: 4px 0 0; white-space: pre-line;
    }
  `],
})
export class ConfirmDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: ConfirmOptions) {}

  get title(): string { return this.data.title || (this.data.danger ? 'Confermi l\'azione?' : 'Conferma'); }
  get confirmText(): string { return this.data.confirmText || 'Conferma'; }
  get cancelText(): string { return this.data.cancelText || 'Annulla'; }
  get icon(): string { return this.data.icon || (this.data.danger ? 'delete' : 'help'); }
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  constructor(private dialog: MatDialog) {}

  /** Conferma generica. Restituisce true se l'utente conferma. */
  ask(opts: string | ConfirmOptions): Promise<boolean> {
    const data: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data,
      width: '440px',
      maxWidth: '92vw',
      restoreFocus: true,
      // Per le azioni distruttive il focus iniziale va su "Annulla" (più sicuro);
      // per le conferme normali sul bottone d'azione (Invio = conferma).
      autoFocus: data.danger ? 'first-tabbable' : '[cdkFocusInitial]',
    });
    return firstValueFrom(ref.afterClosed()).then(r => r === true);
  }

  /** Conferma di eliminazione (rossa, etichetta "Elimina"). */
  delete(message: string, opts: Partial<ConfirmOptions> = {}): Promise<boolean> {
    return this.ask({
      title: 'Eliminazione',
      confirmText: 'Elimina',
      danger: true,
      icon: 'delete',
      ...opts,
      message,
    });
  }
}

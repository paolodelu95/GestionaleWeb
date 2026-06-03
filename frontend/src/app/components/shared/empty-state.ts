import { Component, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * Stato vuoto coerente per liste e sezioni.
 * Sostituisce i `<p class="empty-msg">Nessun…</p>` testuali: invece di un vicolo
 * cieco, mostra icona + titolo + spiegazione + (opzionale) azione primaria.
 *
 * Uso:
 *   <app-empty-state icon="people" title="Ancora nessun cliente"
 *                    message="Crea il primo cliente per iniziare a fatturare.">
 *     <button mat-flat-button color="primary" (click)="nuovo()">
 *       <mat-icon>add</mat-icon> Nuovo cliente
 *     </button>
 *   </app-empty-state>
 *
 * Variante compatta (per sotto-liste dentro card/tab):
 *   <app-empty-state compact icon="receipt" title="Nessun pagamento" />
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="empty-state" [class.compact]="compact">
      <div class="es-icon"><mat-icon>{{ icon }}</mat-icon></div>
      <div class="es-title">{{ title }}</div>
      @if (message) { <div class="es-message">{{ message }}</div> }
      <div class="es-actions"><ng-content></ng-content></div>
    </div>`,
  styles: [`
    .empty-state {
      display: flex; flex-direction: column; align-items: center; text-align: center;
      padding: 48px 24px; gap: 6px;
    }
    .es-icon {
      width: 64px; height: 64px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--primary-soft); color: var(--primary);
      margin-bottom: 10px;
    }
    .es-icon mat-icon { font-size: 32px; width: 32px; height: 32px; }
    .es-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
    .es-message {
      font-size: 13.5px; color: var(--text-tertiary); max-width: 340px; line-height: 1.5;
    }
    .es-actions:empty { display: none; }
    .es-actions { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

    /* Variante compatta per sotto-liste */
    .empty-state.compact { padding: 28px 16px; }
    .empty-state.compact .es-icon { width: 44px; height: 44px; margin-bottom: 6px; }
    .empty-state.compact .es-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .empty-state.compact .es-title { font-size: 14px; }
    .empty-state.compact .es-message { font-size: 12.5px; }
  `],
})
export class EmptyStateComponent {
  @Input() icon = 'inbox';
  @Input() title = '';
  @Input() message = '';
  @Input({ transform: booleanAttribute }) compact = false;
}

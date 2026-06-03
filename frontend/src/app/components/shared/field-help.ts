import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GLOSSARIO } from './glossario';

/**
 * Piccola icona "?" di aiuto in-context da affiancare a un campo.
 * Mostra in tooltip la spiegazione presa dal glossario (per chiave `term`)
 * oppure un testo libero (`text`).
 *
 * Uso (come suffisso del campo):
 *   <mat-form-field>
 *     <mat-label>Codice SDI</mat-label>
 *     <input matInput formControlName="sdi">
 *     <app-field-help matSuffix term="sdi" />
 *   </mat-form-field>
 *
 * Oppure con testo libero:
 *   <app-field-help text="Lascia vuoto per numerazione automatica" />
 */
@Component({
  selector: 'app-field-help',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <mat-icon class="field-help" tabindex="0" role="img"
              [attr.aria-label]="aria"
              [matTooltip]="tip" matTooltipClass="field-help-tip"
              matTooltipPosition="above" [matTooltipShowDelay]="100">help_outline</mat-icon>`,
  styles: [`
    .field-help {
      font-size: 18px; width: 18px; height: 18px; line-height: 18px;
      color: var(--text-tertiary); cursor: help;
      transition: color var(--transition-fast, 120ms);
      outline: none;
    }
    .field-help:hover, .field-help:focus-visible { color: var(--primary); }
  `],
})
export class FieldHelpComponent {
  /** Chiave del glossario (vedi glossario.ts). */
  @Input() term?: string;
  /** Testo libero alternativo, se il termine non è nel glossario. */
  @Input() text?: string;

  get tip(): string {
    if (this.text) return this.text;
    const v = this.term ? GLOSSARIO[this.term] : undefined;
    if (!v) return '';
    return v.esempio ? `${v.descrizione}\n\nEsempio: ${v.esempio}` : v.descrizione;
  }

  get aria(): string {
    const v = this.term ? GLOSSARIO[this.term] : undefined;
    return v ? `Cosa significa: ${v.titolo}` : 'Aiuto';
  }
}

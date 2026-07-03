import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Cheat-sheet delle scorciatoie da tastiera. Si apre con "?". */
@Component({
  selector: 'app-shortcuts-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="sh-head">
      <h2 style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px">
        <mat-icon style="color:#11769b">keyboard</mat-icon> Scorciatoie da tastiera
      </h2>
      <button mat-icon-button (click)="dialogRef.close()"><mat-icon>close</mat-icon></button>
    </div>
    <div class="sh-body">
      @for (s of scorciatoie; track s.desc) {
        <div class="sh-row">
          <span class="sh-desc">{{ s.desc }}</span>
          <span class="sh-keys">
            @for (k of s.keys; track k) { <kbd>{{ k }}</kbd> }
          </span>
        </div>
      }
      <p class="sh-note">Premi <kbd>?</kbd> in qualsiasi momento per riaprire questo elenco.</p>
    </div>
  `,
  styles: [`
    :host { display:block; width:440px; max-width:100%; }
    .sh-head { display:flex; align-items:center; justify-content:space-between; padding:18px 22px 10px; border-bottom:1px solid #e2e8f0; }
    .sh-body { padding:12px 22px 20px; }
    .sh-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:9px 0; border-bottom:1px solid #f1f5f9; }
    .sh-desc { font-size:14px; color:#0f172a; }
    .sh-keys { display:flex; gap:5px; flex:none; }
    kbd { font-family:inherit; font-size:12px; font-weight:600; color:#334155; background:#f1f5f9;
      border:1px solid #cbd5e1; border-bottom-width:2px; border-radius:6px; padding:2px 8px; white-space:nowrap; }
    .sh-note { color:#94a3b8; font-size:12.5px; margin:14px 0 0; }
  `]
})
export class ShortcutsDialogComponent {
  readonly isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  private readonly mod = this.isMac ? '⌘' : 'Ctrl';
  readonly scorciatoie: { desc: string; keys: string[] }[] = [
    { desc: 'Ricerca rapida e comandi', keys: [this.mod, 'K'] },
    { desc: 'Nuovo elemento (dove disponibile)', keys: [this.mod, 'N'] },
    { desc: 'Apri/modifica una riga', keys: ['Doppio clic'] },
    { desc: 'Mostra queste scorciatoie', keys: ['?'] },
    { desc: 'Chiudi ricerca o finestra', keys: ['Esc'] },
  ];

  constructor(public dialogRef: MatDialogRef<ShortcutsDialogComponent>) {}
}

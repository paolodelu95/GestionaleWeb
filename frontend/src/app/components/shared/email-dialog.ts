import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../services/i18n.service';
import { TPipe } from '../../pipes/t.pipe';

export interface EmailDialogData {
  title?: string;
  subtitle?: string;
  destinatario: string;
  testo: string;
}

export interface EmailDialogResult {
  destinatario: string;
  testo: string;
}

@Component({
  selector: 'app-email-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, TPipe,
  ],
  template: `
    <div mat-dialog-title style="display:flex;align-items:center;gap:10px;padding-bottom:4px">
      <mat-icon style="color:#3b82f6;font-size:22px;width:22px;height:22px;flex-shrink:0">mail</mat-icon>
      <span style="font-size:17px;font-weight:700;color:#0f172a">{{ data.title || ('shared.email.titleDefault' | t) }}</span>
    </div>
    @if (data.subtitle) {
      <div style="padding:0 24px 8px;font-size:12px;color:#64748b;margin-top:-8px">{{ data.subtitle }}</div>
    }
    <mat-dialog-content style="min-width:380px;max-width:560px">
      <mat-form-field style="width:100%" appearance="outline">
        <mat-label>{{ 'shared.email.destinatario' | t }}</mat-label>
        <input matInput type="email" [(ngModel)]="destinatario" [placeholder]="'shared.email.destinatarioPh' | t" required>
      </mat-form-field>

      <mat-form-field style="width:100%" appearance="outline">
        <mat-label>{{ 'shared.email.testo' | t }}</mat-label>
        <textarea matInput [(ngModel)]="testo" rows="6"
          [placeholder]="'shared.email.testoPh' | t"></textarea>
        <mat-hint>{{ 'shared.email.hint' | t }}</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'shared.email.annulla' | t }}</button>
      <button mat-flat-button color="primary" (click)="send()" [disabled]="!isValid()">
        <mat-icon>send</mat-icon> {{ 'shared.email.invia' | t }}
      </button>
    </mat-dialog-actions>`,
})
export class EmailDialogComponent {
  i18n = inject(I18nService);
  destinatario = '';
  testo = '';

  constructor(
    public dialogRef: MatDialogRef<EmailDialogComponent, EmailDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: EmailDialogData,
  ) {
    this.destinatario = data.destinatario || '';
    this.testo = data.testo || '';
  }

  isValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.destinatario.trim());
  }

  send() {
    if (!this.isValid()) return;
    this.dialogRef.close({ destinatario: this.destinatario.trim(), testo: this.testo });
  }
}

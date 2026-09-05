import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../services/i18n.service';
import { TPipe } from '../../pipes/t.pipe';
import { TnPipe } from '../../pipes/tn.pipe';

export interface FattureInsoluteDialogData {
  clienteNome: string;
  fatture: { id: number; numero: string; dataEmissione: string; totale: number; stato: string }[];
}

@Component({
  selector: 'app-fatture-insolute-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, TPipe, TnPipe],
  template: `
    <div style="display:flex;align-items:center;gap:12px;padding:20px 24px 0">
      <div style="width:44px;height:44px;background:#fef3c7;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <mat-icon style="color:#d97706;font-size:24px;width:24px;height:24px">warning_amber</mat-icon>
      </div>
      <div>
        <h2 mat-dialog-title style="margin:0;padding:0;font-size:16px;font-weight:600">{{ 'shared.fattureInsolute.title' | t }}</h2>
        <p style="margin:2px 0 0;font-size:13px;color:#64748b">{{ data.clienteNome }}</p>
      </div>
    </div>

    <mat-dialog-content style="min-width:480px;max-width:620px;padding:16px 24px">
      <p style="margin:0 0 14px;font-size:13px;color:#374151">
        {{ 'shared.fattureInsolute.introPrefix' | t }}
        <strong>{{ data.fatture.length | tn:'shared.fattureInsolute.fatturaAperta' }}</strong>
        {{ data.fatture.length | tn:'shared.fattureInsolute.nonSaldata' }}
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;color:#64748b">{{ 'shared.fattureInsolute.colNumero' | t }}</th>
            <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;color:#64748b">{{ 'ddt.col.data' | t }}</th>
            <th style="text-align:right;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;color:#64748b">{{ 'ddt.col.importo' | t }}</th>
            <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;color:#64748b">{{ 'ddt.col.stato' | t }}</th>
          </tr>
        </thead>
        <tbody>
          @for (f of data.fatture; track f.id) {
            <tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:8px 10px;font-weight:600">{{ f.numero }}</td>
              <td style="padding:8px 10px;color:#64748b">{{ f.dataEmissione | date:'dd/MM/yyyy' }}</td>
              <td style="padding:8px 10px;text-align:right;font-weight:500">{{ f.totale | currency:'EUR':'symbol':'1.2-2':'it' }}</td>
              <td style="padding:8px 10px">
                <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">{{ f.stato }}</span>
              </td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:9px 10px;font-weight:600;background:#f8fafc;border-top:2px solid #e2e8f0">{{ 'shared.fattureInsolute.totaleAperto' | t }}</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;color:#dc2626;background:#f8fafc;border-top:2px solid #e2e8f0">{{ totale | currency:'EUR':'symbol':'1.2-2':'it' }}</td>
            <td style="background:#f8fafc;border-top:2px solid #e2e8f0"></td>
          </tr>
        </tfoot>
      </table>
    </mat-dialog-content>

    <mat-dialog-actions align="end" style="padding:12px 24px 16px;gap:8px">
      <button mat-button (click)="dialogRef.close(false)">{{ 'shared.fattureInsolute.nonSalvareOra' | t }}</button>
      <button mat-flat-button (click)="dialogRef.close(true)" style="background:#d97706;color:#fff">
        <mat-icon>arrow_forward</mat-icon>
        {{ 'shared.fattureInsolute.procediComunque' | t }}
      </button>
    </mat-dialog-actions>
  `,
})
export class FattureInsoluteDialogComponent {
  i18n = inject(I18nService);
  totale: number;

  constructor(
    public dialogRef: MatDialogRef<FattureInsoluteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FattureInsoluteDialogData
  ) {
    this.totale = data.fatture.reduce((s, f) => s + (f.totale ?? 0), 0);
  }
}

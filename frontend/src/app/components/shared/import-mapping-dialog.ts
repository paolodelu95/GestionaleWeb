import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: 'string' | 'number' | 'integer';
  defaultValue?: any;
  aliases: string[];
}

export interface ImportMappingData {
  rows: Record<string, string>[];
  fields: FieldDef[];
  entityType: string;
  entityLabel: string;
}

export interface MappingResult {
  mapping: Record<string, string>;
}

const STORAGE_KEY = 'import_mapping_';

function autoMap(headers: string[], field: FieldDef): string {
  const lower = headers.map(h => ({ h, l: h.toLowerCase().trim().replace(/\s+/g, ' ') }));
  for (const alias of field.aliases) {
    const aliasLow = alias.toLowerCase().trim().replace(/\s+/g, ' ');
    const match = lower.find(x => x.l === aliasLow);
    if (match) return match.h;
  }
  return '';
}

@Component({
  selector: 'app-import-mapping-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatSelectModule, MatButtonModule, MatCheckboxModule, MatIconModule,
  ],
  styles: [`
    .grid-row {
      display: grid;
      grid-template-columns: 170px 1fr 130px;
      gap: 8px;
      align-items: center;
      padding: 2px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #eee);
    }
    .grid-header {
      display: grid;
      grid-template-columns: 170px 1fr 130px;
      gap: 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--mat-sys-on-surface-variant, #888);
      padding-bottom: 6px;
      border-bottom: 2px solid var(--mat-sys-outline, #ccc);
      margin-bottom: 2px;
    }
    .field-label { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 4px; }
    .req { color: var(--mat-sys-error, #f44336); font-size: 13px; }
    .preview-val {
      font-size: 12px; color: var(--mat-sys-on-surface-variant, #666);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 128px;
    }
    .warn { color: var(--mat-sys-error, #f44336); font-size: 12px; margin-top: 10px; display: flex; align-items: center; gap: 4px; }
  `],
  template: `
    <h2 mat-dialog-title>Mappa colonne — {{ data.entityLabel }}</h2>
    <mat-dialog-content style="width:660px;max-width:94vw;max-height:68vh;overflow-y:auto;padding-top:4px">
      <p style="font-size:13px;margin:0 0 14px;color:var(--mat-sys-on-surface-variant,#666)">
        Associa le colonne del tuo file ai campi del sistema.
        I campi con <span style="color:var(--mat-sys-error,#f44336);font-weight:600">*</span> sono obbligatori.
      </p>
      <div class="grid-header">
        <span>Campo</span>
        <span>Colonna nel file</span>
        <span>Anteprima</span>
      </div>
      @for (f of data.fields; track f.key) {
        <div class="grid-row">
          <span class="field-label">
            {{ f.label }}
            @if (f.required) { <span class="req">*</span> }
          </span>
          <mat-form-field style="width:100%" subscriptSizing="dynamic">
            <mat-select [(ngModel)]="mapping[f.key]">
              <mat-option value="">(Nessuna)</mat-option>
              @for (h of headers; track h) {
                <mat-option [value]="h">{{ h }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <span class="preview-val" [title]="getPreview(f.key)">{{ getPreview(f.key) }}</span>
        </div>
      }
      @if (missingRequired.length > 0) {
        <div class="warn">
          <mat-icon style="font-size:16px;width:16px;height:16px">warning</mat-icon>
          Campi obbligatori mancanti: {{ missingRequired.join(', ') }}
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end" style="gap:8px;padding:12px 24px">
      <mat-checkbox [(ngModel)]="saveMapping" style="font-size:13px;margin-right:auto">
        Ricorda mapping per il prossimo import
      </mat-checkbox>
      <button mat-button (click)="dialogRef.close(null)">Annulla</button>
      <button mat-flat-button color="primary" [disabled]="missingRequired.length > 0" (click)="confirm()">
        Importa
      </button>
    </mat-dialog-actions>
  `
})
export class ImportMappingDialogComponent {
  headers: string[] = [];
  mapping: Record<string, string> = {};
  saveMapping = false;
  private firstRow: Record<string, string> = {};

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ImportMappingData,
    public dialogRef: MatDialogRef<ImportMappingDialogComponent>
  ) {
    this.firstRow = data.rows[0] ?? {};
    this.headers = Object.keys(this.firstRow);

    const saved = this.loadSaved();
    for (const f of data.fields) {
      const savedCol = saved[f.key];
      if (savedCol && this.headers.includes(savedCol)) {
        this.mapping[f.key] = savedCol;
      } else {
        this.mapping[f.key] = autoMap(this.headers, f);
      }
    }
  }

  get missingRequired(): string[] {
    return this.data.fields
      .filter(f => f.required && !this.mapping[f.key])
      .map(f => f.label);
  }

  getPreview(key: string): string {
    const col = this.mapping[key];
    if (!col) return '—';
    const v = String(this.firstRow[col] ?? '');
    return v || '—';
  }

  confirm() {
    if (this.saveMapping) {
      localStorage.setItem(STORAGE_KEY + this.data.entityType, JSON.stringify(this.mapping));
    }
    this.dialogRef.close({ mapping: { ...this.mapping } } satisfies MappingResult);
  }

  private loadSaved(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY + this.data.entityType) ?? '{}');
    } catch { return {}; }
  }
}

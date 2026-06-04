import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';
import { ExcelService } from '../../services/excel.service';
import { Fornitore } from '../../models';

/**
 * Import listino fornitore (Excel/CSV): aggiorna i prezzi d'acquisto abbinando il
 * codice del file al codice fornitore salvato nei prodotti per quel fornitore.
 */
@Component({
  selector: 'app-import-listino-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
            MatFormFieldModule, MatInputModule, MatSelectModule, MatRadioModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Importa listino fornitore</h2>
    <mat-dialog-content style="min-width:460px;max-width:560px">
      @if (!risultato) {
        <p style="font-size:13px;color:var(--text-tertiary);margin:0 0 14px">
          Carica il listino (Excel o CSV). Abbino il <b>codice del file</b> al <b>codice fornitore</b>
          salvato nella scheda prodotto per il fornitore scelto, e aggiorno il prezzo d'acquisto.
        </p>

        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Fornitore *</mat-label>
          <mat-select [(ngModel)]="fornitoreId">
            @for (f of fornitori; track f.id) { <mat-option [value]="f.id">{{ f.ragioneSociale }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <div style="margin:4px 0 12px">
          <input #fileInput type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                 style="display:none" (change)="onFile($event)">
          <button mat-stroked-button type="button" (click)="fileInput.click()">
            <mat-icon>upload_file</mat-icon> {{ rows.length ? 'Cambia file' : 'Scegli file Excel/CSV' }}
          </button>
          @if (rows.length) { <span style="margin-left:10px;font-size:13px;color:var(--text-secondary)">{{ rows.length }} righe lette</span> }
        </div>

        @if (rows.length) {
          <div class="form-row" style="display:flex;gap:12px">
            <mat-form-field appearance="outline" style="flex:1">
              <mat-label>Colonna Codice</mat-label>
              <mat-select [(ngModel)]="colCodice">
                @for (c of colonne; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" style="flex:1">
              <mat-label>Colonna Prezzo</mat-label>
              <mat-select [(ngModel)]="colPrezzo">
                @for (c of colonne; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
              </mat-select>
            </mat-form-field>
          </div>

          <div style="margin:6px 0 4px;font-size:13px;font-weight:600;color:var(--text-secondary)">I prezzi del listino sono:</div>
          <mat-radio-group [(ngModel)]="ivato" style="display:flex;gap:20px">
            <mat-radio-button [value]="false">IVA esclusa (netto)</mat-radio-button>
            <mat-radio-button [value]="true">IVA inclusa</mat-radio-button>
          </mat-radio-group>
          <p style="font-size:12px;color:var(--text-tertiary);margin:8px 0 0">
            Salvo sempre il prezzo in netto: se è IVA inclusa lo converto con l'aliquota del prodotto.
          </p>
        }
      } @else {
        <div style="text-align:center;padding:8px 0">
          <mat-icon style="font-size:42px;width:42px;height:42px;color:var(--success-on)">task_alt</mat-icon>
          <div style="font-size:16px;font-weight:700;margin-top:6px">{{ risultato.aggiornati }} prezz{{ risultato.aggiornati === 1 ? 'o' : 'i' }} aggiornat{{ risultato.aggiornati === 1 ? 'o' : 'i' }}</div>
          @if (risultato.nonTrovati.length) {
            <div style="margin-top:12px;text-align:left">
              <div style="font-size:13px;font-weight:600;color:var(--warning-on)">{{ risultato.nonTrovati.length }} codici non abbinati:</div>
              <div style="font-size:12px;color:var(--text-tertiary);max-height:140px;overflow:auto;margin-top:4px">
                {{ risultato.nonTrovati.join(', ') }}
              </div>
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">
                Questi codici non corrispondono a nessun codice fornitore salvato per {{ fornitoreNome }}. Controlla i codici nelle schede prodotto.
              </div>
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ risultato ? 'Chiudi' : 'Annulla' }}</button>
      @if (!risultato) {
        <button mat-flat-button color="primary" [disabled]="!canImport || importing" (click)="importa()">
          @if (importing) { <mat-spinner diameter="18" style="display:inline-block;vertical-align:middle;margin-right:6px"></mat-spinner> }
          Importa prezzi
        </button>
      }
    </mat-dialog-actions>`,
})
export class ImportListinoDialogComponent {
  fornitori: Fornitore[] = [];
  fornitoreId: number | null = null;
  ivato = false;
  rows: Record<string, string>[] = [];
  colonne: string[] = [];
  colCodice = '';
  colPrezzo = '';
  importing = false;
  risultato: { aggiornati: number; nonTrovati: string[] } | null = null;

  constructor(
    public dialogRef: MatDialogRef<ImportListinoDialogComponent>,
    private ds: DataService,
    private excel: ExcelService,
    private snack: MatSnackBar,
  ) {
    this.ds.getFornitori().subscribe(f => this.fornitori = f);
  }

  get fornitoreNome(): string {
    return this.fornitori.find(f => f.id === this.fornitoreId)?.ragioneSociale || 'questo fornitore';
  }
  get canImport(): boolean {
    return !!this.fornitoreId && !!this.colCodice && !!this.colPrezzo && this.rows.length > 0;
  }

  async onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.rows = await this.excel.readFile(file);
      this.colonne = this.rows.length ? Object.keys(this.rows[0]) : [];
      this.colCodice = this.guess(['codice', 'code', 'cod', 'articolo', 'art', 'sku']);
      this.colPrezzo = this.guess(['prezzo', 'price', 'netto', 'costo', 'importo', 'listino']);
    } catch {
      this.snack.open('File non leggibile o formato non supportato', '', { duration: 3000 });
    }
  }
  private guess(keys: string[]): string {
    return this.colonne.find(c => keys.some(k => c.toLowerCase().includes(k))) || '';
  }

  importa() {
    if (!this.canImport) return;
    const righe = this.rows
      .map(r => ({ codice: r[this.colCodice], prezzo: r[this.colPrezzo] }))
      .filter(x => String(x.codice ?? '').trim());
    this.importing = true;
    this.ds.importListino(this.fornitoreId!, this.ivato, righe).subscribe({
      next: res => { this.importing = false; this.risultato = res; },
      error: e => { this.importing = false; this.snack.open(e.error?.error || 'Errore durante l\'import', '', { duration: 3500 }); },
    });
  }
}

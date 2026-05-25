import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface OcrRiga {
  descrizione: string;
  quantita: number;
  prezzo: number;
  iva: number;
}

type Step = 'idle' | 'loading' | 'preview' | 'success' | 'error';

@Component({
  selector: 'app-ocr-fatture',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSnackBarModule,
    MatTooltipModule, RouterLink,
  ],
  styles: [`
    :host { display: block; padding: 24px; max-width: 900px; margin: 0 auto; }

    .page-header {
      display: flex; align-items: center; gap: 16px; margin-bottom: 28px;
    }
    .page-header-icon {
      width: 48px; height: 48px; border-radius: var(--radius-lg);
      background: linear-gradient(135deg, var(--primary) 0%, var(--brand-mid) 100%);
      box-shadow: 0 4px 12px -2px rgba(17,118,155,0.35);
      display: flex; align-items: center; justify-content: center;
      color: #fff; flex-shrink: 0;
    }
    .page-header-icon mat-icon { font-size: 24px; width: 24px; height: 24px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
    .page-sub { font-size: 13px; color: var(--text-secondary); margin: 0; }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-sm);
      padding: 32px;
    }

    /* ── DROP ZONE ── */
    .drop-card {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; min-height: 280px; cursor: default;
      border: 2px dashed var(--border-strong);
      transition: border-color var(--transition-base), background var(--transition-base);
    }
    .drop-card.drag-over {
      border-color: var(--primary); background: var(--primary-soft);
    }
    .drop-icon {
      font-size: 56px; width: 56px; height: 56px;
      color: var(--primary); opacity: 0.7;
    }
    .drop-title { font-size: 17px; font-weight: 600; color: var(--text-primary); margin: 0; }
    .drop-sub { font-size: 13px; color: var(--text-tertiary); margin: 0; }
    .drop-hint { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; }

    /* ── LOADING / CENTER CARD ── */
    .center-card {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 16px; min-height: 280px; text-align: center;
    }
    .loading-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
    .loading-sub { font-size: 13px; color: var(--text-secondary); margin: 0; }

    /* ── SUCCESS ── */
    .success-icon {
      font-size: 56px; width: 56px; height: 56px; color: var(--success);
    }
    .success-title { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0; }
    .success-sub { font-size: 14px; color: var(--text-secondary); margin: 0; }

    /* ── ERROR ── */
    .error-icon {
      font-size: 52px; width: 52px; height: 52px; color: var(--danger);
    }
    .error-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
    .error-msg {
      font-size: 13px; color: var(--danger-on);
      background: var(--danger-soft); border-radius: var(--radius-md);
      padding: 10px 16px; max-width: 480px; margin: 0;
    }

    /* ── PREVIEW ── */
    .preview-header {
      display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px;
    }
    .preview-title { font-size: 17px; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
    .preview-sub { font-size: 13px; color: var(--text-secondary); margin: 0; }

    .fields-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 28px;
    }
    @media (max-width: 600px) { .fields-grid { grid-template-columns: 1fr; } }

    .field-group { display: flex; flex-direction: column; gap: 4px; }
    .field-group label { font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
    .field-input {
      height: 38px; padding: 0 12px;
      border: 1px solid var(--border-strong); border-radius: var(--radius-md);
      background: var(--bg-surface-2); color: var(--text-primary);
      font-size: 14px; outline: none;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .field-input:focus { border-color: var(--primary); box-shadow: var(--shadow-focus); }

    /* ── RIGHE TABLE ── */
    .righe-section { margin-bottom: 24px; }
    .righe-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px;
    }
    .righe-header b { font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .righe-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .righe-table thead tr { border-bottom: 2px solid var(--border-strong); }
    .righe-table th {
      padding: 8px 6px; text-align: left; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);
      background: var(--bg-subtle);
    }
    .righe-table td { padding: 4px 2px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    .righe-table tfoot td { padding: 6px 6px; border-top: 1px solid var(--border-strong); }
    .righe-table tfoot tr:first-child td { border-top: 2px solid var(--border-strong); }

    .riga-input {
      width: 100%; height: 32px; padding: 0 8px;
      border: 1px solid transparent; border-radius: var(--radius-sm);
      background: transparent; color: var(--text-primary); font-size: 13px;
      outline: none; box-sizing: border-box;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }
    .riga-input:focus { border-color: var(--primary); background: var(--bg-surface); }
    .riga-input.num { width: 80px; text-align: right; }
    .num-col { width: 90px; text-align: right; }
    .del-col { width: 40px; }
    .total-cell { text-align: right; padding: 4px 8px; font-weight: 600; color: var(--text-primary); }
    .summary-label { text-align: right; color: var(--text-secondary); font-size: 12px; padding-right: 8px; }
    .summary-value { text-align: right; padding-right: 8px; font-weight: 600; }
    .total-row .summary-label,
    .total-row .summary-value { font-size: 15px; font-weight: 700; color: var(--text-primary); padding-top: 8px; }

    .preview-actions {
      display: flex; justify-content: flex-end; gap: 12px; padding-top: 20px;
      border-top: 1px solid var(--border-subtle);
    }
  `],
  template: `
    <div class="page-header">
      <div class="page-header-icon"><mat-icon>document_scanner</mat-icon></div>
      <div>
        <h1 class="page-title">OCR fatture passive</h1>
        <p class="page-sub">Carica il PDF · Mindee estrae i dati · Conferma per creare l'acquisto</p>
      </div>
    </div>

    @if (step === 'idle') {
      <div class="card drop-card" [class.drag-over]="dragOver"
           (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)">
        <mat-icon class="drop-icon">upload_file</mat-icon>
        <p class="drop-title">Trascina qui il PDF della fattura</p>
        <p class="drop-sub">oppure</p>
        <input #fileInput type="file" accept=".pdf" style="display:none" (change)="onFileSelected($event)">
        <button mat-flat-button color="primary" (click)="fileInput.click()">
          <mat-icon>attach_file</mat-icon>&nbsp;Sfoglia file
        </button>
        <p class="drop-hint">Solo PDF &middot; max 10 MB</p>
      </div>
    }

    @if (step === 'loading') {
      <div class="card center-card">
        <mat-spinner diameter="52"></mat-spinner>
        <p class="loading-title">Analisi in corso…</p>
        <p class="loading-sub">Mindee sta estraendo i dati dalla fattura</p>
      </div>
    }

    @if (step === 'preview') {
      <div class="card">
        <div class="preview-header">
          <div>
            <h2 class="preview-title">Dati estratti — verifica e correggi</h2>
            <p class="preview-sub">I campi sono editabili. Aggiungi o rimuovi righe prima di confermare.</p>
          </div>
          <button mat-icon-button matTooltip="Ricomincia" (click)="reset()">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="fields-grid">
          <div class="field-group">
            <label>Fornitore *</label>
            <input class="field-input" [(ngModel)]="fornitore" placeholder="Ragione sociale">
          </div>
          <div class="field-group">
            <label>P.IVA fornitore</label>
            <input class="field-input" [(ngModel)]="pIva" placeholder="IT12345678901">
          </div>
          <div class="field-group">
            <label>Numero fattura</label>
            <input class="field-input" [(ngModel)]="numero" placeholder="2024/001">
          </div>
          <div class="field-group">
            <label>Data documento *</label>
            <input class="field-input" type="date" [(ngModel)]="dataDoc">
          </div>
        </div>

        <div class="righe-section">
          <div class="righe-header">
            <b>Righe ({{ righe.length }})</b>
            <button mat-button (click)="addRiga()">
              <mat-icon>add</mat-icon> Aggiungi riga
            </button>
          </div>
          <table class="righe-table">
            <thead>
              <tr>
                <th>Descrizione</th>
                <th class="num-col">Qtà</th>
                <th class="num-col">Prezzo</th>
                <th class="num-col">IVA %</th>
                <th class="num-col">Totale</th>
                <th class="del-col"></th>
              </tr>
            </thead>
            <tbody>
              @for (r of righe; track $index) {
                <tr>
                  <td><input class="riga-input" [(ngModel)]="r.descrizione" placeholder="Descrizione"></td>
                  <td><input class="riga-input num" type="number" [(ngModel)]="r.quantita" min="0.001" step="0.001"></td>
                  <td><input class="riga-input num" type="number" [(ngModel)]="r.prezzo" min="0" step="0.01"></td>
                  <td><input class="riga-input num" type="number" [(ngModel)]="r.iva" min="0" max="100"></td>
                  <td class="total-cell">{{ formatCurrency(r.quantita * r.prezzo) }}</td>
                  <td>
                    <button mat-icon-button (click)="removeRiga($index)" [disabled]="righe.length <= 1"
                            matTooltip="Rimuovi riga">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" class="summary-label">Imponibile</td>
                <td colspan="2" class="summary-value">{{ formatCurrency(totaleNetto) }}</td>
              </tr>
              <tr>
                <td colspan="4" class="summary-label">IVA</td>
                <td colspan="2" class="summary-value">{{ formatCurrency(totaleIva) }}</td>
              </tr>
              <tr class="total-row">
                <td colspan="4" class="summary-label">Totale lordo</td>
                <td colspan="2" class="summary-value">{{ formatCurrency(totaleLordo) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="preview-actions">
          <button mat-button (click)="reset()">Ricomincia</button>
          <button mat-flat-button color="primary" (click)="conferma()">
            <mat-icon>check</mat-icon>&nbsp;Conferma e crea acquisto
          </button>
        </div>
      </div>
    }

    @if (step === 'success') {
      <div class="card center-card">
        <mat-icon class="success-icon">check_circle</mat-icon>
        <h2 class="success-title">Acquisto creato!</h2>
        <p class="success-sub">Acquisto <b>#{{ acquistoId }}</b> salvato in stato RICEVUTA.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
          <button mat-button (click)="reset()">Nuova fattura OCR</button>
          <button mat-flat-button color="primary" routerLink="/acquisti">Vai agli acquisti</button>
        </div>
      </div>
    }

    @if (step === 'error') {
      <div class="card center-card">
        <mat-icon class="error-icon">error_outline</mat-icon>
        <h2 class="error-title">Errore durante l'analisi</h2>
        <p class="error-msg">{{ errorMsg }}</p>
        <button mat-flat-button color="primary" (click)="reset()">Riprova</button>
      </div>
    }
  `,
})
export class OcrFattureComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  step: Step = 'idle';
  dragOver = false;

  fornitore = '';
  pIva = '';
  dataDoc = '';
  numero = '';
  righe: OcrRiga[] = [];

  acquistoId: number | null = null;
  errorMsg = '';

  constructor(private http: HttpClient, private snack: MatSnackBar) {}

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(e: DragEvent) {
    this.dragOver = false;
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) this.processFile(file);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.processFile(file);
  }

  processFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.snack.open('Seleziona un file PDF', '', { duration: 3000 });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.snack.open('File troppo grande (max 10 MB)', '', { duration: 3000 });
      return;
    }

    this.step = 'loading';
    const form = new FormData();
    form.append('file', file);

    this.http.post<any>(`${environment.apiUrl}/ocr/fattura`, form).subscribe({
      next: (res) => {
        const s = res.suggerito;
        this.fornitore = s.fornitore || '';
        this.pIva = s.pIvaFornitore || '';
        this.dataDoc = s.dataDoc || new Date().toISOString().substring(0, 10);
        this.numero = s.numero || '';
        this.righe = s.righe?.length
          ? s.righe
          : [{ descrizione: '', quantita: 1, prezzo: 0, iva: 22 }];
        this.step = 'preview';
      },
      error: (e) => {
        this.errorMsg = e.error?.error || 'Errore durante l\'analisi OCR';
        this.step = 'error';
      },
    });
  }

  addRiga() {
    this.righe.push({ descrizione: '', quantita: 1, prezzo: 0, iva: 22 });
  }

  removeRiga(i: number) {
    if (this.righe.length > 1) this.righe.splice(i, 1);
  }

  get totaleNetto(): number {
    return this.righe.reduce((s, r) => s + r.quantita * r.prezzo, 0);
  }

  get totaleIva(): number {
    return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * r.iva / 100, 0);
  }

  get totaleLordo(): number {
    return this.totaleNetto + this.totaleIva;
  }

  conferma() {
    if (!this.fornitore.trim()) {
      this.snack.open('Il fornitore è obbligatorio', '', { duration: 3000 });
      return;
    }
    if (!this.dataDoc) {
      this.snack.open('La data documento è obbligatoria', '', { duration: 3000 });
      return;
    }

    this.step = 'loading';
    this.http.post<any>(`${environment.apiUrl}/ocr/fattura/conferma`, {
      fornitore: this.fornitore,
      pIva: this.pIva,
      dataDoc: this.dataDoc,
      numero: this.numero,
      righe: this.righe,
    }).subscribe({
      next: (res) => {
        this.acquistoId = res.acquistoId;
        this.step = 'success';
      },
      error: (e) => {
        if (e.status === 409) {
          this.snack.open(
            `Acquisto già presente (ID #${e.error?.acquistoId})`,
            'Vai agli acquisti',
            { duration: 5000 }
          );
          this.step = 'preview';
        } else {
          this.errorMsg = e.error?.error || 'Errore durante la conferma';
          this.step = 'error';
        }
      },
    });
  }

  reset() {
    this.step = 'idle';
    this.fornitore = '';
    this.pIva = '';
    this.dataDoc = '';
    this.numero = '';
    this.righe = [];
    this.acquistoId = null;
    this.errorMsg = '';
    if (this.fileInput) this.fileInput.nativeElement.value = '';
  }

  formatCurrency(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n ?? 0);
  }
}

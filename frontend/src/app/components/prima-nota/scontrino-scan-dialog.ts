import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';
import { environment } from '../../../environments/environment';

// ── Scansiona scontrino → registrazione di Prima Nota ─────────────────────────
// Scatta/carica la foto di uno scontrino: l'OCR (Mindee) pre-compila data, importo
// e negozio, l'utente verifica e salva. La voce viene creata in Prima Nota come
// USCITA e la foto resta allegata alla registrazione.
@Component({
  selector: 'app-scontrino-scan-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <div class="sc-head">
      <div class="sc-hero-icon"><mat-icon>receipt_long</mat-icon></div>
      <div>
        <div class="sc-title">Scansiona scontrino</div>
        <div class="sc-sub">Foto → registrazione di cassa, con scontrino allegato</div>
      </div>
    </div>

    <mat-dialog-content class="sc-body">
      <!-- Acquisizione foto -->
      @if (!previewUrl) {
        <div class="sc-pick">
          <label class="sc-pick-btn">
            <input type="file" accept="image/*" capture="environment" hidden (change)="onFile($event)">
            <mat-icon>photo_camera</mat-icon><span>Scatta foto</span>
          </label>
          <label class="sc-pick-btn">
            <input type="file" accept="image/*,application/pdf" hidden (change)="onFile($event)">
            <mat-icon>upload_file</mat-icon><span>Carica file</span>
          </label>
        </div>
        <p class="sc-pick-hint">Immagine o PDF, max 5 MB.</p>
      } @else {
        <div class="sc-preview">
          @if (isImage) { <img [src]="previewUrl" alt="scontrino"> }
          @else { <div class="sc-pdf"><mat-icon>picture_as_pdf</mat-icon><span>{{ fileName }}</span></div> }
          <button mat-icon-button class="sc-preview-x" (click)="resetFile()" matTooltip="Cambia"><mat-icon>close</mat-icon></button>
        </div>

        @if (analyzing) {
          <div class="sc-loading">
            <mat-spinner diameter="22"></mat-spinner>
            <span>Lettura scontrino in corso…</span>
          </div>
        }
        @if (ocrNota) { <p class="sc-ocrnota"><mat-icon>info</mat-icon> {{ ocrNota }}</p> }

        <!-- Form (compilato dall'OCR, sempre modificabile) -->
        <div class="sc-form">
          <div class="sc-row">
            <mat-form-field appearance="outline">
              <mat-label>Data *</mat-label>
              <input matInput type="date" [(ngModel)]="data">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Importo (€) *</mat-label>
              <input matInput type="number" step="0.01" min="0.01" [(ngModel)]="importo">
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" class="sc-full">
            <mat-label>Causale *</mat-label>
            <input matInput [(ngModel)]="causale" placeholder="Es. Spesa, carburante, materiale…">
          </mat-form-field>
          <div class="sc-row">
            <mat-form-field appearance="outline">
              <mat-label>Tipo *</mat-label>
              <mat-select [(ngModel)]="tipo">
                <mat-option value="USCITA">Uscita</mat-option>
                <mat-option value="ENTRATA">Entrata</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Conto *</mat-label>
              <mat-select [(ngModel)]="conto">
                <mat-option value="CASSA">Cassa</mat-option>
                <mat-option value="BANCA">Banca</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" class="sc-full">
            <mat-label>Note</mat-label>
            <input matInput [(ngModel)]="note" placeholder="Annotazioni opzionali">
          </mat-form-field>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving">Annulla</button>
      <button mat-flat-button color="primary" (click)="salva()" [disabled]="!canSave || saving">
        <mat-icon>save</mat-icon> {{ saving ? 'Salvataggio…' : 'Registra' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .sc-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px 4px; }
    .sc-hero-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg,#0f766e 0%,#14b8a6 100%); }
    .sc-title { font-weight: 700; font-size: 16px; color: var(--text-primary); }
    .sc-sub { font-size: 12px; color: var(--text-tertiary); }
    .sc-body { min-width: 520px; max-width: 560px; }
    .sc-pick { display: flex; gap: 12px; padding: 16px 0 6px; }
    .sc-pick-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 12px; border: 2px dashed var(--border-strong); border-radius: 12px; cursor: pointer; color: var(--text-secondary); transition: border-color .15s, background .15s; }
    .sc-pick-btn:hover { border-color: #14b8a6; background: var(--bg-surface-2); }
    .sc-pick-btn mat-icon { font-size: 30px; width: 30px; height: 30px; color: #14b8a6; }
    .sc-pick-btn span { font-size: 13px; font-weight: 600; }
    .sc-pick-hint { text-align: center; font-size: 12px; color: var(--text-tertiary); margin: 4px 0 0; }
    .sc-preview { position: relative; border-radius: 12px; overflow: hidden; margin: 8px 0 12px; background: var(--bg-surface-2); }
    .sc-preview img { width: 100%; max-height: 30vh; object-fit: contain; display: block; }
    .sc-pdf { display: flex; align-items: center; gap: 10px; padding: 18px; color: var(--text-secondary); }
    .sc-pdf mat-icon { color: #dc2626; }
    .sc-preview-x { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,.5); color: #fff; }
    .sc-loading { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-secondary); padding: 4px 0 10px; }
    .sc-ocrnota { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-tertiary); margin: 0 0 8px; }
    .sc-ocrnota mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .sc-form { display: flex; flex-direction: column; }
    .sc-row { display: flex; gap: 12px; }
    .sc-row mat-form-field { flex: 1; }
    .sc-full { width: 100%; }
  `]
})
export class ScontrinoScanDialogComponent implements OnDestroy {
  file: File | null = null;
  fileName = '';
  previewUrl: string | null = null;
  isImage = false;
  analyzing = false;
  saving = false;
  ocrNota = '';

  data = new Date().toISOString().substring(0, 10);
  importo: number | null = null;
  causale = '';
  tipo: 'USCITA' | 'ENTRATA' = 'USCITA';
  conto: 'CASSA' | 'BANCA' = 'CASSA';
  note = '';

  constructor(
    private dialogRef: MatDialogRef<ScontrinoScanDialogComponent, boolean>,
    private ds: DataService,
    private http: HttpClient,
    private snack: MatSnackBar,
  ) {}

  get canSave(): boolean {
    return !!this.data && this.importo != null && +this.importo > 0 && !!this.causale.trim();
  }

  onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { this.snack.open('File troppo grande (max 5 MB)', '', { duration: 3000 }); return; }
    this.file = f;
    this.fileName = f.name;
    this.isImage = f.type.startsWith('image/');
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = this.isImage ? URL.createObjectURL(f) : 'pdf';
    this.analizza();
  }

  resetFile() {
    if (this.previewUrl && this.isImage) URL.revokeObjectURL(this.previewUrl);
    this.file = null; this.previewUrl = null; this.ocrNota = '';
  }

  private analizza() {
    if (!this.file) return;
    this.analyzing = true;
    this.ocrNota = '';
    const form = new FormData();
    form.append('file', this.file);
    this.http.post<any>(`${environment.apiUrl}/ocr/scontrino`, form).subscribe({
      next: res => {
        this.analyzing = false;
        const s = res?.suggerito || {};
        if (s.data) this.data = s.data;
        if (s.importo) this.importo = s.importo;
        if (s.causale) this.causale = s.causale;
        if (!s.importo && !s.data) this.ocrNota = 'Non sono riuscito a leggere i dati: inseriscili a mano.';
      },
      error: e => {
        this.analyzing = false;
        this.ocrNota = (e.status === 500 && /MINDEE/.test(e.error?.error || ''))
          ? 'OCR non configurato: inserisci i dati a mano (la foto verrà comunque allegata).'
          : 'Lettura automatica non riuscita: inserisci i dati a mano.';
      },
    });
  }

  salva() {
    if (!this.canSave) return;
    this.saving = true;
    const payload = {
      data: this.data, tipo: this.tipo, causale: this.causale.trim(),
      importo: Number(this.importo), conto: this.conto, note: this.note,
      riferimentoTipo: '', riferimentoId: null,
    };
    this.ds.createPrimaNotaEntry(payload).subscribe({
      next: (entry: any) => {
        if (this.file && entry?.id) {
          const fd = new FormData();
          fd.append('file', this.file);
          this.http.post(`${environment.apiUrl}/allegati?tipo=primaNota&id=${entry.id}`, fd).subscribe({
            next: () => this.done(),
            // La registrazione è salvata; fallisce solo l'allegato → avvisa ma chiudi ok.
            error: () => { this.snack.open('Registrazione salvata, ma la foto non è stata allegata', '', { duration: 3500 }); this.dialogRef.close(true); },
          });
        } else { this.done(); }
      },
      error: e => { this.saving = false; this.snack.open(e.error?.error || 'Errore salvataggio', '', { duration: 3500 }); },
    });
  }

  private done() {
    this.snack.open('Scontrino registrato', '', { duration: 2200, panelClass: 'snack-ok' });
    this.dialogRef.close(true);
  }

  ngOnDestroy() {
    if (this.previewUrl && this.isImage) URL.revokeObjectURL(this.previewUrl);
  }
}

import { inject, Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { ConfirmService } from '../shared/confirm-dialog';
import { EmptyStateComponent } from '../shared/empty-state';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { DataService } from '../../services/data.service';
import { AllegatiComponent } from '../shared/allegati/allegati';
import { ScontrinoScanDialogComponent } from './scontrino-scan-dialog';
import { environment } from '../../../environments/environment';

// ── Dialog ─────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-prima-nota-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule, MatIconModule,
            AllegatiComponent],
  template: `
    <mat-dialog-content style="min-width:560px">
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)">
          <mat-icon>edit_note</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data?.id ? 'Modifica registrazione' : 'Nuova registrazione' }}</span>
          <span class="dialog-hero-sub">{{ data?.id ? 'Aggiorna i dettagli della voce contabile' : 'Registra un movimento di cassa o banca' }}</span>
        </div>
      </div>
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field>
            <mat-label>Data *</mat-label>
            <input matInput type="date" formControlName="data">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo *</mat-label>
            <mat-select formControlName="tipo">
              <mat-option value="ENTRATA">Entrata</mat-option>
              <mat-option value="USCITA">Uscita</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%">
          <mat-label>Causale *</mat-label>
          <input matInput formControlName="causale" placeholder="Es. Incasso fattura, Pagamento fornitore...">
          @if (form.get('causale')?.invalid && form.get('causale')?.touched) {
            <mat-error>Causale obbligatoria</mat-error>
          }
        </mat-form-field>
        <div class="form-row">
          <mat-form-field>
            <mat-label>Importo (€) *</mat-label>
            <input matInput type="number" step="0.01" min="0.01" formControlName="importo">
            @if (form.get('importo')?.invalid && form.get('importo')?.touched) {
              <mat-error>Importo obbligatorio e maggiore di 0</mat-error>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Conto *</mat-label>
            <mat-select formControlName="conto">
              <mat-option value="CASSA">Cassa</mat-option>
              <mat-option value="BANCA">Banca</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="note" placeholder="Annotazioni opzionali"></textarea>
        </mat-form-field>
      </form>
      @if (data?.id) {
        <div style="margin-top:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px">Scontrino / allegati</div>
          <app-allegati documentoTipo="primaNota" [documentoId]="data.id"></app-allegati>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>
  `
})
export class PrimaNotaDialogComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<PrimaNotaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any | null
  ) {
    this.form = this.fb.group({
      data:    [data?.data    ?? new Date().toISOString().substring(0, 10), Validators.required],
      tipo:    [data?.tipo    ?? 'ENTRATA', Validators.required],
      causale: [data?.causale ?? '', Validators.required],
      importo: [data?.importo ?? '', [Validators.required, Validators.min(0.01)]],
      conto:   [data?.conto   ?? 'CASSA', Validators.required],
      note:    [data?.note    ?? ''],
    });
  }

  save() {
    if (this.form.valid) {
      this.dialogRef.close({ ...this.data, ...this.form.value });
    }
  }
}

// ── Componente principale ───────────────────────────────────────────────────────
@Component({
  selector: 'app-prima-nota',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatDialogModule, MatSnackBarModule,
    MatSelectModule, MatFormFieldModule, MatMenuModule,
    EmptyStateComponent,
  ],
  templateUrl: './prima-nota.html',
  styleUrl: './prima-nota.scss',
})
export class PrimaNotaComponent implements OnInit, AfterViewInit {
  private confirm = inject(ConfirmService);
  /** Edizione desktop offline: nasconde la scansione OCR scontrino (usa Mindee, online). */
  readonly offline = environment.offline;
  @ViewChild(MatSort)      sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  dataSource = new MatTableDataSource<any>([]);
  displayedColumns = ['data', 'tipo', 'causale', 'conto', 'importo', 'note', 'azioni'];

  totaleEntrate = 0;
  totaleUscite  = 0;
  saldo         = 0;

  filtroMese   = '';
  filtroConto  = '';
  filtroTipo   = '';

  readonly mesiOptions = [
    { v: '', l: 'Tutti i mesi' },
    ...Array.from({ length: 12 }, (_, i) => {
      const d = new Date(2000, i, 1);
      return { v: String(i + 1).padStart(2, '0'), l: d.toLocaleString('it-IT', { month: 'long' }) };
    }),
  ];

  annoCorrente = new Date().getFullYear();
  filtroAnnoMese = '';

  constructor(
    private ds: DataService,
    private dialog: MatDialog,
    private snack: MatSnackBar,
  ) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, col) => {
      if (col === 'data')    return item.data;
      if (col === 'importo') return item.importo;
      return (item[col] ?? '').toString().toLowerCase();
    };
  }

  buildMeseParam(): string | undefined {
    if (!this.filtroMese) return undefined;
    return `${this.annoCorrente}-${this.filtroMese}`;
  }

  load() {
    const mese = this.buildMeseParam();
    this.ds.getPrimaNota(mese).subscribe({
      next: (res: any) => {
        this.totaleEntrate = res.totaleEntrate;
        this.totaleUscite  = res.totaleUscite;
        this.saldo         = res.saldo;
        let entries: any[] = res.entries;
        if (this.filtroConto) entries = entries.filter(e => e.conto === this.filtroConto);
        if (this.filtroTipo)  entries = entries.filter(e => e.tipo  === this.filtroTipo);
        this.dataSource.data = entries;
      },
      error: err => this.snack.open(err.message || 'Errore caricamento', '', { duration: 3000 }),
    });
  }

  resetFiltri() {
    this.filtroMese  = '';
    this.filtroConto = '';
    this.filtroTipo  = '';
    this.load();
  }

  open(entry?: any) {
    const ref = this.dialog.open(PrimaNotaDialogComponent, {
      data: entry ?? null,
      width: '640px',
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id
        ? this.ds.updatePrimaNotaEntry(result)
        : this.ds.createPrimaNotaEntry(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: err => this.snack.open(err.error?.error || err.message, '', { duration: 3000 }),
      });
    });
  }

  openScontrino() {
    this.dialog.open(ScontrinoScanDialogComponent, { width: '600px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(ok => { if (ok) this.load(); });
  }

  async delete(entry: any) {
    if (!await this.confirm.delete(`Eliminare la registrazione "${entry.causale}" di €${entry.importo}?`)) return;
    this.ds.deletePrimaNotaEntry(entry.id).subscribe({
      next: () => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: err => this.snack.open(err.message, '', { duration: 3000 }),
    });
  }
}

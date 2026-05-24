import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../services/data.service';
import { Cliente, TipoPagamento, UnitaMisura } from '../../models';

// ── Styles shared by dialog rig table ──────────────────────────────────────
const RIGHE_STYLES = `
  .righe-section { margin-top: 16px; }
  .righe-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .righe-table { width: 100%; border-collapse: collapse; }
  .righe-table th { background: #f8fafc; padding: 8px; font-size: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .righe-table td { padding: 4px 2px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .riga-input { border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; font-size: 13px; width: 100%; box-sizing: border-box; }
  .riga-input.num { width: 72px; }
  .riga-input.sconto { width: 60px; }
  .righe-total { text-align: right; padding: 10px 16px; font-weight: 700; background: #f8fafc; border-top: 2px solid #e2e8f0; }
  .righe-error { display: flex; align-items: center; gap: 4px; color: #dc2626; font-size: 12px; font-weight: 500; }
  .righe-error mat-icon { font-size: 15px; width: 15px; height: 15px; }
`;

// ── Dialog ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-fattura-ricorrente-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule, MatSlideToggleModule,
    MatIconModule, MatSnackBarModule
  ],
  template: `
    <mat-dialog-content style="min-width:680px;max-width:900px">
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#0e7490 0%,#a78bfa 100%)">
          <mat-icon>repeat</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data?.id ? 'Modifica fattura ricorrente' : 'Nuova fattura ricorrente' }}</span>
          <span class="dialog-hero-sub">{{ data?.id ? 'Aggiorna le impostazioni di ricorrenza' : 'Configura la generazione automatica della fattura' }}</span>
        </div>
      </div>
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field style="flex:2">
            <mat-label>Cliente *</mat-label>
            <mat-select formControlName="clienteId">
              @for (c of clienti; track c.id) {
                <mat-option [value]="c.id">{{ c.ragioneSociale }}</mat-option>
              }
            </mat-select>
            @if (form.get('clienteId')?.invalid && submitted) {
              <mat-error>Seleziona un cliente</mat-error>
            }
          </mat-form-field>
          <mat-form-field style="flex:1">
            <mat-label>Frequenza *</mat-label>
            <mat-select formControlName="frequenza">
              <mat-option value="MENSILE">Mensile</mat-option>
              <mat-option value="BIMESTRALE">Bimestrale</mat-option>
              <mat-option value="TRIMESTRALE">Trimestrale</mat-option>
              <mat-option value="SEMESTRALE">Semestrale</mat-option>
              <mat-option value="ANNUALE">Annuale</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field style="flex:2">
            <mat-label>Descrizione *</mat-label>
            <input matInput formControlName="descrizione" placeholder="Es. Canone mensile assistenza">
            @if (form.get('descrizione')?.invalid && submitted) {
              <mat-error>Campo obbligatorio</mat-error>
            }
          </mat-form-field>
          <mat-form-field style="flex:1">
            <mat-label>Giorno emissione (1-28)</mat-label>
            <input matInput type="number" min="1" max="28" formControlName="giornoEmissione">
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field style="flex:1">
            <mat-label>Prima/prossima emissione *</mat-label>
            <input matInput type="date" formControlName="prossimaEmissione">
            @if (form.get('prossimaEmissione')?.invalid && submitted) {
              <mat-error>Data obbligatoria</mat-error>
            }
          </mat-form-field>
          <mat-form-field style="flex:1">
            <mat-label>Tipo di pagamento</mat-label>
            <mat-select formControlName="tipoPagamentoId">
              <mat-option [value]="null">— non specificato —</mat-option>
              @for (t of tipiPagamento; track t.id) {
                <mat-option [value]="t.id">{{ t.nome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div style="display:flex;align-items:center;gap:8px;padding:0 8px">
            <mat-slide-toggle formControlName="attiva">Attiva</mat-slide-toggle>
          </div>
        </div>
      </form>

      <!-- Righe -->
      <div class="righe-section">
        <div class="righe-header">
          <div style="display:flex;align-items:center;gap:12px">
            <b>Righe *</b>
            @if (submitted && !hasRighe) {
              <span class="righe-error"><mat-icon>error_outline</mat-icon> Aggiungi almeno una riga</span>
            }
          </div>
          <button mat-stroked-button type="button" (click)="addRiga()">
            <mat-icon>add</mat-icon> Aggiungi riga
          </button>
        </div>
        <table class="righe-table">
          <thead>
            <tr>
              <th>Descrizione</th>
              <th>Qtà</th>
              <th>UM</th>
              <th>Prezzo</th>
              <th>Sconto%</th>
              <th>IVA%</th>
              <th>Totale</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (riga of righe; track $index) {
              <tr>
                <td><input class="riga-input" [(ngModel)]="riga.descrizione" placeholder="Descrizione"></td>
                <td><input class="riga-input num" type="number" min="0" step="0.01" [(ngModel)]="riga.quantita"></td>
                <td>
                  <select class="riga-input num" [(ngModel)]="riga.unitaMisura">
                    <option value="">—</option>
                    @for (u of unitaMisura; track u.id) {
                      <option [value]="u.simbolo">{{ u.simbolo }}</option>
                    }
                  </select>
                </td>
                <td><input class="riga-input num" type="number" min="0" step="0.01" [(ngModel)]="riga.prezzo"></td>
                <td><input class="riga-input sconto" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.sconto" placeholder="0"></td>
                <td><input class="riga-input num" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.iva"></td>
                <td style="padding:4px 8px;white-space:nowrap">
                  {{ rigaTotale(riga) | currency:'EUR':'symbol':'1.2-2':'it' }}
                </td>
                <td>
                  <button mat-icon-button color="warn" type="button" (click)="removeRiga($index)">
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        <div class="righe-total">
          <span style="font-weight:400;color:#64748b;margin-right:16px">Imponibile: {{ imponibile | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
          <span style="font-weight:400;color:#64748b;margin-right:16px">IVA: {{ ivaTotal | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
          Totale: {{ totale | currency:'EUR':'symbol':'1.2-2':'it' }}
        </div>
      </div>

      <!-- Note -->
      <div [formGroup]="form" style="margin-top:16px">
        <mat-form-field style="width:100%">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()">Salva</button>
    </mat-dialog-actions>
  `,
  styles: [RIGHE_STYLES + `
    .dialog-form { display: flex; flex-direction: column; gap: 0; }
    .form-row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 4px; }
  `]
})
export class FatturaRicorrenteDialogComponent implements OnInit {
  form: FormGroup;
  clienti: Cliente[] = [];
  tipiPagamento: TipoPagamento[] = [];
  unitaMisura: UnitaMisura[] = [];
  righe: any[] = [];
  submitted = false;

  get hasRighe() { return this.righe.length > 0 && this.righe.some(r => r.descrizione?.trim()); }
  get imponibile() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0); }
  get ivaTotal() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0); }
  get totale() { return this.imponibile + this.ivaTotal; }
  rigaTotale(r: any) { return r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * (1 + r.iva / 100); }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    public dialogRef: MatDialogRef<FatturaRicorrenteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.form = this.fb.group({
      clienteId: [data?.clienteId ?? null, Validators.required],
      descrizione: [data?.descrizione ?? '', Validators.required],
      frequenza: [data?.frequenza ?? 'MENSILE', Validators.required],
      giornoEmissione: [data?.giornoEmissione ?? 1],
      prossimaEmissione: [data?.prossimaEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      tipoPagamentoId: [data?.tipoPagamentoId ?? null],
      attiva: [data?.attiva !== false],
      note: [data?.note ?? ''],
    });
    this.righe = data?.righe?.length
      ? data.righe.map((r: any) => ({ ...r }))
      : [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva: 22 }];
  }

  ngOnInit() {
    this.ds.getClienti().subscribe(c => this.clienti = c);
    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter((x: any) => x.attivo));
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
  }

  addRiga() { this.righe.push({ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva: 22 }); }
  removeRiga(i: number) { this.righe.splice(i, 1); }

  save() {
    this.submitted = true;
    if (this.form.invalid || !this.hasRighe) return;
    this.dialogRef.close({ ...this.data, ...this.form.value, righe: this.righe });
  }
}

// ── List component ─────────────────────────────────────────────────────────
@Component({
  selector: 'app-fatture-ricorrenti',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatButtonModule, MatIconModule,
    MatDialogModule, MatSnackBarModule, MatSelectModule,
    MatChipsModule, MatTooltipModule, MatSlideToggleModule, MatMenuModule
  ],
  templateUrl: './fatture-ricorrenti.html',
  styleUrl: './fatture-ricorrenti.scss'
})
export class FattureRicorrentiComponent implements OnInit {
  ricorrenti: any[] = [];
  filtroAttiva: 'all' | 'attiva' | 'non-attiva' = 'all';
  today = new Date().toISOString().substring(0, 10);

  get filtered() {
    if (this.filtroAttiva === 'attiva') return this.ricorrenti.filter(r => r.attiva);
    if (this.filtroAttiva === 'non-attiva') return this.ricorrenti.filter(r => !r.attiva);
    return this.ricorrenti;
  }

  displayedColumns = ['cliente', 'descrizione', 'frequenza', 'prossimaEmissione', 'attiva', 'azioni'];

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }

  load() {
    this.ds.getFattureRicorrenti().subscribe({ next: d => this.ricorrenti = d, error: () => {} });
  }

  isScaduta(r: any) { return r.prossimaEmissione && r.prossimaEmissione < this.today; }

  frequenzaLabel(f: string): string {
    const map: Record<string, string> = {
      MENSILE: 'Mensile', BIMESTRALE: 'Bimestrale', TRIMESTRALE: 'Trimestrale',
      SEMESTRALE: 'Semestrale', ANNUALE: 'Annuale'
    };
    return map[f] ?? f;
  }

  toggleAttiva(r: any) {
    this.ds.updateFatturaRicorrente({ ...r, attiva: !r.attiva }).subscribe({
      next: () => { r.attiva = !r.attiva; },
      error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), '', { duration: 3000 })
    });
  }

  open(r?: any) {
    const ref = this.dialog.open(FatturaRicorrenteDialogComponent, {
      data: r ?? null, width: '90vw', maxWidth: '960px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateFatturaRicorrente(result) : this.ds.createFatturaRicorrente(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 })
      });
    });
  }

  emetti(r: any) {
    this.ds.emettiFatturaRicorrente(r.id).subscribe({
      next: res => {
        this.load();
        this.snack.open(`Fattura emessa: n. ${res.numero}`, '', { duration: 3500 });
      },
      error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), '', { duration: 4000 })
    });
  }

  delete(r: any) {
    if (!confirm(`Eliminare la ricorrente "${r.descrizione}"?`)) return;
    this.ds.deleteFatturaRicorrente(r.id).subscribe({
      next: () => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 })
    });
  }
}

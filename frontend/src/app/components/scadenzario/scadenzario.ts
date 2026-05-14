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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';
import { ScadenzarioEntry, TipoPagamento } from '../../models';

interface SaldaDialogData { entry: ScadenzarioEntry; tipiPagamento: TipoPagamento[]; }

@Component({
  selector: 'app-salda-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Salda {{ data.entry.numero }}</h2>
    <mat-dialog-content style="min-width:400px">
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field style="width:100%">
          <mat-label>Importo *</mat-label>
          <input matInput type="number" step="0.01" formControlName="importo">
          <mat-hint>Rimane: {{ data.entry.rimanente | currency:'EUR':'symbol':'1.2-2':'it' }}</mat-hint>
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Data saldo *</mat-label>
          <input matInput type="date" formControlName="dataPagamento">
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Metodo di pagamento</mat-label>
          <mat-select formControlName="tipoPagamentoId">
            <mat-option [value]="null">— nessuno —</mat-option>
            @for (t of data.tipiPagamento; track t.id) {
              <mat-option [value]="t.id">{{ t.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Conferma saldo</button>
    </mat-dialog-actions>`
})
export class SaldaDialogComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<SaldaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SaldaDialogData
  ) {
    this.form = this.fb.group({
      importo:        [data.entry.rimanente, [Validators.required, Validators.min(0.01)]],
      dataPagamento:  [new Date().toISOString().substring(0, 10), Validators.required],
      tipoPagamentoId:[null],
    });
  }

  save() { if (this.form.valid) this.dialogRef.close(this.form.value); }
}

@Component({
  selector: 'app-scadenzario',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatSnackBarModule, MatDialogModule],
  templateUrl: './scadenzario.html',
  styleUrl: './scadenzario.scss'
})
export class ScadenzarioComponent implements OnInit {
  entries: ScadenzarioEntry[] = [];
  tipiPagamento: TipoPagamento[] = [];
  readonly oggi = new Date().toISOString().substring(0, 10);
  displayedColumns = ['tipo', 'numero', 'dataEmissione', 'dataScadenza', 'controparte', 'tipoPagamento', 'importoTotale', 'importoPagato', 'rimanente', 'azioni'];

  constructor(private ds: DataService, private snack: MatSnackBar, private dialog: MatDialog) {}

  ngOnInit() { this.load(); }

  load() {
    forkJoin({
      entries: this.ds.getScadenzario(),
      tipi: this.ds.getTipiPagamento(),
    }).subscribe(r => {
      this.entries = r.entries;
      this.tipiPagamento = r.tipi.filter(t => t.attivo);
    });
  }

  get totaleEntrate() { return this.entries.filter(e => e.tipoEntry === 'FATTURA').reduce((s, e) => s + (e.rimanente || 0), 0); }
  get totaleUscite()  { return this.entries.filter(e => e.tipoEntry === 'ACQUISTO').reduce((s, e) => s + (e.rimanente || 0), 0); }

  salda(entry: ScadenzarioEntry) {
    const ref = this.dialog.open(SaldaDialogComponent, {
      data: { entry, tipiPagamento: this.tipiPagamento },
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const tipoSel = this.tipiPagamento.find(t => t.id === result.tipoPagamentoId);
      const pagamento = {
        dataPagamento:   result.dataPagamento,
        importo:         result.importo,
        tipo:            entry.tipoEntry === 'FATTURA' ? 'ENTRATA' : 'USCITA',
        conto:           tipoSel?.conto ?? entry.conto ?? 'BANCA',
        fatturaId:       entry.tipoEntry === 'FATTURA'  ? entry.id : null,
        acquistoId:      entry.tipoEntry === 'ACQUISTO' ? entry.id : null,
        tipoPagamentoId: result.tipoPagamentoId ?? null,
        metodo:          tipoSel?.nome ?? entry.tipoPagamentoNome ?? 'Bonifico',
        note:            '',
      };
      this.ds.createPagamento(pagamento as any).subscribe({
        next: () => { this.load(); this.snack.open('Saldato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }
}

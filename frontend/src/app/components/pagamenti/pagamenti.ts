import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';
import { Pagamento, Fattura, TipoPagamento } from '../../models';

@Component({
  selector: 'app-pagamento-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica Pagamento' : 'Nuovo Pagamento' }}</h2>
    <mat-dialog-content style="min-width:640px">
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field>
            <mat-label>Data *</mat-label>
            <input matInput type="date" formControlName="dataPagamento">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Importo *</mat-label>
            <input matInput type="number" step="0.01" formControlName="importo">
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field>
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="tipo">
              <mat-option value="ENTRATA">Entrata</mat-option>
              <mat-option value="USCITA">Uscita</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Conto</mat-label>
            <mat-select formControlName="conto">
              <mat-option value="BANCA">Banca</mat-option>
              <mat-option value="CASSA">Cassa</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field>
            <mat-label>Fattura collegata</mat-label>
            <mat-select formControlName="fatturaId">
              <mat-option [value]="null">— nessuna —</mat-option>
              @for (f of fatture; track f.id) { <mat-option [value]="f.id">{{ f.numero }} — {{ f.clienteNome }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo Pagamento</mat-label>
            <mat-select formControlName="tipoPagamentoId">
              <mat-option [value]="null">— nessuno —</mat-option>
              @for (t of tipiPagamento; track t.id) { <mat-option [value]="t.id">{{ t.nome }}</mat-option> }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%"><mat-label>Note</mat-label><textarea matInput rows="2" formControlName="note"></textarea></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`,
})
export class PagamentoDialogComponent implements OnInit {
  form: FormGroup;
  fatture: Fattura[] = [];
  tipiPagamento: TipoPagamento[] = [];

  constructor(private fb: FormBuilder, private ds: DataService,
              public dialogRef: MatDialogRef<PagamentoDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: Pagamento | null) {
    this.form = this.fb.group({
      dataPagamento: [data?.dataPagamento ?? new Date().toISOString().substring(0, 10), Validators.required],
      importo: [data?.importo ?? '', [Validators.required, Validators.min(0.01)]],
      fatturaId: [data?.fatturaId ?? null],
      tipo: [data?.tipo ?? 'ENTRATA'],
      conto: [data?.conto ?? 'BANCA'],
      tipoPagamentoId: [data?.tipoPagamentoId ?? null],
      note: [data?.note ?? ''],
    });
  }

  ngOnInit() {
    this.ds.getFatture().subscribe(f => this.fatture = f.filter(x => x.stato !== 'ANNULLATA'));
    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter(x => x.attivo));
  }

  save() { if (this.form.valid) this.dialogRef.close({ ...this.data, ...this.form.value }); }
}

@Component({
  selector: 'app-pagamenti',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatButtonToggleModule, FormsModule],
  templateUrl: './pagamenti.html',
  styleUrl: './pagamenti.scss'
})
export class PagamentiComponent implements OnInit {
  pagamenti: Pagamento[] = [];
  filtro: string = 'TUTTI';
  displayedColumns = ['data', 'tipo', 'importo', 'documento', 'tipoPagamentoNome', 'conto', 'azioni'];

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }

  load() {
    const t = this.filtro === 'TUTTI' ? undefined : this.filtro;
    this.ds.getPagamenti(t).subscribe(p => { this.pagamenti = p; });
  }

  get totaleEntrate() { return this.pagamenti.filter(p => p.tipo === 'ENTRATA').reduce((s, p) => s + p.importo, 0); }
  get totaleUscite() { return this.pagamenti.filter(p => p.tipo === 'USCITA').reduce((s, p) => s + p.importo, 0); }

  open(p?: Pagamento) {
    const ref = this.dialog.open(PagamentoDialogComponent, { data: p ?? null, width: '720px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updatePagamento(result) : this.ds.createPagamento(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  delete(p: Pagamento) {
    if (!confirm(`Eliminare pagamento di €${p.importo}?`)) return;
    this.ds.deletePagamento(p.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

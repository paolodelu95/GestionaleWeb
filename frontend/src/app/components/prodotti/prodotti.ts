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
import { DataService } from '../../services/data.service';
import { Prodotto, CategoriaProdotto, UnitaMisura, AliquotaIva } from '../../models';

// ── Dialog ──────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-prodotto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifica prodotto' : 'Nuovo prodotto' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field><mat-label>Nome *</mat-label>
            <input matInput formControlName="nome"></mat-form-field>
          <mat-form-field>
            <mat-label>Categoria</mat-label>
            <mat-select formControlName="categoria">
              <mat-option value="">— nessuna —</mat-option>
              @for (c of categorie; track c.id) {
                <mat-option [value]="c.nome">{{ c.nome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field><mat-label>Codice</mat-label>
            <input matInput formControlName="codice"></mat-form-field>
          <mat-form-field>
            <mat-label>Unità misura</mat-label>
            <mat-select formControlName="unitaMisura">
              @for (u of unitaMisura; track u.id) {
                <mat-option [value]="u.simbolo">{{ u.nome }} ({{ u.simbolo }})</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field><mat-label>Prezzo (€)</mat-label>
            <input matInput type="number" step="0.01" formControlName="prezzo"></mat-form-field>
          <mat-form-field>
            <mat-label>IVA</mat-label>
            <mat-select formControlName="iva">
              @for (a of aliquoteIva; track a.id) {
                <mat-option [value]="a.valore">{{ a.nome }} – {{ a.valore }}%</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field><mat-label>Quantità</mat-label>
            <input matInput type="number" formControlName="quantita"></mat-form-field>
          <mat-form-field><mat-label>Soglia minima</mat-label>
            <input matInput type="number" formControlName="sogliaMinima"></mat-form-field>
        </div>
        <mat-form-field style="width:100%"><mat-label>Descrizione</mat-label>
          <textarea matInput rows="2" formControlName="descrizione"></textarea></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`
})
export class ProdottoDialogComponent implements OnInit {
  form: FormGroup;
  categorie: CategoriaProdotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  aliquoteIva: AliquotaIva[] = [];

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    public dialogRef: MatDialogRef<ProdottoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Prodotto | null
  ) {
    this.form = this.fb.group({
      nome:         [data?.nome ?? '', Validators.required],
      categoria:    [data?.categoria ?? ''],
      codice:       [data?.codice ?? ''],
      unitaMisura:  [data?.unitaMisura ?? 'pz'],
      prezzo:       [data?.prezzo ?? 0],
      iva:          [data?.iva ?? 22],
      quantita:     [data?.quantita ?? 0],
      sogliaMinima: [data?.sogliaMinima ?? 0],
      descrizione:  [data?.descrizione ?? ''],
    });
  }

  ngOnInit() {
    this.ds.getCategorieProdotto().subscribe(c => this.categorie = c);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
  }

  save() { if (this.form.valid) this.dialogRef.close({ ...this.data, ...this.form.value }); }
}

// ── Component ────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-prodotti',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule],
  templateUrl: './prodotti.html',
  styleUrl: './prodotti.scss'
})
export class ProdottiComponent implements OnInit {
  prodotti: Prodotto[] = [];
  displayedColumns = ['id','nome','categoria','codice','prezzo','quantita','sogliaMinima','iva','azioni'];

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }

  load() { this.ds.getProdotti().subscribe(p => { this.prodotti = p; }); }

  open(p?: Prodotto) {
    const ref = this.dialog.open(ProdottoDialogComponent, { data: p ?? null, width: '780px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateProdotto(result) : this.ds.createProdotto(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  delete(p: Prodotto) {
    if (!confirm(`Eliminare ${p.nome}?`)) return;
    this.ds.deleteProdotto(p.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

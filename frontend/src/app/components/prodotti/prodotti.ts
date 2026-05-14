import { Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
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
  imports: [CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatFormFieldModule, MatInputModule,
            MatSortModule, MatSelectModule],
  templateUrl: './prodotti.html',
  styleUrl: './prodotti.scss'
})
export class ProdottiComponent implements OnInit, AfterViewInit {
  private allProdotti: Prodotto[] = [];
  dataSource = new MatTableDataSource<Prodotto>([]);
  displayedColumns = ['id', 'nome', 'categoria', 'codice', 'prezzo', 'quantita', 'sogliaMinima', 'iva', 'azioni'];

  filtroCategoria: string | null = null;
  get categorieList() { return [...new Set(this.allProdotti.map(p => p.categoria).filter(Boolean))].sort() as string[]; }
  get prodotti() { return this.dataSource.data; }

  @ViewChild(MatSort) sort!: MatSort;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (item, col) => {
      switch (col) {
        case 'id': return item.id ?? 0;
        case 'prezzo': return item.prezzo ?? 0;
        case 'quantita': return item.quantita ?? 0;
        case 'sogliaMinima': return item.sogliaMinima ?? 0;
        case 'iva': return item.iva ?? 0;
        default: return (item as any)[col] ?? '';
      }
    };
    this.dataSource.filterPredicate = (item, filter) => {
      const s = filter.toLowerCase();
      return (item.nome ?? '').toLowerCase().includes(s)
          || (item.codice ?? '').toLowerCase().includes(s)
          || (item.categoria ?? '').toLowerCase().includes(s)
          || (item.descrizione ?? '').toLowerCase().includes(s);
    };
  }

  load() {
    this.ds.getProdotti().subscribe(p => { this.allProdotti = p; this.applyFilters(); });
  }

  applyFilters() {
    let data = this.allProdotti;
    if (this.filtroCategoria) data = data.filter(p => p.categoria === this.filtroCategoria);
    this.dataSource.data = data;
  }

  resetFiltri() { this.filtroCategoria = null; this.dataSource.filter = ''; this.applyFilters(); }
  print() { window.print(); }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

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

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
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DataService } from '../../services/data.service';
import { ExcelService } from '../../services/excel.service';
import { Prodotto, ProdottoVariante, CategoriaProdotto, UnitaMisura, AliquotaIva } from '../../models';
import { ImportMappingDialogComponent, FieldDef, MappingResult } from '../shared/import-mapping-dialog';

const PRODOTTI_FIELDS: FieldDef[] = [
  { key: 'nome', label: 'Nome', required: true, aliases: [
    'Nome', 'nome', 'Prodotto', 'Articolo', 'Descrizione Articolo', 'Product Name',
    'Item Name', 'Denominazione', 'Name', 'Desc.', 'Descrizione Breve',
  ]},
  { key: 'categoria', label: 'Categoria', aliases: [
    'Categoria', 'categoria', 'Categoria Merceologica', 'Category', 'Gruppo',
    'Tipo', 'Famiglia', 'Linea',
  ]},
  { key: 'descrizione', label: 'Descrizione', aliases: [
    'Descrizione', 'descrizione', 'Descrizione Estesa', 'Note', 'Description',
    'Note Prodotto', 'Annotazioni',
  ]},
  { key: 'codice', label: 'Codice', aliases: [
    'Codice', 'codice', 'Codice Articolo', 'Cod. Articolo', 'SKU', 'Cod.',
    'Item Code', 'Codice Prodotto', 'Art.', 'Articolo', 'Riferimento',
  ]},
  { key: 'codiceFornitore', label: 'Codice Fornitore', aliases: [
    'Codice Fornitore', 'codiceFornitore', 'Cod. Fornitore', 'Supplier Code',
    'Codice Interno Fornitore', 'Ref. Fornitore',
  ]},
  { key: 'barcode', label: 'Barcode', aliases: [
    'Barcode', 'barcode', 'EAN', 'EAN13', 'Codice a Barre', 'UPC', 'GTIN',
    'Cod. Barre', 'EAN-13',
  ]},
  { key: 'prezzo', label: 'Prezzo vendita', type: 'number', aliases: [
    'Prezzo vendita', 'Prezzo', 'prezzo', 'Prezzo di Vendita', 'Prezzo Vendita',
    'Selling Price', 'Price', 'Listino', 'Prezzo al pubblico', 'Prezzo Cliente',
  ]},
  { key: 'prezzoAcquisto', label: 'Prezzo acquisto', type: 'number', aliases: [
    'Prezzo acquisto', 'prezzoAcquisto', 'Prezzo di Acquisto', 'Costo',
    'Purchase Price', 'Cost', 'Costo Acquisto', 'Prezzo Fornitore',
  ]},
  { key: 'iva', label: 'IVA (%)', type: 'number', defaultValue: 22, aliases: [
    'IVA', 'iva', 'Aliquota IVA', 'VAT Rate', 'IVA %', 'IVA%', 'Aliquota',
  ]},
  { key: 'quantita', label: 'Quantità', type: 'integer', defaultValue: 0, aliases: [
    'Quantità', 'quantita', 'Qty', 'Quantity', 'Giacenza', 'Stock',
    'Disponibile', 'Qtà', 'Qta', 'Scorta',
  ]},
  { key: 'sogliaMinima', label: 'Soglia Minima', type: 'integer', defaultValue: 0, aliases: [
    'Soglia Minima', 'sogliaMinima', 'Riordino', 'Min Stock', 'Minimo',
    'Stock Minimo', 'Soglia di Riordino', 'Scorta Minima',
  ]},
  { key: 'unitaMisura', label: 'Unità Misura', defaultValue: 'pz', aliases: [
    'Unità Misura', 'unitaMisura', 'U.M.', 'UM', 'UdM', 'Unit',
    'Unit of Measure', 'Unita di Misura', 'Unità di misura',
  ]},
];

// ── Dialog ──────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-prodotto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
            MatIconModule, MatCheckboxModule],
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
            <mat-label>Barcode</mat-label>
            <input matInput formControlName="barcode" placeholder="Scansiona o digita...">
            <mat-icon matSuffix style="color:#94a3b8">qr_code_scanner</mat-icon>
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field style="flex:1">
            <mat-label>Codice fornitore</mat-label>
            <input matInput formControlName="codiceFornitore" placeholder="Codice usato dal fornitore">
            <mat-icon matSuffix style="color:#94a3b8">local_shipping</mat-icon>
          </mat-form-field>
          <div style="flex:1"></div>
        </div>
        <div class="form-row">
          <mat-form-field>
            <mat-label>Unità misura</mat-label>
            <mat-select formControlName="unitaMisura">
              @for (u of unitaMisura; track u.id) {
                <mat-option [value]="u.simbolo">{{ u.nome }} ({{ u.simbolo }})</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>IVA</mat-label>
            <mat-select formControlName="iva">
              @for (a of aliquoteIva; track a.id) {
                <mat-option [value]="a.valore">{{ a.nome }} – {{ a.valore }}%</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="form-row" style="align-items:flex-start">
          <mat-form-field><mat-label>Prezzo vendita (€)</mat-label>
            <input matInput type="number" step="0.01" formControlName="prezzo"></mat-form-field>
          <mat-form-field>
            <mat-label>Prezzo acquisto (€)</mat-label>
            <input matInput type="number" step="0.01" formControlName="prezzoAcquisto" placeholder="0.00">
            <mat-hint>Usato per calcolo margini</mat-hint>
          </mat-form-field>
        </div>
        <div class="form-row" style="align-items:center">
          <div style="padding-top:4px">
            <mat-checkbox formControlName="haVarianti">Gestisci taglie / colori</mat-checkbox>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">Se attivo, la quantità è gestita per variante</div>
          </div>
        </div>
        @if (!form.value.haVarianti) {
          <div class="form-row">
            <mat-form-field><mat-label>Quantità</mat-label>
              <input matInput type="number" formControlName="quantita"></mat-form-field>
            <mat-form-field><mat-label>Soglia minima</mat-label>
              <input matInput type="number" formControlName="sogliaMinima"></mat-form-field>
          </div>
        }
        <mat-form-field style="width:100%"><mat-label>Descrizione</mat-label>
          <textarea matInput rows="2" formControlName="descrizione"></textarea></mat-form-field>

        @if (form.value.haVarianti) {
          <div class="varianti-box">
            <div class="varianti-header">
              <span class="varianti-title">Varianti (Taglie / Colori)</span>
              <button mat-stroked-button type="button" (click)="addVariante()">
                <mat-icon>add</mat-icon> Aggiungi variante
              </button>
            </div>
            <div class="var-table-wrap">
            <table class="var-table">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Taglia</th>
                  <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Colore</th>
                  <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Qtà</th>
                  <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Barcode variante</th>
                  <th style="width:44px;border-bottom:2px solid #e2e8f0"></th>
                </tr>
              </thead>
              <tbody>
                @for (v of varianti; track $index; let i = $index) {
                  <tr>
                    <td style="padding:4px 4px">
                      <input class="var-input" [(ngModel)]="v.taglia" [ngModelOptions]="{standalone:true}" placeholder="es. M, L, 42…">
                    </td>
                    <td style="padding:4px 4px">
                      <input class="var-input" [(ngModel)]="v.colore" [ngModelOptions]="{standalone:true}" placeholder="es. Rosso…">
                    </td>
                    <td style="padding:4px 4px">
                      <input class="var-input num" type="number" min="0" step="1"
                             [(ngModel)]="v.quantita" [ngModelOptions]="{standalone:true}">
                    </td>
                    <td style="padding:4px 4px">
                      <input class="var-input" [(ngModel)]="v.barcode" [ngModelOptions]="{standalone:true}" placeholder="Barcode…">
                    </td>
                    <td style="padding:4px 4px">
                      <button mat-icon-button type="button" color="warn" (click)="removeVariante(i)">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
                @if (!varianti.length) {
                  <tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8;font-size:13px">
                    Nessuna variante — clicca "Aggiungi variante"
                  </td></tr>
                }
              </tbody>
            </table>
            </div>
            @if (varianti.length) {
              <div style="text-align:right;padding-top:8px;font-size:12px;color:#64748b">
                Totale quantità: <b style="color:#1e293b">{{ totaleVarianti }}</b>
              </div>
            }
          </div>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`,
  styles: [`
    .var-input { border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;font-size:13px;width:100%;box-sizing:border-box; }
    .var-input:focus { outline:none;border-color:#4f46e5; }
    .var-input.num { width:70px;text-align:right; }
    .varianti-box { margin-top:12px;border:1px solid #e2e8f0;border-radius:10px;padding:16px; }
    .varianti-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:10px; }
    .varianti-title { font-size:12px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.5px; }
    .var-table-wrap { overflow-x:auto; }
    .var-table { width:100%;border-collapse:collapse;min-width:420px; }
  `]
})
export class ProdottoDialogComponent implements OnInit {
  form: FormGroup;
  categorie: CategoriaProdotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  aliquoteIva: AliquotaIva[] = [];
  varianti: { id?: number; taglia: string; colore: string; quantita: number; barcode: string }[] = [];

  get totaleVarianti() { return this.varianti.reduce((s, v) => s + (v.quantita || 0), 0); }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    public dialogRef: MatDialogRef<ProdottoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Prodotto | null
  ) {
    this.form = this.fb.group({
      nome:         [data?.nome ?? '', Validators.required],
      categoria:    [data?.categoria ?? ''],
      codice:          [data?.codice ?? ''],
      codiceFornitore: [data?.codiceFornitore ?? ''],
      barcode:         [data?.barcode ?? ''],
      unitaMisura:  [data?.unitaMisura ?? 'pz'],
      prezzo:         [data?.prezzo ?? 0, [Validators.min(0)]],
      prezzoAcquisto: [data?.prezzoAcquisto ?? null, [Validators.min(0)]],
      iva:            [data?.iva ?? 22, [Validators.min(0), Validators.max(100)]],
      quantita:     [data?.quantita ?? 0, [Validators.min(0)]],
      sogliaMinima: [data?.sogliaMinima ?? 0, [Validators.min(0)]],
      descrizione:  [data?.descrizione ?? ''],
      haVarianti:   [data?.haVarianti ?? false],
    });
  }

  ngOnInit() {
    this.ds.getCategorieProdotto().subscribe(c => this.categorie = c);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
    if (this.data?.id && this.data.haVarianti) {
      this.ds.getProdottoVarianti(this.data.id).subscribe(v => this.varianti = v);
    }
  }

  addVariante() { this.varianti.push({ taglia: '', colore: '', quantita: 0, barcode: '' }); }
  removeVariante(i: number) { this.varianti.splice(i, 1); }

  save() {
    if (this.form.valid) {
      this.dialogRef.close({ ...this.data, ...this.form.value, varianti: this.varianti });
    }
  }
}

// ── Component ────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-prodotti',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatFormFieldModule, MatInputModule,
            MatSortModule, MatSelectModule, MatPaginatorModule],
  templateUrl: './prodotti.html',
  styleUrl: './prodotti.scss'
})
export class ProdottiComponent implements OnInit, AfterViewInit {
  private allProdotti: Prodotto[] = [];
  dataSource = new MatTableDataSource<Prodotto>([]);
  displayedColumns = ['id', 'nome', 'categoria', 'codice', 'barcode', 'prezzo', 'quantita', 'sogliaMinima', 'iva', 'azioni'];

  filtroCategoria: string | null = null;
  get categorieList() { return [...new Set(this.allProdotti.map(p => p.categoria).filter(Boolean))].sort() as string[]; }
  get prodotti() { return this.dataSource.data; }

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private excel: ExcelService) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
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
          || (item.barcode ?? '').toLowerCase().includes(s)
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
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  resetFiltri() { this.filtroCategoria = null; this.dataSource.filter = ''; this.applyFilters(); }

  print() {
    const rows = this.dataSource.data;
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    const body = rows.map(p=>`<tr><td>${p.nome}</td><td>${p.categoria||'—'}</td><td>${p.codice||'—'}</td><td>${p.barcode||'—'}</td><td class="r">${e(p.prezzo)}</td><td class="r">${p.quantita??0}</td><td class="r">${p.sogliaMinima??0}</td><td class="r">${p.iva??0}%</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Prodotti</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right}</style></head><body><h1>Prodotti</h1><table><thead><tr><th>Nome</th><th>Categoria</th><th>Codice</th><th>Barcode</th><th class="r">Prezzo</th><th class="r">Qtà</th><th class="r">Soglia min.</th><th class="r">IVA</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  open(p?: Prodotto) {
    const ref = this.dialog.open(ProdottoDialogComponent, { data: p ?? null, width: '95vw', maxWidth: '900px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateProdotto(result) : this.ds.createProdotto(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  exportExcel() {
    this.excel.export(this.dataSource.data, [
      { header: 'Nome',             field: 'nome',            width: 30 },
      { header: 'Categoria',        field: 'categoria',       width: 18 },
      { header: 'Descrizione',      field: 'descrizione',     width: 32 },
      { header: 'Codice',           field: 'codice',          width: 14 },
      { header: 'Codice Fornitore', field: 'codiceFornitore', width: 16 },
      { header: 'Barcode',          field: 'barcode',         width: 16 },
      { header: 'Prezzo vendita',   field: 'prezzo',          width: 12 },
      { header: 'Prezzo acquisto', field: 'prezzoAcquisto',  width: 14 },
      { header: 'IVA',              field: 'iva',             width: 8  },
      { header: 'Quantità',         field: 'quantita',        width: 10 },
      { header: 'Soglia Minima',    field: 'sogliaMinima',    width: 12 },
      { header: 'Unità Misura',     field: 'unitaMisura',     width: 12 },
    ], 'prodotti');
  }

  async importExcel(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    try {
      const rows = await this.excel.readFile(file);
      if (!rows.length) { this.snack.open('File vuoto o non leggibile', '', { duration: 3000 }); return; }

      const result: MappingResult | null = await this.dialog.open(ImportMappingDialogComponent, {
        data: { rows, fields: PRODOTTI_FIELDS, entityType: 'prodotti', entityLabel: 'Prodotti' },
        disableClose: true,
      }).afterClosed().toPromise();
      if (!result) return;

      const v = (key: string, row: Record<string, string>) => row[result.mapping[key]] ?? '';
      let ok = 0;
      for (const r of rows) {
        const p: Prodotto = {
          nome:            v('nome', r),
          categoria:       v('categoria', r),
          descrizione:     v('descrizione', r),
          codice:          v('codice', r),
          codiceFornitore: v('codiceFornitore', r),
          barcode:         v('barcode', r),
          prezzo:          parseFloat(v('prezzo', r) || '0') || 0,
          prezzoAcquisto:  parseFloat(v('prezzoAcquisto', r) || '0') || null!,
          iva:             parseFloat(v('iva', r) || '22') || 22,
          quantita:        parseInt(v('quantita', r) || '0', 10) || 0,
          sogliaMinima:    parseInt(v('sogliaMinima', r) || '0', 10) || 0,
          unitaMisura:     v('unitaMisura', r) || 'pz',
        };
        if (!p.nome) continue;
        await this.ds.createProdotto(p).toPromise();
        ok++;
      }
      this.load();
      this.snack.open(`Importati ${ok} prodotti`, '', { duration: 3000 });
    } catch {
      this.snack.open('Errore nella lettura del file', '', { duration: 3000 });
    }
  }

  delete(p: Prodotto) {
    if (!confirm(`Eliminare ${p.nome}?`)) return;
    this.ds.deleteProdotto(p.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

import { Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { SelectionModel } from '@angular/cdk/collections';
import { DataService } from '../../services/data.service';
import { Acquisto, Fornitore, Prodotto, RigaDocumento, TipoPagamento, UnitaMisura } from '../../models';
import { ProdottoPickerComponent } from '../shared/prodotto-picker';

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
  .td-search { width: 36px; padding: 0 !important; }
`;

@Component({
  selector: 'app-acquisto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica Acquisto' : 'Nuovo Acquisto' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field>
            <mat-label>Numero *</mat-label>
            <input matInput formControlName="numero">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Data ricezione *</mat-label>
            <input matInput type="date" formControlName="dataEmissione">
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field style="flex:1">
            <mat-label>Fornitore</mat-label>
            <input matInput [matAutocomplete]="autoFornitore" [formControl]="fornitoreCtrl"
                   (keyup.enter)="autoSelectFornitore()" placeholder="Cerca fornitore...">
            <mat-icon matSuffix>search</mat-icon>
            <mat-autocomplete #autoFornitore="matAutocomplete" [displayWith]="displayFornitore">
              @for (f of filteredFornitori; track f.id) {
                <mat-option [value]="f">{{ f.ragioneSociale }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo Pagamento</mat-label>
            <mat-select formControlName="tipoPagamentoId">
              <mat-option [value]="null">— nessuno —</mat-option>
              @for (t of tipiPagamento; track t.id) {
                <mat-option [value]="t.id">{{ t.nome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      </form>
      <div class="righe-section">
        <div class="righe-header">
          <b>Righe</b>
          <div style="display:flex;gap:8px;align-items:center">
            <mat-button-toggle-group [(ngModel)]="showNetto" [hideSingleSelectionIndicator]="true">
              <mat-button-toggle [value]="false">Ivato</mat-button-toggle>
              <mat-button-toggle [value]="true">Netto</mat-button-toggle>
            </mat-button-toggle-group>
            <button mat-stroked-button type="button" (click)="addRiga()">
              <mat-icon>add</mat-icon> Aggiungi riga
            </button>
          </div>
        </div>
        <table class="righe-table">
          <thead>
            <tr>
              <th>Codice / Descrizione</th>
              <th class="td-search"></th>
              <th>Qtà</th>
              <th>UM</th>
              <th>{{ showNetto ? 'Prezzo netto' : 'Prezzo ivato' }}</th>
              <th>IVA%</th>
              <th>Sconto%</th>
              <th>{{ showNetto ? 'Totale netto' : 'Totale ivato' }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (riga of righe; track $index) {
              <tr>
                <td><input class="riga-input" [(ngModel)]="riga.descrizione" placeholder="Codice o descrizione"></td>
                <td class="td-search">
                  <button mat-icon-button type="button" (click)="searchProdotto($index)" title="Cerca prodotto">
                    <mat-icon>search</mat-icon>
                  </button>
                </td>
                <td><input class="riga-input num" type="number" [(ngModel)]="riga.quantita"></td>
                <td>
                  <select class="riga-input num" [(ngModel)]="riga.unitaMisura">
                    <option value="">—</option>
                    @for (u of unitaMisura; track u.id) {
                      <option [value]="u.simbolo">{{ u.simbolo }}</option>
                    }
                  </select>
                </td>
                <td><input class="riga-input num" type="number" step="0.01"
                  [value]="showNetto ? riga.prezzo : +(riga.prezzo * (1 + riga.iva/100)).toFixed(2)"
                  (change)="setPrezzoFromInput(riga, $event)"></td>
                <td><input class="riga-input num" type="number" [(ngModel)]="riga.iva"></td>
                <td><input class="riga-input sconto" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.sconto"></td>
                <td style="padding:4px 8px; white-space:nowrap">
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
      <div [formGroup]="form" style="margin-top:16px">
        <mat-form-field style="width:100%">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`,
  styles: [RIGHE_STYLES]
})
export class AcquistoDialogComponent implements OnInit {
  form: FormGroup;
  fornitori: Fornitore[] = [];
  filteredFornitori: Fornitore[] = [];
  fornitoreCtrl = new FormControl<Fornitore | string | null>('');
  tipiPagamento: TipoPagamento[] = [];
  righe: RigaDocumento[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];

  showNetto = false;
  get imponibile() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0); }
  get ivaTotal() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0); }
  get totale() { return this.imponibile + this.ivaTotal; }
  rigaTotale(riga: RigaDocumento) {
    const net = riga.prezzo * (1 - (riga.sconto ?? 0) / 100);
    return this.showNetto ? riga.quantita * net : riga.quantita * net * (1 + riga.iva / 100);
  }
  setPrezzoFromInput(riga: RigaDocumento, event: Event) {
    const v = +(event.target as HTMLInputElement).value;
    riga.prezzo = this.showNetto ? v : +(v / (1 + riga.iva / 100)).toFixed(6);
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private matDialog: MatDialog,
    public dialogRef: MatDialogRef<AcquistoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Acquisto | null
  ) {
    this.form = this.fb.group({
      numero: [data?.numero ?? '', Validators.required],
      dataEmissione: [data?.dataEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      tipoPagamentoId: [data?.tipoPagamentoId ?? null],
      note: [data?.note ?? ''],
    });
    if (data?.id) {
      this.ds.getAcquistoById(data.id).subscribe(a => { this.righe = (a.righe ?? []).map((r: any) => ({ ...r, sconto: r.sconto ?? 0 })); });
    } else {
      this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }];
    }
  }

  ngOnInit() {
    this.fornitoreCtrl.valueChanges.subscribe(v => {
      const q = typeof v === 'string' ? v.toLowerCase() : '';
      this.filteredFornitori = this.fornitori.filter(f => f.ragioneSociale.toLowerCase().includes(q));
    });

    this.ds.getFornitori().subscribe(f => {
      this.fornitori = f;
      this.filteredFornitori = f;
      if (this.data?.fornitoreId) {
        const found = f.find(x => x.id === this.data!.fornitoreId);
        if (found) this.fornitoreCtrl.setValue(found, { emitEvent: false });
      }
    });

    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter(x => x.attivo));
    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);

    if (!this.data?.id) {
      this.ds.getNextNumero('acquisti').subscribe(n => this.form.patchValue({ numero: String(n.numero) }));
    }
  }

  displayFornitore(f: Fornitore | string | null): string {
    return f && typeof f !== 'string' ? (f as Fornitore).ragioneSociale : '';
  }

  autoSelectFornitore() {
    if (this.filteredFornitori.length > 0) this.fornitoreCtrl.setValue(this.filteredFornitori[0]);
  }

  searchProdotto(index: number) {
    this.matDialog.open(ProdottoPickerComponent, { width: '650px', data: this.prodotti })
      .afterClosed().subscribe((p: Prodotto) => {
        if (!p) return;
        this.righe[index].descrizione = p.codice ?? p.nome;
        this.righe[index].prezzo = p.prezzo ?? 0;
        this.righe[index].iva = p.iva ?? 22;
        this.righe[index].unitaMisura = p.unitaMisura ?? '';
        this.righe[index].prodottoId = p.id ?? null;
      });
  }

  addRiga() { this.righe.push({ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }); }
  removeRiga(i: number) { this.righe.splice(i, 1); }

  save() {
    if (!this.form.valid) return;
    const v = this.fornitoreCtrl.value;
    const fornitoreId = v && typeof v !== 'string' ? (v as Fornitore).id ?? null : null;
    this.dialogRef.close({ ...this.data, ...this.form.value, fornitoreId, righe: this.righe });
  }
}

@Component({
  selector: 'app-acquisti',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule,
            MatSortModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './acquisti.html',
  styleUrl: './acquisti.scss'
})
export class AcquistiComponent implements OnInit, AfterViewInit {
  private allAcquisti: Acquisto[] = [];
  dataSource = new MatTableDataSource<Acquisto>([]);
  displayedColumns = ['select', 'numero', 'dataEmissione', 'fornitoreNome', 'tipoPagamentoNome', 'totale', 'stato', 'azioni'];
  selection = new SelectionModel<Acquisto>(true, []);

  readonly mesi = [{v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},{v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}];
  filtroAnno: number | null = null;
  filtroMese: number | null = null;
  filtroFornitore: number | null = null;

  get anni() { return [...new Set(this.allAcquisti.map(a => +a.dataEmissione.substring(0, 4)))].sort().reverse(); }
  get fornitoriList() {
    const map = new Map<number, string>();
    this.allAcquisti.forEach(a => { if (a.fornitoreId) map.set(a.fornitoreId, a.fornitoreNome ?? ''); });
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }
  get acquisti() { return this.dataSource.data; }

  @ViewChild(MatSort) sort!: MatSort;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (item, col) => {
      switch (col) {
        case 'totale': return item.totale ?? 0;
        case 'dataEmissione': return item.dataEmissione ?? '';
        default: return (item as any)[col] ?? '';
      }
    };
    this.dataSource.filterPredicate = (item, filter) => {
      const s = filter.toLowerCase();
      return (item.numero ?? '').toLowerCase().includes(s)
          || (item.fornitoreNome ?? '').toLowerCase().includes(s)
          || (item.stato ?? '').toLowerCase().includes(s);
    };
  }

  load() {
    this.ds.getAcquisti().subscribe(a => {
      this.allAcquisti = a;
      this.applyFilters();
      this.selection.clear();
    });
  }

  applyFilters() {
    let data = this.allAcquisti;
    if (this.filtroAnno) data = data.filter(a => +a.dataEmissione.substring(0, 4) === this.filtroAnno);
    if (this.filtroMese) data = data.filter(a => +a.dataEmissione.substring(5, 7) === this.filtroMese);
    if (this.filtroFornitore) data = data.filter(a => a.fornitoreId === this.filtroFornitore);
    this.dataSource.data = data;
  }

  resetFiltri() {
    this.filtroAnno = null; this.filtroMese = null; this.filtroFornitore = null;
    this.dataSource.filter = ''; this.applyFilters();
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  print() { window.print(); }

  isAllSelected() { return this.dataSource.data.length > 0 && this.selection.selected.length === this.dataSource.data.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.dataSource.data.forEach(r => this.selection.select(r)); }

  setStato(a: Acquisto, stato: string) {
    this.ds.setAcquistoStato(a.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) { this.selection.selected.forEach(a => this.ds.setAcquistoStato(a.id!, stato).subscribe()); this.load(); }

  open(a?: Acquisto) {
    const ref = this.dialog.open(AcquistoDialogComponent, {
      data: a ?? null, width: '90vw', maxWidth: '1200px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateAcquisto(result) : this.ds.createAcquisto(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  delete(a: Acquisto) {
    if (!confirm(`Eliminare acquisto ${a.numero}?`)) return;
    this.ds.deleteAcquisto(a.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

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
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { SelectionModel } from '@angular/cdk/collections';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { Acquisto, Fornitore, Prodotto, RigaDocumento, TipoPagamento, UnitaMisura, NotaRapida } from '../../models';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';
import { DocInfoDialogComponent, DocInfoData } from '../shared/doc-info-dialog';

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
  .riga-nota td { background: #fefce8; }
  .riga-nota input { font-style: italic; color: #78716c; }
  .td-drag { width: 28px; padding: 0 !important; cursor: grab; color: #94a3b8; }
  .cdk-drag-placeholder { opacity: 0.4; }
  .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
`;

@Component({
  selector: 'app-acquisto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule, MatMenuModule, DragDropModule],
  template: `
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);box-shadow:0 4px 12px -2px rgba(14,165,233,0.35)">
          <mat-icon>shopping_bag</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data?.id ? ('Acquisto n. ' + (data?.numero || '')) : 'Nuovo acquisto' }}</span>
          <span class="dialog-hero-sub">{{ data?.id ? 'Modifica righe e dati fornitore' : 'Fattura passiva da fornitore' }}</span>
        </div>
      </div>

      <form [formGroup]="form" class="dialog-form">

        <div style="display:flex;gap:12px;align-items:flex-start;padding-top:8px">
          <mat-form-field style="flex:1">
            <mat-label>Fornitore</mat-label>
            <input matInput [matAutocomplete]="autoFornitore" [formControl]="fornitoreCtrl"
                   (keyup.enter)="autoSelectFornitore()" placeholder="Cerca fornitore per ragione sociale o P.IVA...">
            <mat-icon matSuffix>search</mat-icon>
            <mat-autocomplete #autoFornitore="matAutocomplete" [displayWith]="displayFornitore">
              @for (f of filteredFornitori; track f.id) {
                <mat-option [value]="f">{{ f.ragioneSociale }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field style="flex:1">
            <mat-label>Tipo Pagamento</mat-label>
            <mat-select formControlName="tipoPagamentoId">
              <mat-option [value]="null">— nessuno —</mat-option>
              @for (t of tipiPagamento; track t.id) {
                <mat-option [value]="t.id">{{ t.nome }}</mat-option>
              }
            </mat-select>
            <mat-icon matSuffix>payments</mat-icon>
          </mat-form-field>
          <mat-form-field style="flex:0 0 175px">
            <mat-label>Numero *</mat-label>
            <input matInput formControlName="numero">
          </mat-form-field>
          <mat-form-field style="flex:0 0 160px">
            <mat-label>Data ricezione *</mat-label>
            <input matInput type="date" formControlName="dataEmissione">
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
            <button mat-stroked-button type="button" [matMenuTriggerFor]="menuNota">
              <mat-icon>note_add</mat-icon> Aggiungi nota
            </button>
            <mat-menu #menuNota="matMenu">
              <button mat-menu-item type="button" (click)="addNota('')">
                <mat-icon>edit_note</mat-icon> Nota libera
              </button>
              @if (noteRapideList.length) {
                <div style="padding:4px 16px;font-size:11px;font-weight:600;color:#94a3b8;pointer-events:none;text-transform:uppercase">Note rapide</div>
                @for (nr of noteRapideList; track nr.id) {
                  <button mat-menu-item type="button" (click)="addNota(nr.testo)">{{ nr.testo }}</button>
                }
              }
            </mat-menu>
          </div>
        </div>
        <table class="righe-table">
          <thead>
            <tr>
              <th class="td-drag"></th>
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
          <tbody cdkDropList (cdkDropListDropped)="dropRiga($event)">
            @for (riga of righe; track $index) {
              @if (riga.tipo === 'NOTA') {
                <tr class="riga-nota" cdkDrag cdkDragPreviewContainer="parent">
                  <td class="td-drag" cdkDragHandle><mat-icon>drag_indicator</mat-icon></td>
                  <td colspan="8">
                    <input class="riga-input" [(ngModel)]="riga.descrizione" placeholder="Testo nota...">
                  </td>
                  <td>
                    <button mat-icon-button color="warn" type="button" (click)="removeRiga($index)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </tr>
              } @else {
              <tr cdkDrag cdkDragPreviewContainer="parent">
                <td class="td-drag" cdkDragHandle><mat-icon>drag_indicator</mat-icon></td>
                <td><input class="riga-input" [(ngModel)]="riga.descrizione" placeholder="Codice o descrizione"></td>
                <td class="td-search">
                  <button mat-icon-button type="button" (click)="searchProdotto($index)" title="Cerca prodotto">
                    <mat-icon>search</mat-icon>
                  </button>
                </td>
                <td><input class="riga-input num" type="number" min="0"
                  [step]="riga.unitaMisura === 'pz' ? 1 : 0.01"
                  [(ngModel)]="riga.quantita" (change)="roundIfPz(riga)"></td>
                <td>
                  <select class="riga-input num" [(ngModel)]="riga.unitaMisura">
                    <option value="">—</option>
                    @for (u of unitaMisura; track u.id) {
                      <option [value]="u.simbolo">{{ u.simbolo }}</option>
                    }
                  </select>
                </td>
                <td><input class="riga-input num" type="number" min="0" step="0.01"
                  [value]="showNetto ? riga.prezzo : +(riga.prezzo * (1 + riga.iva/100)).toFixed(2)"
                  (change)="setPrezzoFromInput(riga, $event)"></td>
                <td><input class="riga-input num" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.iva"></td>
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
          <mat-label>Note ad uso interno</mat-label>
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
  noteRapideList: NotaRapida[] = [];
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
    riga.prezzo = Math.max(0, this.showNetto ? v : +(v / (1 + riga.iva / 100)).toFixed(6));
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
    } else if (data?.righe?.length) {
      this.righe = data.righe.map(r => ({ ...r, sconto: r.sconto ?? 0 }));
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
      } else if (this.data?.fornitoreNome && !this.data.fornitoreId) {
        this.fornitoreCtrl.setValue(this.data.fornitoreNome, { emitEvent: false });
      }
    });

    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter(x => x.attivo));
    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getNoteRapide().subscribe(n => this.noteRapideList = n);

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
      .afterClosed().subscribe((pick: ProdottoPick) => {
        if (!pick) return;
        const p = pick.prodotto; const v = pick.variante;
        const varSuffix = v ? ` (${[v.taglia, v.colore].filter(Boolean).join(' / ')})` : '';
        this.righe[index].descrizione = (p.codice ?? p.nome) + varSuffix;
        this.righe[index].prezzo = p.prezzo ?? 0;
        this.righe[index].iva = p.iva ?? 22;
        this.righe[index].unitaMisura = p.unitaMisura ?? '';
        this.righe[index].prodottoId = p.id ?? null;
        this.righe[index].varianteId = v?.id ?? null;
        this.righe[index].varianteTaglia = v?.taglia ?? '';
        this.righe[index].varianteColore = v?.colore ?? '';
      });
  }

  roundIfPz(riga: RigaDocumento) {
    if (riga.unitaMisura === 'pz') riga.quantita = Math.max(1, Math.round(riga.quantita || 1));
    else riga.quantita = Math.max(0.001, riga.quantita || 0.001);
  }
  clampSconto(riga: RigaDocumento) {
    riga.sconto = Math.min(100, Math.max(0, riga.sconto ?? 0));
  }

  addRiga() { this.righe.push({ tipo: 'PRODOTTO', descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }); }
  addNota(testo: string) { this.righe.push({ tipo: 'NOTA', descrizione: testo, quantita: 0, prezzo: 0, sconto: 0, iva: 0 }); }
  removeRiga(i: number) { this.righe.splice(i, 1); }
  dropRiga(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.righe, event.previousIndex, event.currentIndex);
  }

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
            MatDialogModule, MatSnackBarModule, MatCheckboxModule, MatMenuModule,
            MatSortModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule,
            DocInfoDialogComponent],
  templateUrl: './acquisti.html',
  styleUrl: './acquisti.scss'
})
export class AcquistiComponent implements OnInit, AfterViewInit {
  private allAcquisti: Acquisto[] = [];
  private fornitori: Fornitore[] = [];
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
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private printSvc: PrintService) {}

  ngOnInit() {
    this.load();
    this.ds.getFornitori().subscribe(f => this.fornitori = f);
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, col) => {
      switch (col) {
        case 'numero': {
          const n = item.numero || '';
          const slash = n.match(/^(\d+)\/(\d+)$/);
          if (slash) return parseInt(slash[1], 10) * 100000 + parseInt(slash[2], 10);
          const plain = n.match(/(\d+)/);
          return plain ? parseInt(plain[1], 10) : 0;
        }
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
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  resetFiltri() {
    this.filtroAnno = null; this.filtroMese = null; this.filtroFornitore = null;
    this.dataSource.filter = ''; this.applyFilters();
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  print() {
    const rows = this.selection.hasValue() ? this.selection.selected : this.dataSource.data;
    const d = (s: string) => { const p = (s||'').substring(0,10).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'; };
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    const body = rows.map(a=>`<tr><td>${a.numero}</td><td>${d(a.dataEmissione)}</td><td>${a.fornitoreNome||'—'}</td><td>${a.tipoPagamentoNome||'—'}</td><td class="r">${e(a.totale)}</td><td>${a.stato}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Acquisti</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right;font-weight:600}</style></head><body><h1>Acquisti</h1><table><thead><tr><th>Numero</th><th>Data</th><th>Fornitore</th><th>Pagamento</th><th class="r">Importo</th><th>Stato</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

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

  importaXml(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = this.parseXmlFatturaPA(reader.result as string);
        const forn = this.fornitori.find(f =>
          f.pIva && f.pIva.replace(/^IT/i, '') === (parsed.fornitorePIva ?? '').replace(/^IT/i, '')
        );
        this.open({
          numero: parsed.numero ?? '',
          dataEmissione: parsed.dataEmissione ?? new Date().toISOString().substring(0, 10),
          fornitoreId: forn?.id ?? null,
          fornitoreNome: forn ? undefined : parsed.fornitoreNome,
          note: parsed.note,
          stato: 'RICEVUTA',
          righe: parsed.righe,
        });
      } catch (_) {
        this.snack.open('File XML non valido o non riconosciuto', '', { duration: 3500 });
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  private parseXmlFatturaPA(xml: string) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML non valido');
    const txt = (sel: string, ctx: Element | Document = doc) =>
      ctx.querySelector(sel)?.textContent?.trim() ?? '';
    const num = (sel: string, ctx: Element | Document = doc) =>
      parseFloat(txt(sel, ctx)) || 0;

    const cedente = doc.querySelector('CedentePrestatore');
    const fornitorePIva  = txt('IdFiscaleIVA IdCodice', cedente ?? doc);
    const fornitoreNome  = txt('Anagrafica Denominazione', cedente ?? doc)
                        || txt('Anagrafica Nome', cedente ?? doc);

    const datiDoc = doc.querySelector('DatiGeneraliDocumento');
    const numero        = txt('Numero', datiDoc ?? doc);
    const dataEmissione = txt('Data', datiDoc ?? doc);
    const causali = Array.from(doc.querySelectorAll('DatiGeneraliDocumento Causale'))
      .map(el => el.textContent?.trim() ?? '').filter(Boolean);
    const note = causali.join(' ');

    const righe: RigaDocumento[] = Array.from(doc.querySelectorAll('DettaglioLinee')).map(linea => ({
      descrizione:  txt('Descrizione', linea),
      quantita:     num('Quantita', linea) || 1,
      prezzo:       num('PrezzoUnitario', linea),
      sconto:       num('ScontoMaggiorazione Percentuale', linea),
      iva:          num('AliquotaIVA', linea),
      unitaMisura:  txt('UnitaMisura', linea),
    }));

    return { numero, dataEmissione, note, righe, fornitorePIva, fornitoreNome };
  }

  printDoc(a: Acquisto) { this.printSvc.printAcquisto(a.id!); }

  inviaEmail(a: Acquisto) {
    const dest = prompt(`Email destinatario per acquisto n. ${a.numero}:`, '');
    if (dest === null) return;
    const note = prompt('Note aggiuntive (opzionale):', '') ?? '';
    this.ds.sendAcquistoEmail(a.id!, dest || undefined, note || undefined).subscribe({
      next: () => this.snack.open('Email inviata', '', { duration: 2000 }),
      error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), '', { duration: 4000 })
    });
  }

  info(a: Acquisto) {
    this.ds.getAcquistoPrint(a.id!).subscribe(doc => {
      const righe = doc.righe ?? [];
      const imponibile = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0);
      const ivaT = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0);
      const extra: { label: string; value: string }[] = [];
      if (doc.tipoPagamentoNome) extra.push({ label: 'Pagamento', value: doc.tipoPagamentoNome });
      this.dialog.open(DocInfoDialogComponent, {
        data: {
          tipo: 'ACQUISTO', numero: doc.numero, data: doc.dataEmissione, stato: doc.stato,
          controparteLabel: 'FORNITORE',
          controparte: doc.fornitore?.ragioneSociale || a.fornitoreNome || '—',
          controparteInfo: doc.fornitore ? [
            [doc.fornitore.via, [doc.fornitore.cap, doc.fornitore.citta].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            doc.fornitore.pIva ? `P.IVA: ${doc.fornitore.pIva}` : '',
          ].filter(Boolean) as string[] : [],
          totale: imponibile + ivaT, imponibile, righe, extraFields: extra, note: doc.note,
        } as DocInfoData,
        width: '720px', maxWidth: '98vw', maxHeight: '92vh',
      });
    });
  }

  delete(a: Acquisto) {
    if (!confirm(`Eliminare acquisto ${a.numero}?`)) return;
    this.ds.deleteAcquisto(a.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

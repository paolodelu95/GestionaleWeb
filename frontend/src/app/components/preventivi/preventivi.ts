import { Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { SelectionModel } from '@angular/cdk/collections';
import { DataService } from '../../services/data.service';
import { Preventivo, Cliente, Prodotto, RigaDocumento, UnitaMisura } from '../../models';
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
  .td-history { width: 28px; padding: 0 !important; }
`;

@Component({
  selector: 'app-preventivo-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule, MatMenuModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica Preventivo' : 'Nuovo Preventivo' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field>
            <mat-label>Numero *</mat-label>
            <input matInput formControlName="numero">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Data emissione *</mat-label>
            <input matInput type="date" formControlName="dataEmissione">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Validità (gg)</mat-label>
            <input matInput type="number" formControlName="validita">
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field style="flex:1">
            <mat-label>Cliente *</mat-label>
            <input matInput [matAutocomplete]="autoCliente" [formControl]="clienteCtrl"
                   (keyup.enter)="autoSelectCliente()" placeholder="Cerca cliente..."
                   [class.input-error]="submitted && !hasCliente">
            <mat-icon matSuffix>search</mat-icon>
            <mat-autocomplete #autoCliente="matAutocomplete" [displayWith]="displayCliente">
              @for (c of filteredClienti; track c.id) {
                <mat-option [value]="c">{{ c.ragioneSociale }}</mat-option>
              }
            </mat-autocomplete>
            @if (submitted && !hasCliente) {
              <mat-error>Seleziona un cliente</mat-error>
            }
          </mat-form-field>
        </div>
      </form>
      <div class="righe-section">
        <div class="righe-header">
          <div style="display:flex;align-items:center;gap:12px">
            <b>Righe *</b>
            @if (submitted && !hasRighe) {
              <span class="righe-error"><mat-icon>error_outline</mat-icon> Aggiungi almeno una riga</span>
            }
          </div>
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
              <th class="td-history"></th>
              <th>Sconto%</th>
              <th>IVA%</th>
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
                <td class="td-history">
                  @if (prezziRecenti[$index]?.length) {
                    <button mat-icon-button type="button" title="Prezzi recenti" [matMenuTriggerFor]="menuPrezzi">
                      <mat-icon style="font-size:16px;color:#6366f1">history</mat-icon>
                    </button>
                    <mat-menu #menuPrezzi="matMenu">
                      <div style="padding:8px 16px 4px;font-size:12px;font-weight:600;color:#64748b;pointer-events:none">Prezzi recenti</div>
                      @for (pr of prezziRecenti[$index]; track $index) {
                        <button mat-menu-item type="button" (click)="usaPrezzo($index, pr.prezzo, pr.sconto)">
                          <span style="font-size:12px;color:#64748b">{{ pr.tipo }} {{ pr.numero }} — {{ pr.dataEmissione | date:'dd/MM/yy' }}</span>
                          <b style="margin-left:8px;color:#1e293b">{{ pr.prezzoEffettivo | currency:'EUR':'symbol':'1.2-2':'it' }}</b>
                          @if (pr.sconto) { <span style="font-size:11px;color:#dc2626;margin-left:4px">(-{{ pr.sconto }}%)</span> }
                        </button>
                      }
                    </mat-menu>
                  }
                </td>
                <td><input class="riga-input sconto" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.sconto" placeholder="0"></td>
                <td><input class="riga-input num" type="number" [(ngModel)]="riga.iva"></td>
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
      <button mat-flat-button (click)="save()">Salva</button>
    </mat-dialog-actions>`,
  styles: [RIGHE_STYLES + `
    .righe-error { display:flex; align-items:center; gap:4px; color:#dc2626; font-size:12px; font-weight:500; }
    .righe-error mat-icon { font-size:15px; width:15px; height:15px; }
    .input-error { border-color:#dc2626 !important; }
  `]
})
export class PreventivoDialogComponent implements OnInit {
  form: FormGroup;
  clienti: Cliente[] = [];
  filteredClienti: Cliente[] = [];
  clienteCtrl = new FormControl<Cliente | string | null>('');
  righe: RigaDocumento[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  prezziRecenti: any[][] = [];
  readonly isNew: boolean;

  submitted = false;
  get hasCliente(): boolean { const v = this.clienteCtrl.value; return !!(v && typeof v !== 'string'); }
  get hasRighe(): boolean { return this.righe.length > 0 && this.righe.some(r => r.descrizione?.trim()); }
  get canSave(): boolean { return this.form.valid && this.hasCliente && this.hasRighe; }

  get clienteId(): number | null {
    const v = this.clienteCtrl.value;
    return v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
  }

  showNetto = false;
  get imponibile() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0); }
  get ivaTotal() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0); }
  get totale() { return this.imponibile + this.ivaTotal; }
  rigaTotale(riga: RigaDocumento) {
    const net = riga.quantita * riga.prezzo * (1 - (riga.sconto ?? 0) / 100);
    return this.showNetto ? net : net * (1 + riga.iva / 100);
  }
  setPrezzoFromInput(riga: RigaDocumento, event: Event) {
    const v = +(event.target as HTMLInputElement).value;
    riga.prezzo = this.showNetto ? v : +(v / (1 + riga.iva / 100)).toFixed(6);
  }

  loadPrezziRecenti(index: number) {
    const riga = this.righe[index];
    if (!riga.prodottoId) return;
    this.ds.getPrezziRecenti(riga.prodottoId, this.clienteId).subscribe(prezzi => {
      this.prezziRecenti[index] = prezzi;
    });
  }

  usaPrezzo(index: number, prezzo: number, sconto: number) {
    this.righe[index].prezzo = prezzo;
    this.righe[index].sconto = sconto;
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private matDialog: MatDialog,
    public dialogRef: MatDialogRef<PreventivoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Preventivo | null
  ) {
    this.isNew = !data?.id;
    this.form = this.fb.group({
      numero: [data?.numero ?? '', Validators.required],
      dataEmissione: [data?.dataEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      validita: [data?.validita ?? 30],
      note: [data?.note ?? ''],
    });
    if (data?.id) {
      this.ds.getPreventivoById(data.id).subscribe(p => { this.righe = p.righe ?? []; this.prezziRecenti = new Array(this.righe.length).fill([]); });
    } else {
      this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva: 22 }];
      this.prezziRecenti = [[]];
    }
  }

  ngOnInit() {
    this.clienteCtrl.valueChanges.subscribe(v => {
      const q = typeof v === 'string' ? v.toLowerCase() : '';
      this.filteredClienti = this.clienti.filter(c => c.ragioneSociale.toLowerCase().includes(q));
    });

    this.ds.getClienti().subscribe(c => {
      this.clienti = c;
      this.filteredClienti = c;
      if (this.data?.clienteId) {
        const found = c.find(x => x.id === this.data!.clienteId);
        if (found) this.clienteCtrl.setValue(found, { emitEvent: false });
      }
    });

    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);

    if (this.isNew) {
      this.ds.getNextNumero('preventivi').subscribe(n => this.form.patchValue({ numero: String(n.numero) }));
    }
  }

  displayCliente(c: Cliente | string | null): string {
    return c && typeof c !== 'string' ? (c as Cliente).ragioneSociale : '';
  }

  autoSelectCliente() {
    if (this.filteredClienti.length > 0) this.clienteCtrl.setValue(this.filteredClienti[0]);
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
        this.loadPrezziRecenti(index);
      });
  }

  addRiga() {
    this.righe.push({ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva: 22 });
    this.prezziRecenti.push([]);
  }
  removeRiga(i: number) { this.righe.splice(i, 1); this.prezziRecenti.splice(i, 1); }

  save() {
    this.submitted = true;
    if (!this.canSave) return;
    const v = this.clienteCtrl.value;
    const clienteId = v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
    this.dialogRef.close({ ...this.data, ...this.form.value, clienteId, righe: this.righe });
  }
}

@Component({
  selector: 'app-preventivi',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule, MatFormFieldModule, MatInputModule],
  templateUrl: './preventivi.html',
  styleUrl: './preventivi.scss'
})
export class PreventiviComponent implements OnInit, AfterViewInit {
  preventivi: Preventivo[] = [];
  dataSource = new MatTableDataSource<Preventivo>();
  displayedColumns = ['select', 'numero', 'dataEmissione', 'clienteNome', 'totale', 'stato', 'azioni'];
  selection = new SelectionModel<Preventivo>(true, []);

  @ViewChild(MatSort) sort!: MatSort;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (item, prop) => {
      switch (prop) {
        case 'totale': return item.totale ?? 0;
        case 'dataEmissione': return item.dataEmissione ?? '';
        default: return (item as any)[prop] ?? '';
      }
    };
    this.dataSource.filterPredicate = (data, filter) =>
      [data.numero, data.clienteNome, data.stato].some(v => v?.toLowerCase().includes(filter));
  }

  load() { this.ds.getPreventivi().subscribe(p => { this.preventivi = p; this.dataSource.data = p; this.selection.clear(); }); }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
  }

  isAllSelected() { return this.preventivi.length > 0 && this.selection.selected.length === this.preventivi.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.preventivi.forEach(r => this.selection.select(r)); }

  setStato(p: Preventivo, stato: string) {
    this.ds.setPreventivoStato(p.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) { this.selection.selected.forEach(p => this.ds.setPreventivoStato(p.id!, stato).subscribe()); this.load(); }

  open(p?: Preventivo) {
    const ref = this.dialog.open(PreventivoDialogComponent, {
      data: p ?? null, width: '90vw', maxWidth: '1400px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updatePreventivo(result) : this.ds.createPreventivo(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  delete(p: Preventivo) {
    if (!confirm(`Eliminare Preventivo ${p.numero}?`)) return;
    this.ds.deletePreventivo(p.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

import { Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { SelectionModel } from '@angular/cdk/collections';
import { DataService } from '../../services/data.service';
import { NotaCredito, Cliente, Fattura, Prodotto, RigaDocumento, UnitaMisura } from '../../models';
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
  .prezzo-recente-item { display:flex; justify-content:space-between; gap:16px; font-size:13px; min-width:220px; }
  .pr-meta { color:#64748b; font-size:11px; }
`;

@Component({
  selector: 'app-nc-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule, MatMenuModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica Nota di Credito' : 'Nuova Nota di Credito' }}</h2>
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
        </div>
        <div class="form-row">
          <mat-form-field style="flex:1">
            <mat-label>Cliente</mat-label>
            <input matInput [matAutocomplete]="autoCliente" [formControl]="clienteCtrl"
                   (keyup.enter)="autoSelectCliente()" placeholder="Cerca cliente...">
            <mat-icon matSuffix>search</mat-icon>
            <mat-autocomplete #autoCliente="matAutocomplete" [displayWith]="displayCliente">
              @for (c of filteredClienti; track c.id) {
                <mat-option [value]="c">{{ c.ragioneSociale }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Fattura collegata</mat-label>
            <mat-select formControlName="fatturaId">
              <mat-option [value]="null">— nessuna —</mat-option>
              @for (f of fatture; track f.id) { <mat-option [value]="f.id">{{ f.numero }}</mat-option> }
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
              <th class="td-history"></th>
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
                <td class="td-history">
                  @if (prezziRecenti[$index]?.length) {
                    <button mat-icon-button type="button" [matMenuTriggerFor]="menuPR" [matMenuTriggerData]="{idx: $index}" title="Prezzi recenti">
                      <mat-icon style="font-size:18px;color:#7c3aed">history</mat-icon>
                    </button>
                  }
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
        <mat-menu #menuPR="matMenu">
          <ng-template matMenuContent let-idx="idx">
            @for (pr of prezziRecenti[idx]; track $index) {
              <button mat-menu-item type="button" (click)="usaPrezzo(idx, pr.prezzo, pr.sconto)">
                <div class="prezzo-recente-item">
                  <span>{{ pr.prezzoEffettivo | currency:'EUR':'symbol':'1.2-2':'it' }}
                    @if (pr.sconto) { <span style="color:#d97706">&nbsp;(-{{ pr.sconto }}%)</span> }
                  </span>
                  <span class="pr-meta">{{ pr.tipo }} {{ pr.numero }} · {{ pr.dataEmissione | date:'dd/MM/yy' }}</span>
                </div>
              </button>
            }
          </ng-template>
        </mat-menu>
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
export class NotaCreditoDialogComponent implements OnInit {
  form: FormGroup;
  clienti: Cliente[] = [];
  filteredClienti: Cliente[] = [];
  clienteCtrl = new FormControl<Cliente | string | null>('');
  fatture: Fattura[] = [];
  righe: RigaDocumento[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  prezziRecenti: any[][] = [];
  readonly isNew: boolean;

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
    public dialogRef: MatDialogRef<NotaCreditoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NotaCredito | null
  ) {
    this.isNew = !data?.id;
    this.form = this.fb.group({
      numero: [data?.numero ?? '', Validators.required],
      dataEmissione: [data?.dataEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      fatturaId: [data?.fatturaId ?? null],
      note: [data?.note ?? ''],
    });
    if (data?.id) { this.ds.getNotaCreditoById(data.id).subscribe(n => { this.righe = (n.righe ?? []).map((r: any) => ({ ...r, sconto: r.sconto ?? 0 })); }); }
    else { this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }]; }
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

    this.ds.getFatture().subscribe(f => this.fatture = f);
    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);

    if (this.isNew) {
      this.ds.getNextNumero('note-credito').subscribe(n => this.form.patchValue({ numero: String(n.numero) }));
    }
  }

  displayCliente(c: Cliente | string | null): string {
    return c && typeof c !== 'string' ? (c as Cliente).ragioneSociale : '';
  }

  autoSelectCliente() {
    if (this.filteredClienti.length > 0) this.clienteCtrl.setValue(this.filteredClienti[0]);
  }

  private get selectedClienteId(): number | null {
    const v = this.clienteCtrl.value;
    return v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
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

  loadPrezziRecenti(index: number) {
    const riga = this.righe[index];
    if (!riga.prodottoId) return;
    this.ds.getPrezziRecenti(riga.prodottoId, this.selectedClienteId).subscribe(pr => {
      this.prezziRecenti[index] = pr;
    });
  }

  usaPrezzo(index: number, prezzo: number, sconto: number) {
    this.righe[index].prezzo = prezzo;
    this.righe[index].sconto = sconto;
  }

  addRiga() { this.righe.push({ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }); }
  removeRiga(i: number) { this.righe.splice(i, 1); }

  save() {
    if (!this.form.valid) return;
    const v = this.clienteCtrl.value;
    const clienteId = v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
    this.dialogRef.close({ ...this.data, ...this.form.value, clienteId, stato: this.data?.stato ?? 'EMESSA', righe: this.righe });
  }
}

@Component({
  selector: 'app-note-credito',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule,
            MatSortModule, MatFormFieldModule, MatInputModule],
  templateUrl: './note-credito.html',
  styleUrl: './note-credito.scss'
})
export class NoteCreditoComponent implements OnInit, AfterViewInit {
  noteCredito: NotaCredito[] = [];
  dataSource = new MatTableDataSource<NotaCredito>([]);
  displayedColumns = ['select', 'numero', 'dataEmissione', 'clienteNome', 'totale', 'stato', 'azioni'];
  selection = new SelectionModel<NotaCredito>(true, []);

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
          || (item.clienteNome ?? '').toLowerCase().includes(s)
          || (item.stato ?? '').toLowerCase().includes(s);
    };
  }

  load() {
    this.ds.getNoteCredito().subscribe(n => {
      this.noteCredito = n;
      this.dataSource.data = n;
      this.selection.clear();
    });
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  isAllSelected() { return this.noteCredito.length > 0 && this.selection.selected.length === this.noteCredito.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.noteCredito.forEach(r => this.selection.select(r)); }

  setStato(n: NotaCredito, stato: string) {
    this.ds.setNotaCreditoStato(n.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) { this.selection.selected.forEach(n => this.ds.setNotaCreditoStato(n.id!, stato).subscribe()); this.load(); }

  open(n?: NotaCredito) {
    const ref = this.dialog.open(NotaCreditoDialogComponent, {
      data: n ?? null, width: '90vw', maxWidth: '1400px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateNotaCredito(result) : this.ds.createNotaCredito(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  delete(n: NotaCredito) {
    if (!confirm(`Eliminare Nota di Credito ${n.numero}?`)) return;
    this.ds.deleteNotaCredito(n.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

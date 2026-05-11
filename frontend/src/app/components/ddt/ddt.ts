import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';
import { Ddt, Fattura, Cliente, Prodotto, RigaDocumento, UnitaMisura } from '../../models';
import { ProdottoPickerComponent } from '../shared/prodotto-picker';
import { FatturaDialogComponent } from '../fatture/fatture';

const RIGHE_STYLES = `
  .righe-section { margin-top: 16px; }
  .righe-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .righe-table { width: 100%; border-collapse: collapse; }
  .righe-table th { background: #f8fafc; padding: 8px; font-size: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .righe-table td { padding: 4px 2px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .riga-input { border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; font-size: 13px; width: 100%; box-sizing: border-box; }
  .riga-input.num { width: 80px; }
  .riga-input.cod { width: 160px; }
  .righe-total { text-align: right; padding: 10px 16px; font-weight: 700; background: #f8fafc; border-top: 2px solid #e2e8f0; }
  .td-search { width: 36px; padding: 0 !important; }
`;

@Component({
  selector: 'app-ddt-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatAutocompleteModule,
            MatTableModule, MatIconModule, MatButtonToggleModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica DDT' : 'Nuovo DDT' }}</h2>
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
export class DdtDialogComponent implements OnInit {
  form: FormGroup;
  clienti: Cliente[] = [];
  filteredClienti: Cliente[] = [];
  clienteCtrl = new FormControl<Cliente | string | null>('');
  righe: RigaDocumento[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  readonly isNew: boolean;

  submitted = false;
  get hasCliente(): boolean { const v = this.clienteCtrl.value; return !!(v && typeof v !== 'string'); }
  get hasRighe(): boolean { return this.righe.length > 0 && this.righe.some(r => r.descrizione?.trim()); }
  get canSave(): boolean { return this.form.valid && this.hasCliente && this.hasRighe; }

  showNetto = false;
  get imponibile() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo, 0); }
  get ivaTotal() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * r.iva / 100, 0); }
  get totale() { return this.imponibile + this.ivaTotal; }
  rigaTotale(riga: RigaDocumento) { return this.showNetto ? riga.quantita * riga.prezzo : riga.quantita * riga.prezzo * (1 + riga.iva / 100); }
  setPrezzoFromInput(riga: RigaDocumento, event: Event) {
    const v = +(event.target as HTMLInputElement).value;
    riga.prezzo = this.showNetto ? v : +(v / (1 + riga.iva / 100)).toFixed(6);
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private matDialog: MatDialog,
    public dialogRef: MatDialogRef<DdtDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Ddt | null
  ) {
    this.isNew = !data?.id;
    this.form = this.fb.group({
      numero: [data?.numero ?? '', Validators.required],
      dataEmissione: [data?.dataEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      note: [data?.note ?? ''],
    });
    if (data?.id) {
      this.ds.getDdtById(data.id).subscribe(d => this.righe = d.righe ?? []);
    } else {
      this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22 }];
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
      this.ds.getNextNumero('ddt').subscribe(n => this.form.patchValue({ numero: String(n.numero) }));
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
      });
  }

  addRiga() { this.righe.push({ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22 }); }
  removeRiga(i: number) { this.righe.splice(i, 1); }

  save() {
    this.submitted = true;
    if (!this.canSave) return;
    const v = this.clienteCtrl.value;
    const clienteId = v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
    this.dialogRef.close({ ...this.data, ...this.form.value, clienteId, righe: this.righe });
  }
}

@Component({
  selector: 'app-ddt',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule],
  templateUrl: './ddt.html',
  styleUrl: './ddt.scss'
})
export class DdtComponent implements OnInit {
  ddt: Ddt[] = [];
  displayedColumns = ['select', 'numero', 'dataEmissione', 'clienteNome', 'totale', 'stato', 'fattura', 'azioni'];
  selection = new SelectionModel<Ddt>(true, []);

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }
  load() { this.ds.getDdt().subscribe(d => { this.ddt = d; this.selection.clear(); }); }

  isAllSelected() { return this.ddt.length > 0 && this.selection.selected.length === this.ddt.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.ddt.forEach(r => this.selection.select(r)); }

  setStato(d: Ddt, stato: string) {
    this.ds.setDdtStato(d.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) { this.selection.selected.forEach(d => this.ds.setDdtStato(d.id!, stato).subscribe()); this.load(); }

  generaFattura(ddt: Ddt) {
    forkJoin({ full: this.ds.getDdtById(ddt.id!), num: this.ds.getNextNumero('fatture') }).subscribe(({ full, num }) => {
      const pre: Fattura = {
        numero: String(num.numero),
        dataEmissione: new Date().toISOString().substring(0, 10),
        clienteId: ddt.clienteId, ddtId: ddt.id,
        stato: 'BOZZA', righe: full.righe,
      } as Fattura;
      this.dialog.open(FatturaDialogComponent, { data: pre, width: '90vw', maxWidth: '1400px', maxHeight: '95vh' })
        .afterClosed().subscribe(result => {
          if (!result) return;
          this.ds.createFattura(result).subscribe({
            next: () => { this.load(); this.snack.open('Fattura creata', '', { duration: 2000 }); },
            error: e => this.snack.open(e.message, '', { duration: 3000 })
          });
        });
    });
  }

  apriImpostazioniFattura(fatturaId: number) {
    this.ds.getFatturaById(fatturaId).subscribe(f => this.dialog.open(FatturaDialogComponent, {
      data: f, width: '90vw', maxWidth: '1400px', maxHeight: '95vh'
    }).afterClosed().subscribe(result => {
      if (!result) return;
      this.ds.updateFattura(result).subscribe({ next: () => this.snack.open('Salvato', '', { duration: 2000 }) });
    }));
  }

  open(d?: Ddt) {
    const ref = this.dialog.open(DdtDialogComponent, {
      data: d ?? null, width: '90vw', maxWidth: '1400px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateDdt(result) : this.ds.createDdt(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  delete(d: Ddt) {
    if (!confirm(`Eliminare DDT ${d.numero}?`)) return;
    this.ds.deleteDdt(d.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

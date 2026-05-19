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
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { SelectionModel } from '@angular/cdk/collections';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { NotaCredito, Cliente, Fattura, Prodotto, RigaDocumento, UnitaMisura, NotaRapida } from '../../models';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';

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
  .riga-nota td { background: #fefce8; }
  .riga-nota input { font-style: italic; color: #78716c; }
  .td-drag { width: 28px; padding: 0 !important; cursor: grab; color: #94a3b8; }
  .cdk-drag-placeholder { opacity: 0.4; }
  .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
`;

@Component({
  selector: 'app-nc-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule, MatMenuModule, DragDropModule],
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
            <mat-label>Fattura da stornare</mat-label>
            <mat-select formControlName="fatturaId">
              <mat-option [value]="null">— nessuna —</mat-option>
              @for (f of fattureDisponibili; track f.id) {
                <mat-option [value]="f.id">{{ f.numero }} — {{ f.dataEmissione | date:'dd/MM/yyyy' }}</mat-option>
              }
            </mat-select>
            @if (!selectedClienteId) {
              <mat-hint>Seleziona prima un cliente</mat-hint>
            }
          </mat-form-field>
        </div>
        @if (form.get('fatturaId')?.value) {
          <div style="font-size:12px;color:#16a34a;margin-top:-8px;margin-bottom:4px">
            <mat-icon style="font-size:14px;vertical-align:middle">auto_fix_high</mat-icon>
            Le righe della fattura sono state importate con importo negativo. Fattura e nota di credito saranno saldate automaticamente.
          </div>
        }
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
          <tbody cdkDropList (cdkDropListDropped)="dropRiga($event)">
            @for (riga of righe; track $index) {
              @if (riga.tipo === 'NOTA') {
                <tr class="riga-nota" cdkDrag cdkDragPreviewContainer="parent">
                  <td class="td-drag" cdkDragHandle><mat-icon>drag_indicator</mat-icon></td>
                  <td colspan="9">
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
                <td class="td-history">
                  @if (prezziRecenti[$index]?.length) {
                    <button mat-icon-button type="button" [matMenuTriggerFor]="menuPR" [matMenuTriggerData]="{idx: $index}" title="Prezzi recenti - questo cliente">
                      <mat-icon style="font-size:18px;color:#7c3aed">history</mat-icon>
                    </button>
                  }
                  @if (riga.prodottoId) {
                    <button mat-icon-button type="button" [matMenuTriggerFor]="menuPRTutti" [matMenuTriggerData]="{idx: $index}" (click)="loadTuttiPrezzi($index, riga.prodottoId)" title="Prezzi tutti i clienti">
                      <mat-icon style="font-size:18px;color:#94a3b8">groups</mat-icon>
                    </button>
                  }
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
        <mat-menu #menuPRTutti="matMenu">
          <ng-template matMenuContent let-idx="idx">
            <div style="padding:8px 16px 4px;font-size:12px;font-weight:600;color:#64748b;pointer-events:none">Tutti i clienti</div>
            @if (!tuttiCaricati[idx]) {
              <div style="padding:8px 16px;font-size:12px;color:#94a3b8">Clicca per caricare...</div>
            }
            @if (tuttiCaricati[idx] && !prezziRecentiTutti[idx]?.length) {
              <div style="padding:8px 16px;font-size:12px;color:#94a3b8">Nessun prezzo trovato</div>
            }
            @for (pr of prezziRecentiTutti[idx] ?? []; track $index) {
              <button mat-menu-item type="button" (click)="usaPrezzo(idx, pr.prezzo, pr.sconto)">
                <div class="prezzo-recente-item">
                  <span style="font-size:11px;color:#64748b;display:block">{{ pr.clienteNome ?? '' }} · {{ pr.tipo }} {{ pr.numero }} — {{ pr.dataEmissione | date:'dd/MM/yy' }}</span>
                  <b>{{ pr.prezzoEffettivo | currency:'EUR':'symbol':'1.2-2':'it' }}</b>
                  @if (pr.sconto) { <span style="color:#d97706">&nbsp;(-{{ pr.sconto }}%)</span> }
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
export class NotaCreditoDialogComponent implements OnInit {
  form: FormGroup;
  clienti: Cliente[] = [];
  filteredClienti: Cliente[] = [];
  clienteCtrl = new FormControl<Cliente | string | null>('');
  allFatture: Fattura[] = [];
  private usedFatturaIds = new Set<number>();
  righe: RigaDocumento[] = [];
  noteRapideList: NotaRapida[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  prezziRecenti: any[][] = [];
  prezziRecentiTutti: any[][] = [];
  tuttiCaricati: boolean[] = [];
  readonly isNew: boolean;

  get selectedClienteId(): number | null {
    const v = this.clienteCtrl.value;
    return v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
  }

  get fattureDisponibili(): Fattura[] {
    const cid = this.selectedClienteId;
    if (!cid) return [];
    return this.allFatture.filter(f =>
      f.clienteId === cid &&
      (f.id === this.form.value.fatturaId || !this.usedFatturaIds.has(f.id!))
    );
  }

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
    if (data?.id) { this.ds.getNotaCreditoById(data.id).subscribe(n => { this.righe = (n.righe ?? []).map((r: any) => ({ ...r, sconto: r.sconto ?? 0 })); this.prezziRecenti = new Array(this.righe.length).fill([]); this.prezziRecentiTutti = new Array(this.righe.length).fill([]); this.tuttiCaricati = new Array(this.righe.length).fill(false); }); }
    else { this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }]; this.prezziRecenti = [[]]; this.prezziRecentiTutti = [[]]; this.tuttiCaricati = [false]; }
  }

  ngOnInit() {
    this.clienteCtrl.valueChanges.subscribe(v => {
      const q = typeof v === 'string' ? v.toLowerCase() : '';
      this.filteredClienti = this.clienti.filter(c => c.ragioneSociale.toLowerCase().includes(q));
      // Reset fattura when client changes
      if (typeof v !== 'string') {
        this.form.patchValue({ fatturaId: null }, { emitEvent: false });
      }
    });

    this.ds.getClienti().subscribe(c => {
      this.clienti = c;
      this.filteredClienti = c;
      if (this.data?.clienteId) {
        const found = c.find(x => x.id === this.data!.clienteId);
        if (found) this.clienteCtrl.setValue(found, { emitEvent: false });
      }
    });

    this.ds.getFatture().subscribe(f => this.allFatture = f);
    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getNoteRapide().subscribe(n => this.noteRapideList = n);
    this.ds.getNoteCredito().subscribe(ncs => {
      this.usedFatturaIds = new Set(
        ncs.filter(n => n.fatturaId && n.id !== this.data?.id).map(n => n.fatturaId!)
      );
    });

    // Auto-populate rows when a fattura is selected (only for new NCs)
    this.form.get('fatturaId')!.valueChanges.subscribe(id => {
      if (id && this.isNew) this.loadFatturaRows(id);
    });

    if (this.isNew) {
      this.ds.getNextNumero('note-credito').subscribe(n => this.form.patchValue({ numero: String(n.numero) }));
    }
  }

  private loadFatturaRows(fatturaId: number) {
    this.ds.getFatturaById(fatturaId).subscribe(f => {
      const [y, mo, day] = f.dataEmissione.substring(0, 10).split('-');
      this.righe = [
        { descrizione: `Riferimento fattura n. ${f.numero} del ${day}/${mo}/${y}`, quantita: 0, prezzo: 0, iva: 0, sconto: 0, unitaMisura: '' },
        ...(f.righe ?? []).map(r => ({ ...r, id: undefined, quantita: -(r.quantita ?? 0) }))
      ];
      this.prezziRecenti = new Array(this.righe.length).fill([]);
      this.prezziRecentiTutti = new Array(this.righe.length).fill([]);
      this.tuttiCaricati = new Array(this.righe.length).fill(false);
    });
  }

  displayCliente(c: Cliente | string | null): string {
    return c && typeof c !== 'string' ? (c as Cliente).ragioneSociale : '';
  }

  autoSelectCliente() {
    if (this.filteredClienti.length > 0) this.clienteCtrl.setValue(this.filteredClienti[0]);
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
        this.loadPrezziRecenti(index);
      });
  }

  roundIfPz(riga: RigaDocumento) {
    if (riga.unitaMisura === 'pz') riga.quantita = Math.max(1, Math.round(riga.quantita || 1));
    else riga.quantita = Math.max(0.001, riga.quantita || 0.001);
  }
  clampSconto(riga: RigaDocumento) {
    riga.sconto = Math.min(100, Math.max(0, riga.sconto ?? 0));
  }

  loadPrezziRecenti(index: number) {
    const riga = this.righe[index];
    if (!riga.prodottoId) return;
    this.ds.getPrezziRecenti(riga.prodottoId, this.selectedClienteId).subscribe(pr => {
      this.prezziRecenti[index] = pr;
    });
  }

  loadTuttiPrezzi(index: number, prodottoId: number | null) {
    if (!prodottoId || this.tuttiCaricati[index]) return;
    this.tuttiCaricati[index] = true;
    this.ds.getPrezziRecenti(prodottoId, null).subscribe({
      next: p => {
        const cid = this.selectedClienteId ?? null;
        this.prezziRecentiTutti[index] = cid ? p.filter((x: any) => x.clienteId !== cid) : p;
      },
      error: () => { this.prezziRecentiTutti[index] = []; }
    });
  }

  usaPrezzo(index: number, prezzo: number, sconto: number) {
    this.righe[index].prezzo = prezzo;
    this.righe[index].sconto = sconto;
  }

  addRiga() { this.righe.push({ tipo: 'PRODOTTO', descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }); this.prezziRecenti.push([]); this.prezziRecentiTutti.push([]); this.tuttiCaricati.push(false); }
  addNota(testo: string) { this.righe.push({ tipo: 'NOTA', descrizione: testo, quantita: 0, prezzo: 0, sconto: 0, iva: 0 }); this.prezziRecenti.push([]); this.prezziRecentiTutti.push([]); this.tuttiCaricati.push(false); }
  removeRiga(i: number) { this.righe.splice(i, 1); this.prezziRecenti.splice(i, 1); this.prezziRecentiTutti.splice(i, 1); this.tuttiCaricati.splice(i, 1); }
  dropRiga(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.righe, event.previousIndex, event.currentIndex);
    moveItemInArray(this.prezziRecenti, event.previousIndex, event.currentIndex);
    moveItemInArray(this.prezziRecentiTutti, event.previousIndex, event.currentIndex);
    moveItemInArray(this.tuttiCaricati, event.previousIndex, event.currentIndex);
  }

  save() {
    if (!this.form.valid) return;
    const v = this.clienteCtrl.value;
    const clienteId = v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
    const fatturaId = this.form.value.fatturaId;
    const stato = fatturaId ? 'PAGATA' : (this.data?.stato ?? 'EMESSA');
    this.dialogRef.close({ ...this.data, ...this.form.value, clienteId, stato, righe: this.righe });
  }
}

@Component({
  selector: 'app-note-credito',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule,
            MatSortModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule],
  templateUrl: './note-credito.html',
  styleUrl: './note-credito.scss'
})
export class NoteCreditoComponent implements OnInit, AfterViewInit {
  private allNoteCredito: NotaCredito[] = [];
  dataSource = new MatTableDataSource<NotaCredito>([]);
  displayedColumns = ['select', 'numero', 'dataEmissione', 'clienteNome', 'totale', 'stato', 'azioni'];
  selection = new SelectionModel<NotaCredito>(true, []);

  readonly mesi = [{v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},{v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}];
  filtroAnno: number | null = null;
  filtroMese: number | null = null;
  filtroCliente: number | null = null;

  get anni() { return [...new Set(this.allNoteCredito.map(n => +n.dataEmissione.substring(0, 4)))].sort().reverse(); }
  get clientiList() {
    const map = new Map<number, string>();
    this.allNoteCredito.forEach(n => { if (n.clienteId) map.set(n.clienteId, n.clienteNome ?? ''); });
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }
  get noteCredito() { return this.dataSource.data; }

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private printSvc: PrintService) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, col) => {
      switch (col) {
        case 'numero': { const m = (item.numero || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; }
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
      this.allNoteCredito = n;
      this.applyFilters();
      this.selection.clear();
    });
  }

  applyFilters() {
    let data = this.allNoteCredito;
    if (this.filtroAnno) data = data.filter(n => +n.dataEmissione.substring(0, 4) === this.filtroAnno);
    if (this.filtroMese) data = data.filter(n => +n.dataEmissione.substring(5, 7) === this.filtroMese);
    if (this.filtroCliente) data = data.filter(n => n.clienteId === this.filtroCliente);
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  resetFiltri() {
    this.filtroAnno = null; this.filtroMese = null; this.filtroCliente = null;
    this.dataSource.filter = ''; this.applyFilters();
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  print() {
    const rows = this.selection.hasValue() ? this.selection.selected : this.dataSource.data;
    const d = (s: string) => { const p = (s||'').substring(0,10).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'; };
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    const body = rows.map(n=>`<tr><td>${n.numero}</td><td>${d(n.dataEmissione)}</td><td>${n.clienteNome||'—'}</td><td class="r">${e(n.totale)}</td><td>${n.stato}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Note di Credito</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right;font-weight:600}</style></head><body><h1>Note di Credito</h1><table><thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th class="r">Importo</th><th>Stato</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

  isAllSelected() { return this.dataSource.data.length > 0 && this.selection.selected.length === this.dataSource.data.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.dataSource.data.forEach(r => this.selection.select(r)); }

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
        next: () => {
          if (result.fatturaId) {
            this.ds.setFatturaStato(result.fatturaId, 'PAGATA').subscribe();
          }
          this.load();
          this.snack.open('Salvato', '', { duration: 2000 });
        },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  printDoc(n: NotaCredito) { this.printSvc.printNotaCredito(n.id!); }

  delete(n: NotaCredito) {
    if (!confirm(`Eliminare Nota di Credito ${n.numero}?`)) return;
    this.ds.deleteNotaCredito(n.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

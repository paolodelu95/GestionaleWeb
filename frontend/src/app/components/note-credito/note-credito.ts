import { inject, Component, OnInit, OnDestroy, AfterViewInit, Inject, ViewChild, ViewChildren, QueryList, ElementRef, HostListener } from '@angular/core';
import { RIGHE_STYLES } from '../shared/righe-styles';
import { ConfirmService } from '../shared/confirm-dialog';
import { EmptyStateComponent } from '../shared/empty-state';
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
import { ExcelService, ExcelColumn } from '../../services/excel.service';
import { ExportMenuComponent } from '../shared/export-menu';
import { NotaCredito, Cliente, Fattura, Prodotto, RigaDocumento, UnitaMisura, NotaRapida } from '../../models';
import { findProdottoByCodice } from '../../utils/prodotto-match';
import { scrollFocusLastRiga } from '../../utils/scroll';
import { numeroUnivocoValidator, setNumeriEsistenti } from '../../utils/numero-univoco';
import { docRigaTotale, prezzoNettoDaInput } from '../../utils/doc-calc';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';
import { DocInfoDialogComponent, DocInfoData } from '../shared/doc-info-dialog';
import { EmailDialogComponent } from '../shared/email-dialog';
import { CopiaRigheDialogComponent, CopiaRigheDialogData } from '../shared/copia-righe-dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocLockService } from '../../services/doc-lock.service';
import { ViewStateService } from '../../services/view-state.service';
import { TableKeyboardNavDirective } from '../shared/table-keyboard-nav.directive';
import { DocumentDirtyService } from '../../services/document-dirty.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-nc-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule, MatMenuModule, MatTooltipModule, DragDropModule],
  template: `
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon is-danger">
          <mat-icon>note_alt</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">
            {{ data?.id ? ('Nota di credito n. ' + (data?.numero || '')) : 'Nuova nota di credito' }}
            @if (data?.id && locked) {
              <span class="dialog-lock-chip"><mat-icon>lock</mat-icon>Bloccato</span>
            }
          </span>
          <span class="dialog-hero-sub">{{ data?.id ? 'Modifica intestatario, fattura collegata e righe' : 'Storno di fattura emessa' }}</span>
        </div>
        @if (data?.id) {
          <button mat-icon-button type="button"
                  class="dialog-lock-btn"
                  [class.is-locked]="locked"
                  [class.is-unlocked]="!locked"
                  [matTooltip]="locked ? 'Documento bloccato — clicca per sbloccare' : 'Documento sbloccato — clicca per bloccare'"
                  (click)="toggleLock()">
            <mat-icon>{{ locked ? 'lock' : 'lock_open' }}</mat-icon>
          </button>
        }
      </div>

      <div [class.doc-locked-content]="locked" (click)="onLockedClick($event)">

      <div class="doc-form">

        <div class="form-section is-primary">
          <div class="form-section-header"><mat-icon>person</mat-icon><span>Intestazione</span></div>
          <div class="doc-field-grid has-2-extra" [formGroup]="form">
            <mat-form-field>
              <mat-label>Cliente</mat-label>
              <input matInput [matAutocomplete]="autoCliente" [formControl]="clienteCtrl"
                     (keyup.enter)="autoSelectCliente()" placeholder="Cerca cliente per ragione sociale o P.IVA...">
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
              <mat-icon matSuffix>receipt</mat-icon>
              @if (!selectedClienteId) {
                <mat-hint>Seleziona prima un cliente</mat-hint>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Numero *</mat-label>
              <input matInput formControlName="numero">
              @if (form.get('numero')?.hasError('numeroDuplicato')) {
                <mat-error>Numero già esistente</mat-error>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Data emissione *</mat-label>
              <input matInput type="date" formControlName="dataEmissione">
            </mat-form-field>
          </div>
        </div>

        <div class="form-section">
          <div class="righe-header">
            <div class="righe-header-title">
              <span>Righe *</span>
            </div>
            <div class="righe-actions">
              <mat-button-toggle-group [(ngModel)]="showNetto" [hideSingleSelectionIndicator]="true">
                <mat-button-toggle [value]="false">Ivato</mat-button-toggle>
                <mat-button-toggle [value]="true">Netto</mat-button-toggle>
              </mat-button-toggle-group>
              <button mat-flat-button color="primary" type="button" (click)="addRiga()">
                <mat-icon>add</mat-icon> Aggiungi riga
              </button>
              <button mat-stroked-button type="button" (click)="apriCopiaRighe()">
                <mat-icon>content_copy</mat-icon> Copia da…
              </button>
              <button mat-stroked-button type="button" [matMenuTriggerFor]="menuNota">
                <mat-icon>note_add</mat-icon> Aggiungi nota
              </button>
              <mat-menu #menuNota="matMenu">
                <button mat-menu-item type="button" (click)="addNota('')">
                  <mat-icon>edit_note</mat-icon> Nota libera
                </button>
                @if (noteRapideList.length) {
                  <div class="menu-section-label">Note rapide</div>
                  @for (nr of noteRapideList; track nr.id) {
                    <button mat-menu-item type="button" (click)="addNota(nr.testo)">{{ nr.testo }}</button>
                  }
                }
              </mat-menu>
            </div>
          </div>

          @if (form.get('fatturaId')?.value) {
            <div class="doc-banner is-success grid-span-all">
              <mat-icon>auto_fix_high</mat-icon>
              <span>Righe importate con importo negativo. Fattura e nota di credito saranno saldate automaticamente.</span>
            </div>
          }

          <div class="righe-scroll">
          <table class="righe-table">
            <thead>
              <tr>
                <th class="td-drag"></th>
                <th class="td-desc">Codice / Descrizione</th>
                <th class="td-search"></th>
                <th class="td-history"></th>
                <th class="td-qta">Qtà</th>
                <th class="td-um">UM</th>
                <th class="td-prezzo">{{ showNetto ? 'Prezzo netto' : 'Prezzo ivato' }}</th>
                <th class="td-sconto">Sconto%</th>
                <th class="td-iva">IVA%</th>
                <th class="td-totale">{{ showNetto ? 'Totale netto' : 'Totale ivato' }}</th>
                <th class="td-actions"></th>
              </tr>
            </thead>
            <tbody cdkDropList (cdkDropListDropped)="dropRiga($event)">
              @for (riga of righe; track $index) {
                @if (riga.tipo === 'NOTA') {
                  <tr class="riga-nota" cdkDrag cdkDragPreviewContainer="parent">
                    <td class="td-drag" cdkDragHandle><mat-icon>drag_indicator</mat-icon></td>
                    <td class="td-nota" colspan="9">
                      <input class="riga-input" [(ngModel)]="riga.descrizione" placeholder="Testo nota…">
                    </td>
                    <td class="td-actions">
                      <button mat-icon-button color="warn" type="button" (click)="removeRiga($index)">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                } @else {
                <tr cdkDrag cdkDragPreviewContainer="parent">
                  <td class="td-drag" cdkDragHandle><mat-icon>drag_indicator</mat-icon></td>
                  <td class="td-desc">
                    <div class="codice-desc-stack">
                      <input class="riga-input riga-codice" #rigaCodice [(ngModel)]="riga.codiceProdotto" placeholder="Codice" (keydown.enter)="risolviCodiceRiga($index, $event)" (keydown.f2)="searchProdotto($index)" (keydown.arrowdown)="focusSiblingCodice($event, 1)" (keydown.arrowup)="focusSiblingCodice($event, -1)" (keydown.backspace)="onCodiceBackspace($index, $event)">
                      <input class="riga-input riga-input--desc" [(ngModel)]="riga.descrizione" placeholder="Descrizione">
                    </div>
                  </td>
                  <td class="td-search">
                    <button mat-icon-button type="button" (click)="searchProdotto($index)" title="Cerca prodotto">
                      <mat-icon>search</mat-icon>
                    </button>
                  </td>
                  <td class="td-history">
                    @if (prezziRecenti[$index]?.length) {
                      <button mat-icon-button type="button" [matMenuTriggerFor]="menuPR" [matMenuTriggerData]="{idx: $index}" title="Prezzi recenti - questo cliente">
                        <mat-icon class="icon-primary">history</mat-icon>
                      </button>
                    }
                    @if (riga.prodottoId) {
                      <button mat-icon-button type="button" [matMenuTriggerFor]="menuPRTutti" [matMenuTriggerData]="{idx: $index}" (click)="loadTuttiPrezzi($index, riga.prodottoId)" title="Prezzi tutti i clienti">
                        <mat-icon class="icon-muted">groups</mat-icon>
                      </button>
                    }
                  </td>
                  <td class="td-qta" [attr.data-label]="'Qtà'"><input class="riga-input" type="number" min="0"
                    [step]="riga.unitaMisura === 'pz' ? 1 : 0.01"
                    [(ngModel)]="riga.quantita" (change)="roundIfPz(riga)"></td>
                  <td class="td-um" [attr.data-label]="'UM'">
                    <select class="riga-input" [(ngModel)]="riga.unitaMisura">
                      <option value="">—</option>
                      @for (u of unitaMisura; track u.id) {
                        <option [value]="u.simbolo">{{ u.simbolo }}</option>
                      }
                    </select>
                  </td>
                  <td class="td-prezzo" [attr.data-label]="showNetto ? 'Prezzo netto' : 'Prezzo ivato'"><input class="riga-input" type="number" min="0" step="0.01"
                    [value]="showNetto ? riga.prezzo : +(riga.prezzo * (1 + riga.iva/100)).toFixed(2)"
                    (change)="setPrezzoFromInput(riga, $event)"></td>
                  <td class="td-sconto" [attr.data-label]="'Sconto %'"><input class="riga-input" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.sconto"></td>
                  <td class="td-iva" [attr.data-label]="'IVA'"><input class="riga-input" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.iva"></td>
                  <td class="td-totale" [attr.data-label]="'Totale'">
                    {{ rigaTotale(riga) | currency:'EUR':'symbol':'1.2-2':'it' }}
                  </td>
                  <td class="td-actions">
                    <button mat-icon-button color="warn" type="button" (click)="removeRiga($index)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </tr>
                }
              }
            </tbody>
          </table>
          </div>
          <mat-menu #menuPR="matMenu">
            <ng-template matMenuContent let-idx="idx">
              <div class="menu-section-label">Prezzi recenti</div>
              @for (pr of prezziRecenti[idx]; track $index) {
                <button mat-menu-item type="button" (click)="usaPrezzo(idx, pr.prezzo, pr.sconto)">
                  <span class="pr-meta">{{ pr.tipo }} {{ pr.numero }} · {{ pr.dataEmissione | date:'dd/MM/yy' }}</span>
                  <b class="pr-value">{{ pr.prezzoEffettivo | currency:'EUR':'symbol':'1.2-2':'it' }}</b>
                  @if (pr.sconto) { <span class="pr-discount">(-{{ pr.sconto }}%)</span> }
                </button>
              }
            </ng-template>
          </mat-menu>
          <mat-menu #menuPRTutti="matMenu">
            <ng-template matMenuContent let-idx="idx">
              <div class="menu-section-label">Tutti i clienti</div>
              @if (!tuttiCaricati[idx]) {
                <div class="menu-empty">Clicca per caricare…</div>
              }
              @if (tuttiCaricati[idx] && !prezziRecentiTutti[idx]?.length) {
                <div class="menu-empty">Nessun prezzo trovato</div>
              }
              @for (pr of prezziRecentiTutti[idx] ?? []; track $index) {
                <button mat-menu-item type="button" (click)="usaPrezzo(idx, pr.prezzo, pr.sconto)">
                  <div>
                    <span class="pr-meta" style="display:block">{{ pr.clienteNome ?? '' }} · {{ pr.tipo }} {{ pr.numero }} — {{ pr.dataEmissione | date:'dd/MM/yy' }}</span>
                    <b class="pr-value" style="margin-left:0">{{ pr.prezzoEffettivo | currency:'EUR':'symbol':'1.2-2':'it' }}</b>
                    @if (pr.sconto) { <span class="pr-discount">(-{{ pr.sconto }}%)</span> }
                  </div>
                </button>
              }
            </ng-template>
          </mat-menu>
        </div>

        <div class="doc-totals-strip">
          <div class="totals-item"><span class="totals-label">Imponibile</span><span class="totals-value">{{ imponibile | currency:'EUR':'symbol':'1.2-2':'it' }}</span></div>
          <div class="totals-item"><span class="totals-label">IVA</span><span class="totals-value">{{ ivaTotal | currency:'EUR':'symbol':'1.2-2':'it' }}</span></div>
          <span class="totals-spacer"></span>
          <div class="totals-grand"><span class="totals-label">Totale</span><span class="totals-value">{{ totale | currency:'EUR':'symbol':'1.2-2':'it' }}</span></div>
        </div>

        <div class="form-section is-flat" [formGroup]="form">
          <div class="form-section-header"><mat-icon>notes</mat-icon><span>Note interne</span></div>
          <mat-form-field>
            <mat-label>Note ad uso interno</mat-label>
            <textarea matInput rows="2" formControlName="note"></textarea>
          </mat-form-field>
        </div>
      </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      @if (data?.id) {
        <button mat-stroked-button type="button" (click)="printFromDialog()">
          <mat-icon>print</mat-icon> Esporta PDF </button>
      }
      <button mat-flat-button (click)="save()" [disabled]="form.invalid || locked"
              [matTooltip]="locked ? 'Sblocca il documento (icona lucchetto in alto) per modificarlo' : (form.get('numero')?.hasError('numeroDuplicato') ? 'Numero già esistente' : '')">Salva</button>
    </mat-dialog-actions>`,
  styles: [RIGHE_STYLES]
})
export class NotaCreditoDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  locked = false;
  toggleLock() { this.locked = !this.locked; }
  onLockedClick(ev: MouseEvent) {
    if (!this.locked) return;
    const target = ev.target as HTMLElement;
    if (target.closest('.dialog-lock-btn')) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.snack.open('Documento bloccato — clicca il lucchetto in alto per sbloccare', 'OK', { duration: 2600 });
  }
  form: FormGroup;
  numeriEsistenti = new Set<string>();
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
    return docRigaTotale(riga, this.showNetto);
  }
  setPrezzoFromInput(riga: RigaDocumento, event: Event) {
    const v = +(event.target as HTMLInputElement).value;
    riga.prezzo = prezzoNettoDaInput(v, riga.iva, this.showNetto);
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private matDialog: MatDialog,
    private snack: MatSnackBar,
    private printSvcDialog: PrintService,
    private docLockSvc: DocLockService,
    private documentDirty: DocumentDirtyService,
    public dialogRef: MatDialogRef<NotaCreditoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NotaCredito | null
  ) {
    this.isNew = !data?.id;
    this.locked = !!data?.id && this.docLockSvc.enabled;
    this.numeriEsistenti = setNumeriEsistenti((data as any)?.numeriEsistenti);
    this.form = this.fb.group({
      numero: [data?.numero ?? '', [Validators.required, numeroUnivocoValidator(() => this.numeriEsistenti)]],
      dataEmissione: [data?.dataEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      fatturaId: [data?.fatturaId ?? null],
      note: [data?.note ?? ''],
    });
    if (data?.id) { this.ds.getNotaCreditoById(data.id).subscribe(n => { this.righe = (n.righe ?? []).map((r: any) => ({ ...r, sconto: r.sconto ?? 0 })); this.prezziRecenti = new Array(this.righe.length).fill([]); this.prezziRecentiTutti = new Array(this.righe.length).fill([]); this.tuttiCaricati = new Array(this.righe.length).fill(false); this.righe.forEach((r, i) => { if (r.prodottoId) this.loadPrezziRecenti(i); }); }); }
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

  private applyListino(index: number) {
    const riga = this.righe[index];
    const clienteId = this.selectedClienteId;
    if (!clienteId || !riga.prodottoId) return;
    this.ds.resolvePrezzoCliente(clienteId, riga.prodottoId).subscribe(r => {
      if (r.sorgente === 'BASE') return;
      // Per note di credito mantengo il segno della quantita (rimangono in negativo se importate)
      riga.prezzo = r.prezzo;
      riga.sconto = r.sconto;
      if (r.listinoNome) this.snack.open(`Prezzo da listino "${r.listinoNome}" applicato`, '', { duration: 2200 });
    });
  }

  @ViewChildren('rigaCodice') private codiceInputs!: QueryList<ElementRef<HTMLInputElement>>;

  ngAfterViewInit() {
    setTimeout(() => this.codiceInputs?.first?.nativeElement.focus(), 0);
  }

  searchProdotto(index: number, lista?: Prodotto[]) {
    const query = (this.righe[index]?.codiceProdotto ?? '').toString().trim();
    this.matDialog.open(ProdottoPickerComponent, { width: '650px', data: { prodotti: lista ?? this.prodotti, query } })
      .afterClosed().subscribe((pick: ProdottoPick) => {
        if (!pick) return;
        this.applyProdottoToRiga(index, pick.prodotto, pick.variante);
      });
  }

  /** Riempie la riga coi dati del prodotto (riusato da selettore e inserimento via codice). */
  private applyProdottoToRiga(index: number, p: Prodotto, v?: ProdottoPick['variante']) {
    const varSuffix = v ? ` (${[v.taglia, v.colore].filter(Boolean).join(' / ')})` : '';
    this.righe[index].codiceProdotto = p.codice ?? '';
    this.righe[index].descrizione = (p.descrizione || p.nome) + varSuffix;
    this.righe[index].prezzo = p.prezzo ?? 0;
    this.righe[index].iva = p.iva ?? 22;
    this.righe[index].unitaMisura = p.unitaMisura ?? '';
    this.righe[index].prodottoId = p.id ?? null;
    this.righe[index].varianteId = v?.id ?? null;
    this.righe[index].varianteTaglia = v?.taglia ?? '';
    this.righe[index].varianteColore = v?.colore ?? '';
    this.applyListino(index);
    this.loadPrezziRecenti(index);
  }

  /** Inserimento rapido da tastiera: codice (anche parziale) + Invio. */
  risolviCodiceRiga(index: number, event: Event) {
    if ((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey) return;   // Ctrl/Cmd+Invio = salva
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const q = (this.righe[index]?.codiceProdotto ?? '').toString().trim();
    if (!q) { this.searchProdotto(index); return; }
    const { exact, matches } = findProdottoByCodice(this.prodotti, q);
    if (exact) { this.applyProdottoToRiga(index, exact); this.focusNextCodice(input); }
    else if (matches.length === 1) { this.applyProdottoToRiga(index, matches[0]); this.focusNextCodice(input); }
    else if (matches.length > 1) { this.searchProdotto(index, matches); }
    else { this.searchProdotto(index); }
  }

  /** Sposta il focus al codice della riga successiva; se non esiste, ne crea una nuova. */
  // Scorciatoia: Ctrl/Cmd+Invio e Ctrl/Cmd+S salvano il documento da qualunque campo.
  @HostListener('keydown', ['$event'])
  onDialogKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.save(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.save(); }
  }

  // Marca il documento "sporco" a ogni modifica nei campi figli (gli eventi bubblano fino all'host).
  @HostListener('input')
  @HostListener('change')
  onAnyEdit(): void { this.documentDirty.setDirty(true); }

  ngOnDestroy(): void { this.documentDirty.setDirty(false); }

  /** Backspace su campo vuoto = elimina la riga corrente e torna alla precedente. */
  onCodiceBackspace(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.value !== '' || this.righe.length <= 1) return;
    event.preventDefault();
    this.removeRiga(index);
    setTimeout(() => {
      const arr = this.codiceInputs?.toArray() ?? [];
      arr[Math.max(0, index - 1)]?.nativeElement.focus();
    }, 0);
  }

  /** ↑/↓ per spostarsi tra i codici delle righe (gli input single-line non usano le frecce verticali). */
  focusSiblingCodice(event: Event, delta: number) {
    event.preventDefault();
    const inputs = this.codiceInputs?.toArray() ?? [];
    const i = inputs.findIndex(r => r.nativeElement === (event.target as HTMLInputElement));
    const target = inputs[i + delta];
    if (target) { target.nativeElement.focus(); target.nativeElement.select(); }
  }

  private focusNextCodice(current: HTMLInputElement) {
    const inputs = this.codiceInputs?.toArray() ?? [];
    const i = inputs.findIndex(r => r.nativeElement === current);
    const next = i >= 0 ? inputs[i + 1] : undefined;
    if (next) { setTimeout(() => { next.nativeElement.focus(); next.nativeElement.select(); }, 0); }
    else {
      this.addRiga();
      setTimeout(() => {
        const arr = this.codiceInputs.toArray();
        const el = arr[arr.length - 1]?.nativeElement;
        if (el) { el.focus(); el.select(); }
      }, 0);
    }
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

  addRiga() { this.righe.push({ tipo: 'PRODOTTO', descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }); this.prezziRecenti.push([]); this.prezziRecentiTutti.push([]); this.tuttiCaricati.push(false); scrollFocusLastRiga(this.codiceInputs); }
  addNota(testo: string) { this.righe.push({ tipo: 'NOTA', descrizione: testo, quantita: 0, prezzo: 0, sconto: 0, iva: 0 }); this.prezziRecenti.push([]); this.prezziRecentiTutti.push([]); this.tuttiCaricati.push(false); }
  removeRiga(i: number) { this.righe.splice(i, 1); this.prezziRecenti.splice(i, 1); this.prezziRecentiTutti.splice(i, 1); this.tuttiCaricati.splice(i, 1); }

  apriCopiaRighe() {
    const cv = this.clienteCtrl.value;
    const clienteId = cv && typeof cv !== 'string' ? (cv as Cliente).id ?? null : null;
    const clienteNome = cv && typeof cv !== 'string' ? (cv as Cliente).ragioneSociale : null;
    this.matDialog.open(CopiaRigheDialogComponent, {
      data: { clienteId, clienteNome } as CopiaRigheDialogData
    }).afterClosed().subscribe((righe: RigaDocumento[]) => {
      if (!righe?.length) return;
      if (this.righe.length === 1) {
        const r = this.righe[0];
        if (!r.descrizione?.trim() && !r.prodottoId) {
          this.righe.splice(0, 1);
          this.prezziRecenti.splice(0, 1);
          this.prezziRecentiTutti.splice(0, 1);
          this.tuttiCaricati.splice(0, 1);
        }
      }
      this.righe.push(...righe);
      this.prezziRecenti.push(...new Array(righe.length).fill([]));
      this.prezziRecentiTutti.push(...new Array(righe.length).fill([]));
      this.tuttiCaricati.push(...new Array(righe.length).fill(false));
    });
  }
  dropRiga(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.righe, event.previousIndex, event.currentIndex);
    moveItemInArray(this.prezziRecenti, event.previousIndex, event.currentIndex);
    moveItemInArray(this.prezziRecentiTutti, event.previousIndex, event.currentIndex);
    moveItemInArray(this.tuttiCaricati, event.previousIndex, event.currentIndex);
  }

  printFromDialog() { if (this.data?.id) this.printSvcDialog.printNotaCredito(this.data.id); }

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
            MatDialogModule, MatSnackBarModule, MatCheckboxModule, MatMenuModule,
            MatSortModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule, EmptyStateComponent,
            TableKeyboardNavDirective, ExportMenuComponent],
  templateUrl: './note-credito.html',
  styleUrl: './note-credito.scss'
})
export class NoteCreditoComponent implements OnInit, AfterViewInit {
  private confirm = inject(ConfirmService);
  private allNoteCredito: NotaCredito[] = [];
  dataSource = new MatTableDataSource<NotaCredito>([]);
  displayedColumns = ['select', 'numero', 'dataEmissione', 'clienteNome', 'totale', 'stato', 'azioni'];
  selection = new SelectionModel<NotaCredito>(true, []);

  readonly mesi = [{v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},{v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}];
  // Filtri multipli: array vuoto = "tutti" (si possono scegliere più anni/mesi/clienti).
  filtroAnni: number[] = [];
  filtroMesi: number[] = [];
  filtroClienti: number[] = [];

  get anni() { return [...new Set(this.allNoteCredito.map(n => +n.dataEmissione.substring(0, 4)))].sort().reverse(); }
  get clientiList() {
    const map = new Map<number, string>();
    this.allNoteCredito.forEach(n => { if (n.clienteId) map.set(n.clienteId, n.clienteNome ?? ''); });
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }
  get noteCredito() { return this.dataSource.data; }
  /** Somma dei soli documenti selezionati (per la barra totali in fondo alla lista). */
  get totaleSelezione(): number { return this.selection.selected.reduce((s, x) => s + (Number((x as any).totale) || 0), 0); }

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private printSvc: PrintService, public excel: ExcelService, private viewState: ViewStateService) {}

  // Scorciatoia: Ctrl/Cmd+N apre una nuova nota di credito (disabilitata se un dialog è già aperto).
  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
      if (this.dialog.openDialogs.length) return;
      e.preventDefault();
      this.open();
    }
  }

  ngOnInit() {
    // Ripristino filtri salvati (prima di qualunque prefill, che deve poter prevalere).
    const vs = this.viewState.read<any>('note-credito');
    if (vs) {
      if (Array.isArray(vs.filtroAnni)) this.filtroAnni = vs.filtroAnni;
      if (Array.isArray(vs.filtroMesi)) this.filtroMesi = vs.filtroMesi;
      if (Array.isArray(vs.filtroClienti)) this.filtroClienti = vs.filtroClienti;
    }
    this.load();
  }

  /** Salva filtri + ordinamento correnti per ripristinarli alla prossima apertura. */
  saveViewState(): void {
    this.viewState.write('note-credito', {
      filtroAnni: this.filtroAnni,
      filtroMesi: this.filtroMesi,
      filtroClienti: this.filtroClienti,
      sortActive: this.sort?.active ?? null,
      sortDir: this.sort?.direction ?? null,
    });
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    // Ripristino ordinamento salvato.
    const vs = this.viewState.read<any>('note-credito');
    if (vs?.sortActive) {
      this.sort.active = vs.sortActive;
      this.sort.direction = vs.sortDir ?? '';
      this.dataSource.sort = this.sort;
    }
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
    if (this.filtroAnni.length) data = data.filter(n => this.filtroAnni.includes(+n.dataEmissione.substring(0, 4)));
    if (this.filtroMesi.length) data = data.filter(n => this.filtroMesi.includes(+n.dataEmissione.substring(5, 7)));
    if (this.filtroClienti.length) data = data.filter(n => n.clienteId != null && this.filtroClienti.includes(n.clienteId));
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
    this.saveViewState();
  }

  resetFiltri() {
    this.filtroAnni = []; this.filtroMesi = []; this.filtroClienti = [];
    this.dataSource.filter = ''; this.applyFilters();
    this.saveViewState();
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

  readonly exportCols: ExcelColumn<any>[] = [
    { header: 'Numero',  field: 'numero',        width: 14 },
    { header: 'Data',    field: 'dataEmissione', width: 14 },
    { header: 'Cliente', field: 'clienteNome',   width: 30 },
    { header: 'Importo', field: 'totale',        width: 14 },
    { header: 'Stato',   field: 'stato',         width: 14 },
  ];
  /** Righe da esportare: le selezionate se ce ne sono, altrimenti tutta la lista. */
  get exportRows(): any[] { return this.selection.hasValue() ? this.selection.selected : this.dataSource.data; }

  get totaleLista(): number {
    return this.dataSource.data.reduce((s, r) => s + (Number((r as any).totale) || 0), 0);
  }

  isAllSelected() { return this.dataSource.data.length > 0 && this.selection.selected.length === this.dataSource.data.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.dataSource.data.forEach(r => this.selection.select(r)); }

  setStato(n: NotaCredito, stato: string) {
    this.ds.setNotaCreditoStato(n.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) {
    const ids = this.selection.selected.map(n => n.id!);
    if (!ids.length) return;
    forkJoin(ids.map(id => this.ds.setNotaCreditoStato(id, stato))).subscribe({
      next: () => { this.selection.clear(); this.load(); },
      error: e => this.snack.open(e?.error?.error || e?.message || 'Errore aggiornamento stato', '', { duration: 3000 })
    });
  }

  async bulkElimina() {
    const sel = this.selection.selected;
    if (!sel.length) return;
    const n = sel.length;
    if (!await this.confirm.delete(`Eliminare ${n} not${n === 1 ? 'a' : 'e'} di credito selezionat${n === 1 ? 'a' : 'e'}? L'operazione non è reversibile.`)) return;
    forkJoin(sel.map(x => this.ds.deleteNotaCredito(x.id!).pipe(catchError(err => of({ __error: err }))))).subscribe(results => {
      const errori = results.filter((r: any) => r && r.__error).length;
      this.snack.open(errori ? `${n - errori} eliminate, ${errori} non eliminabili` : `${n} note di credito eliminate`, '', { duration: 4000 });
      this.selection.clear();
      this.load();
    });
  }

  open(n?: NotaCredito) {
    const numeriEsistenti = this.allNoteCredito.filter(x => x.id !== n?.id).map(x => x.numero);
    const ref = this.dialog.open(NotaCreditoDialogComponent, {
      data: { ...(n ?? {}), numeriEsistenti }, width: '90vw', maxWidth: '1400px', maxHeight: '95vh'
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
        error: e => this.snack.open(e.error?.error || e.message, 'OK', { duration: 4000, panelClass: 'snack-error' })
      });
    });
  }

  printDoc(n: NotaCredito) { this.printSvc.printNotaCredito(n.id!); }

  inviaEmail(n: NotaCredito) {
    forkJoin({ az: this.ds.getAzienda(), clienti: this.ds.getClienti() }).subscribe(({ az, clienti }) => {
      const cliente = clienti.find(c => c.id === n.clienteId);
      const ref = this.dialog.open(EmailDialogComponent, {
        width: '560px', maxWidth: '95vw',
        data: {
          title: `Invia nota di credito n. ${n.numero}`,
          subtitle: cliente?.ragioneSociale ? `A: ${cliente.ragioneSociale}` : undefined,
          destinatario: cliente?.email || '',
          testo: az?.emailCorpoDocumento || '',
        },
      });
      ref.afterClosed().subscribe(result => {
        if (!result) return;
        this.ds.sendNotaCreditoEmail(n.id!, result.destinatario, result.testo || undefined).subscribe({
          next: () => this.snack.open('Email inviata', '', { duration: 2000 }),
          error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), '', { duration: 4000 })
        });
      });
    });
  }

  info(n: NotaCredito) {
    this.ds.getNotaCreditoPrint(n.id!).subscribe(doc => {
      const righe = doc.righe ?? [];
      const imponibile = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0);
      const ivaT = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0);
      const extra: { label: string; value: string }[] = [];
      if (doc.fatturaNumeroColl) extra.push({ label: 'Rif. Fattura', value: doc.fatturaNumeroColl });
      this.dialog.open(DocInfoDialogComponent, {
        data: {
          tipo: 'NOTA DI CREDITO', numero: doc.numero, data: doc.dataEmissione, stato: doc.stato,
          controparteLabel: 'CLIENTE',
          controparte: doc.cliente?.ragioneSociale || n.clienteNome || '—',
          controparteInfo: doc.cliente ? [
            [doc.cliente.via, [doc.cliente.cap, doc.cliente.citta].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            doc.cliente.pIva ? `P.IVA: ${doc.cliente.pIva}` : '',
          ].filter(Boolean) as string[] : [],
          totale: imponibile + ivaT, imponibile, righe, extraFields: extra, note: doc.note,
        } as DocInfoData,
        width: '720px', maxWidth: '98vw', maxHeight: '92vh',
      });
    });
  }

  duplicate(n: NotaCredito) {
    forkJoin({ full: this.ds.getNotaCreditoById(n.id!), num: this.ds.getNextNumero('note-credito') }).subscribe({
      next: ({ full, num }) => {
        const { id, ...pre } = full as any;
        pre.numero = String(num.numero);
        pre.dataEmissione = new Date().toISOString().substring(0, 10);
        pre.stato = 'EMESSA';
        pre.fatturaId = null;
        this.ds.createNotaCredito(pre).subscribe({
          next: () => { this.load(); this.snack.open(`Nota di credito duplicata (n. ${pre.numero})`, '', { duration: 2500, panelClass: 'snack-ok' }); },
          error: e => this.snack.open(e.message || 'Errore duplicazione', 'OK', { duration: 4000, panelClass: 'snack-error' })
        });
      },
      error: e => this.snack.open('Errore: ' + (e.message || ''), 'OK', { duration: 4000 })
    });
  }

  async delete(n: NotaCredito) {
    if (!await this.confirm.delete(`Eliminare Nota di Credito ${n.numero}?`)) return;
    this.ds.getNotaCreditoById(n.id!).subscribe(full => {
      this.ds.deleteNotaCredito(n.id!).subscribe(() => {
        this.load();
        const ref = this.snack.open(`Nota di Credito ${n.numero} eliminata`, 'ANNULLA', { duration: 6000, panelClass: 'snack-ok' });
        ref.onAction().subscribe(() => {
          const { id, ...payload } = full as any;
          this.ds.createNotaCredito(payload).subscribe({
            next: () => { this.load(); this.snack.open('Nota di Credito ripristinata', '', { duration: 2000, panelClass: 'snack-ok' }); },
            error: e => this.snack.open('Ripristino fallito: ' + (e.message || ''), 'OK', { duration: 4000, panelClass: 'snack-error' })
          });
        });
      });
    });
  }
}

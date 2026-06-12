import { inject, Component, OnInit, AfterViewInit, Inject, ViewChild, ViewChildren, QueryList, ElementRef, HostListener } from '@angular/core';
import { RIGHE_STYLES } from '../shared/righe-styles';
import { ConfirmService } from '../shared/confirm-dialog';
import { EmptyStateComponent } from '../shared/empty-state';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AcquistoMagazzinoDialogComponent } from './acquisto-magazzino-dialog';
import { AcquistoRegistraDialogComponent } from './acquisto-registra-dialog';
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
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';
import { consumePrefill } from '../../utils/nav-prefill';
import { PrintService } from '../../services/print.service';
import { Acquisto, Fornitore, Prodotto, RigaDocumento, TipoPagamento, UnitaMisura, NotaRapida } from '../../models';
import { findProdottoByCodice } from '../../utils/prodotto-match';
import { scrollFocusLastRiga } from '../../utils/scroll';
import { numeroUnivocoValidator } from '../../utils/numero-univoco';
import { docRigaTotale, prezzoNettoDaInput } from '../../utils/doc-calc';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';
import { DocInfoDialogComponent, DocInfoData } from '../shared/doc-info-dialog';
import { EmailDialogComponent } from '../shared/email-dialog';
import { CopiaRigheDialogComponent, CopiaRigheDialogData } from '../shared/copia-righe-dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocLockService } from '../../services/doc-lock.service';

@Component({
  selector: 'app-acquisto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule, MatMenuModule, MatTooltipModule, DragDropModule],
  template: `
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon is-info">
          <mat-icon>shopping_bag</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">
            {{ data?.id ? ('Acquisto n. ' + (data?.numero || '')) : 'Nuovo acquisto' }}
            @if (data?.id && locked) {
              <span class="dialog-lock-chip"><mat-icon>lock</mat-icon>Bloccato</span>
            }
          </span>
          <span class="dialog-hero-sub">{{ data?.id ? 'Modifica righe e dati fornitore' : 'Fattura passiva da fornitore' }}</span>
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
          <div class="form-section-header"><mat-icon>business</mat-icon><span>Intestazione</span></div>
          <div class="doc-field-grid has-2-extra" [formGroup]="form">
            <mat-form-field>
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
            <mat-form-field>
              <mat-label>Tipo pagamento</mat-label>
              <mat-select formControlName="tipoPagamentoId">
                <mat-option [value]="null">— nessuno —</mat-option>
                @for (t of tipiPagamento; track t.id) {
                  <mat-option [value]="t.id">{{ t.nome }}</mat-option>
                }
              </mat-select>
              <mat-icon matSuffix>payments</mat-icon>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Numero *</mat-label>
              <input matInput formControlName="numero">
              @if (form.get('numero')?.hasError('numeroDuplicato')) {
                <mat-error>Numero già esistente</mat-error>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Data ricezione *</mat-label>
              <input matInput type="date" formControlName="dataEmissione">
            </mat-form-field>
          </div>
        </div>

        <div class="form-section">
          <div class="righe-header">
            <div class="righe-header-title">
              <span>Righe</span>
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
                <mat-icon>content_copy</mat-icon> Copia da...
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
          <div class="righe-scroll">
          <table class="righe-table">
            <thead>
              <tr>
                <th class="td-drag"></th>
                <th class="td-desc">Codice / Descrizione</th>
                <th class="td-search"></th>
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
                    <td class="td-nota" colspan="8">
                      <input class="riga-input" [(ngModel)]="riga.descrizione" placeholder="Testo nota...">
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
                  <td class="td-sconto" [attr.data-label]="'Sconto %'"><input class="riga-input" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.sconto" (change)="clampSconto(riga)"></td>
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
export class AcquistoDialogComponent implements OnInit, AfterViewInit {
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
  /** Numeri già usati negli acquisti, con il rispettivo fornitore: per le fatture di acquisto
   *  il numero è quello del fornitore, quindi è duplicato solo se lo stesso fornitore lo riusa. */
  numeriEsistenti: { fornitoreId: number | null; numero: string }[] = [];
  fornitori: Fornitore[] = [];
  filteredFornitori: Fornitore[] = [];
  fornitoreCtrl = new FormControl<Fornitore | string | null>('');
  private currentFornitoreId(): number | null {
    const v: any = this.fornitoreCtrl.value;
    return v && typeof v === 'object' ? (v.id ?? null) : null;
  }
  private numeriEsistentiCorrente(): Set<string> {
    const fid = this.currentFornitoreId();
    return new Set(this.numeriEsistenti
      .filter(e => (e.fornitoreId ?? null) === fid)
      .map(e => (e.numero ?? '').toString().trim().toLowerCase())
      .filter(Boolean));
  }
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
    private printSvcDialog: PrintService,
    private snack: MatSnackBar,
    private docLockSvc: DocLockService,
    public dialogRef: MatDialogRef<AcquistoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Acquisto | null
  ) {
    this.locked = !!data?.id && this.docLockSvc.enabled;
    this.numeriEsistenti = (data as any)?.numeriEsistenti ?? [];
    this.form = this.fb.group({
      numero: [data?.numero ?? '', [Validators.required, numeroUnivocoValidator(() => this.numeriEsistentiCorrente())]],
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
      // il numero è duplicato solo a parità di fornitore: ricontrolla quando cambia
      this.form.get('numero')?.updateValueAndValidity({ emitEvent: false });
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
  // Scorciatoia: Ctrl/Cmd+Invio salva il documento da qualunque campo.
  @HostListener('keydown', ['$event'])
  onDialogKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.save(); }
  }

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

  printFromDialog() { if (this.data?.id) this.printSvcDialog.printAcquisto(this.data.id); }

  roundIfPz(riga: RigaDocumento) {
    if (riga.unitaMisura === 'pz') riga.quantita = Math.max(1, Math.round(riga.quantita || 1));
    else riga.quantita = Math.max(0.001, riga.quantita || 0.001);
  }
  clampSconto(riga: RigaDocumento) {
    riga.sconto = Math.min(100, Math.max(0, riga.sconto ?? 0));
  }

  addRiga() { this.righe.push({ tipo: 'PRODOTTO', codiceProdotto: '', descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }); scrollFocusLastRiga(this.codiceInputs); }
  addNota(testo: string) { this.righe.push({ tipo: 'NOTA', descrizione: testo, quantita: 0, prezzo: 0, sconto: 0, iva: 0 }); }

  apriCopiaRighe() {
    const fv = this.fornitoreCtrl.value;
    const fornitoreId = fv && typeof fv !== 'string' ? (fv as Fornitore).id ?? null : null;
    const fornitoreNome = fv && typeof fv !== 'string' ? (fv as Fornitore).ragioneSociale : null;
    this.matDialog.open(CopiaRigheDialogComponent, {
      data: { fornitoreId, fornitoreNome } as CopiaRigheDialogData
    }).afterClosed().subscribe((righe: RigaDocumento[]) => {
      if (!righe?.length) return;
      if (this.righe.length === 1) {
        const r = this.righe[0];
        if (!r.descrizione?.trim() && !r.prodottoId) this.righe.splice(0, 1);
      }
      this.righe.push(...righe);
    });
  }
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
            MatSortModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule, EmptyStateComponent],
  templateUrl: './acquisti.html',
  styleUrl: './acquisti.scss'
})
export class AcquistiComponent implements OnInit, AfterViewInit {
  private confirm = inject(ConfirmService);
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

  constructor(
    private ds: DataService,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private printSvc: PrintService,
    private api: ApiService,
  ) {}

  ngOnInit() {
    try { const s = JSON.parse(localStorage.getItem('filtri-acquisti') ?? 'null'); if (s) { this.filtroAnno = s.anno ?? null; this.filtroMese = s.mese ?? null; this.filtroFornitore = s.fornitore ?? null; } } catch {}
    // Apertura da scheda fornitore ("Acquisti" nel kebab): filtra subito su quel fornitore.
    const ff = consumePrefill<number>('filtroFornitore');
    if (ff) { this.filtroAnno = null; this.filtroMese = null; this.filtroFornitore = ff; }
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
    localStorage.setItem('filtri-acquisti', JSON.stringify({ anno: this.filtroAnno, mese: this.filtroMese, fornitore: this.filtroFornitore }));
  }

  resetFiltri() {
    this.filtroAnno = null; this.filtroMese = null; this.filtroFornitore = null;
    this.dataSource.filter = ''; localStorage.removeItem('filtri-acquisti'); this.applyFilters();
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
  bulkSetStato(stato: string) {
    const ids = this.selection.selected.map(a => a.id!);
    if (!ids.length) return;
    forkJoin(ids.map(id => this.ds.setAcquistoStato(id, stato))).subscribe({
      next: () => { this.selection.clear(); this.load(); },
      error: e => this.snack.open(e?.error?.error || e?.message || 'Errore aggiornamento stato', '', { duration: 3000 })
    });
  }

  open(a?: Acquisto) {
    const numeriEsistenti = this.allAcquisti
      .filter(x => x.id !== a?.id)
      .map(x => ({ fornitoreId: x.fornitoreId ?? null, numero: x.numero }));
    const ref = this.dialog.open(AcquistoDialogComponent, {
      data: { ...(a ?? {}), numeriEsistenti }, width: '90vw', maxWidth: '1200px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const isCreate = !result.id;
      const op = result.id ? this.ds.updateAcquisto(result) : this.ds.createAcquisto(result);
      op.subscribe({
        next: (r: any) => {
          this.load();
          this.snack.open('Salvato', '', { duration: 2000 });
          // Solo per NUOVO acquisto: proponi di generare l'arrivo merce
          if (isCreate && r?.id) {
            this.generaArrivoMerce({ ...result, id: r.id });
          }
        },
        error: e => this.snack.open(e.error?.error || e.message, 'OK', { duration: 4000, panelClass: 'snack-error' })
      });
    });
  }

  // Apre il dialog "Carica a magazzino?" che analizza le righe dell'acquisto:
  //   - matched   → prodotto già a catalogo
  //   - unmatched → propone di crearlo a catalogo + caricarlo
  //   - noCode    → riga senza codice prodotto, sarà saltata
  // Su conferma, genera arrivo merce + crea i prodotti scelti + scarica/carica magazzino.
  generaArrivoMerce(a: Acquisto) {
    if (!a.id) return;
    const ref = this.dialog.open(AcquistoMagazzinoDialogComponent, {
      data: { acquistoId: a.id, api: this.api },
      maxWidth: '90vw',
    });
    ref.afterClosed().subscribe(result => {
      if (!result?.generated) return;
      const numNuovi = result.prodottiCreati?.length || 0;
      const numRighe = result.righeTotali || 0;
      const msg = numNuovi > 0
        ? `Arrivo merce ${result.numero} creato (${numRighe} righe, ${numNuovi} prodotti nuovi)`
        : `Arrivo merce ${result.numero} creato (${numRighe} righe)`;
      this.snack.open(msg, 'OK', { duration: 4500, panelClass: 'snack-ok' });
      this.load();
    });
  }

  // "Registra": in un colpo solo registra il pagamento e carica i prodotti a
  // magazzino (come l'import di un XML). Pensato per le fatture passive ricevute.
  registra(a: Acquisto) {
    if (!a.id) return;
    const ref = this.dialog.open(AcquistoRegistraDialogComponent, {
      data: { acquistoId: a.id, api: this.api, fornitoreNome: a.fornitoreNome },
      maxWidth: '92vw',
    });
    ref.afterClosed().subscribe(result => {
      if (!result?.registered) return;
      const parts: string[] = [];
      if (result.arrivo) parts.push(`arrivo merce ${result.arrivo.numero}`);
      if (result.pagamento) parts.push(`pagamento € ${result.pagamento.importo.toFixed(2)}`);
      this.snack.open(`Registrato: ${parts.join(' + ') || 'nessuna operazione'}`, 'OK', { duration: 4500, panelClass: 'snack-ok' });
      this.load();
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
    this.ds.getAzienda().subscribe(az => {
      const fornitore = this.fornitori.find(f => f.id === a.fornitoreId);
      const ref = this.dialog.open(EmailDialogComponent, {
        width: '560px', maxWidth: '95vw',
        data: {
          title: `Invia acquisto n. ${a.numero}`,
          subtitle: fornitore?.ragioneSociale ? `A: ${fornitore.ragioneSociale}` : undefined,
          destinatario: fornitore?.email || '',
          testo: az?.emailCorpoDocumento || '',
        },
      });
      ref.afterClosed().subscribe(result => {
        if (!result) return;
        this.ds.sendAcquistoEmail(a.id!, result.destinatario, result.testo || undefined).subscribe({
          next: () => this.snack.open('Email inviata', '', { duration: 2000 }),
          error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), '', { duration: 4000 })
        });
      });
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

  duplicate(a: Acquisto) {
    forkJoin({ full: this.ds.getAcquistoById(a.id!), num: this.ds.getNextNumero('acquisti') }).subscribe({
      next: ({ full, num }) => {
        const { id, ...pre } = full as any;
        pre.numero = String(num.numero);
        pre.dataEmissione = new Date().toISOString().substring(0, 10);
        pre.stato = 'RICEVUTA';
        this.ds.createAcquisto(pre).subscribe({
          next: () => { this.load(); this.snack.open(`Acquisto duplicato (n. ${pre.numero})`, '', { duration: 2500, panelClass: 'snack-ok' }); },
          error: e => this.snack.open(e.message || 'Errore duplicazione', 'OK', { duration: 4000, panelClass: 'snack-error' })
        });
      },
      error: e => this.snack.open('Errore: ' + (e.message || ''), 'OK', { duration: 4000 })
    });
  }

  async delete(a: Acquisto) {
    if (!await this.confirm.delete(`Eliminare acquisto ${a.numero}?`)) return;
    this.ds.deleteAcquisto(a.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

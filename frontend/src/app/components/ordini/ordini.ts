import { Component, OnInit, AfterViewInit, Inject, ViewChild, ViewChildren, QueryList, ElementRef } from '@angular/core';
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
import { Ordine, Cliente, Fornitore, Prodotto, RigaDocumento, UnitaMisura, NotaRapida } from '../../models';
import { findProdottoByCodice } from '../../utils/prodotto-match';
import { docRigaTotale, prezzoNettoDaInput } from '../../utils/doc-calc';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';
import { DocInfoDialogComponent, DocInfoData } from '../shared/doc-info-dialog';
import { EmailDialogComponent } from '../shared/email-dialog';
import { CopiaRigheDialogComponent, CopiaRigheDialogData } from '../shared/copia-righe-dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocLockService } from '../../services/doc-lock.service';
import { forkJoin } from 'rxjs';

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
  .td-desc { min-width: 160px; }
  .riga-codice { font-size:11px; color:#64748b; border-bottom:none !important; border-radius:4px 4px 0 0 !important; background:#f8fafc; margin-bottom:0; }
  .td-drag { width: 28px; padding: 0 !important; cursor: grab; color: #94a3b8; }
  .cdk-drag-placeholder { opacity: 0.4; }
  .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
`;

@Component({
  selector: 'app-ordine-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatIconModule, MatButtonToggleModule, MatMenuModule, MatTooltipModule, DragDropModule],
  template: `
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);box-shadow:0 4px 12px -2px rgba(245,158,11,0.35)">
          <mat-icon>shopping_cart</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">
            {{ data?.id ? ('Ordine n. ' + (data?.numero || '')) : 'Nuovo ordine' }}
            @if (data?.id && locked) {
              <span class="dialog-lock-chip"><mat-icon>lock</mat-icon>Bloccato</span>
            }
          </span>
          <span class="dialog-hero-sub">{{ data?.id ? 'Modifica righe e intestatario' : 'Seleziona tipo e intestatario' }}</span>
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

      <form [formGroup]="form" class="dialog-form">

        <div style="display:flex;gap:12px;align-items:flex-start;padding-top:8px">
          <mat-form-field style="flex:0 0 150px">
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="tipo">
              <mat-option value="CLIENTE">Cliente</mat-option>
              <mat-option value="FORNITORE">Fornitore</mat-option>
            </mat-select>
          </mat-form-field>
          @if (form.get('tipo')?.value === 'CLIENTE') {
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
          }
          @if (form.get('tipo')?.value === 'FORNITORE') {
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
          }
          <mat-form-field style="flex:0 0 175px">
            <mat-label>Numero *</mat-label>
            <input matInput formControlName="numero">
          </mat-form-field>
          <mat-form-field style="flex:0 0 160px">
            <mat-label>Data ordine *</mat-label>
            <input matInput type="date" formControlName="dataOrdine">
          </mat-form-field>
        </div>
      </form>
      <div class="righe-section">
        <div class="righe-header">
          <b>Righe</b>
          <div style="display:flex;gap:8px;align-items:center">
            @if (!isFornitore) {
              <mat-button-toggle-group [(ngModel)]="showNetto" [hideSingleSelectionIndicator]="true">
                <mat-button-toggle [value]="false">Ivato</mat-button-toggle>
                <mat-button-toggle [value]="true">Netto</mat-button-toggle>
              </mat-button-toggle-group>
            }
            <button mat-stroked-button type="button" (click)="addRiga()">
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
              @if (isFornitore) { <th style="width:110px">Vostro codice</th> }
              <th class="td-desc">Codice / Descrizione</th>
              <th class="td-search"></th>
              @if (!isFornitore) { <th class="td-history"></th> }
              <th>Qtà</th>
              <th>UM</th>
              @if (!isFornitore) {
                <th>{{ showNetto ? 'Prezzo netto' : 'Prezzo ivato' }}</th>
                <th>Sconto%</th>
                <th>IVA%</th>
                <th>{{ showNetto ? 'Totale netto' : 'Totale ivato' }}</th>
              }
              <th></th>
            </tr>
          </thead>
          <tbody cdkDropList (cdkDropListDropped)="dropRiga($event)">
            @for (riga of righe; track $index; let rowIdx = $index) {
              @if (riga.tipo === 'NOTA') {
                <tr class="riga-nota" cdkDrag cdkDragPreviewContainer="parent">
                  <td class="td-drag" cdkDragHandle><mat-icon>drag_indicator</mat-icon></td>
                  <td [attr.colspan]="isFornitore ? 5 : 9">
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
                @if (isFornitore) {
                  <td><input class="riga-input" style="width:100px" [(ngModel)]="riga.codiceFornitore" placeholder="Cod. fornitore"></td>
                }
                <td class="td-desc" style="padding:2px">
                  <input class="riga-input riga-codice" #rigaCodice [(ngModel)]="riga.codiceProdotto" placeholder="Codice" (keydown.enter)="risolviCodiceRiga($index, $event)" (keydown.f2)="searchProdotto($index)">
                  <input class="riga-input" style="border-radius:0 0 4px 4px" [(ngModel)]="riga.descrizione" placeholder="Descrizione">
                </td>
                <td class="td-search">
                  <button mat-icon-button type="button" (click)="searchProdotto($index)" title="Cerca prodotto">
                    <mat-icon>search</mat-icon>
                  </button>
                </td>
                @if (!isFornitore) {
                  <td class="td-history">
                    @if (prezziRecenti[$index]?.length) {
                      <button mat-icon-button type="button" [matMenuTriggerFor]="menuPR" [matMenuTriggerData]="{idx: $index}" title="Prezzi recenti - questo cliente">
                        <mat-icon style="font-size:18px;color:#0e7490">history</mat-icon>
                      </button>
                    }
                    @if (riga.prodottoId) {
                      <button mat-icon-button type="button" title="Prezzi tutti i clienti" [matMenuTriggerFor]="menuTutti" (click)="loadTuttiPrezzi($index, riga.prodottoId)">
                        <mat-icon style="font-size:16px;color:#94a3b8">groups</mat-icon>
                      </button>
                      <mat-menu #menuTutti="matMenu">
                        <div style="padding:8px 16px 4px;font-size:12px;font-weight:600;color:#64748b;pointer-events:none">Tutti i clienti</div>
                        @if (!tuttiCaricati[$index]) {
                          <div style="padding:8px 16px;font-size:12px;color:#94a3b8">Clicca per caricare...</div>
                        }
                        @if (tuttiCaricati[$index] && !prezziRecentiTutti[$index]?.length) {
                          <div style="padding:8px 16px;font-size:12px;color:#94a3b8">Nessun prezzo trovato</div>
                        }
                        @for (pr of prezziRecentiTutti[rowIdx] ?? []; track $index) {
                          <button mat-menu-item type="button" (click)="usaPrezzo(rowIdx, pr.prezzo, pr.sconto)">
                            <div>
                              <span style="font-size:11px;color:#64748b;display:block">{{ pr.clienteNome ?? '' }} · {{ pr.tipo }} {{ pr.numero }} — {{ pr.dataEmissione | date:'dd/MM/yy' }}</span>
                              <b style="color:#1e293b">{{ pr.prezzoEffettivo | currency:'EUR':'symbol':'1.2-2':'it' }}</b>
                              @if (pr.sconto) { <span style="font-size:11px;color:#dc2626;margin-left:4px">(-{{ pr.sconto }}%)</span> }
                            </div>
                          </button>
                        }
                      </mat-menu>
                    }
                  </td>
                }
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
                @if (!isFornitore) {
                  <td><input class="riga-input num" type="number" min="0" step="0.01"
                    [value]="showNetto ? riga.prezzo : +(riga.prezzo * (1 + riga.iva/100)).toFixed(2)"
                    (change)="setPrezzoFromInput(riga, $event)"></td>
                  <td><input class="riga-input sconto" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.sconto"></td>
                  <td><input class="riga-input num" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.iva"></td>
                  <td style="padding:4px 8px; white-space:nowrap">
                    {{ rigaTotale(riga) | currency:'EUR':'symbol':'1.2-2':'it' }}
                  </td>
                }
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
        @if (!isFornitore) {
          <div class="righe-total">
            <span style="font-weight:400;color:#64748b;margin-right:16px">Imponibile: {{ imponibile | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
            <span style="font-weight:400;color:#64748b;margin-right:16px">IVA: {{ ivaTotal | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
            Totale: {{ totale | currency:'EUR':'symbol':'1.2-2':'it' }}
          </div>
        }
      </div>
      <div [formGroup]="form" style="margin-top:16px">
        <mat-form-field style="width:100%">
          <mat-label>Note ad uso interno</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
      </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      @if (data?.id) {
        <button mat-stroked-button type="button" (click)="esportaPdf()">
          <mat-icon>print</mat-icon> Esporta PDF
        </button>
      }
      <button mat-flat-button (click)="save()" [disabled]="form.invalid || locked"
              [matTooltip]="locked ? 'Sblocca il documento (icona lucchetto in alto) per modificarlo' : ''">Salva</button>
    </mat-dialog-actions>`,
  styles: [RIGHE_STYLES]
})
export class OrdineDialogComponent implements OnInit, AfterViewInit {
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
  clienti: Cliente[] = [];
  filteredClienti: Cliente[] = [];
  clienteCtrl = new FormControl<Cliente | string | null>('');
  fornitori: Fornitore[] = [];
  filteredFornitori: Fornitore[] = [];
  fornitoreCtrl = new FormControl<Fornitore | string | null>('');
  righe: RigaDocumento[] = [];
  noteRapideList: NotaRapida[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  prezziRecenti: any[][] = [];
  prezziRecentiTutti: any[][] = [];
  tuttiCaricati: boolean[] = [];
  readonly isNew: boolean;

  showNetto = false;
  get isFornitore() { return this.form.get('tipo')?.value === 'FORNITORE'; }
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
    public dialogRef: MatDialogRef<OrdineDialogComponent>,
    private printSvc: PrintService,
    private docLockSvc: DocLockService,
    @Inject(MAT_DIALOG_DATA) public data: Ordine | null
  ) {
    this.isNew = !data?.id;
    this.locked = !!data?.id && this.docLockSvc.enabled;
    this.form = this.fb.group({
      numero: [data?.numero ?? '', Validators.required],
      dataOrdine: [data?.dataOrdine ?? new Date().toISOString().substring(0, 10), Validators.required],
      tipo: [data?.tipo ?? 'CLIENTE'],
      note: [data?.note ?? ''],
    });
    if (data?.id) { this.ds.getOrdineById(data.id).subscribe(o => { this.righe = (o.righe ?? []).map((r: any) => ({ ...r, sconto: r.sconto ?? 0 })); this.prezziRecenti = new Array(this.righe.length).fill([]); this.prezziRecentiTutti = new Array(this.righe.length).fill([]); this.tuttiCaricati = new Array(this.righe.length).fill(false); this.righe.forEach((r, i) => { if (r.prodottoId) this.loadPrezziRecenti(i); }); }); }
    else { this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, iva: 22, sconto: 0 }]; this.prezziRecenti = [[]]; this.prezziRecentiTutti = [[]]; this.tuttiCaricati = [false]; }
  }

  ngOnInit() {
    this.clienteCtrl.valueChanges.subscribe(v => {
      const q = typeof v === 'string' ? v.toLowerCase() : '';
      this.filteredClienti = this.clienti.filter(c => c.ragioneSociale.toLowerCase().includes(q));
    });
    this.fornitoreCtrl.valueChanges.subscribe(v => {
      const q = typeof v === 'string' ? v.toLowerCase() : '';
      this.filteredFornitori = this.fornitori.filter(f => f.ragioneSociale.toLowerCase().includes(q));
    });

    this.ds.getClienti().subscribe(c => {
      this.clienti = c;
      this.filteredClienti = c;
      if (this.data?.clienteId) {
        const found = c.find(x => x.id === this.data!.clienteId);
        if (found) this.clienteCtrl.setValue(found, { emitEvent: false });
      }
    });

    this.ds.getFornitori().subscribe(f => {
      this.fornitori = f;
      this.filteredFornitori = f;
      if (this.data?.fornitoreId) {
        const found = f.find(x => x.id === this.data!.fornitoreId);
        if (found) this.fornitoreCtrl.setValue(found, { emitEvent: false });
      }
    });

    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getNoteRapide().subscribe(n => this.noteRapideList = n);

    if (this.isNew) {
      this.ds.getNextNumero('ordini').subscribe(n => this.form.patchValue({ numero: String(n.numero) }));
    }
  }

  displayCliente(c: Cliente | string | null): string {
    return c && typeof c !== 'string' ? (c as Cliente).ragioneSociale : '';
  }
  displayFornitore(f: Fornitore | string | null): string {
    return f && typeof f !== 'string' ? (f as Fornitore).ragioneSociale : '';
  }

  autoSelectCliente() {
    if (this.filteredClienti.length > 0) this.clienteCtrl.setValue(this.filteredClienti[0]);
  }
  autoSelectFornitore() {
    if (this.filteredFornitori.length > 0) this.fornitoreCtrl.setValue(this.filteredFornitori[0]);
  }

  private get selectedClienteId(): number | null {
    const v = this.clienteCtrl.value;
    return v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
  }

  @ViewChildren('rigaCodice') private codiceInputs!: QueryList<ElementRef<HTMLInputElement>>;

  ngAfterViewInit() {
    setTimeout(() => this.codiceInputs?.first?.nativeElement.focus(), 0);
  }

  searchProdotto(index: number, lista?: Prodotto[]) {
    this.matDialog.open(ProdottoPickerComponent, { width: '650px', data: lista ?? this.prodotti })
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
    if (this.isFornitore && p.codiceFornitore) {
      this.righe[index].codiceFornitore = p.codiceFornitore;
    }
    if (this.form.get('tipo')?.value === 'CLIENTE') {
      this.applyListino(index);
      this.loadPrezziRecenti(index);
    }
  }

  /** Inserimento rapido da tastiera: codice (anche parziale) + Invio. */
  risolviCodiceRiga(index: number, event: Event) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const q = (this.righe[index]?.codiceProdotto ?? '').toString().trim();
    if (!q) { this.searchProdotto(index); return; }
    const { exact, matches } = findProdottoByCodice(this.prodotti, q);
    if (exact) { this.applyProdottoToRiga(index, exact); this.focusNextCodice(input); }
    else if (matches.length === 1) { this.applyProdottoToRiga(index, matches[0]); this.focusNextCodice(input); }
    else if (matches.length > 1) { this.searchProdotto(index, matches); }
    else { this.snack.open(`Nessun prodotto per "${q}"`, '', { duration: 2200 }); }
  }

  /** Sposta il focus al codice della riga successiva; se non esiste, ne crea una nuova. */
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

  private applyListino(index: number) {
    const riga = this.righe[index];
    const clienteId = this.selectedClienteId;
    if (!clienteId || !riga.prodottoId) return;
    this.ds.resolvePrezzoCliente(clienteId, riga.prodottoId).subscribe(r => {
      if (r.sorgente === 'BASE') return;
      riga.prezzo = r.prezzo;
      riga.sconto = r.sconto;
      if (r.listinoNome) this.snack.open(`Prezzo da listino "${r.listinoNome}" applicato`, '', { duration: 2200 });
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

  apriCopiaRighe() {
    let data: CopiaRigheDialogData;
    if (this.isFornitore) {
      const fv = this.fornitoreCtrl.value;
      data = {
        fornitoreId: fv && typeof fv !== 'string' ? (fv as Fornitore).id ?? null : null,
        fornitoreNome: fv && typeof fv !== 'string' ? (fv as Fornitore).ragioneSociale : null,
      };
    } else {
      const cv = this.clienteCtrl.value;
      data = {
        clienteId: cv && typeof cv !== 'string' ? (cv as Cliente).id ?? null : null,
        clienteNome: cv && typeof cv !== 'string' ? (cv as Cliente).ragioneSociale : null,
      };
    }
    this.matDialog.open(CopiaRigheDialogComponent, { data }).afterClosed().subscribe((righe: RigaDocumento[]) => {
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
    const cv = this.clienteCtrl.value;
    const fv = this.fornitoreCtrl.value;
    const clienteId = cv && typeof cv !== 'string' ? (cv as Cliente).id ?? null : null;
    const fornitoreId = fv && typeof fv !== 'string' ? (fv as Fornitore).id ?? null : null;
    this.dialogRef.close({ ...this.data, ...this.form.value, clienteId, fornitoreId, righe: this.righe });
  }

  // Esporta il documento in PDF dal dialog (apre anteprima con bottone "Salva PDF").
  // Visibile solo per ordini già salvati (data?.id presente).
  esportaPdf() {
    if (this.data?.id) this.printSvc.printOrdine(this.data.id);
  }
}

@Component({
  selector: 'app-ordini',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule, MatMenuModule,
            MatSortModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule],
  templateUrl: './ordini.html',
  styleUrl: './ordini.scss'
})
export class OrdiniComponent implements OnInit, AfterViewInit {
  private allOrdini: Ordine[] = [];
  dataSource = new MatTableDataSource<Ordine>([]);
  displayedColumns = ['select', 'numero', 'dataOrdine', 'tipo', 'controparte', 'totale', 'stato', 'azioni'];
  selection = new SelectionModel<Ordine>(true, []);

  readonly mesi = [{v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},{v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}];
  filtroAnno: number | null = null;
  filtroMese: number | null = null;
  filtroTipo: string | null = null;

  get anni() { return [...new Set(this.allOrdini.map(o => +o.dataOrdine.substring(0, 4)))].sort().reverse(); }
  get ordini() { return this.dataSource.data; }

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private printSvc: PrintService) {}

  ngOnInit() {
    try { const s = JSON.parse(localStorage.getItem('filtri-ordini') ?? 'null'); if (s) { this.filtroAnno = s.anno ?? null; this.filtroMese = s.mese ?? null; this.filtroTipo = s.tipo ?? null; } } catch {}
    this.load();
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
        case 'dataOrdine': return item.dataOrdine ?? '';
        case 'controparte': return item.clienteNome || item.fornitoreNome || '';
        default: return (item as any)[col] ?? '';
      }
    };
    this.dataSource.filterPredicate = (item, filter) => {
      const s = filter.toLowerCase();
      return (item.numero ?? '').toLowerCase().includes(s)
          || (item.clienteNome ?? '').toLowerCase().includes(s)
          || (item.fornitoreNome ?? '').toLowerCase().includes(s)
          || (item.stato ?? '').toLowerCase().includes(s)
          || (item.tipo ?? '').toLowerCase().includes(s);
    };
  }

  load() {
    this.ds.getOrdini().subscribe(o => {
      this.allOrdini = o;
      this.applyFilters();
      this.selection.clear();
    });
  }

  applyFilters() {
    let data = this.allOrdini;
    if (this.filtroAnno) data = data.filter(o => +o.dataOrdine.substring(0, 4) === this.filtroAnno);
    if (this.filtroMese) data = data.filter(o => +o.dataOrdine.substring(5, 7) === this.filtroMese);
    if (this.filtroTipo) data = data.filter(o => o.tipo === this.filtroTipo);
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
    localStorage.setItem('filtri-ordini', JSON.stringify({ anno: this.filtroAnno, mese: this.filtroMese, tipo: this.filtroTipo }));
  }

  resetFiltri() {
    this.filtroAnno = null; this.filtroMese = null; this.filtroTipo = null;
    this.dataSource.filter = ''; localStorage.removeItem('filtri-ordini'); this.applyFilters();
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  print() {
    const rows = this.selection.hasValue() ? this.selection.selected : this.dataSource.data;
    const d = (s: string) => { const p = (s||'').substring(0,10).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'; };
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    const body = rows.map(o=>`<tr><td>${o.numero}</td><td>${d(o.dataOrdine)}</td><td>${o.tipo}</td><td>${o.clienteNome||o.fornitoreNome||'—'}</td><td class="r">${e(o.totale)}</td><td>${o.stato}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Ordini</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right;font-weight:600}</style></head><body><h1>Ordini</h1><table><thead><tr><th>Numero</th><th>Data</th><th>Tipo</th><th>Controparte</th><th class="r">Importo</th><th>Stato</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

  isAllSelected() { return this.dataSource.data.length > 0 && this.selection.selected.length === this.dataSource.data.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.dataSource.data.forEach(r => this.selection.select(r)); }

  setStato(o: Ordine, stato: string) {
    this.ds.setOrdineStato(o.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) { this.selection.selected.forEach(o => this.ds.setOrdineStato(o.id!, stato).subscribe()); this.load(); }

  open(o?: Ordine) {
    const ref = this.dialog.open(OrdineDialogComponent, {
      data: o ?? null, width: '90vw', maxWidth: '1400px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateOrdine(result) : this.ds.createOrdine(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.error?.error || e.message, 'OK', { duration: 4000, panelClass: 'snack-error' })
      });
    });
  }

  printDoc(o: Ordine) { this.printSvc.printOrdine(o.id!); }

  inviaEmail(o: Ordine) {
    const isFornitore = o.tipo === 'FORNITORE';
    const sources: any = isFornitore
      ? forkJoin({ az: this.ds.getAzienda(), parti: this.ds.getFornitori() })
      : forkJoin({ az: this.ds.getAzienda(), parti: this.ds.getClienti() });
    sources.subscribe((r: { az: any; parti: any[] }) => {
      const { az, parti } = r;
      const parte: any = parti.find((p: any) => p.id === (isFornitore ? o.fornitoreId : o.clienteId));
      const ref = this.dialog.open(EmailDialogComponent, {
        width: '560px', maxWidth: '95vw',
        data: {
          title: `Invia ordine n. ${o.numero}`,
          subtitle: parte?.ragioneSociale ? `A: ${parte.ragioneSociale}` : undefined,
          destinatario: parte?.email || '',
          testo: az?.emailCorpoDocumento || '',
        },
      });
      ref.afterClosed().subscribe(result => {
        if (!result) return;
        this.ds.sendOrdineEmail(o.id!, result.destinatario, result.testo || undefined).subscribe({
          next: () => this.snack.open('Email inviata', '', { duration: 2000 }),
          error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), '', { duration: 4000 })
        });
      });
    });
  }

  convertiInDdt(o: Ordine) {
    if (!confirm(`Convertire l'ordine ${o.numero} in DDT?`)) return;
    this.ds.ordineToDD(o.id!).subscribe({
      next: r => { this.load(); this.snack.open(`DDT ${r.numero} creato`, '', { duration: 3000 }); },
      error: e => this.snack.open(e.message || 'Errore conversione', '', { duration: 3000 }),
    });
  }

  info(o: Ordine) {
    this.ds.getOrdinePrint(o.id!).subscribe(doc => {
      const isCliente = o.tipo === 'CLIENTE';
      const righe = doc.righe ?? [];
      const imponibile = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0);
      const ivaT = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0);
      const cp = isCliente ? doc.cliente : doc.fornitore;
      this.dialog.open(DocInfoDialogComponent, {
        data: {
          tipo: 'ORDINE', sottotitolo: isCliente ? 'Ordine cliente' : 'Ordine fornitore',
          numero: doc.numero, data: doc.dataOrdine, stato: doc.stato,
          controparteLabel: isCliente ? 'CLIENTE' : 'FORNITORE',
          controparte: cp?.ragioneSociale || (isCliente ? o.clienteNome : o.fornitoreNome) || '—',
          controparteInfo: cp ? [
            [cp.via, [cp.cap, cp.citta].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            cp.pIva ? `P.IVA: ${cp.pIva}` : '',
          ].filter(Boolean) as string[] : [],
          totale: imponibile + ivaT, imponibile, righe,
          note: doc.note,
        } as DocInfoData,
        width: '720px', maxWidth: '98vw', maxHeight: '92vh',
      });
    });
  }

  delete(o: Ordine) {
    if (!confirm(`Eliminare Ordine ${o.numero}?`)) return;
    this.ds.getOrdineById(o.id!).subscribe(full => {
      this.ds.deleteOrdine(o.id!).subscribe(() => {
        this.load();
        const ref = this.snack.open(`Ordine ${o.numero} eliminato`, 'ANNULLA', { duration: 6000, panelClass: 'snack-ok' });
        ref.onAction().subscribe(() => {
          const { id, ...payload } = full as any;
          this.ds.createOrdine(payload).subscribe({
            next: () => { this.load(); this.snack.open('Ordine ripristinato', '', { duration: 2000, panelClass: 'snack-ok' }); },
            error: e => this.snack.open('Ripristino fallito: ' + (e.message || ''), 'OK', { duration: 4000, panelClass: 'snack-error' })
          });
        });
      });
    });
  }
}

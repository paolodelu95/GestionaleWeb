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
import { MatTabsModule } from '@angular/material/tabs';
import { SelectionModel } from '@angular/cdk/collections';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { Ddt, Fattura, Cliente, ClienteIndirizzo, Prodotto, RigaDocumento, UnitaMisura, NotaRapida } from '../../models';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';
import { FatturaDialogComponent } from '../fatture/fatture';
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
  .td-history { width: 28px; padding: 0 !important; }
  .righe-error { display:flex; align-items:center; gap:4px; color:#dc2626; font-size:12px; font-weight:500; }
  .righe-error mat-icon { font-size:15px; width:15px; height:15px; }
  .input-error { border-color:#dc2626 !important; }
  .colli-row { display:flex; align-items:flex-end; gap:8px; }
  .colli-calc-btn { margin-bottom:20px; flex-shrink:0; }
  .riga-nota td { background: #fefce8; }
  .riga-nota input { font-style: italic; color: #78716c; }
  .td-drag { width: 28px; padding: 0 !important; cursor: grab; color: #94a3b8; }
  .cdk-drag-placeholder { opacity: 0.4; }
  .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
`;

@Component({
  selector: 'app-ddt-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
    MatAutocompleteModule, MatTableModule, MatIconModule,
    MatButtonToggleModule, MatMenuModule, MatTabsModule, DragDropModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica DDT' : 'Nuovo DDT' }}</h2>
    <mat-dialog-content>
      <mat-tab-group>

        <!-- ── TAB 1: Documento ──────────────────────────────────── -->
        <mat-tab label="Documento">
          <div style="padding-top:16px">
            <form [formGroup]="documentoForm" class="dialog-form">
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
                    <th class="td-history"></th>
                    <th>Sconto%</th>
                    <th>IVA%</th>
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
                      <td class="td-history">
                        @if (prezziRecenti[$index]?.length) {
                          <button mat-icon-button type="button" title="Prezzi recenti - questo cliente" [matMenuTriggerFor]="menuPrezzi">
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
                            @for (pr of prezziRecentiTutti[$index] ?? []; track $index) {
                              <button mat-menu-item type="button" (click)="usaPrezzo($index, pr.prezzo, pr.sconto)">
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
                      <td><input class="riga-input sconto" type="number" min="0" max="100" step="0.1" [(ngModel)]="riga.sconto" (change)="clampSconto(riga)" placeholder="0"></td>
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
                  }
                </tbody>
              </table>
              <div class="righe-total">
                <span style="font-weight:400;color:#64748b;margin-right:16px">Imponibile: {{ imponibile | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
                <span style="font-weight:400;color:#64748b;margin-right:16px">IVA: {{ ivaTotal | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
                Totale: {{ totale | currency:'EUR':'symbol':'1.2-2':'it' }}
              </div>
            </div>

            <div [formGroup]="documentoForm" style="margin-top:16px">
              <mat-form-field style="width:100%">
                <mat-label>Note ad uso interno</mat-label>
                <textarea matInput rows="2" formControlName="note"></textarea>
              </mat-form-field>
            </div>
          </div>
        </mat-tab>

        <!-- ── TAB 2: Dati Trasporto ─────────────────────────────── -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="font-size:18px;margin-right:4px;vertical-align:middle">local_shipping</mat-icon>
            Dati Trasporto
            @if (!trasportoForm.get('dataOraInizioTrasporto')?.value) {
              <mat-icon style="font-size:16px;margin-left:6px;color:#f59e0b;vertical-align:middle">warning_amber</mat-icon>
            } @else {
              <mat-icon style="font-size:16px;margin-left:6px;color:#16a34a;vertical-align:middle">check_circle</mat-icon>
            }
          </ng-template>
          <div style="padding-top:24px">
            <form [formGroup]="trasportoForm" class="dialog-form">

              <div class="form-row">
                <mat-form-field style="flex:1.4">
                  <mat-label>Data e ora inizio trasporto *</mat-label>
                  <input matInput type="datetime-local" formControlName="dataOraInizioTrasporto">
                  @if (trasportoForm.get('dataOraInizioTrasporto')?.invalid && trasportoForm.get('dataOraInizioTrasporto')?.touched) {
                    <mat-error>Campo obbligatorio</mat-error>
                  }
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Causale</mat-label>
                  <mat-select formControlName="causaleTrasporto">
                    <mat-option value="Vendita">Vendita</mat-option>
                    <mat-option value="Reso">Reso</mat-option>
                    <mat-option value="C/Riparazione">C/Riparazione</mat-option>
                    <mat-option value="C/Conto lavoro">C/Conto lavoro</mat-option>
                    <mat-option value="C/Conto visione">C/Conto visione</mat-option>
                    <mat-option value="Omaggio">Omaggio</mat-option>
                    <mat-option value="Campioni">Campioni</mat-option>
                    <mat-option value="Esposizione">Esposizione</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="form-row">
                <mat-form-field>
                  <mat-label>Porto</mat-label>
                  <mat-select formControlName="porto">
                    <mat-option value="Franco">Franco (pagato dal mittente)</mat-option>
                    <mat-option value="Assegnato">Assegnato (pagato dal destinatario)</mat-option>
                    <mat-option value="Reso">Reso</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Aspetto dei beni</mat-label>
                  <mat-select formControlName="aspettoBeni">
                    <mat-option value="">— non specificato —</mat-option>
                    <mat-option value="A vista">A vista</mat-option>
                    <mat-option value="Scatole">Scatole</mat-option>
                    <mat-option value="Bancali">Bancali</mat-option>
                    <mat-option value="Pallet">Pallet</mat-option>
                    <mat-option value="Sacchi">Sacchi</mat-option>
                    <mat-option value="Rotoli">Rotoli</mat-option>
                    <mat-option value="Fusti">Fusti</mat-option>
                    <mat-option value="Colli">Colli</mat-option>
                    <mat-option value="Sfuso">Sfuso</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="form-row colli-row">
                <mat-form-field>
                  <mat-label>Numero colli</mat-label>
                  <input matInput type="number" min="0" formControlName="numeroColli">
                  <mat-hint>Somma quantità righe: {{ totalQuantita }}</mat-hint>
                </mat-form-field>
                <button mat-stroked-button type="button" class="colli-calc-btn" (click)="calcolaColli()" title="Calcola da righe">
                  <mat-icon>calculate</mat-icon>
                </button>
                <mat-form-field>
                  <mat-label>Peso lordo (kg)</mat-label>
                  <input matInput type="number" min="0" step="0.01" formControlName="pesoLordo">
                </mat-form-field>
              </div>

              <div class="form-row">
                <mat-form-field>
                  <mat-label>Incaricato del trasporto</mat-label>
                  <mat-select formControlName="incaricatoTrasporto">
                    <mat-option value="Mittente">Mittente</mat-option>
                    <mat-option value="Destinatario">Destinatario</mat-option>
                    <mat-option value="Corriere">Corriere / Vettore</mat-option>
                  </mat-select>
                </mat-form-field>
                @if (trasportoForm.get('incaricatoTrasporto')?.value === 'Corriere') {
                  <mat-form-field>
                    <mat-label>Nome corriere / vettore</mat-label>
                    <input matInput formControlName="vettore" placeholder="Es. GLS, BRT...">
                  </mat-form-field>
                }
              </div>

              @if (indirizziCliente.length) {
                <mat-form-field style="width:100%">
                  <mat-label>Destinazione salvata</mat-label>
                  <mat-select [(ngModel)]="destinazioneId" [ngModelOptions]="{standalone:true}" (ngModelChange)="onDestinazioneChange($event)">
                    <mat-option [value]="null">— indirizzo principale cliente —</mat-option>
                    @for (addr of indirizziCliente; track addr.id) {
                      <mat-option [value]="addr.id">{{ addr.nome }} — {{ [addr.via, addr.cap, addr.citta].filter(v => !!v).join(', ') }}</mat-option>
                    }
                    <mat-option [value]="-1">Altra destinazione (manuale)</mat-option>
                  </mat-select>
                </mat-form-field>
              }
              <mat-form-field style="width:100%">
                <mat-label>Destinazione (se diversa dall'indirizzo cliente)</mat-label>
                <input matInput formControlName="destinazioneDiversa" placeholder="Via, Città, CAP...">
              </mat-form-field>

              <mat-form-field style="width:100%">
                <mat-label>Note trasporto</mat-label>
                <textarea matInput rows="2" formControlName="noteTrasporto"></textarea>
              </mat-form-field>
            </form>
          </div>
        </mat-tab>

      </mat-tab-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button type="button" (click)="save()">
        <mat-icon>save</mat-icon> Salva DDT
      </button>
    </mat-dialog-actions>`,
  styles: [RIGHE_STYLES]
})
export class DdtDialogComponent implements OnInit {

  documentoForm: FormGroup;
  trasportoForm: FormGroup;
  clienti: Cliente[] = [];
  filteredClienti: Cliente[] = [];
  clienteCtrl = new FormControl<Cliente | string | null>('');
  righe: RigaDocumento[] = [];
  noteRapideList: NotaRapida[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  prezziRecenti: any[][] = [];
  prezziRecentiTutti: any[][] = [];
  tuttiCaricati: boolean[] = [];
  indirizziCliente: ClienteIndirizzo[] = [];
  destinazioneId: number | null = null;
  readonly isNew: boolean;

  submitted = false;
  get hasCliente(): boolean { const v = this.clienteCtrl.value; return !!(v && typeof v !== 'string'); }
  get hasRighe(): boolean { return this.righe.length > 0 && this.righe.some(r => r.descrizione?.trim()); }
  get totalQuantita(): number { return this.righe.reduce((s, r) => s + (r.quantita ?? 0), 0); }

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
    riga.prezzo = Math.max(0, this.showNetto ? v : +(v / (1 + riga.iva / 100)).toFixed(6));
  }

  loadPrezziRecenti(index: number) {
    const riga = this.righe[index];
    if (!riga.prodottoId) return;
    this.ds.getPrezziRecenti(riga.prodottoId, this.clienteId).subscribe(prezzi => {
      this.prezziRecenti[index] = prezzi;
    });
  }

  loadTuttiPrezzi(index: number, prodottoId: number | null) {
    if (!prodottoId || this.tuttiCaricati[index]) return;
    this.tuttiCaricati[index] = true;
    this.ds.getPrezziRecenti(prodottoId, null).subscribe({
      next: p => {
        const cid = this.clienteId ?? null;
        this.prezziRecentiTutti[index] = cid ? p.filter((x: any) => x.clienteId !== cid) : p;
      },
      error: () => { this.prezziRecentiTutti[index] = []; }
    });
  }

  usaPrezzo(index: number, prezzo: number, sconto: number) {
    this.righe[index].prezzo = prezzo;
    this.righe[index].sconto = sconto;
  }

  calcolaColli() {
    this.trasportoForm.patchValue({ numeroColli: Math.ceil(this.totalQuantita) });
  }

  private defaultDataOra(): string {
    const now = new Date();
    return now.toISOString().substring(0, 16);
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private matDialog: MatDialog,
    public dialogRef: MatDialogRef<DdtDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Ddt | null
  ) {
    this.isNew = !data?.id;
    this.destinazioneId = (data as any)?.destinazioneId ?? null;

    this.documentoForm = this.fb.group({
      numero: [data?.numero ?? '', Validators.required],
      dataEmissione: [data?.dataEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      note: [data?.note ?? ''],
    });

    this.trasportoForm = this.fb.group({
      dataOraInizioTrasporto: [data?.dataOraInizioTrasporto || this.defaultDataOra(), Validators.required],
      causaleTrasporto: [data?.causaleTrasporto || 'Vendita'],
      aspettoBeni: [data?.aspettoBeni || ''],
      porto: [data?.porto || 'Franco'],
      numeroColli: [data?.numeroColli ?? null],
      pesoLordo: [data?.pesoLordo ?? null],
      incaricatoTrasporto: [data?.incaricatoTrasporto || 'Mittente'],
      vettore: [data?.vettore || ''],
      destinazioneDiversa: [data?.destinazioneDiversa || ''],
      noteTrasporto: [data?.noteTrasporto || ''],
    });

    if (data?.id) {
      this.ds.getDdtById(data.id).subscribe(d => {
        this.righe = d.righe ?? [];
        this.prezziRecenti = new Array(this.righe.length).fill([]);
        this.prezziRecentiTutti = new Array(this.righe.length).fill([]);
        this.tuttiCaricati = new Array(this.righe.length).fill(false);
      });
    } else {
      this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva: 22 }];
      this.prezziRecenti = [[]];
      this.prezziRecentiTutti = [[]];
      this.tuttiCaricati = [false];
    }
  }

  onDestinazioneChange(id: number | null) {
    if (id === null) {
      this.trasportoForm.patchValue({ destinazioneDiversa: '' });
    } else if (id === -1) {
      // manual: leave destinazioneDiversa as-is
    } else {
      const addr = this.indirizziCliente.find(a => a.id === id);
      if (addr) {
        const formatted = [addr.via, addr.cap, addr.citta, addr.provincia, addr.stato !== 'Italia' ? addr.stato : ''].filter(Boolean).join(', ');
        this.trasportoForm.patchValue({ destinazioneDiversa: formatted });
      }
    }
  }

  private loadIndirizziCliente(clienteId: number | null) {
    if (!clienteId) { this.indirizziCliente = []; return; }
    this.ds.getClienteIndirizzi(clienteId).subscribe({
      next: a => this.indirizziCliente = a,
      error: () => this.indirizziCliente = [],
    });
  }

  ngOnInit() {
    this.clienteCtrl.valueChanges.subscribe(v => {
      const q = typeof v === 'string' ? v.toLowerCase() : '';
      this.filteredClienti = this.clienti.filter(c => c.ragioneSociale.toLowerCase().includes(q));
      if (v && typeof v !== 'string') {
        this.loadIndirizziCliente((v as Cliente).id ?? null);
      }
    });

    this.ds.getClienti().subscribe(c => {
      this.clienti = c;
      this.filteredClienti = c;
      if (this.data?.clienteId) {
        const found = c.find(x => x.id === this.data!.clienteId);
        if (found) {
          this.clienteCtrl.setValue(found, { emitEvent: false });
          this.loadIndirizziCliente(found.id ?? null);
        }
      }
    });

    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getNoteRapide().subscribe(n => this.noteRapideList = n);

    if (this.isNew) {
      this.ds.getNextNumero('ddt').subscribe(n => this.documentoForm.patchValue({ numero: String(n.numero) }));
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

  addRiga() {
    this.righe.push({ tipo: 'PRODOTTO', descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva: 22 });
    this.prezziRecenti.push([]);
    this.prezziRecentiTutti.push([]);
    this.tuttiCaricati.push(false);
  }
  addNota(testo: string) {
    this.righe.push({ tipo: 'NOTA', descrizione: testo, quantita: 0, prezzo: 0, sconto: 0, iva: 0 });
    this.prezziRecenti.push([]);
    this.prezziRecentiTutti.push([]);
    this.tuttiCaricati.push(false);
  }
  removeRiga(i: number) { this.righe.splice(i, 1); this.prezziRecenti.splice(i, 1); this.prezziRecentiTutti.splice(i, 1); this.tuttiCaricati.splice(i, 1); }
  dropRiga(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.righe, event.previousIndex, event.currentIndex);
    moveItemInArray(this.prezziRecenti, event.previousIndex, event.currentIndex);
    moveItemInArray(this.prezziRecentiTutti, event.previousIndex, event.currentIndex);
    moveItemInArray(this.tuttiCaricati, event.previousIndex, event.currentIndex);
  }

  save() {
    this.submitted = true;
    if (!this.documentoForm.valid || !this.hasCliente || !this.hasRighe) {
      return;
    }
    this.trasportoForm.markAllAsTouched();
    if (!this.trasportoForm.valid) return;

    this.dialogRef.close({
      ...this.data,
      ...this.documentoForm.value,
      ...this.trasportoForm.value,
      clienteId: this.clienteId,
      destinazioneId: this.destinazioneId && this.destinazioneId > 0 ? this.destinazioneId : null,
      stato: this.data?.stato ?? 'EMESSO',
      righe: this.righe,
    });
  }
}

@Component({
  selector: 'app-ddt',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatPaginatorModule, MatMenuModule, DocInfoDialogComponent],
  templateUrl: './ddt.html',
  styleUrl: './ddt.scss'
})
export class DdtComponent implements OnInit, AfterViewInit {
  private allDdt: Ddt[] = [];
  dataSource = new MatTableDataSource<Ddt>();
  displayedColumns = ['select', 'numero', 'dataEmissione', 'clienteNome', 'totale', 'stato', 'fattura', 'azioni'];
  selection = new SelectionModel<Ddt>(true, []);

  readonly mesi = [{v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},{v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}];
  filtroAnno: number | null = null;
  filtroMese: number | null = null;
  filtroCliente: number | null = null;

  get anni() { return [...new Set(this.allDdt.map(d => +d.dataEmissione.substring(0, 4)))].sort().reverse(); }
  get clientiList() {
    const map = new Map<number, string>();
    this.allDdt.forEach(d => { if (d.clienteId) map.set(d.clienteId, d.clienteNome ?? ''); });
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }
  get ddt() { return this.dataSource.data; }

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private printSvc: PrintService) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, prop) => {
      switch (prop) {
        case 'numero': { const m = (item.numero || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; }
        case 'totale': return item.totale ?? 0;
        case 'dataEmissione': return item.dataEmissione ?? '';
        default: return (item as any)[prop] ?? '';
      }
    };
    this.dataSource.filterPredicate = (data, filter) =>
      [data.numero, data.clienteNome, data.stato].some(v => v?.toLowerCase().includes(filter));
  }

  load() {
    this.ds.getDdt().subscribe(d => { this.allDdt = d; this.applyFilters(); this.selection.clear(); });
  }

  applyFilters() {
    let data = this.allDdt;
    if (this.filtroAnno) data = data.filter(d => +d.dataEmissione.substring(0, 4) === this.filtroAnno);
    if (this.filtroMese) data = data.filter(d => +d.dataEmissione.substring(5, 7) === this.filtroMese);
    if (this.filtroCliente) data = data.filter(d => d.clienteId === this.filtroCliente);
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  resetFiltri() {
    this.filtroAnno = null; this.filtroMese = null; this.filtroCliente = null;
    this.dataSource.filter = ''; this.applyFilters();
  }

  print() {
    const rows = this.selection.hasValue() ? this.selection.selected : this.dataSource.data;
    const d = (s: string) => { const p = (s||'').substring(0,10).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'; };
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    const body = rows.map(r=>`<tr><td>${r.numero}</td><td>${d(r.dataEmissione)}</td><td>${r.clienteNome||'—'}</td><td class="r">${e(r.totale)}</td><td>${r.stato}</td><td>${r.fatturaNumero||'—'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>DDT</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right;font-weight:600}</style></head><body><h1>DDT</h1><table><thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th class="r">Importo</th><th>Stato</th><th>Fattura</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
  }

  isAllSelected() { return this.dataSource.data.length > 0 && this.selection.selected.length === this.dataSource.data.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.dataSource.data.forEach(r => this.selection.select(r)); }

  setStato(d: Ddt, stato: string) {
    this.ds.setDdtStato(d.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) { this.selection.selected.forEach(d => this.ds.setDdtStato(d.id!, stato).subscribe()); this.load(); }

  printDoc(d: Ddt) { this.printSvc.printDdt(d.id!); }

  generaFattura(ddt: Ddt) {
    forkJoin({ full: this.ds.getDdtById(ddt.id!), num: this.ds.getNextNumero('fatture') }).subscribe(({ full, num }) => {
      const pre: Fattura = {
        numero: String(num.numero),
        dataEmissione: new Date().toISOString().substring(0, 10),
        clienteId: ddt.clienteId, ddtIds: [ddt.id!],
        stato: 'EMESSA', righe: full.righe,
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

  info(d: Ddt) {
    this.ds.getDdtPrint(d.id!).subscribe(doc => {
      const righe = doc.righe ?? [];
      const imponibile = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0);
      const ivaT = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0);
      const extra: { label: string; value: string }[] = [];
      if (doc.causaleTrasporto) extra.push({ label: 'Causale', value: doc.causaleTrasporto });
      if (doc.porto) extra.push({ label: 'Porto', value: doc.porto });
      if (doc.fatturaNumero) extra.push({ label: 'Fattura', value: doc.fatturaNumero });
      this.dialog.open(DocInfoDialogComponent, {
        data: {
          tipo: 'DDT', sottotitolo: 'Documento di Trasporto',
          numero: doc.numero, data: doc.dataEmissione, stato: doc.stato,
          controparteLabel: 'DESTINATARIO',
          controparte: doc.cliente?.ragioneSociale || d.clienteNome || '—',
          controparteInfo: [
            [doc.cliente?.via, [doc.cliente?.cap, doc.cliente?.citta].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            doc.cliente?.pIva ? `P.IVA: ${doc.cliente.pIva}` : '',
          ].filter(Boolean) as string[],
          totale: imponibile + ivaT, imponibile, righe, extraFields: extra, note: doc.note,
        } as DocInfoData,
        width: '720px', maxWidth: '98vw', maxHeight: '92vh',
      });
    });
  }

  delete(d: Ddt) {
    if (!confirm(`Eliminare DDT ${d.numero}?`)) return;
    this.ds.deleteDdt(d.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

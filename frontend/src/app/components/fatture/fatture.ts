import { Component, OnInit, AfterViewInit, Inject, ChangeDetectorRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';
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
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { SelectionModel } from '@angular/cdk/collections';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { Fattura, FatturaRiferimento, Cliente, Ddt, Prodotto, RigaDocumento, TipoPagamento, UnitaMisura, Pagamento, NotaRapida, AliquotaIva } from '../../models';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';
import { AllegatiComponent } from '../shared/allegati/allegati';
import { DocInfoDialogComponent, DocInfoData } from '../shared/doc-info-dialog';

interface DdtItem { ddt: any; checked: boolean; }
interface ClienteGroup { clienteId: number | null; clienteNome: string; items: DdtItem[]; tipoPagamentoId: number | null; }

@Component({
  selector: 'app-genera-fatture-da-ddt-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
            MatCheckboxModule, MatProgressSpinnerModule, MatSnackBarModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Genera Fatture da DDT</h2>
    <mat-dialog-content style="min-width:560px;max-width:700px">
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#0ea5e9 0%,#38bdf8 100%)">
          <mat-icon>receipt_long</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">Genera fatture da DDT non fatturati</span>
          <span class="dialog-hero-sub">Seleziona i DDT da includere. Verrà creata una fattura per ogni cliente.</span>
        </div>
      </div>

      @if (loading) {
        <div style="text-align:center;padding:40px">
          <mat-spinner diameter="40" style="margin:0 auto"></mat-spinner>
        </div>
      } @else if (!groups.length) {
        <div style="text-align:center;padding:40px;color:#94a3b8">
          <mat-icon style="font-size:48px;width:48px;height:48px;display:block;margin:0 auto 12px">check_circle_outline</mat-icon>
          <p style="margin:0;font-size:14px">Nessun DDT da fatturare</p>
        </div>
      } @else {
        <div class="gd-groups">
          @for (g of groups; track g.clienteId) {
            <div class="gd-group">
              <div class="gd-group-header">
                <mat-checkbox
                  [checked]="isGroupAllChecked(g)"
                  [indeterminate]="isGroupIndeterminate(g)"
                  (change)="toggleGroup(g, $event.checked)">
                </mat-checkbox>
                <mat-icon style="color:#6366f1;font-size:18px;width:18px;height:18px">person</mat-icon>
                <span class="gd-cliente">{{ g.clienteNome }}</span>
                <mat-select [(ngModel)]="g.tipoPagamentoId" class="gd-pagamento-select"
                            placeholder="Tipo pagamento">
                  <mat-option [value]="null">— non specificato —</mat-option>
                  @for (t of tipiPagamento; track t.id) {
                    <mat-option [value]="t.id">{{ t.nome }}</mat-option>
                  }
                </mat-select>
                <span class="gd-group-total">{{ groupSelectedTotal(g) | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
              </div>
              @for (item of g.items; track item.ddt.id) {
                <div class="gd-ddt-row" [class.gd-unchecked]="!item.checked">
                  <mat-checkbox [(ngModel)]="item.checked"></mat-checkbox>
                  <mat-icon style="font-size:15px;width:15px;height:15px;color:#64748b">local_shipping</mat-icon>
                  <span class="gd-ddt-num">DDT n.&nbsp;{{ item.ddt.numero }}</span>
                  <span class="gd-ddt-data">{{ item.ddt.dataEmissione | date:'dd/MM/yyyy' }}</span>
                  <span class="gd-ddt-tot">{{ item.ddt.totale | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
                </div>
              }
            </div>
          }
        </div>
        <div class="gd-summary">
          <mat-icon>info_outline</mat-icon>
          @if (selectedGroups.length) {
            Verranno generate <b>{{ selectedGroups.length }}&nbsp;fatture</b> per&nbsp;<b>{{ selectedCount }}&nbsp;DDT</b> selezionati
          } @else {
            Nessun DDT selezionato
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="generating">Annulla</button>
      <button mat-flat-button (click)="generate()"
              [disabled]="!selectedCount || generating || loading">
        @if (generating) {
          <mat-spinner diameter="16" style="display:inline-block;vertical-align:middle;margin-right:6px"></mat-spinner>
        }
        Genera {{ selectedGroups.length ? selectedGroups.length + (selectedGroups.length === 1 ? ' fattura' : ' fatture') : '' }}
      </button>
    </mat-dialog-actions>`,
  styles: [`
    .gd-groups { display:flex; flex-direction:column; gap:8px; margin:16px 0 8px; }
    .gd-group { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
    .gd-group-header { display:flex; align-items:center; gap:10px; padding:8px 14px; background:#f8fafc; font-weight:600; font-size:14px; }
    .gd-pagamento-select { font-size:12px; min-width:190px; max-width:220px; }
    .gd-cliente { flex:1; color:#1e293b; }
    .gd-group-total { font-size:13px; color:#374151; font-weight:700; }
    .gd-ddt-row { display:flex; align-items:center; gap:10px; padding:8px 14px 8px 28px; border-top:1px solid #f1f5f9; font-size:13px; transition:background 0.15s; }
    .gd-ddt-row:hover { background:#f8fafc; }
    .gd-unchecked { opacity:0.5; }
    .gd-ddt-num { font-weight:500; color:#374151; min-width:110px; }
    .gd-ddt-data { color:#64748b; flex:1; }
    .gd-ddt-tot { font-weight:600; color:#1e293b; }
    .gd-summary { display:flex; align-items:center; gap:8px; padding:10px 14px; background:#f0f9ff; border-radius:8px; font-size:13px; color:#0369a1; margin-top:8px; }
    .gd-summary mat-icon { font-size:18px; width:18px; height:18px; }
  `]
})
export class GeneraFattureDaDdtDialogComponent implements OnInit {
  groups: ClienteGroup[] = [];
  tipiPagamento: TipoPagamento[] = [];
  loading = true;
  generating = false;

  constructor(
    private ds: DataService,
    private snack: MatSnackBar,
    public dialogRef: MatDialogRef<GeneraFattureDaDdtDialogComponent>
  ) {}

  ngOnInit() {
    this.ds.getTipiPagamento().subscribe(t => {
      this.tipiPagamento = t.filter(x => x.attivo);
      if (!this.loading) this.applyDefaults();
    });
    this.ds.getDdtNonFatturati().subscribe({
      next: ddts => {
        const map = new Map<string, ClienteGroup>();
        for (const ddt of ddts) {
          const key = String(ddt.clienteId ?? 0);
          if (!map.has(key)) map.set(key, {
            clienteId: ddt.clienteId ?? null,
            clienteNome: (ddt as any).clienteNome ?? 'Senza cliente',
            items: [],
            tipoPagamentoId: (ddt as any).clienteTipoPagamentoId ?? null
          });
          map.get(key)!.items.push({ ddt, checked: true });
        }
        this.groups = [...map.values()];
        this.loading = false;
        if (this.tipiPagamento.length) this.applyDefaults();
      },
      error: () => { this.loading = false; }
    });
  }

  private applyDefaults() {
    for (const g of this.groups) {
      const preferred = g.tipoPagamentoId
        ? this.tipiPagamento.find(t => t.id === g.tipoPagamentoId)
        : null;
      // Se il cliente non ha preferenza o la preferenza è immediata (contanti/POS)
      // → cerchiamo "vista fattura": non immediato, giorni_scadenza = 0
      if (!preferred || preferred.immediato) {
        const vistaFattura = this.tipiPagamento.find(t => !t.immediato && t.giorniScadenza === 0);
        g.tipoPagamentoId = vistaFattura?.id ?? g.tipoPagamentoId;
      }
      // altrimenti manteniamo la preferenza del cliente (bonifico dilazionato, ecc.)
    }
  }

  isGroupAllChecked(g: ClienteGroup): boolean { return g.items.every(i => i.checked); }
  isGroupIndeterminate(g: ClienteGroup): boolean { const n = g.items.filter(i => i.checked).length; return n > 0 && n < g.items.length; }
  toggleGroup(g: ClienteGroup, checked: boolean) { g.items.forEach(i => i.checked = checked); }
  groupSelectedTotal(g: ClienteGroup): number { return g.items.filter(i => i.checked).reduce((s, i) => s + (i.ddt.totale ?? 0), 0); }
  get selectedGroups(): ClienteGroup[] { return this.groups.filter(g => g.items.some(i => i.checked)); }
  get selectedCount(): number { return this.groups.reduce((s, g) => s + g.items.filter(i => i.checked).length, 0); }

  generate() {
    const items = this.selectedGroups.map(g => ({
      clienteId: g.clienteId,
      ddtIds: g.items.filter(i => i.checked).map(i => i.ddt.id),
      tipoPagamentoId: g.tipoPagamentoId
    }));
    if (!items.length) return;
    this.generating = true;
    this.ds.generaFattureDaDdt(items).subscribe({
      next: result => { this.generating = false; this.dialogRef.close(result.fatture); },
      error: e => { this.generating = false; this.snack.open(e.error?.error || 'Errore generazione fatture', '', { duration: 3500 }); }
    });
  }
}

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
  .prezzo-cell { display: flex; align-items: center; gap: 2px; }
  .riga-nota td { background: #fefce8; }
  .riga-nota input { font-style: italic; color: #78716c; }
  .td-drag { width: 28px; padding: 0 !important; cursor: grab; color: #94a3b8; }
  .cdk-drag-placeholder { opacity: 0.4; }
  .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
`;

@Component({
  selector: 'app-fattura-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
            MatAutocompleteModule, MatTableModule, MatIconModule, MatTabsModule,
            MatButtonToggleModule, MatSnackBarModule, MatMenuModule, AllegatiComponent, DragDropModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica Fattura' : 'Nuova Fattura' }}</h2>
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%)">
          <mat-icon>receipt</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data?.id ? ('Fattura n. ' + (data?.numero || '')) : 'Nuova fattura' }}</span>
          <span class="dialog-hero-sub">{{ data?.id ? 'Modifica righe, pagamento e allegati' : 'Seleziona il cliente e compila le righe' }}</span>
        </div>
      </div>

      <mat-tab-group>
        <mat-tab label="Documento">
          <div style="padding-top:16px">

            <!-- ── Intestazione ──────────────────────────── -->
            <div class="form-section is-primary">
              <div class="form-section-header">
                <mat-icon>person</mat-icon>
                <span>Intestatario</span>
                <span class="section-hint">Cliente destinatario</span>
              </div>
              <mat-form-field style="width:100%">
                <mat-label>Cliente *</mat-label>
                <input matInput [matAutocomplete]="autoCliente" [formControl]="clienteCtrl"
                       (keyup.enter)="autoSelectCliente()" placeholder="Cerca cliente per ragione sociale o P.IVA..."
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

            <!-- ── Estremi documento ─────────────────────── -->
            <form [formGroup]="form" class="dialog-form">
              <div class="form-section">
                <div class="form-section-header">
                  <mat-icon>tag</mat-icon>
                  <span>Estremi documento</span>
                </div>
                <div class="form-row">
                  <mat-form-field>
                    <mat-label>Numero *</mat-label>
                    <input matInput formControlName="numero">
                    <mat-icon matSuffix>tag</mat-icon>
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>Data emissione *</mat-label>
                    <input matInput type="date" formControlName="dataEmissione">
                  </mat-form-field>
                </div>
              </div>
            </form>

            <!-- DDT collegati (visibile solo dopo aver selezionato il cliente) -->
            @if (hasCliente) {
            <div class="ddt-section">
              <div class="ddt-header">
                <span style="font-size:13px;font-weight:600;color:#374151">DDT collegati</span>
                <div style="display:flex;gap:8px;align-items:center">
                  <select class="riga-input" style="width:auto;min-width:220px" [(ngModel)]="ddtSelezione" (change)="addDdt()">
                    <option [ngValue]="null">— Collega DDT... —</option>
                    @for (d of ddtDisponibili; track d.id) {
                      <option [ngValue]="d.id">DDT {{ d.numero }} — {{ d.dataEmissione | date:'dd/MM/yy' }}</option>
                    }
                  </select>
                </div>
              </div>
              @if (linkedDdts.length) {
                <div class="ddt-chips">
                  @for (d of linkedDdts; track d.id) {
                    <span class="ddt-chip">
                      <mat-icon style="font-size:14px;width:14px;height:14px;vertical-align:middle;margin-right:4px">local_shipping</mat-icon>
                      DDT n. {{ d.numero }} del {{ d.dataEmissione | date:'dd/MM/yyyy' }}
                      <button type="button" class="chip-remove" (click)="removeDdt(d.id!)" title="Scollega DDT">×</button>
                    </span>
                  }
                </div>
              } @else {
                <p style="margin:6px 0 0;font-size:12px;color:#94a3b8">Nessun DDT collegato. Selezionane uno per importare le righe automaticamente.</p>
              }
            </div>
            }

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
                    <th style="min-width:130px">IVA</th>
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
                      <td>
                        @if (aliquoteIva.length) {
                          <select class="riga-input" style="min-width:120px"
                                  [ngModel]="riga.codiceIva || resolveAliquotaCodice(riga.iva)"
                                  (ngModelChange)="onAliquotaChange(riga, $event)">
                            @for (a of aliquoteIva; track a.id) {
                              <option [value]="a.codice">{{ a.valore }}% {{ a.codice ? '(' + a.codice + ')' : '' }}</option>
                            }
                          </select>
                        } @else {
                          <input class="riga-input num" type="number" [(ngModel)]="riga.iva">
                        }
                      </td>
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
          </div>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="font-size:18px;margin-right:4px;vertical-align:middle">payment</mat-icon>
            Pagamento
            @if (!selectedTipoPagamentoId) {
              <mat-icon style="font-size:16px;margin-left:6px;color:#f59e0b;vertical-align:middle">warning_amber</mat-icon>
            } @else {
              <mat-icon style="font-size:16px;margin-left:6px;color:#16a34a;vertical-align:middle">check_circle</mat-icon>
            }
          </ng-template>
          <div style="padding-top:24px">
            <div style="display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap">
              <div style="flex:0 0 300px">
                <mat-form-field style="width:100%">
                  <mat-label>Tipo di pagamento</mat-label>
                  <mat-select [(ngModel)]="selectedTipoPagamentoId" (ngModelChange)="onTipoPagamentoChange()">
                    <mat-option [value]="null">— non specificato —</mat-option>
                    @for (t of tipiPagamento; track t.id) {
                      <mat-option [value]="t.id">{{ t.nome }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                @if (tipoPagamentoSelezionato) {
                  <div class="pagamento-info">
                    <div class="info-row">
                      <mat-icon>{{ tipoPagamentoSelezionato.conto === 'CASSA' ? 'account_balance_wallet' : 'account_balance' }}</mat-icon>
                      <span>Conto: <b>{{ tipoPagamentoSelezionato.conto }}</b></span>
                    </div>
                    <div class="info-row">
                      <mat-icon>{{ tipoPagamentoSelezionato.immediato ? 'flash_on' : 'schedule' }}</mat-icon>
                      <span>
                        @if (tipoPagamentoSelezionato.immediato) {
                          <b>Pagamento immediato</b> — registrato automaticamente all'emissione
                        } @else if (tipoPagamentoSelezionato.giorniScadenza === 0) {
                          <b>Vista fattura</b> — inserito in scadenzario
                        } @else {
                          Scadenza: <b>{{ tipoPagamentoSelezionato.giorniScadenza }} giorni{{ tipoPagamentoSelezionato.fineMese ? ' fine mese' : '' }}</b>
                        }
                      </span>
                    </div>
                  </div>
                }
              </div>
              <div style="flex:1;min-width:300px">
                <b style="display:block;margin-bottom:12px;font-size:14px">Acconti versati</b>
                @if (!data?.id) {
                  <p style="color:#94a3b8;font-size:13px;margin:0">Salva prima il documento per aggiungere acconti.</p>
                } @else {
                  @if (pagamenti.length > 0) {
                    <table class="acconto-table">
                      <thead><tr><th>Data</th><th>Metodo</th><th>Importo</th><th>Tipo</th><th></th></tr></thead>
                      <tbody>
                        @for (p of pagamenti; track p.id) {
                          <tr>
                            <td>{{ p.dataPagamento | date:'dd/MM/yyyy' }}</td>
                            <td>{{ p.metodo }}</td>
                            <td style="font-weight:600;white-space:nowrap">{{ p.importo | currency:'EUR':'symbol':'1.2-2':'it' }}</td>
                            <td><span [class]="'tipo-badge tipo-' + (p.tipo ?? 'acconto').toLowerCase()">{{ p.tipo ?? 'ACCONTO' }}</span></td>
                            <td>
                              <button mat-icon-button color="warn" type="button" (click)="deleteAcconto(p.id!)">
                                <mat-icon>delete</mat-icon>
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  } @else {
                    <p style="color:#94a3b8;font-size:13px;margin:0 0 12px">Nessun acconto registrato.</p>
                  }
                  <div class="acconto-summary">
                    <span>Totale fattura: <b>{{ totale | currency:'EUR':'symbol':'1.2-2':'it' }}</b></span>
                    <span>Acconti: <b>{{ totalePagato | currency:'EUR':'symbol':'1.2-2':'it' }}</b></span>
                    <span [style.color]="rimanente > 0.005 ? '#dc2626' : '#16a34a'">Rimanente: <b>{{ rimanente | currency:'EUR':'symbol':'1.2-2':'it' }}</b></span>
                  </div>
                  <div class="acconto-form">
                    <input class="riga-input" type="date" [(ngModel)]="nuovoAcconto.dataPagamento">
                    <input class="riga-input num" type="number" step="0.01" min="0" [(ngModel)]="nuovoAcconto.importo" placeholder="Importo">
                    <select class="riga-input" style="width:auto" [(ngModel)]="nuovoAcconto.metodo">
                      <option value="Contanti">Contanti</option>
                      <option value="Bonifico">Bonifico</option>
                      <option value="Carta">Carta</option>
                      <option value="Assegno">Assegno</option>
                      <option value="RID">RID</option>
                      <option value="Altro">Altro</option>
                    </select>
                    <button mat-stroked-button type="button" (click)="addAcconto()">
                      <mat-icon>add</mat-icon> Aggiungi
                    </button>
                  </div>
                }
              </div>
            </div>
          </div>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="font-size:18px;margin-right:4px;vertical-align:middle">account_balance</mat-icon>
            Riferimenti
            @if (riferimenti.length) {
              <span style="background:#6366f1;color:#fff;border-radius:10px;font-size:10px;padding:1px 6px;margin-left:6px">{{ riferimenti.length }}</span>
            }
          </ng-template>
          <div style="padding-top:16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
              <div>
                <b style="font-size:14px;color:#1e293b">Documento emesso in seguito a</b>
                <p style="font-size:12px;color:#64748b;margin:4px 0 0">Per fattura PA: ordini d'acquisto, contratti, convenzioni. Ogni riga genera un blocco nel file XML SDI.</p>
              </div>
              <button mat-stroked-button type="button" (click)="addRiferimento()">
                <mat-icon>add</mat-icon> Aggiungi riga
              </button>
            </div>

            @if (!riferimenti.length) {
              <div style="text-align:center;padding:32px 0;color:#94a3b8;font-size:13px">
                <mat-icon style="display:block;font-size:40px;width:40px;height:40px;margin:0 auto 10px;opacity:.4">link</mat-icon>
                Nessun riferimento. Clicca "Aggiungi riga" per collegare un ordine, contratto o convenzione.
              </div>
            }

            @for (rif of riferimenti; track $index) {
              <div class="rif-card">
                <div class="rif-card-header">
                  <mat-icon style="font-size:16px;width:16px;height:16px;color:#6366f1">link</mat-icon>
                  <span style="font-size:13px;font-weight:600;color:#374151;flex:1">Riga {{ $index + 1 }}</span>
                  <button mat-icon-button color="warn" type="button" (click)="removeRiferimento($index)">
                    <mat-icon style="font-size:18px">delete</mat-icon>
                  </button>
                </div>
                <div class="rif-fields">
                  <div class="rif-field rif-field-tipo">
                    <label class="rif-label">Tipo documento</label>
                    <select class="riga-input" [(ngModel)]="rif.tipo">
                      @for (t of TIPI_RIF; track t.value) {
                        <option [value]="t.value">{{ t.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="rif-field rif-field-numero">
                    <label class="rif-label">Numero *</label>
                    <input class="riga-input" [(ngModel)]="rif.numero" placeholder="es. ODA-2024-001">
                  </div>
                  <div class="rif-field rif-field-data">
                    <label class="rif-label">Data</label>
                    <input class="riga-input" type="date" [(ngModel)]="rif.data">
                  </div>
                  <div class="rif-field rif-field-cig">
                    <label class="rif-label">CIG</label>
                    <input class="riga-input" [(ngModel)]="rif.cig" placeholder="es. Z123456789" style="text-transform:uppercase" (input)="rif.cig = rif.cig?.toUpperCase() ?? ''">
                  </div>
                  <div class="rif-field rif-field-cup">
                    <label class="rif-label">CUP</label>
                    <input class="riga-input" [(ngModel)]="rif.cup" placeholder="es. C57I18000050006" style="text-transform:uppercase" (input)="rif.cup = rif.cup?.toUpperCase() ?? ''">
                  </div>
                  <div class="rif-field rif-field-commessa">
                    <label class="rif-label">Commessa / Convenzione</label>
                    <input class="riga-input" [(ngModel)]="rif.commessa" placeholder="Codice commessa o convenzione">
                  </div>
                </div>
              </div>
            }
          </div>
        </mat-tab>
      </mat-tab-group>

      @if (data?.id) {
        <app-allegati [documentoTipo]="'fattura'" [documentoId]="data?.id ?? null"></app-allegati>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()">Salva</button>
    </mat-dialog-actions>`,
  styles: [RIGHE_STYLES + `
    .pagamento-info { background:#f8fafc; border-radius:8px; padding:16px; margin-top:8px; display:flex; flex-direction:column; gap:12px; }
    .info-row { display:flex; align-items:center; gap:8px; color:#374151; }
    .info-row mat-icon { color:#6366f1; font-size:20px; }
    .righe-error { display:flex; align-items:center; gap:4px; color:#dc2626; font-size:12px; font-weight:500; }
    .righe-error mat-icon { font-size:15px; width:15px; height:15px; }
    .input-error { border-color:#dc2626 !important; }
    .acconto-table { width:100%; border-collapse:collapse; margin-bottom:8px; font-size:13px; }
    .acconto-table th { background:#f8fafc; padding:6px 8px; text-align:left; border-bottom:1px solid #e2e8f0; font-size:12px; }
    .acconto-table td { padding:4px 8px; border-bottom:1px solid #f1f5f9; }
    .acconto-summary { display:flex; gap:16px; flex-wrap:wrap; padding:8px 0; font-size:13px; color:#374151; margin-bottom:12px; }
    .acconto-form { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:4px; }
    .tipo-badge { font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; background:#e2e8f0; color:#475569; }
    .tipo-automatico { background:#dbeafe; color:#1d4ed8; }
    .tipo-acconto { background:#dcfce7; color:#15803d; }
    .ddt-section { margin: 12px 0 8px; padding: 12px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .ddt-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .ddt-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .ddt-chip { display:inline-flex; align-items:center; background:#dbeafe; color:#1d4ed8; border-radius:20px; padding:4px 10px 4px 10px; font-size:12px; font-weight:500; }
    .chip-remove { background:none; border:none; cursor:pointer; color:#1d4ed8; font-size:16px; line-height:1; margin-left:6px; padding:0; opacity:0.7; }
    .chip-remove:hover { opacity:1; }
    .rif-card { border:1px solid #e2e8f0; border-radius:8px; margin-bottom:10px; overflow:hidden; }
    .rif-card-header { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f8fafc; border-bottom:1px solid #f1f5f9; }
    .rif-fields { display:flex; flex-wrap:wrap; gap:8px; padding:10px 12px; }
    .rif-field { display:flex; flex-direction:column; gap:3px; }
    .rif-field-tipo { flex:0 0 190px; }
    .rif-field-numero { flex:1; min-width:130px; }
    .rif-field-data { flex:0 0 140px; }
    .rif-field-cig { flex:0 0 130px; }
    .rif-field-cup { flex:0 0 160px; }
    .rif-field-commessa { flex:1; min-width:140px; }
    .rif-label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.4px; }
  `]
})
export class FatturaDialogComponent implements OnInit, AfterViewInit {
  form: FormGroup;
  clienti: Cliente[] = [];
  filteredClienti: Cliente[] = [];
  clienteCtrl = new FormControl<Cliente | string | null>('');
  ddts: Ddt[] = [];
  linkedDdts: Ddt[] = [];
  ddtSelezione: number | null = null;
  righe: RigaDocumento[] = [];
  noteRapideList: NotaRapida[] = [];
  prodotti: Prodotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  tipiPagamento: TipoPagamento[] = [];
  aliquoteIva: AliquotaIva[] = [];
  riferimenti: FatturaRiferimento[] = [];

  readonly TIPI_RIF = [
    { value: 'ORDINE_ACQUISTO', label: "Ordine d'acquisto" },
    { value: 'CONTRATTO',       label: 'Contratto' },
    { value: 'CONVENZIONE',     label: 'Convenzione' },
    { value: 'RICEZIONE',       label: 'Ricezione' },
    { value: 'FATTURA_COLLEGATA', label: 'Fattura collegata' },
    { value: 'DDT',             label: 'Documento di trasporto' },
  ];
  selectedTipoPagamentoId: number | null = null;
  pagamenti: Pagamento[] = [];
  prezziRecenti: any[][] = [];
  prezziRecentiTutti: any[][] = [];
  tuttiCaricati: boolean[] = [];
  nuovoAcconto = { dataPagamento: new Date().toISOString().substring(0, 10), importo: 0, metodo: 'Bonifico', note: '' };
  readonly isNew: boolean;

  submitted = false;

  get hasCliente(): boolean {
    const v = this.clienteCtrl.value;
    return !!(v && typeof v !== 'string');
  }
  get hasRighe(): boolean {
    return this.righe.length > 0 && this.righe.some(r => r.descrizione?.trim());
  }
  get canSave(): boolean {
    return this.form.valid && this.hasCliente && this.hasRighe;
  }

  get clienteId(): number | null {
    const v = this.clienteCtrl.value;
    return v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
  }

  get ddtsFiltrati(): Ddt[] {
    const cid = this.clienteId;
    return cid ? this.ddts.filter(d => d.clienteId === cid) : [];
  }

  get ddtDisponibili(): Ddt[] {
    const linkedIds = new Set(this.linkedDdts.map(d => d.id));
    const currentFatturaId = this.data?.id;
    return this.ddtsFiltrati.filter(d =>
      !linkedIds.has(d.id) && (!d.fatturaId || d.fatturaId === currentFatturaId)
    );
  }

  showNetto = false;
  get imponibile() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0); }
  get ivaTotal() { return this.righe.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0); }
  get totale() { return this.imponibile + this.ivaTotal; }
  rigaTotale(riga: RigaDocumento) {
    const net = riga.quantita * riga.prezzo * (1 - (riga.sconto ?? 0) / 100);
    return this.showNetto ? net : net * (1 + riga.iva / 100);
  }
  isRigaNota(riga: RigaDocumento) {
    return riga.tipo === 'NOTA';
  }

  get tipoPagamentoSelezionato(): TipoPagamento | null {
    return this.tipiPagamento.find(t => t.id === this.selectedTipoPagamentoId) ?? null;
  }
  get totalePagato() { return this.pagamenti.reduce((s, p) => s + p.importo, 0); }
  get rimanente() { return this.totale - this.totalePagato; }

  onTipoPagamentoChange() { /* handled by ngModel */ }

  loadPagamenti() {
    if (!this.data?.id) return;
    this.ds.getPagamenti().subscribe(ps => {
      this.pagamenti = ps.filter(p => p.fatturaId === this.data!.id);
    });
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

  addAcconto() {
    if (!this.data?.id || !this.nuovoAcconto.importo) return;
    const p: Pagamento = {
      fatturaId: this.data.id,
      dataPagamento: this.nuovoAcconto.dataPagamento,
      importo: this.nuovoAcconto.importo,
      metodo: this.nuovoAcconto.metodo,
      note: this.nuovoAcconto.note,
      tipo: 'ACCONTO',
      conto: this.tipoPagamentoSelezionato?.conto,
      tipoPagamentoId: this.selectedTipoPagamentoId,
    };
    this.ds.createPagamento(p).subscribe({
      next: () => { this.nuovoAcconto.importo = 0; this.loadPagamenti(); },
      error: e => this.snack.open(e.message || 'Errore', '', { duration: 3000 })
    });
  }

  deleteAcconto(id: number) {
    this.ds.deletePagamento(id).subscribe({
      next: () => this.loadPagamenti(),
      error: e => this.snack.open(e.message || 'Errore', '', { duration: 3000 })
    });
  }

  ngAfterViewInit() { this.cdr.detectChanges(); }

  setPrezzoFromInput(riga: RigaDocumento, event: Event) {
    const v = +(event.target as HTMLInputElement).value;
    riga.prezzo = Math.max(0, this.showNetto ? v : +(v / (1 + riga.iva / 100)).toFixed(6));
  }

  addDdt() {
    const id = this.ddtSelezione;
    if (!id) return;
    this.ddtSelezione = null;
    if (this.linkedDdts.some(d => d.id === id)) return;

    this.ds.getDdtById(id).subscribe(ddt => {
      this.linkedDdts.push(ddt);

      // Rimuove la riga placeholder vuota iniziale
      if (this.righe.length === 1) {
        const r = this.righe[0];
        if (!r.descrizione?.trim() && !r.prodottoId) {
          this.righe.splice(0, 1);
          this.prezziRecenti.splice(0, 1);
          this.prezziRecentiTutti.splice(0, 1);
          this.tuttiCaricati.splice(0, 1);
        }
      }

      const [year, month, day] = ddt.dataEmissione.split('T')[0].split('-');
      const dataFmt = `${day}/${month}/${year}`;

      // Riga di intestazione con il riferimento al DDT
      this.righe.push({ descrizione: `Riferimento DDT n. ${ddt.numero} del ${dataFmt}`, quantita: 0, prezzo: 0, sconto: 0, iva: 0, unitaMisura: '' });
      this.prezziRecenti.push([]);
      this.prezziRecentiTutti.push([]);
      this.tuttiCaricati.push(false);

      // Righe prodotti del DDT
      if (ddt.righe?.length) {
        this.righe.push(...ddt.righe.map(r => ({ ...r, id: undefined })));
        this.prezziRecenti.push(...new Array(ddt.righe.length).fill([]));
        this.prezziRecentiTutti.push(...new Array(ddt.righe.length).fill([]));
        this.tuttiCaricati.push(...new Array(ddt.righe.length).fill(false));
      }
    });
  }

  removeDdt(ddtId: number) {
    this.linkedDdts = this.linkedDdts.filter(d => d.id !== ddtId);
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private matDialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private snack: MatSnackBar,
    public dialogRef: MatDialogRef<FatturaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Fattura | null
  ) {
    this.isNew = !data?.id;
    this.selectedTipoPagamentoId = data?.tipoPagamentoId ?? null;
    this.form = this.fb.group({
      numero: [data?.numero ?? '', Validators.required],
      dataEmissione: [data?.dataEmissione ?? new Date().toISOString().substring(0, 10), Validators.required],
      note: [data?.note ?? ''],
    });
    if (data?.id) {
      this.ds.getFatturaById(data.id).subscribe(f => {
        this.righe = f.righe ?? [];
        this.riferimenti = f.riferimenti ?? [];
        this.prezziRecenti = new Array(this.righe.length).fill([]);
        this.prezziRecentiTutti = new Array(this.righe.length).fill([]);
        this.tuttiCaricati = new Array(this.righe.length).fill(false);
        if (f.ddtIds?.length) {
          f.ddtIds.forEach(ddtId => {
            this.ds.getDdtById(ddtId).subscribe(ddt => this.linkedDdts.push(ddt));
          });
        }
      });
    } else if (data?.righe?.length) {
      this.righe = [...data.righe];
      this.prezziRecenti = new Array(this.righe.length).fill([]);
      this.prezziRecentiTutti = new Array(this.righe.length).fill([]);
      this.tuttiCaricati = new Array(this.righe.length).fill(false);
      const preIds: number[] = data.ddtIds?.length ? data.ddtIds : (data.ddtId ? [data.ddtId] : []);
      preIds.forEach(id => this.ds.getDdtById(id).subscribe(ddt => this.linkedDdts.push(ddt)));
    } else {
      this.righe = [{ descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva: 22 }];
      this.prezziRecenti = [[]];
      this.prezziRecentiTutti = [[]];
      this.tuttiCaricati = [false];
    }
  }

  ngOnInit() {
    this.clienteCtrl.valueChanges.subscribe(v => {
      const q = typeof v === 'string' ? v.toLowerCase() : '';
      this.filteredClienti = this.clienti.filter(c => c.ragioneSociale.toLowerCase().includes(q));
      if (v && typeof v !== 'string' && this.isNew) {
        const c = v as Cliente;
        if (!this.selectedTipoPagamentoId && c.tipoPagamentoId)
          this.selectedTipoPagamentoId = c.tipoPagamentoId;
        // Se c'è una sola riga vuota, aggiorna l'IVA con quella del cliente
        if (c.aliquotaIvaId && this.aliquoteIva.length) {
          const aliq = this.aliquoteIva.find(a => a.id === c.aliquotaIvaId);
          if (aliq && this.righe.length === 1 && !this.righe[0].descrizione?.trim() && !this.righe[0].prodottoId) {
            this.righe[0].iva = aliq.valore;
            this.righe[0].codiceIva = aliq.codice ?? '';
          }
        }
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

    this.ds.getDdt().subscribe(d => this.ddts = d);
    this.ds.getProdotti().subscribe(p => this.prodotti = p);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter(x => x.attivo));
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
    this.ds.getNoteRapide().subscribe(n => this.noteRapideList = n);
    this.loadPagamenti();

    if (this.isNew && !this.data?.numero) {
      this.ds.getNextNumero('fatture').subscribe(n => this.form.patchValue({ numero: String(n.numero) }));
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
        const { iva, codiceIva } = this.resolveIvaPerProdotto(p.iva ?? 22);
        this.righe[index].descrizione = (p.codice ?? p.nome) + varSuffix;
        this.righe[index].prezzo = p.prezzo ?? 0;
        this.righe[index].iva = iva;
        this.righe[index].codiceIva = codiceIva;
        this.righe[index].unitaMisura = p.unitaMisura ?? '';
        this.righe[index].prodottoId = p.id ?? null;
        this.righe[index].varianteId = v?.id ?? null;
        this.righe[index].varianteTaglia = v?.taglia ?? '';
        this.righe[index].varianteColore = v?.colore ?? '';
        this.applyListino(index);
        this.loadPrezziRecenti(index);
      });
  }

  /** Risolve il prezzo del prodotto secondo il listino del cliente */
  private applyListino(index: number) {
    const riga = this.righe[index];
    const v = this.clienteCtrl.value;
    const clienteId = v && typeof v !== 'string' ? (v as Cliente).id : null;
    if (!clienteId || !riga.prodottoId) return;
    this.ds.resolvePrezzoCliente(clienteId, riga.prodottoId).subscribe(r => {
      if (r.sorgente === 'BASE') return;
      riga.prezzo = r.prezzo;
      riga.sconto = r.sconto;
      if (r.listinoNome) {
        this.snack.open(`Prezzo da listino "${r.listinoNome}" applicato`, '', { duration: 2200 });
      }
    });
  }

  roundIfPz(riga: RigaDocumento) {
    if (riga.unitaMisura === 'pz') riga.quantita = Math.max(1, Math.round(riga.quantita || 1));
    else riga.quantita = Math.max(0.001, riga.quantita || 0.001);
  }
  clampSconto(riga: RigaDocumento) {
    riga.sconto = Math.min(100, Math.max(0, riga.sconto ?? 0));
  }

  resolveAliquotaCodice(iva: number): string {
    const match = this.aliquoteIva.find(a => a.valore === iva && a.categoria === 'Imponibile');
    return match?.codice ?? this.aliquoteIva.find(a => a.valore === iva)?.codice ?? '';
  }

  onAliquotaChange(riga: RigaDocumento, codice: string) {
    const a = this.aliquoteIva.find(x => x.codice === codice);
    if (a) { riga.iva = a.valore; riga.codiceIva = a.codice; }
  }

  private getClienteAliquota(): AliquotaIva | null {
    const v = this.clienteCtrl.value;
    const cliente = v && typeof v !== 'string' ? v as Cliente : null;
    if (cliente?.aliquotaIvaId && this.aliquoteIva.length) {
      return this.aliquoteIva.find(x => x.id === cliente.aliquotaIvaId) ?? null;
    }
    return null;
  }

  private resolveIvaPerProdotto(productIva: number): { iva: number; codiceIva: string } {
    const clienteAliq = this.getClienteAliquota();

    if (!clienteAliq) {
      return { iva: productIva, codiceIva: this.resolveAliquotaCodice(productIva) };
    }

    if (clienteAliq.categoria === 'Split payment') {
      const spVariant = this.aliquoteIva.find(
        a => a.categoria === 'Split payment' && a.valore === productIva
      );
      if (spVariant) return { iva: spVariant.valore, codiceIva: spVariant.codice ?? '' };
      // variante split payment non disponibile per questo valore: usa l'aliquota del cliente
      return { iva: clienteAliq.valore, codiceIva: clienteAliq.codice ?? '' };
    }

    // cliente con aliquota non-split payment: applica l'override cliente (comportamento attuale)
    return { iva: clienteAliq.valore, codiceIva: clienteAliq.codice ?? '' };
  }

  private getClienteDefaultIva(): { iva: number; codiceIva: string } {
    const clienteAliq = this.getClienteAliquota();
    if (clienteAliq) return { iva: clienteAliq.valore, codiceIva: clienteAliq.codice ?? '' };
    return { iva: 22, codiceIva: this.resolveAliquotaCodice(22) };
  }

  addRiferimento() {
    this.riferimenti.push({ tipo: 'ORDINE_ACQUISTO', numero: '', data: '', cig: '', cup: '', commessa: '' });
  }
  removeRiferimento(i: number) { this.riferimenti.splice(i, 1); }

  addRiga() {
    const { iva, codiceIva } = this.getClienteDefaultIva();
    this.righe.push({ tipo: 'PRODOTTO', descrizione: '', quantita: 1, unitaMisura: '', prezzo: 0, sconto: 0, iva, codiceIva });
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
    if (!this.canSave) return;
    const v = this.clienteCtrl.value;
    const clienteId = v && typeof v !== 'string' ? (v as Cliente).id ?? null : null;
    this.dialogRef.close({
      ...this.data, ...this.form.value, clienteId,
      stato: this.data?.stato ?? 'EMESSA',
      tipoPagamentoId: this.selectedTipoPagamentoId,
      ddtIds: this.linkedDdts.map(d => d.id).filter(Boolean),
      righe: this.righe,
      riferimenti: this.riferimenti.filter(r => r.numero.trim())
    });
  }
}

@Component({
  selector: 'app-fatture',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatCheckboxModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatPaginatorModule, MatMenuModule, MatDividerModule, DocInfoDialogComponent,
            GeneraFattureDaDdtDialogComponent],
  templateUrl: './fatture.html',
  styleUrl: './fatture.scss'
})
export class FattureComponent implements OnInit, AfterViewInit {
  private allFatture: Fattura[] = [];
  dataSource = new MatTableDataSource<Fattura>();
  displayedColumns = ['select', 'numero', 'dataEmissione', 'clienteNome', 'totale', 'stato', 'azioni'];
  selection = new SelectionModel<Fattura>(true, []);

  readonly mesi = [{v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},{v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}];
  filtroAnno: number | null = null;
  filtroMese: number | null = null;
  filtroCliente: number | null = null;
  filtroStato: string | null = null;
  filtroDaPagare = false;

  get anni() { return [...new Set(this.allFatture.map(f => +f.dataEmissione.substring(0, 4)))].sort().reverse(); }
  get daPagareCount() { return this.allFatture.filter(f => f.stato === 'EMESSA').length; }
  get clientiList() {
    const map = new Map<number, string>();
    this.allFatture.forEach(f => { if (f.clienteId) map.set(f.clienteId, f.clienteNome ?? ''); });
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }

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
    this.ds.getFatture().subscribe(f => {
      this.allFatture = f;
      this.applyFilters();
      this.selection.clear();
    });
  }

  applyFilters() {
    let data = this.allFatture;
    if (this.filtroAnno) data = data.filter(f => +f.dataEmissione.substring(0, 4) === this.filtroAnno);
    if (this.filtroMese) data = data.filter(f => +f.dataEmissione.substring(5, 7) === this.filtroMese);
    if (this.filtroCliente) data = data.filter(f => f.clienteId === this.filtroCliente);
    if (this.filtroStato) data = data.filter(f => f.stato === this.filtroStato);
    if (this.filtroDaPagare) data = data.filter(f => f.stato === 'EMESSA');
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  resetFiltri() {
    this.filtroAnno = null; this.filtroMese = null; this.filtroCliente = null; this.filtroStato = null; this.filtroDaPagare = false;
    this.dataSource.filter = '';
    this.applyFilters();
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
  }

  print() {
    const rows = this.selection.hasValue() ? this.selection.selected : this.dataSource.data;
    const d = (s: string) => { const p = (s||'').substring(0,10).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'; };
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    const body = rows.map(f=>`<tr><td>${f.numero}</td><td>${d(f.dataEmissione)}</td><td>${f.clienteNome||'—'}</td><td class="r">${e(f.totale)}</td><td>${f.stato}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Fatture</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right;font-weight:600}</style></head><body><h1>Fatture</h1><table><thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th class="r">Importo</th><th>Stato</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

  get fatture() { return this.dataSource.data; }
  isAllSelected() { return this.allFatture.length > 0 && this.selection.selected.length === this.dataSource.data.length; }
  toggleAll() { this.isAllSelected() ? this.selection.clear() : this.dataSource.data.forEach(r => this.selection.select(r)); }

  setStato(f: Fattura, stato: string) {
    this.ds.setFatturaStato(f.id!, stato).subscribe({ next: () => this.load(), error: e => this.snack.open(e.message, '', { duration: 3000 }) });
  }
  bulkSetStato(stato: string) { this.selection.selected.forEach(f => this.ds.setFatturaStato(f.id!, stato).subscribe()); this.load(); }

  openGeneraDaDdt() {
    const ref = this.dialog.open(GeneraFattureDaDdtDialogComponent, {
      width: '700px', maxWidth: '98vw', maxHeight: '92vh'
    });
    ref.afterClosed().subscribe((result: any[]) => {
      if (!result?.length) return;
      this.load();
      this.snack.open(`${result.length} ${result.length === 1 ? 'fattura generata' : 'fatture generate'}`, '', { duration: 3000 });
    });
  }

  open(f?: Fattura) {
    const ref = this.dialog.open(FatturaDialogComponent, {
      data: f ?? null, width: '90vw', maxWidth: '1400px', maxHeight: '95vh'
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateFattura(result) : this.ds.createFattura(result);
      op.subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  printDoc(f: Fattura) { this.printSvc.printFattura(f.id!); }

  downloadXml(f: Fattura) {
    const a = document.createElement('a');
    a.href = `http://localhost:3000/api/fattura-xml/${f.id}`;
    a.download = `FatturaPA_${f.numero}.xml`;
    a.click();
  }

  inviaEmail(f: Fattura) {
    const dest = prompt(`Email destinatario per fattura n. ${f.numero}:`, '');
    if (dest === null) return;
    const note = prompt('Note aggiuntive (opzionale):', '') ?? '';
    this.ds.sendFatturaEmail(f.id!, dest || undefined, note || undefined).subscribe({
      next: () => this.snack.open('Email inviata', '', { duration: 2000 }),
      error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), '', { duration: 4000 })
    });
  }

  inviaSdi(f: Fattura) {
    if (!confirm(`Inviare la fattura n. ${f.numero} all'SDI?`)) return;
    this.ds.inviaFatturaSdi(f.id!).subscribe({
      next: r => { this.load(); this.snack.open(`Inviata all'SDI (ID: ${r.idTrasmissione})`, '', { duration: 4000 }); },
      error: e => this.snack.open('Errore SDI: ' + (e.error?.error || e.message), '', { duration: 5000 })
    });
  }

  info(f: Fattura) {
    this.ds.getFatturaPrint(f.id!).subscribe(doc => {
      const righe = doc.righe ?? [];
      const imponibile = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0);
      const ivaT = righe.reduce((s: number, r: any) => s + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100) * r.iva / 100, 0);
      const extra: { label: string; value: string }[] = [];
      if (doc.tipoPagamentoNome) extra.push({ label: 'Pagamento', value: doc.tipoPagamentoNome });
      if (doc.statoSdi) extra.push({ label: 'SDI', value: doc.statoSdi });
      this.dialog.open(DocInfoDialogComponent, {
        data: {
          tipo: 'FATTURA', numero: doc.numero, data: doc.dataEmissione, stato: doc.stato,
          controparteLabel: 'CLIENTE',
          controparte: doc.cliente?.ragioneSociale || f.clienteNome || '—',
          controparteInfo: [
            [doc.cliente?.via, [doc.cliente?.cap, doc.cliente?.citta].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            doc.cliente?.pIva ? `P.IVA: ${doc.cliente.pIva}` : '',
            doc.cliente?.email ?? '',
          ].filter(Boolean) as string[],
          totale: imponibile + ivaT,
          imponibile,
          righe,
          extraFields: extra,
          note: doc.note,
        } as DocInfoData,
        width: '720px', maxWidth: '98vw', maxHeight: '92vh',
      });
    });
  }

  delete(f: Fattura) {
    if (!confirm(`Eliminare Fattura ${f.numero}?`)) return;
    this.ds.deleteFattura(f.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

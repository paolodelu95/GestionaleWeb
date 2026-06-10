import { inject, Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { ConfirmService } from '../shared/confirm-dialog';
import { EmptyStateComponent } from '../shared/empty-state';
import { FieldHelpComponent } from '../shared/field-help';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { DataService } from '../../services/data.service';
import { ExcelService } from '../../services/excel.service';
import { Prodotto, CategoriaProdotto, UnitaMisura, AliquotaIva, Fornitore, ProdottoFornitore, CodiceAlias } from '../../models';
import { consumePrefill } from '../../utils/nav-prefill';
import { ImportMappingDialogComponent, FieldDef, MappingResult } from '../shared/import-mapping-dialog';
import { ColumnPickerComponent, ColDef } from '../shared/column-picker';
import { InfoDialogComponent, InfoDialogData } from '../shared/info-dialog';
import { QuickAddProdottoDialogComponent } from './quick-add-prodotto-dialog';
import { ImportListinoDialogComponent } from './import-listino-dialog';
import { BarcodeScannerDialogComponent } from '../shared/barcode-scanner-dialog';
import { unitaFrazionabile, stepPerUnita, arrotondaPerUnita } from '../../utils/unita';

const PRODOTTI_FIELDS: FieldDef[] = [
  { key: 'nome', label: 'Nome', required: true, aliases: [
    'Nome', 'nome', 'Prodotto', 'Articolo', 'Descrizione Articolo', 'Product Name',
    'Item Name', 'Denominazione', 'Name', 'Desc.', 'Descrizione Breve',
  ]},
  { key: 'categoria', label: 'Categoria', aliases: [
    'Categoria', 'categoria', 'Categoria Merceologica', 'Category', 'Gruppo',
    'Tipo', 'Famiglia', 'Linea',
  ]},
  { key: 'descrizione', label: 'Descrizione', aliases: [
    'Descrizione', 'descrizione', 'Descrizione Estesa', 'Note', 'Description',
    'Note Prodotto', 'Annotazioni',
  ]},
  { key: 'codice', label: 'Codice', aliases: [
    'Codice', 'codice', 'Codice Articolo', 'Cod. Articolo', 'SKU', 'Cod.',
    'Item Code', 'Codice Prodotto', 'Art.', 'Articolo', 'Riferimento',
  ]},
  { key: 'codiceFornitore', label: 'Codice Fornitore', aliases: [
    'Codice Fornitore', 'codiceFornitore', 'Cod. Fornitore', 'Supplier Code',
    'Codice Interno Fornitore', 'Ref. Fornitore',
  ]},
  { key: 'barcode', label: 'Barcode', aliases: [
    'Barcode', 'barcode', 'EAN', 'EAN13', 'Codice a Barre', 'UPC', 'GTIN',
    'Cod. Barre', 'EAN-13',
  ]},
  { key: 'prezzo', label: 'Prezzo vendita', type: 'number', aliases: [
    'Prezzo vendita', 'Prezzo', 'prezzo', 'Prezzo di Vendita', 'Prezzo Vendita',
    'Selling Price', 'Price', 'Listino', 'Prezzo al pubblico', 'Prezzo Cliente',
  ]},
  { key: 'prezzoAcquisto', label: 'Prezzo acquisto', type: 'number', aliases: [
    'Prezzo acquisto', 'prezzoAcquisto', 'Prezzo di Acquisto', 'Costo',
    'Purchase Price', 'Cost', 'Costo Acquisto', 'Prezzo Fornitore',
  ]},
  { key: 'iva', label: 'IVA (%)', type: 'number', defaultValue: 22, aliases: [
    'IVA', 'iva', 'Aliquota IVA', 'VAT Rate', 'IVA %', 'IVA%', 'Aliquota',
  ]},
  { key: 'quantita', label: 'Quantità', type: 'integer', defaultValue: 0, aliases: [
    'Quantità', 'quantita', 'Qty', 'Quantity', 'Giacenza', 'Stock',
    'Disponibile', 'Qtà', 'Qta', 'Scorta',
  ]},
  { key: 'sogliaMinima', label: 'Soglia Minima', type: 'integer', defaultValue: 0, aliases: [
    'Soglia Minima', 'sogliaMinima', 'Riordino', 'Min Stock', 'Minimo',
    'Stock Minimo', 'Soglia di Riordino', 'Scorta Minima',
  ]},
  { key: 'unitaMisura', label: 'Unità Misura', defaultValue: 'pz', aliases: [
    'Unità Misura', 'unitaMisura', 'U.M.', 'UM', 'UdM', 'Unit',
    'Unit of Measure', 'Unita di Misura', 'Unità di misura',
  ]},
];

// ── Dialog ──────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-prodotto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatSelectModule, MatAutocompleteModule, MatButtonModule,
            MatIconModule, MatCheckboxModule, MatButtonToggleModule, MatTooltipModule, FieldHelpComponent],
  template: `
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);box-shadow:0 4px 12px -2px rgba(16,185,129,0.35)">
          <mat-icon>inventory_2</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data ? data.nome : 'Nuovo prodotto' }}</span>
          <span class="dialog-hero-sub">{{ data ? 'Modifica anagrafica e prezzi' : 'Aggiungi un articolo al catalogo' }}</span>
        </div>
      </div>

      <form [formGroup]="form" class="dialog-form">

        <!-- ── Identità prodotto ────────────────────────── -->
        <div class="form-section is-primary">
          <div class="form-section-header">
            <mat-icon>label</mat-icon>
            <span>Identità prodotto</span>
            <span class="section-hint">Dati di riconoscimento</span>
          </div>
          <mat-form-field style="width:100%"><mat-label>Nome *</mat-label>
            <input matInput formControlName="nome" placeholder="es. Maglietta cotone manica corta"></mat-form-field>
          <div class="form-row">
            <mat-form-field><mat-label>Codice interno</mat-label>
              <input matInput formControlName="codice"></mat-form-field>
            <mat-form-field>
              <mat-label>Categoria</mat-label>
              <mat-select formControlName="categoria">
                <mat-option value="">— nessuna —</mat-option>
                @for (c of categorie; track c.id) {
                  <mat-option [value]="c.nome">{{ c.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <div class="form-row">
            <div class="input-with-action" style="flex:1">
              <mat-form-field>
                <mat-label>Barcode</mat-label>
                <input matInput formControlName="barcode" placeholder="Scansiona o digita...">
              </mat-form-field>
              <button mat-icon-button type="button" matTooltip="Scansiona barcode con la fotocamera"
                      (click)="scannerBarcode()">
                <mat-icon>qr_code_scanner</mat-icon>
              </button>
            </div>
          </div>
        </div>

        <!-- ── Prezzi & IVA ─────────────────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>sell</mat-icon>
            <span>Prezzi & IVA</span>
            <span class="section-hint">
              <mat-button-toggle-group [value]="prezzoMode" (change)="onPrezzoModeChange($event.value)"
                                      [hideSingleSelectionIndicator]="true" class="prezzo-mode-toggle">
                <mat-button-toggle value="netto">Netto</mat-button-toggle>
                <mat-button-toggle value="ivato">Ivato</mat-button-toggle>
              </mat-button-toggle-group>
            </span>
          </div>
          <div class="form-row">
            <mat-form-field>
              <mat-label>IVA</mat-label>
              <mat-select formControlName="iva">
                @for (a of aliquoteIva; track a.id) {
                  <mat-option [value]="a.valore">{{ a.nome }} – {{ a.valore }}%</mat-option>
                }
              </mat-select>
              <app-field-help matSuffix term="aliquotaIva" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Unità misura</mat-label>
              <mat-select formControlName="unitaMisura">
                @for (u of unitaMisura; track u.id) {
                  <mat-option [value]="u.simbolo">{{ u.nome }} ({{ u.simbolo }})</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <div class="form-row" style="align-items:flex-start">
            <mat-form-field>
              <mat-label>Prezzo vendita ({{ prezzoMode }}) €</mat-label>
              <input matInput type="number" step="0.01" min="0"
                     [value]="prezzoDisplay('prezzo')"
                     (input)="onPrezzoInput('prezzo', $event)">
              <mat-icon matSuffix>euro</mat-icon>
              @if (prezzoMode === 'ivato') {
                <mat-hint>Netto: {{ form.value.prezzo | number:'1.4-4' }} €</mat-hint>
              } @else {
                <mat-hint>Ivato: {{ prezzoIvato('prezzo') | number:'1.2-2' }} €</mat-hint>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Prezzo acquisto ({{ prezzoMode }}) €</mat-label>
              <input matInput type="number" step="0.01" min="0"
                     [value]="prezzoDisplay('prezzoAcquisto')"
                     (input)="onPrezzoInput('prezzoAcquisto', $event)">
              <mat-icon matSuffix>shopping_cart</mat-icon>
              @if (margine !== null) {
                <mat-hint>Margine: <b [style.color]="margine >= 0 ? '#10b981' : '#ef4444'">{{ margine | number:'1.1-1' }}%</b></mat-hint>
              } @else {
                <mat-hint>Per calcolo margini</mat-hint>
              }
            </mat-form-field>
          </div>
        </div>

        <!-- ── Fornitori ────────────────────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>local_shipping</mat-icon>
            <span>Fornitori</span>
            <span class="section-hint">Codice e prezzo per ciascun fornitore</span>
          </div>
          @for (f of fornitori; track $index) {
            <div class="form-row" style="align-items:flex-start;gap:8px">
              <mat-form-field style="flex:2">
                <mat-label>Fornitore</mat-label>
                <input matInput [matAutocomplete]="autoForn"
                       [(ngModel)]="f.cercaFornitore" [ngModelOptions]="{ standalone: true }"
                       (focus)="$any($event.target).select()" (blur)="syncFornitoreText(f)"
                       placeholder="Cerca per nome, P.IVA o città...">
                <mat-icon matSuffix>search</mat-icon>
                <mat-autocomplete #autoForn="matAutocomplete"
                                  (optionSelected)="onFornitorePick(f, $event.option.value)">
                  @for (fo of filtraFornitori(f.cercaFornitore); track fo.id) {
                    <mat-option [value]="fo">
                      <span style="font-weight:600">{{ fo.ragioneSociale }}</span>
                      @if (fo.citta) { <span style="color:#94a3b8;margin-left:8px;font-size:12px">{{ fo.citta }}</span> }
                    </mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>
              <mat-form-field style="flex:1">
                <mat-label>Codice</mat-label>
                <input matInput [(ngModel)]="f.codiceFornitore" [ngModelOptions]="{ standalone: true }" placeholder="Codice del fornitore">
              </mat-form-field>
              <mat-form-field style="flex:1">
                <mat-label>Prezzo netto €</mat-label>
                <input matInput type="number" step="0.01" min="0" [(ngModel)]="f.prezzoAcquisto" [ngModelOptions]="{ standalone: true }">
              </mat-form-field>
              <button mat-icon-button type="button" style="margin-top:6px"
                      [color]="f.predefinito ? 'primary' : undefined"
                      [title]="f.predefinito ? 'Fornitore predefinito' : 'Imposta come predefinito'"
                      (click)="setPredefinito($index)">
                <mat-icon>{{ f.predefinito ? 'star' : 'star_border' }}</mat-icon>
              </button>
              <button mat-icon-button type="button" style="margin-top:6px" title="Rimuovi fornitore" (click)="removeFornitore($index)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
          <button mat-stroked-button type="button" (click)="addFornitore()">
            <mat-icon>add</mat-icon> Aggiungi fornitore
          </button>
          @if (!fornitori.length) {
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">
              Aggiungi i fornitori da cui acquisti questo prodotto, ciascuno col proprio codice. Negli ordini il prodotto userà il codice del fornitore scelto.
            </div>
          }

          @if (codiciAlias.length) {
            <div style="margin-top:14px">
              <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px;display:flex;align-items:center;gap:6px">
                <mat-icon style="font-size:15px;width:15px;height:15px">bookmark</mat-icon> Codici memorizzati
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);margin:2px 0 8px">
                Codici riconosciuti automaticamente nei prossimi import listino. Rimuovi quelli sbagliati.
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                @for (a of codiciAlias; track a.id) {
                  <span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:99px;padding:3px 6px 3px 10px;font-size:12px;background:var(--surface-2, transparent)">
                    <span style="font-family:monospace;font-weight:700;color:var(--primary)">{{ a.codice }}</span>
                    @if (a.fornitoreNome) { <span style="color:var(--text-tertiary)">· {{ a.fornitoreNome }}</span> }
                    <button mat-icon-button type="button" title="Rimuovi codice memorizzato"
                            style="width:22px;height:22px;line-height:22px" (click)="removeCodiceAlias(a)">
                      <mat-icon style="font-size:15px;width:15px;height:15px">close</mat-icon>
                    </button>
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- ── Magazzino ────────────────────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>warehouse</mat-icon>
            <span>Magazzino</span>
            <span class="section-hint">Disponibilità e scorte</span>
          </div>
          <div>
            <mat-checkbox formControlName="haVarianti">Gestisci taglie / colori</mat-checkbox>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;padding-left:32px">Se attivo, la quantità è gestita per variante</div>
          </div>
          @if (!form.value.haVarianti) {
            <div class="form-row">
              <mat-form-field><mat-label>Quantità</mat-label>
                <input matInput type="number" formControlName="quantita">
                <mat-icon matSuffix>inventory</mat-icon>
              </mat-form-field>
              <mat-form-field><mat-label>Soglia minima</mat-label>
                <input matInput type="number" min="0" step="1" formControlName="sogliaMinima"
                       placeholder="Nessun avviso">
                <mat-icon matSuffix>warning</mat-icon>
                <mat-hint>Lascia vuoto per non ricevere avvisi (es. articoli su ordinazione)</mat-hint>
              </mat-form-field>
            </div>
          }
        </div>

        <!-- ── Descrizione ──────────────────────────────── -->
        <div class="form-section is-flat">
          <div class="form-section-header">
            <mat-icon>description</mat-icon>
            <span>Descrizione</span>
          </div>
          <mat-form-field style="width:100%"><mat-label>Descrizione</mat-label>
            <textarea matInput rows="2" formControlName="descrizione" placeholder="Note descrittive opzionali"></textarea></mat-form-field>
        </div>

        @if (form.value.haVarianti) {
          <div class="varianti-box">
            <div class="varianti-header">
              <span class="varianti-title">Varianti (Taglie / Colori)</span>
              <button mat-stroked-button type="button" (click)="addVariante()">
                <mat-icon>add</mat-icon> Aggiungi variante
              </button>
            </div>
            <div class="var-table-wrap">
            <table class="var-table">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Taglia</th>
                  <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Colore</th>
                  <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Qtà</th>
                  <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Barcode variante</th>
                  <th style="width:44px;border-bottom:2px solid #e2e8f0"></th>
                </tr>
              </thead>
              <tbody>
                @for (v of varianti; track $index; let i = $index) {
                  <tr>
                    <td style="padding:4px 4px">
                      <input class="var-input" [(ngModel)]="v.taglia" [ngModelOptions]="{standalone:true}" placeholder="es. M, L, 42…">
                    </td>
                    <td style="padding:4px 4px">
                      <input class="var-input" [(ngModel)]="v.colore" [ngModelOptions]="{standalone:true}" placeholder="es. Rosso…">
                    </td>
                    <td style="padding:4px 4px">
                      <input class="var-input num" type="number" min="0" step="1"
                             [(ngModel)]="v.quantita" [ngModelOptions]="{standalone:true}">
                    </td>
                    <td style="padding:4px 4px">
                      <input class="var-input" [(ngModel)]="v.barcode" [ngModelOptions]="{standalone:true}" placeholder="Barcode…">
                    </td>
                    <td style="padding:4px 4px">
                      <button mat-icon-button type="button" color="warn" (click)="removeVariante(i)">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
                @if (!varianti.length) {
                  <tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8;font-size:13px">
                    Nessuna variante — clicca "Aggiungi variante"
                  </td></tr>
                }
              </tbody>
            </table>
            </div>
            @if (varianti.length) {
              <div style="text-align:right;padding-top:8px;font-size:12px;color:#64748b">
                Totale quantità: <b style="color:#1e293b">{{ totaleVarianti }}</b>
              </div>
            }
          </div>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`,
  styles: [`
    .var-input { border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;font-size:13px;width:100%;box-sizing:border-box; }
    .var-input:focus { outline:none;border-color:#0e6480; }
    .var-input.num { width:70px;text-align:right; }
    .varianti-box { margin-top:12px;border:1px solid #e2e8f0;border-radius:10px;padding:16px; }
    .varianti-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:10px; }
    .varianti-title { font-size:12px;font-weight:700;color:#0e6480;text-transform:uppercase;letter-spacing:.5px; }
    .var-table-wrap { overflow-x:auto; }
    .var-table { width:100%;border-collapse:collapse;min-width:420px; }
    .prezzo-mode-toggle ::ng-deep .mat-button-toggle { font-size:11px; }
    .prezzo-mode-toggle ::ng-deep .mat-button-toggle-button { height:24px; padding:0 10px; line-height:24px; }
    .prezzo-mode-toggle ::ng-deep .mat-button-toggle-label-content { line-height:24px; padding:0; font-weight:600; }
  `]
})
export class ProdottoDialogComponent implements OnInit {
  form: FormGroup;
  categorie: CategoriaProdotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  aliquoteIva: AliquotaIva[] = [];
  varianti: { id?: number; taglia: string; colore: string; quantita: number; barcode: string }[] = [];
  fornitori: (ProdottoFornitore & { cercaFornitore?: string })[] = [];
  fornitoriList: Fornitore[] = [];
  codiciAlias: CodiceAlias[] = [];

  prezzoMode: 'netto' | 'ivato' = (localStorage.getItem('prodotto-prezzo-mode') as 'netto' | 'ivato') ?? 'netto';

  get totaleVarianti() { return this.varianti.reduce((s, v) => s + (v.quantita || 0), 0); }

  get margine(): number | null {
    const v = +(this.form.get('prezzo')?.value ?? 0);
    const a = +(this.form.get('prezzoAcquisto')?.value ?? 0);
    if (!v || !a) return null;
    return ((v - a) / v) * 100;
  }

  prezzoDisplay(field: 'prezzo' | 'prezzoAcquisto'): number {
    const net = +(this.form.get(field)?.value ?? 0);
    const iva = +(this.form.get('iva')?.value ?? 0);
    if (!net) return 0;
    if (this.prezzoMode === 'ivato') return +(net * (1 + iva / 100)).toFixed(2);
    return +net.toFixed(2);
  }

  prezzoIvato(field: 'prezzo' | 'prezzoAcquisto'): number {
    const net = +(this.form.get(field)?.value ?? 0);
    const iva = +(this.form.get('iva')?.value ?? 0);
    return +(net * (1 + iva / 100)).toFixed(2);
  }

  onPrezzoInput(field: 'prezzo' | 'prezzoAcquisto', e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    const val = parseFloat(raw);
    if (isNaN(val)) { this.form.get(field)?.setValue(null); return; }
    const iva = +(this.form.get('iva')?.value ?? 0);
    const net = this.prezzoMode === 'ivato' ? val / (1 + iva / 100) : val;
    this.form.get(field)?.setValue(+net.toFixed(4));
  }

  onPrezzoModeChange(mode: 'netto' | 'ivato') {
    this.prezzoMode = mode;
    localStorage.setItem('prodotto-prezzo-mode', mode);
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private dialog: MatDialog,
    private confirm: ConfirmService,
    public dialogRef: MatDialogRef<ProdottoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Prodotto | null
  ) {
    this.form = this.fb.group({
      nome:         [data?.nome ?? '', Validators.required],
      categoria:    [data?.categoria ?? ''],
      codice:          [data?.codice ?? ''],
      barcode:         [data?.barcode ?? ''],
      unitaMisura:  [data?.unitaMisura ?? 'pz'],
      prezzo:         [data?.prezzo ?? 0, [Validators.min(0)]],
      prezzoAcquisto: [data?.prezzoAcquisto ?? null, [Validators.min(0)]],
      iva:            [data?.iva ?? 22, [Validators.min(0), Validators.max(100)]],
      quantita:     [data?.quantita ?? 0, [Validators.min(0)]],
      sogliaMinima: [data?.sogliaMinima || null, [Validators.min(0)]],
      descrizione:  [data?.descrizione ?? ''],
      haVarianti:   [data?.haVarianti ?? false],
    });
  }

  ngOnInit() {
    this.ds.getCategorieProdotto().subscribe(c => {
      this.categorie = c;
      this.form.get('categoria')?.valueChanges.subscribe(catNome => {
        if (!catNome) return;
        const cat = this.categorie.find(x => x.nome === catNome);
        if (cat?.aliquotaIvaId) {
          const aliq = this.aliquoteIva.find(a => a.id === cat.aliquotaIvaId);
          if (aliq) this.form.get('iva')?.setValue(aliq.valore);
        }
      });
    });
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
    this.ds.getFornitori().subscribe(f => this.fornitoriList = f);
    if (this.data?.id && this.data.haVarianti) {
      this.ds.getProdottoVarianti(this.data.id).subscribe(v => this.varianti = v);
    } else if (this.data?.varianti?.length) {
      // Duplicazione: precarico le varianti del prodotto sorgente (come nuove, senza id/barcode).
      this.varianti = this.data.varianti.map(v => ({ taglia: v.taglia, colore: v.colore, quantita: v.quantita, barcode: '' }));
    }
    if (this.data?.id) {
      this.ds.getProdottoFornitori(this.data.id).subscribe(f =>
        this.fornitori = f.map(x => ({ ...x, cercaFornitore: x.fornitoreNome ?? '' })));
      this.ds.getCodiciAlias(this.data.id).subscribe(a => this.codiciAlias = a);
    } else if (this.data?.fornitori?.length) {
      // Duplicazione: precarico i fornitori del prodotto sorgente (come nuovi, senza id).
      this.fornitori = this.data.fornitori.map(x => ({
        fornitoreId: x.fornitoreId, codiceFornitore: x.codiceFornitore ?? '',
        prezzoAcquisto: x.prezzoAcquisto ?? null, predefinito: x.predefinito,
        cercaFornitore: x.fornitoreNome ?? '',
      }));
    }
  }

  /** Ricerca "a token" tra i fornitori: ogni parola deve comparire in nome, P.IVA o città. */
  filtraFornitori(text?: string): Fornitore[] {
    const tokens = (text ?? '').toString().toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return this.fornitoriList;
    return this.fornitoriList.filter(f => {
      const hay = `${f.ragioneSociale ?? ''} ${f.pIva ?? ''} ${f.citta ?? ''}`.toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }

  onFornitorePick(f: ProdottoFornitore & { cercaFornitore?: string }, fo: Fornitore) {
    f.fornitoreId = fo.id ?? null;
    f.cercaFornitore = fo.ragioneSociale;
  }

  /** Al blur riallinea il testo mostrato al fornitore effettivamente selezionato (evita testo "orfano"). */
  syncFornitoreText(f: ProdottoFornitore & { cercaFornitore?: string }) {
    setTimeout(() => {
      const fo = this.fornitoriList.find(x => x.id === f.fornitoreId);
      f.cercaFornitore = fo?.ragioneSociale ?? '';
    }, 200);
  }

  async removeCodiceAlias(a: CodiceAlias) {
    if (!await this.confirm.delete(`Rimuovere il codice memorizzato "${a.codice}"${a.fornitoreNome ? ' di ' + a.fornitoreNome : ''}? Non verrà più riconosciuto automaticamente nei prossimi import.`)) return;
    this.ds.deleteCodiceAlias(a.id).subscribe(() => {
      this.codiciAlias = this.codiciAlias.filter(x => x.id !== a.id);
    });
  }

  addVariante() { this.varianti.push({ taglia: '', colore: '', quantita: 0, barcode: '' }); }
  removeVariante(i: number) { this.varianti.splice(i, 1); }

  addFornitore() {
    this.fornitori.push({ fornitoreId: null, codiceFornitore: '', prezzoAcquisto: null, predefinito: this.fornitori.length === 0, cercaFornitore: '' });
  }
  removeFornitore(i: number) {
    const wasPref = this.fornitori[i]?.predefinito;
    this.fornitori.splice(i, 1);
    if (wasPref && this.fornitori.length) this.fornitori[0].predefinito = true;
  }
  setPredefinito(i: number) { this.fornitori.forEach((f, idx) => f.predefinito = idx === i); }

  scannerBarcode() {
    const ref = this.dialog.open(BarcodeScannerDialogComponent, { width: '480px', maxWidth: '95vw' });
    ref.afterClosed().subscribe((code: string | null | undefined) => {
      if (code) this.form.patchValue({ barcode: code });
    });
  }

  save() {
    if (this.form.valid) {
      const fornitori = this.fornitori.map(({ cercaFornitore, ...rest }) => rest);
      this.dialogRef.close({ ...this.data, ...this.form.value, varianti: this.varianti, fornitori });
    }
  }
}

// ── Rettifica giacenza (rapida) ──────────────────────────────────────────────
@Component({
  selector: 'app-rettifica-giacenza-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Rettifica giacenza</h2>
    <mat-dialog-content style="min-width:360px">
      <p style="margin:0 0 4px;font-weight:600">{{ data.prodotto.nome }}</p>
      <p style="margin:0 0 16px;font-size:13px;color:var(--text-tertiary,#94a3b8)">
        Giacenza attuale: <b>{{ data.prodotto.quantita }}</b> {{ data.prodotto.unitaMisura || '' }}
      </p>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Nuova giacenza reale *</mat-label>
        <input matInput type="number" [step]="step" [min]="0" [(ngModel)]="nuova"
               (keyup.enter)="save()" autofocus>
        <span matTextSuffix>{{ data.prodotto.unitaMisura || 'pz' }}</span>
      </mat-form-field>
      @if (nuova !== null && delta !== 0) {
        <p style="margin:-6px 0 12px;font-size:13px" [style.color]="delta > 0 ? '#16a34a' : '#dc2626'">
          <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle">{{ delta > 0 ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
          {{ delta > 0 ? '+' : '' }}{{ delta }} — verrà registrato un movimento di rettifica.
        </p>
      }
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Motivo (facoltativo)</mat-label>
        <input matInput [(ngModel)]="note" placeholder="es. inventario, rottura, ammanco…">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="nuova === null">Salva rettifica</button>
    </mat-dialog-actions>`
})
export class RettificaGiacenzaDialogComponent {
  nuova: number | null = null;
  note = '';
  constructor(
    public dialogRef: MatDialogRef<RettificaGiacenzaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { prodotto: Prodotto }
  ) { this.nuova = data.prodotto.quantita ?? 0; }
  /** L'unità del prodotto è frazionabile (kg, lt…)? Determina lo step dell'input. */
  get frazionabile(): boolean { return unitaFrazionabile(this.data.prodotto.unitaMisura); }
  get step(): number { return stepPerUnita(this.data.prodotto.unitaMisura); }
  get delta(): number { return (this.nuova ?? 0) - (this.data.prodotto.quantita ?? 0); }
  save() {
    if (this.nuova === null) return;
    // Arrotonda in modo coerente con l'unità: per i pezzi niente decimali.
    const q = arrotondaPerUnita(this.nuova, this.data.prodotto.unitaMisura);
    this.dialogRef.close({ quantita: q, note: this.note });
  }
}

// ── Component ────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-prodotti',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatFormFieldModule, MatInputModule,
            MatSortModule, MatSelectModule, MatPaginatorModule, MatTooltipModule, MatMenuModule,
            ColumnPickerComponent, EmptyStateComponent],
  templateUrl: './prodotti.html',
  styleUrl: './prodotti.scss'
})
export class ProdottiComponent implements OnInit, AfterViewInit {
  private confirm = inject(ConfirmService);
  private allProdotti: Prodotto[] = [];
  dataSource = new MatTableDataSource<Prodotto>([]);
  displayedColumns: string[] = ['nome', 'categoria', 'prezzo', 'margine', 'quantita', 'sogliaMinima'];

  readonly allCols: ColDef[] = [
    { key: 'nome', label: 'Nome' },
    { key: 'categoria', label: 'Categoria' },
    { key: 'codice', label: 'Codice', defaultVisible: false },
    { key: 'codiceFornitore', label: 'Cod. Fornitore', defaultVisible: false },
    { key: 'barcode', label: 'Barcode', defaultVisible: false },
    { key: 'prezzo', label: 'Prezzo' },
    { key: 'prezzoAcquisto', label: 'Prezzo Acquisto', defaultVisible: false },
    { key: 'margine', label: 'Margine %' },
    { key: 'quantita', label: 'Qtà' },
    { key: 'sogliaMinima', label: 'Soglia min.' },
    { key: 'iva', label: 'IVA', defaultVisible: false },
    { key: 'unitaMisura', label: 'U.M.', defaultVisible: false },
    { key: 'id', label: 'ID', defaultVisible: false },
  ];

  filtroCategoria: string | null = null;
  filtroSottoSoglia = false;
  filtroMargineBasso = false;
  marginePerc(p: any): number | null {
    const v = +(p?.prezzo ?? 0), a = +(p?.prezzoAcquisto ?? 0);
    if (!v || !a) return null;
    return Math.round(((v - a) / v) * 1000) / 10;
  }
  get categorieList() { return [...new Set(this.allProdotti.map(p => p.categoria).filter(Boolean))].sort() as string[]; }
  // "Sotto soglia" = SOLO i prodotti con una soglia minima configurata (> 0) e
  // sotto di essa. Senza soglia (0/vuota) niente avviso, nemmeno a 0: così gli
  // articoli su ordinazione non generano notifiche perenni.
  isSottoSoglia(p: Prodotto): boolean {
    const q = p.quantita ?? 0;
    const soglia = p.sogliaMinima ?? 0;
    return soglia > 0 && q < soglia;
  }
  get sottoSogliaCount() {
    return this.allProdotti.filter(p => this.isSottoSoglia(p)).length;
  }
  get prodotti() { return this.dataSource.data; }

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private excel: ExcelService) {}

  private pendingOpenId: number | null = null;

  ngOnInit() {
    this.pendingOpenId = consumePrefill<number>('openId');
    this.load();
    const pf = consumePrefill('prefill');
    if (pf) setTimeout(() => this.open(pf as Prodotto), 0);
  }

  private openPending(list: Prodotto[]) {
    if (this.pendingOpenId == null) return;
    const it = list.find(x => x.id === this.pendingOpenId);
    this.pendingOpenId = null;
    if (it) setTimeout(() => this.open(it), 0);
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, col) => {
      switch (col) {
        case 'id': return item.id ?? 0;
        case 'prezzo': return item.prezzo ?? 0;
        case 'quantita': return item.quantita ?? 0;
        case 'sogliaMinima': return item.sogliaMinima ?? 0;
        case 'iva': return item.iva ?? 0;
        default: return (item as any)[col] ?? '';
      }
    };
    this.dataSource.filterPredicate = (item, filter) => {
      const s = filter.toLowerCase();
      return (item.nome ?? '').toLowerCase().includes(s)
          || (item.codice ?? '').toLowerCase().includes(s)
          || (item.barcode ?? '').toLowerCase().includes(s)
          || (item.categoria ?? '').toLowerCase().includes(s)
          || (item.descrizione ?? '').toLowerCase().includes(s);
    };
  }

  load() {
    this.ds.getProdotti().subscribe(p => { this.allProdotti = p; this.applyFilters(); this.openPending(p); });
  }

  applyFilters() {
    let data = this.allProdotti;
    if (this.filtroCategoria) data = data.filter(p => p.categoria === this.filtroCategoria);
    if (this.filtroSottoSoglia) data = data.filter(p => this.isSottoSoglia(p));
    if (this.filtroMargineBasso) data = data.filter(p => { const m = this.marginePerc(p); return m !== null && m < 15; });
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  resetFiltri() { this.filtroCategoria = null; this.filtroSottoSoglia = false; this.filtroMargineBasso = false; this.dataSource.filter = ''; this.applyFilters(); }

  onColsChange(cols: string[]) { this.displayedColumns = [...cols, 'azioni']; }

  print() {
    const rows = this.dataSource.data;
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    const body = rows.map(p=>`<tr><td>${p.nome}</td><td>${p.categoria||'—'}</td><td>${p.codice||'—'}</td><td>${p.barcode||'—'}</td><td class="r">${e(p.prezzo)}</td><td class="r">${p.quantita??0}</td><td class="r">${p.sogliaMinima??0}</td><td class="r">${p.iva??0}%</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Prodotti</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right}</style></head><body><h1>Prodotti</h1><table><thead><tr><th>Nome</th><th>Categoria</th><th>Codice</th><th>Barcode</th><th class="r">Prezzo</th><th class="r">Qtà</th><th class="r">Soglia min.</th><th class="r">IVA</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  open(p?: Prodotto) {
    const ref = this.dialog.open(ProdottoDialogComponent, { data: p ?? null, width: '95vw', maxWidth: '900px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateProdotto(result) : this.ds.createProdotto(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  /** Duplica un prodotto: apre la scheda precompilata col nome + " (copia)" (e fornitori/varianti copiati). */
  duplica(p: Prodotto) {
    this.ds.getProdottoFornitori(p.id!).subscribe(fornitori => {
      const clone: Prodotto = {
        ...p,
        id: undefined,
        nome: `${p.nome} (copia)`,
        barcode: '',
        quantita: 0,
        fornitori,
        varianti: (p.varianti ?? []).map(v => ({ taglia: v.taglia, colore: v.colore, quantita: 0, barcode: '' })),
      };
      const ref = this.dialog.open(ProdottoDialogComponent, { data: clone, width: '95vw', maxWidth: '900px' });
      ref.afterClosed().subscribe(result => {
        if (!result) return;
        this.ds.createProdotto(result).subscribe({
          next: () => { this.load(); this.snack.open('Prodotto duplicato', '', { duration: 2000 }); },
          error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 }),
        });
      });
    });
  }

  openImportListino() {
    this.dialog.open(ImportListinoDialogComponent, { width: '600px', maxWidth: '96vw' })
      .afterClosed().subscribe(() => this.load());
  }

  quickAdd() {
    const ref = this.dialog.open(QuickAddProdottoDialogComponent, {
      width: '95vw', maxWidth: '640px', autoFocus: false,
    });
    ref.afterClosed().subscribe((count: number) => {
      if (count && count > 0) {
        this.load();
        this.snack.open(`${count} ${count === 1 ? 'prodotto aggiunto' : 'prodotti aggiunti'}`, '', { duration: 2500 });
      }
    });
  }

  info(p: Prodotto) {
    const fmt = (n: number | undefined) => n != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n) : undefined;
    const data: InfoDialogData = {
      title: p.nome,
      subtitle: p.categoria || undefined,
      sections: [
        {
          title: 'Identificazione',
          rows: [
            { label: 'Codice',           value: p.codice,          mono: true },
            { label: 'Barcode',          value: p.barcode,         mono: true },
            { label: 'Cod. fornitore',   value: p.codiceFornitore, mono: true },
            { label: 'Descrizione',      value: p.descrizione },
          ],
        },
        {
          title: 'Prezzi',
          rows: [
            { label: 'Prezzo vendita',   value: fmt(p.prezzo) },
            { label: 'Prezzo acquisto',  value: fmt(p.prezzoAcquisto) },
            { label: 'IVA',              value: p.iva != null ? `${p.iva}%` : undefined },
          ],
        },
        {
          title: 'Magazzino',
          rows: [
            { label: 'Quantità',         value: p.quantita != null ? String(p.quantita) + (p.unitaMisura ? ' ' + p.unitaMisura : '') : undefined },
            { label: 'Soglia minima',    value: p.sogliaMinima != null ? String(p.sogliaMinima) : undefined },
            { label: 'Unità di misura',  value: p.unitaMisura },
            { label: 'Con varianti',     value: p.haVarianti ? 'Sì' : undefined },
          ],
        },
      ],
    };
    if (p.haVarianti && p.varianti?.length) {
      data.sections.push({
        title: 'Varianti',
        rows: p.varianti.map(v => ({
          label: [v.taglia, v.colore].filter(x => !!x).join(' / ') || `#${v.id}`,
          value: `Qtà: ${v.quantita}${v.barcode ? ' · ' + v.barcode : ''}`,
        })),
      });
    }
    this.dialog.open(InfoDialogComponent, { data, width: '520px', maxWidth: '95vw' });
  }

  exportExcel() {
    this.excel.export(this.dataSource.data, [
      { header: 'Nome',             field: 'nome',            width: 30 },
      { header: 'Categoria',        field: 'categoria',       width: 18 },
      { header: 'Descrizione',      field: 'descrizione',     width: 32 },
      { header: 'Codice',           field: 'codice',          width: 14 },
      { header: 'Codice Fornitore', field: 'codiceFornitore', width: 16 },
      { header: 'Barcode',          field: 'barcode',         width: 16 },
      { header: 'Prezzo vendita',   field: 'prezzo',          width: 12 },
      { header: 'Prezzo acquisto', field: 'prezzoAcquisto',  width: 14 },
      { header: 'IVA',              field: 'iva',             width: 8  },
      { header: 'Quantità',         field: 'quantita',        width: 10 },
      { header: 'Soglia Minima',    field: 'sogliaMinima',    width: 12 },
      { header: 'Unità Misura',     field: 'unitaMisura',     width: 12 },
    ], 'prodotti');
  }

  importExcel(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    this.excel.readFile(file).then(rows => {
      if (!rows.length) { this.snack.open('File vuoto', '', { duration: 3000 }); return; }
      this.dialog.open(ImportMappingDialogComponent, {
        data: { rows, fields: PRODOTTI_FIELDS, entityType: 'prodotti', entityLabel: 'Prodotti' },
        disableClose: true,
      }).afterClosed().subscribe((result: MappingResult | null) => {
        if (!result) return;
        const toNum = (s: any) => parseFloat(String(s ?? '').replace(',', '.') || '0') || 0;
        const toInt = (s: any) => parseInt(String(s ?? '').replace(',', '.') || '0', 10) || 0;
        const v = (key: string, row: Record<string, any>) => row[result.mapping[key]] ?? '';
        const records = rows.map(r => ({
          nome:            String(v('nome', r)).trim(),
          categoria:       String(v('categoria', r)).trim(),
          descrizione:     String(v('descrizione', r)).trim(),
          codice:          String(v('codice', r)).trim(),
          codiceFornitore: String(v('codiceFornitore', r)).trim(),
          barcode:         String(v('barcode', r)).trim(),
          prezzo:          toNum(v('prezzo', r)),
          prezzoAcquisto:  toNum(v('prezzoAcquisto', r)) || null,
          iva:             toNum(v('iva', r)) || 22,
          quantita:        toInt(v('quantita', r)),
          sogliaMinima:    toInt(v('sogliaMinima', r)),
          unitaMisura:     String(v('unitaMisura', r)).trim() || 'pz',
        })).filter(p => p.nome.length > 0);
        if (!records.length) {
          this.snack.open('Nessun prodotto valido: controlla che la colonna Nome sia mappata correttamente', '', { duration: 5000 });
          return;
        }
        this.ds.importProdotti(records).subscribe({
          next: (res: any) => {
            this.load();
            this.snack.open(`Importati: ${res.created} nuovi, ${res.updated} aggiornati, ${res.skipped} saltati`, '', { duration: 5000 });
          },
          error: (err: any) => {
            this.snack.open('Errore import: ' + (err?.error?.message || err?.message || JSON.stringify(err?.error) || 'errore sconosciuto'), '', { duration: 6000 });
          }
        });
      });
    }).catch(() => {
      this.snack.open('File non leggibile o formato non supportato', '', { duration: 3000 });
    });
  }

  openRettifica(p: Prodotto) {
    this.dialog.open(RettificaGiacenzaDialogComponent, { data: { prodotto: p }, width: '420px' })
      .afterClosed().subscribe(res => {
        if (!res) return;
        this.ds.rettificaGiacenza(p.id!, res.quantita, res.note).subscribe({
          next: () => { this.load(); this.snack.open('Giacenza aggiornata', '', { duration: 2000 }); },
          error: e => this.snack.open(e.error?.error || 'Errore rettifica', '', { duration: 3000 })
        });
      });
  }

  async delete(p: Prodotto) {
    if (!await this.confirm.delete(`Eliminare ${p.nome}?`)) return;
    this.ds.deleteProdotto(p.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

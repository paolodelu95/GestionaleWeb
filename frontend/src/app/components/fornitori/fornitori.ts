import { Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators,
         AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Observable, of, timer } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, switchMap, map, catchError } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { CityService, CityResult } from '../../services/city.service';
import { ExcelService } from '../../services/excel.service';
import { Fornitore } from '../../models';
import { pIvaValidator, telefonoValidator, capValidator, normalizePiva } from '../../validators/italian-validators';
import { ImportMappingDialogComponent, FieldDef, MappingResult } from '../shared/import-mapping-dialog';
import { ColumnPickerComponent, ColDef } from '../shared/column-picker';
import { InfoDialogComponent, InfoDialogData } from '../shared/info-dialog';

const FORNITORI_FIELDS: FieldDef[] = [
  { key: 'ragioneSociale', label: 'Ragione Sociale', required: true, aliases: [
    'Ragione Sociale', 'ragioneSociale', 'Denominazione', 'Azienda', 'Nome Azienda',
    'Ragione sociale', 'Company', 'Company Name', 'Fornitore', 'Supplier', 'Nome',
    'Intestazione', 'Intestatario',
  ]},
  { key: 'email', label: 'Email', aliases: [
    'Email', 'email', 'E-mail', 'E_mail', 'Email Address', 'Indirizzo Email',
    'Posta Elettronica', 'Mail',
  ]},
  { key: 'telefono', label: 'Telefono', aliases: [
    'Telefono', 'telefono', 'Tel', 'Tel.', 'Telefono 1', 'Telefono fisso',
    'Cell', 'Cellulare', 'Phone', 'Mobile', 'Phone Number', 'Numero di telefono',
  ]},
  { key: 'cellulare', label: 'Cellulare', aliases: [
    'Cellulare', 'cellulare', 'Cell', 'Mobile', 'Telefono Mobile', 'Cell.', 'Tel. Mobile',
  ]},
  { key: 'via', label: 'Via / Indirizzo', aliases: [
    'Via', 'via', 'Indirizzo', 'Indirizzo 1', 'Street', 'Address',
    'Indirizzo stradale', 'Sede', 'Via e numero',
  ]},
  { key: 'cap', label: 'CAP', aliases: [
    'CAP', 'cap', 'Codice Postale', 'ZIP', 'Postal Code', 'ZIP Code', 'C.A.P.',
  ]},
  { key: 'citta', label: 'Città', aliases: [
    'Città', 'Citta', 'citta', 'Comune', 'City', 'Town', 'Localita', 'Località',
  ]},
  { key: 'provincia', label: 'Provincia', aliases: [
    'Provincia', 'provincia', 'Prov', 'Prov.', 'Province', 'Sigla Provincia',
  ]},
  { key: 'stato', label: 'Stato / Paese', aliases: [
    'Stato', 'stato', 'Country', 'Nazione', 'Paese', 'Naz.',
  ]},
  { key: 'pIva', label: 'P. IVA', aliases: [
    'P. IVA', 'pIva', 'P.IVA', 'Partita IVA', 'Partita_IVA', 'VAT',
    'VAT Number', 'P IVA', 'PIVA', 'CF/PIVA', 'Partita iva',
  ]},
  { key: 'sdi', label: 'SDI', aliases: [
    'SDI', 'sdi', 'Codice SDI', 'Codice Destinatario', 'Destinatario SDI',
    'Codice Univoco', 'Cod. Destinatario',
  ]},
  { key: 'pec', label: 'PEC', aliases: [
    'PEC', 'pec', 'Posta Certificata', 'PEC Address', 'Indirizzo PEC',
  ]},
];

// ── Azienda Search Dialog ──────────────────────────────────────────────────────
@Component({
  selector: 'app-azienda-search-dialog-f',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
            MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  styles: [`
    .azienda-result {
      padding: 10px 12px; cursor: pointer; border-radius: 6px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      transition: background 0.15s;
    }
    .azienda-result:hover { background: var(--mat-sys-secondary-container, #f0f4ff); }
    .azienda-nome { font-weight: 500; font-size: 14px; }
    .azienda-dettagli { font-size: 12px; color: var(--mat-sys-on-surface-variant, #666); margin-top: 2px; }
    .no-results { text-align: center; color: var(--mat-sys-on-surface-variant, #888);
                  padding: 24px 0; font-size: 14px; }
  `],
  template: `
    <h2 mat-dialog-title>Cerca azienda per ragione sociale</h2>
    <mat-dialog-content style="width:520px;max-width:90vw;min-height:120px">
      <mat-form-field style="width:100%">
        <mat-label>Nome azienda</mat-label>
        <input matInput [(ngModel)]="query" (ngModelChange)="onQueryChange($event)"
               placeholder="es. Rossi srl, Fabbrica..." autofocus>
        <span matSuffix style="margin-right:8px">
          @if (loading) { <mat-spinner diameter="18"></mat-spinner> }
          @else { <mat-icon>search</mat-icon> }
        </span>
      </mat-form-field>

      @if (results.length > 0) {
        <div style="max-height:320px;overflow-y:auto">
          @for (r of results; track r.pIva || r.ragioneSociale) {
            <div class="azienda-result" (click)="select(r)">
              <div class="azienda-nome">{{ r.ragioneSociale }}</div>
              <div class="azienda-dettagli">
                @if (r.pIva) { <span>P.IVA: {{ r.pIva }}</span> }
                @if (r.citta) { <span>{{ r.pIva ? ' · ' : '' }}{{ r.citta }}{{ r.provincia ? ' (' + r.provincia + ')' : '' }}</span> }
              </div>
            </div>
          }
        </div>
      } @else if (searched && !loading) {
        <div class="no-results">
          @if (serviceUnavailable) {
            <mat-icon style="vertical-align:middle;margin-right:6px;opacity:.5">cloud_off</mat-icon>
            Servizio di ricerca non disponibile.<br>
            <small>Inserire manualmente la ragione sociale o attivare il servizio Imprese su openapi.it</small>
          } @else {
            Nessuna azienda trovata per "{{ query }}"
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Chiudi</button>
    </mat-dialog-actions>`
})
export class AziendaSearchDialogFComponent {
  query = '';
  results: any[] = [];
  loading = false;
  searched = false;
  serviceUnavailable = false;
  private searchTimer: any;

  constructor(private ds: DataService, public dialogRef: MatDialogRef<AziendaSearchDialogFComponent>) {}

  onQueryChange(q: string) {
    clearTimeout(this.searchTimer);
    if (q.length < 2) { this.results = []; this.searched = false; return; }
    this.loading = true;
    this.searchTimer = setTimeout(() => this.doSearch(q), 400);
  }

  private doSearch(q: string) {
    this.ds.searchAziendaByName(q).subscribe({
      next: results => {
        this.loading = false;
        this.searched = true;
        this.serviceUnavailable = false;
        this.results = results;
      },
      error: () => {
        this.loading = false;
        this.searched = true;
        this.serviceUnavailable = true;
        this.results = [];
      }
    });
  }

  select(r: any) { this.dialogRef.close(r); }
}

@Component({
  selector: 'app-fornitore-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatAutocompleteModule,
            MatSnackBarModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule,
            MatCheckboxModule],
  template: `
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#0ea5e9 0%,#06b6d4 100%);box-shadow:0 4px 12px -2px rgba(14,165,233,0.35)">
          <mat-icon>local_shipping</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data ? data.ragioneSociale : 'Nuovo fornitore' }}</span>
          <span class="dialog-hero-sub">{{ data ? 'Aggiorna i dati anagrafici e fiscali' : 'Inserisci i dati per gli acquisti' }}</span>
        </div>
      </div>

      <form [formGroup]="form" class="dialog-form">

        <!-- ── Identità ─────────────────────────────────── -->
        <div class="form-section is-primary">
          <div class="form-section-header">
            <mat-icon>badge</mat-icon>
            <span>Identità</span>
            <span class="section-hint">Dati per registrazione acquisti</span>
          </div>
          <div class="input-with-action">
            <mat-form-field>
              <mat-label>Ragione Sociale *</mat-label>
              <input matInput formControlName="ragioneSociale">
            </mat-form-field>
            <button mat-icon-button type="button"
                    matTooltip="Cerca azienda per nome" (click)="cercaAzienda()">
              <mat-icon>business_center</mat-icon>
            </button>
          </div>
          <div class="form-row">
            <div class="input-with-action" style="flex:1">
              <mat-form-field>
                <mat-label>P. IVA</mat-label>
                <input matInput formControlName="pIva" placeholder="11 cifre">
                @if (form.get('pIva')?.hasError('pIva')) {
                  <mat-error>P. IVA non valida (deve essere di 11 cifre)</mat-error>
                }
                @if (form.get('pIva')?.hasError('pivaEsiste')) {
                  <mat-error>P. IVA già presente nell'anagrafica fornitori</mat-error>
                }
                @if (form.get('pIva')?.pending) {
                  <mat-hint>Verifica duplicati...</mat-hint>
                }
              </mat-form-field>
              <button mat-icon-button type="button"
                      matTooltip="Carica dati da P.IVA"
                      [disabled]="lookupLoading || !canLookupPiva"
                      (click)="lookupPiva()">
                @if (lookupLoading) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <mat-icon>cloud_download</mat-icon>
                }
              </button>
            </div>
          </div>
        </div>

        <!-- ── Fatturazione elettronica ─────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>receipt_long</mat-icon>
            <span>Fatturazione elettronica</span>
          </div>
          <div class="form-row">
            <mat-form-field><mat-label>Codice SDI</mat-label>
              <input matInput formControlName="sdi" style="text-transform:uppercase" maxlength="7" placeholder="es. ABC1234">
            </mat-form-field>
            <mat-form-field style="flex:2"><mat-label>PEC</mat-label>
              <input matInput formControlName="pec" placeholder="indirizzo@pec.it">
            </mat-form-field>
          </div>
          <div class="form-row">
            <mat-checkbox formControlName="estero">
              Soggetto estero (incluso nell'esterometro / autofattura TD17-TD19)
            </mat-checkbox>
          </div>
        </div>

        <!-- ── Sede ─────────────────────────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>location_on</mat-icon>
            <span>Sede legale</span>
          </div>
          <mat-form-field style="width:100%"><mat-label>Via</mat-label><input matInput formControlName="via"></mat-form-field>
          <div class="form-row">
            <mat-form-field style="max-width:120px"><mat-label>CAP</mat-label>
              <input matInput formControlName="cap" maxlength="5">
              @if (form.get('cap')?.hasError('cap') && form.get('cap')?.dirty) {
                <mat-error>CAP non valido (5 cifre)</mat-error>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Città</mat-label>
              <input matInput formControlName="citta" [matAutocomplete]="auto">
              <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onCitySelected($event.option.value)">
                @for (c of filteredCities; track c.name) { <mat-option [value]="c.name">{{ c.name }}</mat-option> }
              </mat-autocomplete>
            </mat-form-field>
            <mat-form-field style="max-width:80px"><mat-label>Prov.</mat-label>
              <input matInput formControlName="provincia" maxlength="2" style="text-transform:uppercase">
              <mat-hint>sigla</mat-hint></mat-form-field>
            <mat-form-field style="max-width:120px"><mat-label>Stato</mat-label>
              <input matInput formControlName="stato"></mat-form-field>
          </div>
        </div>

        <!-- ── Contatti ─────────────────────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>contact_phone</mat-icon>
            <span>Contatti</span>
          </div>
          <div class="form-row">
            <mat-form-field>
              <mat-label>Email</mat-label>
              <input matInput formControlName="email" type="email">
              <mat-icon matSuffix>alternate_email</mat-icon>
              @if (form.get('email')?.hasError('email') && form.get('email')?.dirty) {
                <mat-error>Formato email non valido</mat-error>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Telefono</mat-label>
              <input matInput formControlName="telefono">
              <mat-icon matSuffix>call</mat-icon>
              @if (form.get('telefono')?.hasError('telefono') && form.get('telefono')?.dirty) {
                <mat-error>Inserire solo cifre, +, -, spazi o parentesi</mat-error>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Cellulare</mat-label>
              <input matInput formControlName="cellulare">
              <mat-icon matSuffix>smartphone</mat-icon>
            </mat-form-field>
          </div>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!form.get('ragioneSociale')?.valid || form.pending">Salva</button>
    </mat-dialog-actions>`
})
export class FornitoreDialogComponent implements OnInit {
  form: FormGroup;
  filteredCities: CityResult[] = [];
  lookupLoading = false;
  private cityMap = new Map<string, CityResult>();

  constructor(private fb: FormBuilder,
              private ds: DataService,
              private dialog: MatDialog,
              private cityService: CityService,
              private snack: MatSnackBar,
              public dialogRef: MatDialogRef<FornitoreDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: Fornitore | null) {
    this.form = this.fb.group({
      ragioneSociale: [data?.ragioneSociale ?? '', Validators.required],
      email: [data?.email ?? '', Validators.email],
      telefono: [data?.telefono ?? '', telefonoValidator],
      cellulare: [data?.cellulare ?? ''],
      via: [data?.via ?? ''], cap: [data?.cap ?? '', capValidator],
      citta: [data?.citta ?? ''], provincia: [data?.provincia ?? ''],
      stato: [data?.stato ?? 'Italia'], pIva: [data?.pIva ?? '', pIvaValidator, this.pivaAsyncValidator('fornitori', data?.id)],
      sdi: [data?.sdi ?? ''], pec: [data?.pec ?? ''],
      estero: [data?.estero ?? false],
    });
  }

  get canLookupPiva(): boolean { return normalizePiva(this.form.get('pIva')?.value ?? '').length === 11; }

  private pivaAsyncValidator(tipo: 'clienti' | 'fornitori', excludeId?: number): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      const piva = normalizePiva(control.value ?? '');
      if (!piva || piva.length !== 11) return of(null);
      return timer(500).pipe(
        switchMap(() => this.ds.checkPivaDuplicate(piva, tipo, excludeId)),
        map((r: any) => r.exists ? { pivaEsiste: true } : null),
        catchError(() => of(null))
      );
    };
  }

  ngOnInit() {
    this.form.get('citta')!.valueChanges.pipe(
      debounceTime(300), distinctUntilChanged(),
      switchMap(v => this.cityService.searchCities(v ?? ''))
    ).subscribe(results => {
      this.filteredCities = results;
      results.forEach(r => this.cityMap.set(r.name, r));
    });

    this.form.get('cap')!.valueChanges.pipe(
      debounceTime(400), distinctUntilChanged(),
      filter(cap => cap?.length === 5),
      switchMap(cap => this.cityService.lookupByCap(cap))
    ).subscribe(result => {
      if (result) {
        this.form.patchValue({ citta: result.name, provincia: result.provincia, stato: 'Italia' }, { emitEvent: false });
        this.cityMap.set(result.name, result);
      }
    });
  }

  onCitySelected(name: string) {
    const r = this.cityMap.get(name);
    if (r) this.form.patchValue({ cap: r.cap, provincia: r.provincia, stato: 'Italia' }, { emitEvent: false });
  }

  cercaAzienda() {
    const ref = this.dialog.open(AziendaSearchDialogFComponent, { width: '580px', maxWidth: '95vw' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const patch: any = {};
      if (result.ragioneSociale) patch.ragioneSociale = result.ragioneSociale;
      if (result.pIva)           patch.pIva = result.pIva;
      if (result.via)            patch.via = result.via;
      if (result.cap)            patch.cap = result.cap;
      if (result.citta)          patch.citta = result.citta;
      if (result.provincia)      patch.provincia = result.provincia;
      if (result.stato)          patch.stato = result.stato;
      this.form.patchValue(patch);
    });
  }

  lookupPiva() {
    const piva = normalizePiva(this.form.get('pIva')?.value ?? '');
    if (!piva || piva.length !== 11) return;
    this.lookupLoading = true;
    this.ds.lookupPiva(piva).subscribe({
      next: result => {
        this.lookupLoading = false;
        const patch: any = {};
        if (result.ragioneSociale) patch.ragioneSociale = result.ragioneSociale;
        if (result.via)            patch.via = result.via;
        if (result.cap)            patch.cap = result.cap;
        if (result.citta)          patch.citta = result.citta;
        if (result.provincia)      patch.provincia = result.provincia;
        if (result.stato)          patch.stato = result.stato;
        this.form.patchValue(patch);
        this.snack.open('Dati caricati', '', { duration: 2500 });
      },
      error: () => {
        this.lookupLoading = false;
        this.snack.open('P.IVA non trovata', '', { duration: 3000 });
      }
    });
  }

  save() {
    if (this.form.valid && !this.form.pending) {
      this.dialogRef.close({ ...this.data, ...this.form.value });
    }
  }
}

@Component({
  selector: 'app-fornitori',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatFormFieldModule, MatInputModule, MatSortModule, MatPaginatorModule,
            MatTooltipModule, MatMenuModule, ColumnPickerComponent],
  templateUrl: './fornitori.html',
  styleUrl: './fornitori.scss'
})
export class FornitoriComponent implements OnInit, AfterViewInit {
  fornitori: Fornitore[] = [];
  dataSource = new MatTableDataSource<Fornitore>([]);
  displayedColumns: string[] = ['ragioneSociale', 'pIva', 'telefono', 'indirizzo', 'azioni'];

  readonly allCols: ColDef[] = [
    { key: 'ragioneSociale', label: 'Ragione Sociale' },
    { key: 'pIva', label: 'P. IVA' },
    { key: 'telefono', label: 'Telefono' },
    { key: 'indirizzo', label: 'Città' },
    { key: 'email', label: 'Email', defaultVisible: false },
    { key: 'cellulare', label: 'Cellulare', defaultVisible: false },
    { key: 'sdi', label: 'SDI', defaultVisible: false },
    { key: 'pec', label: 'PEC', defaultVisible: false },
    { key: 'id', label: 'ID', defaultVisible: false },
  ];

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, private excel: ExcelService) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, col) => {
      switch (col) {
        case 'id': return item.id ?? 0;
        case 'indirizzo': return this.indirizzo(item);
        default: return (item as any)[col] ?? '';
      }
    };
    this.dataSource.filterPredicate = (item, filter) => {
      const s = filter.toLowerCase();
      return (item.ragioneSociale ?? '').toLowerCase().includes(s)
          || (item.email ?? '').toLowerCase().includes(s)
          || (item.telefono ?? '').toLowerCase().includes(s)
          || (item.pIva ?? '').toLowerCase().includes(s)
          || this.indirizzo(item).toLowerCase().includes(s);
    };
  }

  load() { this.ds.getFornitori().subscribe(f => { this.fornitori = f; this.dataSource.data = f; if (this.paginator) this.dataSource.paginator = this.paginator; }); }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  indirizzo(f: Fornitore) {
    return [f.via, f.cap, f.citta, f.provincia, f.stato].filter(Boolean).join(', ');
  }

  onColsChange(cols: string[]) { this.displayedColumns = cols.includes('azioni') ? cols : [...cols, 'azioni']; }

  open(f?: Fornitore) {
    const ref = this.dialog.open(FornitoreDialogComponent, { data: f ?? null, width: '95vw', maxWidth: '860px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateFornitore(result) : this.ds.createFornitore(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  info(f: Fornitore) {
    const data: InfoDialogData = {
      title: f.ragioneSociale,
      sections: [
        {
          title: 'Contatti',
          rows: [
            { label: 'Email',     value: f.email },
            { label: 'Telefono',  value: f.telefono },
            { label: 'Cellulare', value: f.cellulare },
            { label: 'PEC',       value: f.pec },
          ],
        },
        {
          title: 'Sede',
          rows: [
            { label: 'Via',       value: f.via },
            { label: 'CAP',       value: f.cap },
            { label: 'Città',     value: f.citta },
            { label: 'Provincia', value: f.provincia },
            { label: 'Stato',     value: f.stato },
          ],
        },
        {
          title: 'Dati fiscali',
          rows: [
            { label: 'Partita IVA',  value: f.pIva, mono: true },
            { label: 'Codice SDI',   value: f.sdi, mono: true },
          ],
        },
      ],
    };
    this.dialog.open(InfoDialogComponent, { data, width: '520px', maxWidth: '95vw' });
  }

  exportExcel() {
    this.excel.export(this.dataSource.data, [
      { header: 'Ragione Sociale', field: 'ragioneSociale', width: 30 },
      { header: 'Email',           field: 'email',          width: 28 },
      { header: 'Telefono',        field: 'telefono',       width: 16 },
      { header: 'Cellulare',       field: 'cellulare',      width: 16 },
      { header: 'Via',             field: 'via',            width: 28 },
      { header: 'CAP',             field: 'cap',            width: 8  },
      { header: 'Città',           field: 'citta',          width: 18 },
      { header: 'Provincia',       field: 'provincia',      width: 10 },
      { header: 'Stato',           field: 'stato',          width: 12 },
      { header: 'P. IVA',          field: 'pIva',           width: 14 },
      { header: 'SDI',             field: 'sdi',            width: 10 },
      { header: 'PEC',             field: 'pec',            width: 28 },
    ], 'fornitori');
  }

  importExcel(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    this.excel.readFile(file).then(rows => {
      if (!rows.length) { this.snack.open('File vuoto', '', { duration: 3000 }); return; }
      this.dialog.open(ImportMappingDialogComponent, {
        data: { rows, fields: FORNITORI_FIELDS, entityType: 'fornitori', entityLabel: 'Fornitori' },
        disableClose: true,
      }).afterClosed().subscribe((result: MappingResult | null) => {
        if (!result) return;
        const v = (key: string, row: Record<string, any>) => String(row[result.mapping[key]] ?? '').trim();
        const records = rows.map(r => ({
          ragioneSociale: v('ragioneSociale', r),
          email:     v('email', r),
          telefono:  v('telefono', r),
          cellulare: v('cellulare', r),
          via:       v('via', r),
          cap:       v('cap', r),
          citta:     v('citta', r),
          provincia: v('provincia', r),
          stato:     v('stato', r) || 'Italia',
          pIva:      v('pIva', r),
          sdi:       v('sdi', r),
          pec:       v('pec', r),
        })).filter(f => f.ragioneSociale.length > 0);
        if (!records.length) { this.snack.open('Nessun fornitore valido: controlla la colonna Ragione Sociale', '', { duration: 5000 }); return; }
        this.ds.importFornitori(records).subscribe({
          next: (res: any) => {
            this.load();
            this.snack.open(`Importati: ${res.created} nuovi, ${res.updated} aggiornati, ${res.skipped} saltati`, '', { duration: 5000 });
          },
          error: (err: any) => {
            this.snack.open('Errore import: ' + (err?.error?.message || err?.message || 'errore sconosciuto'), '', { duration: 6000 });
          }
        });
      });
    }).catch(() => {
      this.snack.open('File non leggibile o formato non supportato', '', { duration: 3000 });
    });
  }

  delete(f: Fornitore) {
    if (!confirm(`Eliminare ${f.ragioneSociale}?`)) return;
    this.ds.deleteFornitore(f.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

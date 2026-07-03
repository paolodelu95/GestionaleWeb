import { inject, Component, OnInit, AfterViewInit, Inject, ViewChild, HostListener } from '@angular/core';
import { ConfirmService } from '../shared/confirm-dialog';
import { EmptyStateComponent } from '../shared/empty-state';
import { FieldHelpComponent } from '../shared/field-help';
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
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Observable, of, timer } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, switchMap, map, catchError } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { CityService, CityResult } from '../../services/city.service';
import { ExcelService, ExcelColumn } from '../../services/excel.service';
import { ExportMenuComponent } from '../shared/export-menu';
import { Cliente, ClienteIndirizzo, TipoPagamento, Listino, AliquotaIva } from '../../models';
import { Router } from '@angular/router';
import { consumePrefill } from '../../utils/nav-prefill';
import { pIvaValidator, codiceFiscaleValidator, telefonoValidator, capValidator, normalizePiva } from '../../validators/italian-validators';
import { ImportMappingDialogComponent, FieldDef, MappingResult } from '../shared/import-mapping-dialog';
import { ColumnPickerComponent, ColDef } from '../shared/column-picker';
import { InfoDialogComponent, InfoDialogData } from '../shared/info-dialog';
import { TableKeyboardNavDirective } from '../shared/table-keyboard-nav.directive';

const CLIENTI_FIELDS: FieldDef[] = [
  { key: 'ragioneSociale', label: 'Ragione Sociale', required: true, aliases: [
    'Ragione Sociale', 'ragioneSociale', 'Denominazione', 'Azienda', 'Nome Azienda',
    'Ragione sociale', 'Company', 'Company Name', 'Nominativo', 'Nome Cliente',
    'Cliente', 'Intestazione', 'Intestatario',
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
  { key: 'codiceFiscale', label: 'Codice Fiscale', aliases: [
    'Codice Fiscale', 'codiceFiscale', 'C.F.', 'CF', 'Cod. Fiscale',
    'Tax Code', 'Fiscal Code', 'Cod.Fiscale',
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
  selector: 'app-azienda-search-dialog',
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
export class AziendaSearchDialogComponent {
  query = '';
  results: any[] = [];
  loading = false;
  searched = false;
  serviceUnavailable = false;
  private searchTimer: any;

  constructor(private ds: DataService, public dialogRef: MatDialogRef<AziendaSearchDialogComponent>) {}

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

// ── Dialog ────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-cliente-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatAutocompleteModule, MatSelectModule,
            MatSnackBarModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, MatTabsModule,
            MatSlideToggleModule, FieldHelpComponent],
  template: `
    <mat-dialog-content>
      <div class="dialog-hero">
        <div class="dialog-hero-icon"><mat-icon>person</mat-icon></div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data ? data.ragioneSociale : 'Nuovo cliente' }}</span>
          <span class="dialog-hero-sub">{{ data ? 'Aggiorna i dati anagrafici e fiscali' : 'Inserisci i dati per la fatturazione' }}</span>
        </div>
      </div>

      <mat-tab-group>
        <mat-tab label="Anagrafica">
      <form [formGroup]="form" class="dialog-form" style="padding-top:16px">

        <!-- ── Identità ─────────────────────────────────── -->
        <div class="form-section is-primary">
          <div class="form-section-header">
            <mat-icon>badge</mat-icon>
            <span>Identità</span>
            <span class="section-hint">Dati per fatturazione e ricerca</span>
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
                <app-field-help matSuffix term="piva" />
                @if (form.get('pIva')?.hasError('pIva')) {
                  <mat-error>P. IVA non valida (deve essere di 11 cifre)</mat-error>
                }
                @if (form.get('pIva')?.hasError('pivaEsiste')) {
                  <mat-error>P. IVA già presente nell'anagrafica clienti</mat-error>
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
            <mat-form-field>
              <mat-label>Codice Fiscale</mat-label>
              <input matInput formControlName="codiceFiscale" style="text-transform:uppercase">
              <app-field-help matSuffix term="codiceFiscale" />
              @if (form.get('codiceFiscale')?.hasError('codiceFiscale')) {
                <mat-error>Codice fiscale non valido (16 caratteri o 11 cifre)</mat-error>
              }
            </mat-form-field>
          </div>
        </div>

        <!-- ── Fatturazione elettronica ─────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>receipt_long</mat-icon>
            <span>Fatturazione elettronica</span>
          </div>
          <div class="form-row">
            <mat-form-field style="max-width:180px">
              <mat-label>Tipo soggetto</mat-label>
              <mat-select formControlName="tipoSoggetto">
                <mat-option value="PRIVATO">Privato / B2B</mat-option>
                <mat-option value="PA">Pubblica Amministrazione</mat-option>
                <mat-option value="PROFESSIONISTA">Professionista</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field><mat-label>Codice SDI</mat-label>
              <input matInput formControlName="sdi" style="text-transform:uppercase" maxlength="7" placeholder="es. ABC1234">
              <app-field-help matSuffix term="sdi" />
            </mat-form-field>
            <mat-form-field style="flex:2"><mat-label>PEC</mat-label>
              <input matInput formControlName="pec" placeholder="indirizzo@pec.it">
              <app-field-help matSuffix term="pec" />
            </mat-form-field>
          </div>
          @if (form.get('tipoSoggetto')?.value === 'PA') {
            <div class="form-row" style="margin-top:4px">
              <mat-form-field>
                <mat-label>CIG</mat-label>
                <input matInput formControlName="cig" placeholder="es. Z123456789" style="text-transform:uppercase">
                <mat-hint>Codice Identificativo Gara (opzionale)</mat-hint>
              </mat-form-field>
              <mat-form-field>
                <mat-label>CUP</mat-label>
                <input matInput formControlName="cup" placeholder="es. C57I18000050006" style="text-transform:uppercase">
                <mat-hint>Codice Unico Progetto (opzionale)</mat-hint>
              </mat-form-field>
            </div>
          }
        </div>

        <!-- ── Sede / Indirizzo ─────────────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>location_on</mat-icon>
            <span>Sede legale</span>
          </div>
          <mat-form-field style="width:100%"><mat-label>Via</mat-label>
            <input matInput formControlName="via"></mat-form-field>
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
                @for (c of filteredCities; track c.name) {
                  <mat-option [value]="c.name">{{ c.name }}</mat-option>
                }
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

        <!-- ── Preferenze ───────────────────────────────── -->
        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>tune</mat-icon>
            <span>Preferenze commerciali</span>
            <span class="section-hint">Applicate in automatico nei nuovi documenti</span>
          </div>
          <div class="form-row">
            <mat-form-field>
              <mat-label>Metodo di pagamento preferito</mat-label>
              <mat-select formControlName="tipoPagamentoId">
                <mat-option [value]="null">— nessuno —</mat-option>
                @for (t of tipiPagamento; track t.id) {
                  <mat-option [value]="t.id">{{ t.nome }}</mat-option>
                }
              </mat-select>
              <mat-icon matSuffix>payments</mat-icon>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Aliquota IVA predefinita</mat-label>
              <mat-select formControlName="aliquotaIvaId">
                <mat-option [value]="null">— 22% (predefinita) —</mat-option>
                @for (a of aliquoteIva; track a.id) {
                  <mat-option [value]="a.id">
                    {{ a.valore }}% {{ a.codice ? '(' + a.codice + ')' : '' }} — {{ a.nome }}
                  </mat-option>
                }
              </mat-select>
              <mat-icon matSuffix>percent</mat-icon>
              <mat-hint>Applicata alle nuove righe nei documenti</mat-hint>
            </mat-form-field>
          </div>
          <div class="form-row">
            <mat-form-field>
              <mat-label>Listino prezzi</mat-label>
              <mat-select formControlName="listinoId">
                <mat-option [value]="null">— prezzo base —</mat-option>
                @for (l of listini; track l.id) {
                  <mat-option [value]="l.id">
                    {{ l.nome }}
                    @if (l.scontoDefault) { <span style="color:#94a3b8">&nbsp;(-{{ l.scontoDefault }}%)</span> }
                  </mat-option>
                }
              </mat-select>
              <mat-icon matSuffix>price_change</mat-icon>
              @if (form.value.listinoId) {
                <mat-hint>I prezzi del listino verranno applicati automaticamente</mat-hint>
              }
            </mat-form-field>
          </div>
          <div class="form-row" style="align-items:flex-start">
            <div>
              <mat-slide-toggle formControlName="ancheFornitore">È anche un fornitore</mat-slide-toggle>
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;max-width:520px">
                Crea (o collega) un'anagrafica fornitore gemella con gli stessi dati, così potrai
                registrarci acquisti e ordini fornitore. Le due schede restano sincronizzate.
              </div>
            </div>
          </div>
        </div>
      </form>
        </mat-tab>

        <!-- ── Tab Indirizzi ──────────────────────────────────── -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="font-size:18px;margin-right:4px;vertical-align:middle">place</mat-icon>
            Indirizzi
          </ng-template>
          <div style="padding-top:16px;min-height:200px">
            @if (!data?.id) {
              <div style="color:#94a3b8;text-align:center;padding:32px 0;font-size:14px">
                <mat-icon style="font-size:40px;width:40px;height:40px;display:block;margin:0 auto 8px">info_outline</mat-icon>
                Salva prima il cliente per gestire gli indirizzi aggiuntivi
              </div>
            } @else {
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <span style="font-size:13px;color:#64748b">Destinazioni di consegna salvate per questo cliente</span>
                <button mat-stroked-button type="button" (click)="addIndirizzo()">
                  <mat-icon>add</mat-icon> Aggiungi
                </button>
              </div>
              @if (!indirizzi.length) {
                <div style="color:#94a3b8;text-align:center;padding:24px 0;font-size:13px">Nessun indirizzo aggiuntivo</div>
              }
              @for (addr of indirizzi; track addr.id ?? $index) {
                @if (editingId === addr.id) {
                  <div class="addr-card addr-card--editing">
                    <div class="addr-edit-row">
                      <mat-form-field style="flex:1">
                        <mat-label>Nome / Etichetta</mat-label>
                        <input matInput [(ngModel)]="editBuf.nome" placeholder="es. Sede operativa">
                      </mat-form-field>
                    </div>
                    <div class="addr-edit-row">
                      <mat-form-field style="flex:2">
                        <mat-label>Via</mat-label>
                        <input matInput [(ngModel)]="editBuf.via">
                      </mat-form-field>
                      <mat-form-field style="max-width:90px">
                        <mat-label>CAP</mat-label>
                        <input matInput [(ngModel)]="editBuf.cap" maxlength="5">
                      </mat-form-field>
                    </div>
                    <div class="addr-edit-row">
                      <mat-form-field style="flex:2">
                        <mat-label>Città</mat-label>
                        <input matInput [(ngModel)]="editBuf.citta">
                      </mat-form-field>
                      <mat-form-field style="max-width:70px">
                        <mat-label>Prov.</mat-label>
                        <input matInput [(ngModel)]="editBuf.provincia" maxlength="2" style="text-transform:uppercase">
                      </mat-form-field>
                      <mat-form-field style="max-width:100px">
                        <mat-label>Stato</mat-label>
                        <input matInput [(ngModel)]="editBuf.stato">
                      </mat-form-field>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
                      <button mat-button type="button" (click)="cancelEdit()">Annulla</button>
                      <button mat-flat-button type="button" (click)="saveIndirizzo(addr)">Salva</button>
                    </div>
                  </div>
                } @else {
                  <div class="addr-card">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                      <div>
                        <div style="font-weight:600;font-size:13px;color:#1e293b">{{ addr.nome }}</div>
                        <div style="font-size:12px;color:#64748b;margin-top:2px">
                          {{ [addr.via, addr.cap, addr.citta, addr.provincia].filter(v => !!v).join(', ') }}
                        </div>
                      </div>
                      <div style="display:flex;gap:2px">
                        <button mat-icon-button type="button" (click)="startEdit(addr)" title="Modifica">
                          <mat-icon style="font-size:18px">edit</mat-icon>
                        </button>
                        <button mat-icon-button color="warn" type="button" (click)="deleteIndirizzo(addr)" title="Elimina">
                          <mat-icon style="font-size:18px">delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  </div>
                }
              }
              @if (editingId === 'new') {
                <div class="addr-card addr-card--editing" style="margin-top:8px">
                  <div class="addr-edit-row">
                    <mat-form-field style="flex:1">
                      <mat-label>Nome / Etichetta *</mat-label>
                      <input matInput [(ngModel)]="editBuf.nome" placeholder="es. Magazzino, Sede distaccata">
                    </mat-form-field>
                  </div>
                  <div class="addr-edit-row">
                    <mat-form-field style="flex:2">
                      <mat-label>Via</mat-label>
                      <input matInput [(ngModel)]="editBuf.via">
                    </mat-form-field>
                    <mat-form-field style="max-width:90px">
                      <mat-label>CAP</mat-label>
                      <input matInput [(ngModel)]="editBuf.cap" maxlength="5">
                    </mat-form-field>
                  </div>
                  <div class="addr-edit-row">
                    <mat-form-field style="flex:2">
                      <mat-label>Città</mat-label>
                      <input matInput [(ngModel)]="editBuf.citta">
                    </mat-form-field>
                    <mat-form-field style="max-width:70px">
                      <mat-label>Prov.</mat-label>
                      <input matInput [(ngModel)]="editBuf.provincia" maxlength="2" style="text-transform:uppercase">
                    </mat-form-field>
                    <mat-form-field style="max-width:100px">
                      <mat-label>Stato</mat-label>
                      <input matInput [(ngModel)]="editBuf.stato">
                    </mat-form-field>
                  </div>
                  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
                    <button mat-button type="button" (click)="cancelEdit()">Annulla</button>
                    <button mat-flat-button type="button" (click)="createIndirizzo()">Aggiungi</button>
                  </div>
                </div>
              }
            }
          </div>
        </mat-tab>

      </mat-tab-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.pending">Salva</button>
    </mat-dialog-actions>`,
  styles: [`
    .addr-card {
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px;
      margin-bottom: 8px; background: #fff;
    }
    .addr-card--editing { background: #f8fafc; border-color: #3b82f6; }
    .addr-edit-row { display:flex; gap:8px; }
  `]
})
export class ClienteDialogComponent implements OnInit {
  form: FormGroup;
  filteredCities: CityResult[] = [];
  tipiPagamento: TipoPagamento[] = [];
  listini: Listino[] = [];
  aliquoteIva: AliquotaIva[] = [];
  lookupLoading = false;
  get canLookupPiva(): boolean { return normalizePiva(this.form.get('pIva')?.value ?? '').length === 11; }
  private cityMap = new Map<string, CityResult>();

  // Address management
  indirizzi: ClienteIndirizzo[] = [];
  editingId: number | 'new' | null = null;
  editBuf: ClienteIndirizzo = { nome: '', via: '', cap: '', citta: '', provincia: '', stato: 'Italia' };

  addIndirizzo() {
    this.editingId = 'new';
    this.editBuf = { nome: '', via: '', cap: '', citta: '', provincia: '', stato: 'Italia' };
  }

  startEdit(addr: ClienteIndirizzo) {
    this.editingId = addr.id!;
    this.editBuf = { ...addr };
  }

  cancelEdit() {
    this.editingId = null;
    this.editBuf = { nome: '', via: '', cap: '', citta: '', provincia: '', stato: 'Italia' };
  }

  createIndirizzo() {
    if (!this.data?.id || !this.editBuf.nome.trim()) return;
    this.ds.createClienteIndirizzo(this.data.id, this.editBuf).subscribe({
      next: () => { this.loadIndirizzi(); this.cancelEdit(); },
      error: () => this.snack.open('Errore salvataggio indirizzo', '', { duration: 3000 }),
    });
  }

  saveIndirizzo(addr: ClienteIndirizzo) {
    if (!this.data?.id) return;
    this.ds.updateClienteIndirizzo(this.data.id, { ...this.editBuf, id: addr.id }).subscribe({
      next: () => { this.loadIndirizzi(); this.cancelEdit(); },
      error: () => this.snack.open('Errore aggiornamento indirizzo', '', { duration: 3000 }),
    });
  }

  deleteIndirizzo(addr: ClienteIndirizzo) {
    if (!this.data?.id || !addr.id) return;
    this.ds.deleteClienteIndirizzo(this.data.id, addr.id).subscribe({
      next: () => this.loadIndirizzi(),
      error: () => this.snack.open('Errore eliminazione indirizzo', '', { duration: 3000 }),
    });
  }

  private loadIndirizzi() {
    if (!this.data?.id) return;
    this.ds.getClienteIndirizzi(this.data.id).subscribe(a => this.indirizzi = a);
  }

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private dialog: MatDialog,
    private cityService: CityService,
    private snack: MatSnackBar,
    public dialogRef: MatDialogRef<ClienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Cliente | null
  ) {
    this.form = this.fb.group({
      ragioneSociale: [data?.ragioneSociale ?? '', Validators.required],
      email:          [data?.email ?? '', Validators.email],
      telefono:       [data?.telefono ?? '', telefonoValidator],
      cellulare:      [data?.cellulare ?? ''],
      via:            [data?.via ?? ''],
      cap:            [data?.cap ?? '', capValidator],
      citta:          [data?.citta ?? ''],
      provincia:      [data?.provincia ?? ''],
      stato:          [data?.stato ?? 'Italia'],
      codiceFiscale:  [data?.codiceFiscale ?? '', codiceFiscaleValidator],
      pIva:           [data?.pIva ?? '', pIvaValidator, this.pivaAsyncValidator('clienti', data?.id)],
      sdi:            [data?.sdi ?? ''],
      pec:            [data?.pec ?? ''],
      tipoPagamentoId:[data?.tipoPagamentoId ?? null],
      listinoId:      [data?.listinoId ?? null],
      tipoSoggetto:   [data?.tipoSoggetto ?? 'PRIVATO'],
      cig:            [data?.cig ?? ''],
      cup:            [data?.cup ?? ''],
      aliquotaIvaId:  [data?.aliquotaIvaId ?? null],
      ancheFornitore: [data?.ancheFornitore ?? false],
    });
  }

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
    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter(x => x.attivo));
    this.ds.getListini().subscribe(l => this.listini = l.filter(x => x.attivo));
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
    this.loadIndirizzi();

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
    const ref = this.dialog.open(AziendaSearchDialogComponent, { width: '580px', maxWidth: '95vw' });
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
    this.form.markAllAsTouched();
    if (this.form.pending) return;
    if (!this.form.valid) {
      this.snack.open('Correggi i campi evidenziati prima di salvare', '', { duration: 3000 });
      return;
    }
    this.dialogRef.close({ ...this.data, ...this.form.value });
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-clienti',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatFormFieldModule, MatInputModule, MatSortModule, MatPaginatorModule,
            MatTooltipModule, MatMenuModule, ColumnPickerComponent, EmptyStateComponent,
            TableKeyboardNavDirective, ExportMenuComponent],
  templateUrl: './clienti.html',
  styleUrl: './clienti.scss'
})
export class ClientiComponent implements OnInit, AfterViewInit {
  private confirm = inject(ConfirmService);
  print() {
    const rows = this.dataSource.data;
    const body = rows.map(c=>`<tr><td>${c.ragioneSociale}</td><td>${c.email||'—'}</td><td>${c.telefono||'—'}</td><td>${this.indirizzo(c)||'—'}</td><td>${c.codiceFiscale||'—'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Clienti</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}</style></head><body><h1>Clienti</h1><table><thead><tr><th>Ragione Sociale</th><th>Email</th><th>Telefono</th><th>Indirizzo</th><th>Cod. Fiscale</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }
  clienti: Cliente[] = [];
  dataSource = new MatTableDataSource<Cliente>([]);
  displayedColumns: string[] = ['ragioneSociale', 'pIva', 'telefono', 'indirizzo', 'azioni'];

  readonly allCols: ColDef[] = [
    { key: 'ragioneSociale', label: 'Ragione Sociale' },
    { key: 'pIva', label: 'P. IVA' },
    { key: 'telefono', label: 'Telefono' },
    { key: 'indirizzo', label: 'Città' },
    { key: 'fatturatoAnno', label: 'Fatturato anno', defaultVisible: false },
    { key: 'ultimoAcquisto', label: 'Ultimo acquisto', defaultVisible: false },
    { key: 'fattureInsolute', label: 'Insoluti', defaultVisible: false },
    { key: 'email', label: 'Email', defaultVisible: false },
    { key: 'cellulare', label: 'Cellulare', defaultVisible: false },
    { key: 'codiceFiscale', label: 'Cod. Fiscale', defaultVisible: false },
    { key: 'sdi', label: 'SDI', defaultVisible: false },
    { key: 'pec', label: 'PEC', defaultVisible: false },
    { key: 'id', label: 'ID', defaultVisible: false },
  ];

  filtroDormienti = false;
  filtroInsoluti = false;
  giorniDormienza(c: any): number | null {
    if (!c?.ultimoAcquisto) return null;
    const d = new Date(c.ultimoAcquisto);
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar, public excel: ExcelService, private router: Router) {}

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
      if (this.dialog.openDialogs.length) return;
      e.preventDefault();
      this.open();
    }
  }

  /** Id elemento da aprire dopo il caricamento (apertura scheda da ricerca globale). */
  private pendingOpenId: number | null = null;

  /** Va alle fatture già filtrate su questo cliente. */
  apriFatture(c: Cliente) {
    if (!c.id) return;
    this.router.navigate(['/fatture'], { state: { filtroCliente: c.id } });
  }

  ngOnInit() {
    this.pendingOpenId = consumePrefill<number>('openId');
    this.load();
    const pf = consumePrefill('prefill');
    if (pf) setTimeout(() => this.open(pf as Cliente), 0);
  }

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
          || (item.codiceFiscale ?? '').toLowerCase().includes(s)
          || (item.pIva ?? '').toLowerCase().includes(s)
          || this.indirizzo(item).toLowerCase().includes(s);
    };
  }

  load() { this.ds.getClienti().subscribe(c => { this.clienti = c; this.applyInsightFilter(); this.openPending(c); }); }

  private openPending(list: Cliente[]) {
    if (this.pendingOpenId == null) return;
    const it = list.find(x => x.id === this.pendingOpenId);
    this.pendingOpenId = null;
    if (it) setTimeout(() => this.open(it), 0);
  }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  applyInsightFilter() {
    let data = this.clienti;
    if (this.filtroDormienti) {
      data = data.filter((c: any) => { const g = this.giorniDormienza(c); return g === null || g > 90; });
    }
    if (this.filtroInsoluti) {
      data = data.filter((c: any) => (c.fattureInsolute ?? 0) > 0);
    }
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  toggleDormienti() { this.filtroDormienti = !this.filtroDormienti; this.applyInsightFilter(); }
  toggleInsoluti() { this.filtroInsoluti = !this.filtroInsoluti; this.applyInsightFilter(); }

  indirizzo(c: Cliente): string {
    return [c.via, c.cap, c.citta, c.provincia, c.stato].filter(Boolean).join(', ');
  }

  onColsChange(cols: string[]) { this.displayedColumns = cols.includes('azioni') ? cols : [...cols, 'azioni']; }

  open(c?: Cliente) {
    const ref = this.dialog.open(ClienteDialogComponent, { data: c ?? null, width: '95vw', maxWidth: '860px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateCliente(result) : this.ds.createCliente(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.error?.error || e.message, 'OK', { duration: 4000, panelClass: 'snack-error' }) });
    });
  }

  info(c: Cliente) {
    const fmtCurrency = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    const fmtDate = (s: string) => { const p = s.substring(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };
    const baseData: InfoDialogData = {
      title: c.ragioneSociale,
      sections: [
        {
          title: 'Attività commerciale',
          rows: [
            { label: 'Ultimo acquisto', value: c.ultimoAcquisto ? fmtDate(c.ultimoAcquisto) : 'Mai' },
            { label: 'Fatturato anno',  value: c.fatturatoAnno != null ? fmtCurrency(c.fatturatoAnno) : null },
            { label: 'Insoluti',        value: (c.fattureInsolute ?? 0) > 0 ? `${c.fattureInsolute} fatt.` : null },
          ],
        },
        {
          title: 'Contatti',
          rows: [
            { label: 'Email',     value: c.email },
            { label: 'Telefono',  value: c.telefono },
            { label: 'Cellulare', value: c.cellulare },
            { label: 'PEC',       value: c.pec },
          ],
        },
        {
          title: 'Sede legale',
          rows: [
            { label: 'Via',      value: c.via },
            { label: 'CAP',      value: c.cap },
            { label: 'Città',    value: c.citta },
            { label: 'Provincia',value: c.provincia },
            { label: 'Stato',    value: c.stato },
          ],
        },
        {
          title: 'Dati fiscali',
          rows: [
            { label: 'Partita IVA',    value: c.pIva, mono: true },
            { label: 'Codice Fiscale', value: c.codiceFiscale, mono: true },
            { label: 'Codice SDI',     value: c.sdi, mono: true },
          ],
        },
      ],
    };
    if (c.id) {
      this.ds.getClienteIndirizzi(c.id).subscribe(addrs => {
        if (addrs.length) {
          baseData.sections.push({
            title: 'Destinazioni salvate',
            rows: addrs.map(a => ({
              label: a.nome,
              value: [a.via, a.cap, a.citta, a.provincia].filter(v => !!v).join(', '),
            })),
          });
        }
        this.dialog.open(InfoDialogComponent, { data: baseData, width: '520px', maxWidth: '95vw' });
      });
    } else {
      this.dialog.open(InfoDialogComponent, { data: baseData, width: '520px', maxWidth: '95vw' });
    }
  }

  readonly exportCols: ExcelColumn<any>[] = [
    { header: 'Ragione Sociale', field: 'ragioneSociale', width: 30 },
    { header: 'Email',          field: 'email',          width: 28 },
    { header: 'Telefono',       field: 'telefono',       width: 16 },
    { header: 'Cellulare',      field: 'cellulare',      width: 16 },
    { header: 'Via',            field: 'via',            width: 28 },
    { header: 'CAP',            field: 'cap',            width: 8  },
    { header: 'Città',          field: 'citta',          width: 18 },
    { header: 'Provincia',      field: 'provincia',      width: 10 },
    { header: 'Stato',          field: 'stato',          width: 12 },
    { header: 'Codice Fiscale', field: 'codiceFiscale',  width: 18 },
    { header: 'P. IVA',         field: 'pIva',           width: 14 },
    { header: 'SDI',            field: 'sdi',            width: 10 },
    { header: 'PEC',            field: 'pec',            width: 28 },
  ];

  importExcel(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    this.excel.readFile(file).then(rows => {
      if (!rows.length) { this.snack.open('File vuoto', '', { duration: 3000 }); return; }
      this.dialog.open(ImportMappingDialogComponent, {
        data: { rows, fields: CLIENTI_FIELDS, entityType: 'clienti', entityLabel: 'Clienti' },
        disableClose: true,
      }).afterClosed().subscribe((result: MappingResult | null) => {
        if (!result) return;
        const v = (key: string, row: Record<string, any>) => String(row[result.mapping[key]] ?? '').trim();
        const records = rows.map(r => ({
          ragioneSociale: v('ragioneSociale', r),
          email:          v('email', r),
          telefono:       v('telefono', r),
          cellulare:      v('cellulare', r),
          via:            v('via', r),
          cap:            v('cap', r),
          citta:          v('citta', r),
          provincia:      v('provincia', r),
          stato:          v('stato', r) || 'Italia',
          codiceFiscale:  v('codiceFiscale', r),
          pIva:           v('pIva', r),
          sdi:            v('sdi', r),
          pec:            v('pec', r),
        })).filter(c => c.ragioneSociale.length > 0);
        if (!records.length) { this.snack.open('Nessun cliente valido: controlla la colonna Ragione Sociale', '', { duration: 5000 }); return; }
        this.ds.importClienti(records).subscribe({
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

  async delete(c: Cliente) {
    if (!await this.confirm.delete(`Eliminare ${c.ragioneSociale}?`)) return;
    this.ds.deleteCliente(c.id!).subscribe({
      next: () => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: (err) => {
        if (err.status === 409 && err.error?.counts) {
          const { fatture, ddt, preventivi, ordini, noteCredito } = err.error.counts;
          const parts: string[] = [];
          if (fatture > 0)     parts.push(`${fatture} fattur${fatture === 1 ? 'a' : 'e'}`);
          if (ddt > 0)         parts.push(`${ddt} document${ddt === 1 ? 'o' : 'i'} di trasporto`);
          if (preventivi > 0)  parts.push(`${preventivi} preventiv${preventivi === 1 ? 'o' : 'i'}`);
          if (ordini > 0)      parts.push(`${ordini} ordin${ordini === 1 ? 'e' : 'i'}`);
          if (noteCredito > 0) parts.push(`${noteCredito} nota${noteCredito === 1 ? ' di credito' : ' di credito'}`);
          this.snack.open(
            `Impossibile eliminare: ${c.ragioneSociale} ha ${parts.join(', ')} collegati.`,
            'OK', { duration: 8000 }
          );
        } else {
          this.snack.open('Errore durante l\'eliminazione', '', { duration: 3000 });
        }
      }
    });
  }
}

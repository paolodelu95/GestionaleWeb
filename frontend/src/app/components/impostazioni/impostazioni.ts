import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { CityService, CityResult } from '../../services/city.service';
import { Azienda, TipoPagamento, CategoriaProdotto, UnitaMisura, AliquotaIva, Utente } from '../../models';
import { pIvaValidator, codiceFiscaleValidator } from '../../validators/italian-validators';

// ── Tipo Pagamento Dialog ────────────────────────────────────────────────────
@Component({
  selector: 'app-tipo-pagamento-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica tipo pagamento' : 'Nuovo tipo pagamento' }}</h2>
    <mat-dialog-content style="min-width:480px">
      <div class="dialog-form">
        <mat-form-field style="width:100%">
          <mat-label>Nome *</mat-label>
          <input matInput [(ngModel)]="tp.nome">
        </mat-form-field>
        <div class="form-row">
          <mat-form-field>
            <mat-label>Conto</mat-label>
            <mat-select [(ngModel)]="tp.conto">
              <mat-option value="BANCA">Banca</mat-option>
              <mat-option value="CASSA">Cassa</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Giorni scadenza</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="tp.giorniScadenza" [disabled]="tp.immediato">
          </mat-form-field>
        </div>
        <div style="display:flex; gap:24px; padding:8px 0">
          <mat-checkbox [(ngModel)]="tp.immediato" (change)="onImmediatoChange()">Pagamento immediato</mat-checkbox>
          <mat-checkbox [(ngModel)]="tp.fineMese" [disabled]="tp.immediato || tp.giorniScadenza === 0">Fine mese</mat-checkbox>
          <mat-checkbox [(ngModel)]="tp.attivo">Attivo</mat-checkbox>
        </div>
        @if (tp.immediato) {
          <p style="color:#6366f1;font-size:13px;margin:0">
            Il pagamento viene registrato automaticamente all'emissione della fattura.
          </p>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!tp.nome">Salva</button>
    </mat-dialog-actions>`,
})
export class TipoPagamentoDialogComponent {
  tp: TipoPagamento;
  constructor(
    public dialogRef: MatDialogRef<TipoPagamentoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TipoPagamento | null
  ) {
    this.tp = data ? { ...data } : {
      nome: '', conto: 'BANCA', giorniScadenza: 0, fineMese: false, immediato: false, attivo: true
    };
  }
  onImmediatoChange() { if (this.tp.immediato) { this.tp.giorniScadenza = 0; this.tp.fineMese = false; } }
  save() { if (this.tp.nome) this.dialogRef.close(this.tp); }
}

// ── Categoria Prodotto Dialog ────────────────────────────────────────────────
@Component({
  selector: 'app-categoria-prodotto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica categoria' : 'Nuova categoria' }}</h2>
    <mat-dialog-content style="min-width:340px">
      <mat-form-field style="width:100%; margin-top:8px">
        <mat-label>Nome *</mat-label>
        <input matInput [(ngModel)]="nome" autofocus placeholder="es. Materiali, Servizi…">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!nome.trim()">Salva</button>
    </mat-dialog-actions>`
})
export class CategoriaProdottoDialogComponent {
  nome = '';
  constructor(
    public dialogRef: MatDialogRef<CategoriaProdottoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CategoriaProdotto | null
  ) { this.nome = data?.nome ?? ''; }
  save() { if (this.nome.trim()) this.dialogRef.close({ ...this.data, nome: this.nome.trim() }); }
}

// ── Unità di Misura Dialog ───────────────────────────────────────────────────
@Component({
  selector: 'app-unita-misura-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica unità di misura' : 'Nuova unità di misura' }}</h2>
    <mat-dialog-content style="min-width:360px">
      <div class="dialog-form" style="padding-top:8px">
        <mat-form-field style="width:100%">
          <mat-label>Nome *</mat-label>
          <input matInput [(ngModel)]="nome" autofocus placeholder="es. Pezzo, Chilogrammo…">
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Simbolo</mat-label>
          <input matInput [(ngModel)]="simbolo" placeholder="es. pz, kg, lt…">
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!nome.trim()">Salva</button>
    </mat-dialog-actions>`
})
export class UnitaMisuraDialogComponent {
  nome = '';
  simbolo = '';
  constructor(
    public dialogRef: MatDialogRef<UnitaMisuraDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UnitaMisura | null
  ) { this.nome = data?.nome ?? ''; this.simbolo = data?.simbolo ?? ''; }
  save() {
    if (this.nome.trim()) {
      this.dialogRef.close({ ...this.data, nome: this.nome.trim(), simbolo: this.simbolo.trim() || this.nome.trim() });
    }
  }
}

// ── Aliquota IVA Dialog ──────────────────────────────────────────────────────
@Component({
  selector: 'app-aliquota-iva-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica aliquota IVA' : 'Nuova aliquota IVA' }}</h2>
    <mat-dialog-content style="min-width:340px">
      <div class="dialog-form" style="padding-top:8px">
        <mat-form-field style="width:100%">
          <mat-label>Nome *</mat-label>
          <input matInput [(ngModel)]="nome" autofocus placeholder="es. Ordinaria, Agevolata…">
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Aliquota (%) *</mat-label>
          <input matInput type="number" min="0" max="100" step="0.01" [(ngModel)]="valore">
        </mat-form-field>
        <mat-checkbox [(ngModel)]="attiva" style="margin-top:4px">Attiva</mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!nome.trim() || valore == null">Salva</button>
    </mat-dialog-actions>`
})
export class AliquotaIvaDialogComponent {
  nome = '';
  valore: number = 22;
  attiva = true;
  constructor(
    public dialogRef: MatDialogRef<AliquotaIvaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AliquotaIva | null
  ) {
    this.nome = data?.nome ?? '';
    this.valore = data?.valore ?? 22;
    this.attiva = data?.attiva ?? true;
  }
  save() {
    if (this.nome.trim() && this.valore != null) {
      this.dialogRef.close({ ...this.data, nome: this.nome.trim(), valore: this.valore, attiva: this.attiva });
    }
  }
}

// ── Utente Dialog ────────────────────────────────────────────────────────────
@Component({
  selector: 'app-utente-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
            MatButtonModule, MatSelectModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica utente' : 'Nuovo utente' }}</h2>
    <mat-dialog-content style="min-width:440px">
      <div class="dialog-form" style="padding-top:8px">
        <mat-form-field style="width:100%">
          <mat-label>Username *</mat-label>
          <input matInput [(ngModel)]="u.username" autocomplete="off">
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>{{ data?.id ? 'Nuova password (lascia vuoto per non cambiare)' : 'Password *' }}</mat-label>
          <input matInput type="password" [(ngModel)]="u.password" autocomplete="new-password">
        </mat-form-field>
        <div class="form-row">
          <mat-form-field style="flex:2">
            <mat-label>Nome</mat-label>
            <input matInput [(ngModel)]="u.nome">
          </mat-form-field>
          <mat-form-field style="flex:1">
            <mat-label>Ruolo</mat-label>
            <mat-select [(ngModel)]="u.ruolo">
              <mat-option value="ADMIN">Admin</mat-option>
              <mat-option value="COMMERCIALE">Commerciale</mat-option>
              <mat-option value="MAGAZZINIERE">Magazziniere</mat-option>
              <mat-option value="CONTABILE">Contabile</mat-option>
              <mat-option value="OPERATORE">Operatore</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%">
          <mat-label>Email</mat-label>
          <input matInput type="email" [(ngModel)]="u.email">
        </mat-form-field>
        @if (data?.id) {
          <mat-checkbox [(ngModel)]="u.attivo">Utente attivo</mat-checkbox>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!u.username || (!data?.id && !u.password)">Salva</button>
    </mat-dialog-actions>`
})
export class UtenteDialogComponent {
  u: Utente & { password?: string };
  constructor(
    public dialogRef: MatDialogRef<UtenteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Utente | null
  ) {
    this.u = data ? { ...data, password: '' } : { username: '', password: '', nome: '', email: '', ruolo: 'OPERATORE', attivo: true };
  }
  save() {
    if (this.u.username && (this.data?.id || this.u.password))
      this.dialogRef.close(this.u);
  }
}

// ── Main Component ───────────────────────────────────────────────────────────
@Component({
  selector: 'app-impostazioni',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule,
            MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
            MatTableModule, MatTabsModule, MatDialogModule, MatSnackBarModule,
            MatAutocompleteModule, MatSelectModule, MatCheckboxModule,
            MatSlideToggleModule, MatProgressSpinnerModule],
  templateUrl: './impostazioni.html',
  styleUrl: './impostazioni.scss'
})
export class ImpostazioniComponent implements OnInit {
  form: FormGroup;
  filteredCities: CityResult[] = [];
  private cityMap = new Map<string, CityResult>();
  logoPreview: string = '';

  tipiPagamento: TipoPagamento[] = [];
  tpColumns = ['nome', 'conto', 'scadenza', 'immediato', 'attivo', 'azioni'];

  categorie: CategoriaProdotto[] = [];
  catColumns = ['nome', 'azioni'];

  unitaMisura: UnitaMisura[] = [];
  umColumns = ['nome', 'simbolo', 'azioni'];

  aliquoteIva: AliquotaIva[] = [];
  ivaColumns = ['nome', 'valore', 'attiva', 'azioni'];

  utenti: Utente[] = [];
  utenteColumns = ['username', 'nome', 'ruolo', 'attivo', 'azioni'];

  emailTesting = false;

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private cityService: CityService,
    private dialog: MatDialog,
    private snack: MatSnackBar
  ) {
    this.form = this.fb.group({
      ragioneSociale: [''], pIva: ['', pIvaValidator], codFiscale: ['', codiceFiscaleValidator],
      indirizzo: [''], cap: [''], citta: [''], provincia: [''], stato: [''],
      telefono: [''], email: [''], pec: [''], sdi: [''],
      iban: [''], banca: [''], logo: [''],
      smtpHost: [''], smtpPort: [587], smtpUser: [''], smtpPass: [''], smtpFrom: [''], smtpSecure: [false],
      sdiApiUrl: [''], sdiApiKey: [''],
      riordinoAutomatico: [false], multiUtenteAttivo: [false],
      numerazioneAnnuale: [true],
      prefissoDdt: [''], prefissoFatture: [''], prefissoOrdini: [''],
      prefissoPreventivi: [''], prefissoNoteCredito: [''], prefissoAcquisti: [''],
      prefissoVenditeBanco: [''], prefissoArriviMerce: [''],
    });
  }

  ngOnInit() {
    this.ds.getAzienda().subscribe(a => {
      if (a) {
        this.form.patchValue(a);
        this.logoPreview = a.logo || '';
        const p = a.numeroPrefissi || {};
        this.form.patchValue({
          prefissoDdt: p['ddt'] || '', prefissoFatture: p['fatture'] || '',
          prefissoOrdini: p['ordini'] || '', prefissoPreventivi: p['preventivi'] || '',
          prefissoNoteCredito: p['note_credito'] || '', prefissoAcquisti: p['acquisti'] || '',
          prefissoVenditeBanco: p['vendite_banco'] || '', prefissoArriviMerce: p['arrivi_merce'] || '',
        });
      }
    });

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

    this.loadTipiPagamento();
    this.loadCategorie();
    this.loadUnitaMisura();
    this.loadAliquoteIva();
    this.loadUtenti();
  }

  onCitySelected(name: string) {
    const r = this.cityMap.get(name);
    if (r) this.form.patchValue({ cap: r.cap, provincia: r.provincia, stato: 'Italia' }, { emitEvent: false });
  }

  onLogoSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.logoPreview = reader.result as string;
      this.form.patchValue({ logo: this.logoPreview });
    };
    reader.readAsDataURL(file);
  }

  removeLogo() {
    this.logoPreview = '';
    this.form.patchValue({ logo: '' });
  }

  save() {
    const v = this.form.value;
    const numeroPrefissi = {
      ddt: v.prefissoDdt || '', fatture: v.prefissoFatture || '',
      ordini: v.prefissoOrdini || '', preventivi: v.prefissoPreventivi || '',
      note_credito: v.prefissoNoteCredito || '', acquisti: v.prefissoAcquisti || '',
      vendite_banco: v.prefissoVenditeBanco || '', arrivi_merce: v.prefissoArriviMerce || '',
    };
    this.ds.saveAzienda({ ...v, logo: this.logoPreview, numeroPrefissi } as Azienda).subscribe({
      next: () => this.snack.open('Dati salvati', '', { duration: 2000 }),
      error: e => this.snack.open(e.message, '', { duration: 3000 }),
    });
  }

  testSmtp() {
    this.emailTesting = true;
    this.ds.saveAzienda({ ...this.form.value, logo: this.logoPreview } as Azienda).subscribe({
      next: () => this.ds.testSmtp().subscribe({
        next: () => { this.emailTesting = false; this.snack.open('Connessione SMTP riuscita!', '', { duration: 3000 }); },
        error: e => { this.emailTesting = false; this.snack.open('Errore SMTP: ' + e.error?.error, '', { duration: 5000 }); }
      }),
      error: () => { this.emailTesting = false; }
    });
  }

  // ── Tipi Pagamento ──────────────────────────────────────────────────────────
  loadTipiPagamento() { this.ds.getTipiPagamento().subscribe(t => { this.tipiPagamento = t; }); }

  openTipoPagamento(t?: TipoPagamento) {
    this.dialog.open(TipoPagamentoDialogComponent, { data: t ?? null, width: '520px' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const op = result.id ? this.ds.updateTipoPagamento(result) : this.ds.createTipoPagamento(result);
        op.subscribe({ next: () => { this.loadTipiPagamento(); this.snack.open('Salvato', '', { duration: 2000 }); },
                       error: e => this.snack.open(e.message, '', { duration: 3000 }) });
      });
  }

  deleteTipoPagamento(t: TipoPagamento) {
    if (!confirm(`Eliminare "${t.nome}"?`)) return;
    this.ds.deleteTipoPagamento(t.id!).subscribe({
      next: () => { this.loadTipiPagamento(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }

  scadenzaLabel(t: TipoPagamento): string {
    if (t.immediato) return 'Immediato';
    if (t.giorniScadenza === 0) return 'Vista fattura';
    return `${t.giorniScadenza}gg${t.fineMese ? ' FM' : ''}`;
  }

  // ── Categorie Prodotto ──────────────────────────────────────────────────────
  loadCategorie() { this.ds.getCategorieProdotto().subscribe(c => { this.categorie = c; }); }

  openCategoria(c?: CategoriaProdotto) {
    this.dialog.open(CategoriaProdottoDialogComponent, { data: c ?? null, width: '400px' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const op = result.id ? this.ds.updateCategoriaProdotto(result) : this.ds.createCategoriaProdotto(result);
        op.subscribe({ next: () => { this.loadCategorie(); this.snack.open('Salvato', '', { duration: 2000 }); },
                       error: e => this.snack.open(e.message, '', { duration: 3000 }) });
      });
  }

  deleteCategoria(c: CategoriaProdotto) {
    if (!confirm(`Eliminare la categoria "${c.nome}"?`)) return;
    this.ds.deleteCategoriaProdotto(c.id!).subscribe({
      next: () => { this.loadCategorie(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }

  // ── Unità di Misura ─────────────────────────────────────────────────────────
  loadUnitaMisura() { this.ds.getUnitaMisura().subscribe(u => { this.unitaMisura = u; }); }

  openUnitaMisura(u?: UnitaMisura) {
    this.dialog.open(UnitaMisuraDialogComponent, { data: u ?? null, width: '400px' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const op = result.id ? this.ds.updateUnitaMisura(result) : this.ds.createUnitaMisura(result);
        op.subscribe({ next: () => { this.loadUnitaMisura(); this.snack.open('Salvato', '', { duration: 2000 }); },
                       error: e => this.snack.open(e.message, '', { duration: 3000 }) });
      });
  }

  deleteUnitaMisura(u: UnitaMisura) {
    if (!confirm(`Eliminare "${u.nome}"?`)) return;
    this.ds.deleteUnitaMisura(u.id!).subscribe({
      next: () => { this.loadUnitaMisura(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }

  // ── Aliquote IVA ────────────────────────────────────────────────────────────
  loadAliquoteIva() { this.ds.getAliquoteIva().subscribe(a => { this.aliquoteIva = a; }); }

  openAliquotaIva(a?: AliquotaIva) {
    this.dialog.open(AliquotaIvaDialogComponent, { data: a ?? null, width: '400px' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const op = result.id ? this.ds.updateAliquotaIva(result) : this.ds.createAliquotaIva(result);
        op.subscribe({ next: () => { this.loadAliquoteIva(); this.snack.open('Salvato', '', { duration: 2000 }); },
                       error: e => this.snack.open(e.message, '', { duration: 3000 }) });
      });
  }

  deleteAliquotaIva(a: AliquotaIva) {
    if (!confirm(`Eliminare l'aliquota "${a.nome}"?`)) return;
    this.ds.deleteAliquotaIva(a.id!).subscribe({
      next: () => { this.loadAliquoteIva(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }

  // ── Utenti ──────────────────────────────────────────────────────────────────
  loadUtenti() { this.ds.getUtenti().subscribe(u => { this.utenti = u; }); }

  openUtente(u?: Utente) {
    this.dialog.open(UtenteDialogComponent, { data: u ?? null, width: '480px' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const op = result.id ? this.ds.updateUtente(result) : this.ds.createUtente(result);
        op.subscribe({
          next: () => { this.loadUtenti(); this.snack.open('Salvato', '', { duration: 2000 }); },
          error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 })
        });
      });
  }

  deleteUtente(u: Utente) {
    if (!confirm(`Eliminare l'utente "${u.username}"?`)) return;
    this.ds.deleteUtente(u.id!).subscribe({
      next: () => { this.loadUtenti(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 })
    });
  }

  ruoloLabel(ruolo: string): string {
    const map: Record<string, string> = {
      ADMIN: 'Admin', COMMERCIALE: 'Commerciale',
      MAGAZZINIERE: 'Magazziniere', CONTABILE: 'Contabile', OPERATORE: 'Operatore'
    };
    return map[ruolo] ?? ruolo;
  }
}

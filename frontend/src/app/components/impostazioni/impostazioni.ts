import { inject, Component, OnInit, Inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { EmptyStateComponent } from '../shared/empty-state';
import { ConfirmService } from '../shared/confirm-dialog';
import { LayoutService, NavLayout, Density } from '../../services/layout.service';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PrintService } from '../../services/print.service';
import { TEMPLATE_PRESETS, TemplatePreset } from '../../services/template-presets';
import { SectionKey, ColumnKey } from '../../models';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { UpdateService } from '../../services/update.service';
import { CityService, CityResult } from '../../services/city.service';
import { Azienda, TipoPagamento, CategoriaProdotto, CausalePagamento, UnitaMisura, AliquotaIva, Utente, NotaRapida, TemplateConfig, NotificheConfig, ModuloDto, BackupConfig } from '../../models';
import { DesktopService } from '../../services/desktop.service';
import { ModuliService } from '../../services/moduli.service';
import { DocLockService } from '../../services/doc-lock.service';
import { pIvaValidator, codiceFiscaleValidator, ibanValidator } from '../../validators/italian-validators';
import { AuthService } from '../../services/auth.service';
import { AdminComponent } from '../admin/admin';
import { SuperAdminComponent } from '../super-admin/super-admin';

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
          <p style="color:#11769b;font-size:13px;margin:0">
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
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica categoria' : 'Nuova categoria' }}</h2>
    <mat-dialog-content style="min-width:340px">
      <mat-form-field style="width:100%; margin-top:8px">
        <mat-label>Nome *</mat-label>
        <input matInput [(ngModel)]="nome" autofocus placeholder="es. Materiali, Servizi…">
      </mat-form-field>
      <mat-form-field style="width:100%; margin-top:4px">
        <mat-label>IVA predefinita</mat-label>
        <mat-select [(ngModel)]="aliquotaIvaId">
          <mat-option [value]="null">— nessuna (usa IVA prodotto) —</mat-option>
          @for (a of aliquoteIva; track a.id) {
            @if (a.categoria === 'Imponibile') {
              <mat-option [value]="a.id">{{ a.valore }}% — {{ a.nome }}</mat-option>
            }
          }
        </mat-select>
        <mat-hint>Applicata ai nuovi prodotti creati in questa categoria</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!nome.trim()">Salva</button>
    </mat-dialog-actions>`
})
export class CategoriaProdottoDialogComponent implements OnInit {
  nome = '';
  aliquotaIvaId: number | null = null;
  aliquoteIva: AliquotaIva[] = [];
  constructor(
    private ds: DataService,
    public dialogRef: MatDialogRef<CategoriaProdottoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CategoriaProdotto | null
  ) {
    this.nome = data?.nome ?? '';
    this.aliquotaIvaId = data?.aliquotaIvaId ?? null;
  }
  ngOnInit() { this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva)); }
  save() { if (this.nome.trim()) this.dialogRef.close({ ...this.data, nome: this.nome.trim(), aliquotaIvaId: this.aliquotaIvaId }); }
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

// ── Nota Rapida Dialog ───────────────────────────────────────────────────────
@Component({
  selector: 'app-nota-rapida-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica nota rapida' : 'Nuova nota rapida' }}</h2>
    <mat-dialog-content style="min-width:400px">
      <mat-form-field style="width:100%; margin-top:8px">
        <mat-label>Testo *</mat-label>
        <input matInput [(ngModel)]="testo" autofocus placeholder="es. Prezzi IVA esclusa, Trasporto incluso…">
      </mat-form-field>
      <mat-form-field style="width:120px; margin-top:4px">
        <mat-label>Ordine</mat-label>
        <input matInput type="number" [(ngModel)]="ordine" min="0">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!testo.trim()">Salva</button>
    </mat-dialog-actions>`
})
export class NotaRapidaDialogComponent {
  testo = '';
  ordine = 0;
  constructor(
    public dialogRef: MatDialogRef<NotaRapidaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NotaRapida | null
  ) { this.testo = data?.testo ?? ''; this.ordine = data?.ordine ?? 0; }
  save() { if (this.testo.trim()) this.dialogRef.close({ ...this.data, testo: this.testo.trim(), ordine: this.ordine }); }
}

// ── Causale Pagamento Dialog ─────────────────────────────────────────────────
@Component({
  selector: 'app-causale-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica causale' : 'Nuova causale' }}</h2>
    <mat-dialog-content style="min-width:400px">
      <mat-form-field style="width:100%; margin-top:8px">
        <mat-label>Causale *</mat-label>
        <input matInput [(ngModel)]="nome" autofocus placeholder="es. Affitto negozio, Stipendi, Bolletta Luce…"
               (keyup.enter)="save()">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!nome.trim()">Salva</button>
    </mat-dialog-actions>`
})
export class CausaleDialogComponent {
  nome = '';
  constructor(
    public dialogRef: MatDialogRef<CausaleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CausalePagamento | null
  ) { this.nome = data?.nome ?? ''; }
  save() { if (this.nome.trim()) this.dialogRef.close({ ...this.data, nome: this.nome.trim() }); }
}

// ── Prefisso Conferma Dialog ─────────────────────────────────────────────────
interface PrefissoCambiato { documento: string; da: string; a: string; }

@Component({
  selector: 'app-prefisso-conferma-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px">
      <mat-icon style="color:#f59e0b">warning</mat-icon> Modifica prefisso numerazione
    </h2>
    <mat-dialog-content style="min-width:420px;max-width:560px">
      <p style="margin:0 0 12px">
        Hai modificato il prefisso per i seguenti documenti.
        La numerazione <strong>ripartirà da 1</strong> con il nuovo prefisso:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:12px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:6px 10px;text-align:left;font-weight:600">Documento</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600">Prefisso attuale</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600">Nuovo prefisso</th>
          </tr>
        </thead>
        <tbody>
          @for (c of data; track c.documento) {
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:6px 10px">{{ c.documento }}</td>
              <td style="padding:6px 10px;color:#64748b;font-family:monospace">{{ c.da || '(nessuno)' }}</td>
              <td style="padding:6px 10px;color:#0f172a;font-family:monospace;font-weight:600">{{ c.a || '(nessuno)' }}</td>
            </tr>
          }
        </tbody>
      </table>
      <p style="margin:0;font-size:13px;color:#64748b">
        Se in futuro ripristini il prefisso precedente, la numerazione riprenderà automaticamente dall'ultimo numero usato con quel prefisso.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Annulla</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="true">Conferma</button>
    </mat-dialog-actions>`
})
export class PrefissoConfermaDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<PrefissoConfermaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PrefissoCambiato[]
  ) {}
}

// ── Main Component ───────────────────────────────────────────────────────────
@Component({
  selector: 'app-impostazioni',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule,
            MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
            MatTableModule, MatTabsModule, MatDialogModule, MatSnackBarModule,
            MatAutocompleteModule, MatSelectModule, MatCheckboxModule,
            MatSlideToggleModule, MatProgressSpinnerModule, MatRadioModule, MatMenuModule,
            MatExpansionModule, MatButtonToggleModule, MatSliderModule, MatTooltipModule, DragDropModule,
            EmptyStateComponent, AdminComponent, SuperAdminComponent],
  templateUrl: './impostazioni.html',
  styleUrl: './impostazioni.scss'
})
export class ImpostazioniComponent implements OnInit {
  private confirm = inject(ConfirmService);
  private layout = inject(LayoutService);
  private authSvc = inject(AuthService);
  private desktop = inject(DesktopService);
  readonly update = inject(UpdateService);

  /** Verifica manuale aggiornamenti (sezione Impostazioni → Aggiornamenti). */
  verificaInCorso = false;
  async verificaAggiornamenti() {
    if (this.verificaInCorso) return;
    this.verificaInCorso = true;
    try {
      const esito = await this.update.check();
      if (esito === 'disponibile') {
        this.snack.open(`Aggiornamento disponibile: versione ${this.update.disponibile()?.version}.`, 'OK', { duration: 6000 });
      } else if (esito === 'aggiornato') {
        this.snack.open('Ordeva è già all\'ultima versione disponibile.', '', { duration: 3500 });
      } else {
        const dett = this.update.ultimoErrore();
        this.snack.open(`Impossibile verificare gli aggiornamenti ora${dett ? ` (${dett})` : ' (controlla la connessione)'}.`, '', { duration: 6000 });
      }
    } finally {
      this.verificaInCorso = false;
    }
  }

  /** Edizione offline: nasconde le schede SaaS (Email/SMTP, Moduli, Utenti, Amministrazione, Console SaaS). */
  readonly offline = environment.offline;

  /** Sezione attiva del menu laterale delle impostazioni. */
  sezione = 'azienda';

  /**
   * Voci del menu laterale, raggruppate per area. La visibilità delle voci che
   * dipendono dall'edizione/ruolo è filtrata qui, così il menu mostra solo ciò
   * che è davvero disponibile (i gruppi vuoti spariscono).
   */
  get navGroups(): { label: string; items: { id: string; label: string; icon: string }[] }[] {
    const groups = [
      { label: 'Azienda', items: [
        { id: 'azienda',  label: 'Anagrafica azienda', icon: 'business' },
        { id: 'aspetto',  label: 'Aspetto',            icon: 'palette' },
        { id: 'avanzate', label: 'Avanzate',           icon: 'tune' },
      ] },
      { label: 'Documenti', items: [
        { id: 'grafica', label: 'Grafica documenti', icon: 'auto_awesome' },
        { id: 'sdi',     label: 'SDI / e-Fattura',   icon: 'cloud_upload' },
        { id: 'avvisi',  label: 'Avvisi documenti',  icon: 'notifications' },
      ] },
      { label: 'Anagrafiche', items: [
        { id: 'pagamenti', label: 'Tipi di pagamento',  icon: 'payments' },
        { id: 'causali',   label: 'Causali pagamento',  icon: 'receipt_long' },
        { id: 'categorie', label: 'Categorie prodotto', icon: 'category' },
        { id: 'unita',     label: 'Unità di misura',    icon: 'straighten' },
        { id: 'iva',       label: 'Aliquote IVA',       icon: 'percent' },
        { id: 'note',      label: 'Note rapide',        icon: 'sticky_note_2' },
      ] },
      { label: 'Sistema', items: [
        ...(!this.offline ? [{ id: 'moduli', label: 'Moduli', icon: 'extension' }] : []),
        ...(!this.offline ? [{ id: 'email',  label: 'Email', icon: 'mail' }] : []),
        ...(!this.offline ? [{ id: 'utenti', label: 'Utenti', icon: 'group' }] : []),
        ...(this.offline && this.backupCfg ? [{ id: 'backup', label: 'Backup', icon: 'backup' }] : []),
        ...(this.offline && this.isDesktop ? [{ id: 'dati', label: 'Dati e sincronizzazione', icon: 'folder' }] : []),
        ...(this.offline ? [{ id: 'aggiornamenti', label: 'Aggiornamenti', icon: 'system_update' }] : []),
        ...(this.isAdmin && !this.offline ? [{ id: 'admin', label: 'Amministrazione', icon: 'admin_panel_settings' }] : []),
        ...(this.isSuper && !this.offline ? [{ id: 'console', label: 'Console SaaS', icon: 'dns' }] : []),
      ] },
    ];
    return groups.filter(g => g.items.length > 0);
  }

  // ── Backup (offline) ──────────────────────────────────────────────────────
  backupCfg: BackupConfig | null = null;
  backupFiles: { name: string; encrypted: boolean; size: number; mtime: string }[] = [];
  backupBusy = false;
  get isDesktop(): boolean { return this.desktop.isDesktop; }

  // ── Dati e sincronizzazione (offline) ───────────────────────────────────────
  dataDir = '';
  dataFiles: { nome: string; esiste: boolean; bytes: number }[] = [];
  dataBusy = false;
  /** Avvio automatico col computer (plugin Tauri autostart). */
  autostart = false;
  /** Cronologia versioni (snapshot) ripristinabili. */
  snapshots: { name: string; size: number; mtime: string }[] = [];
  snapBusy = false;
  /** Cifratura del database a riposo. */
  cifraturaAttiva = false;
  cifraturaPasswordImpostata = false;
  cifraturaBusy = false;

  /** Ruolo utente: le schede Amministrazione e Console SaaS sono qui dentro, gated per ruolo. */
  get isSuper(): boolean { return this.authSvc.getUser()?.ruolo === 'SUPERADMIN'; }
  get isAdmin(): boolean { return this.isSuper || this.authSvc.getUser()?.ruolo === 'ADMIN'; }

  /** Layout di navigazione corrente (barra laterale / superiore). */
  get navLayout(): NavLayout { return this.layout.navLayout(); }
  setNavLayout(v: NavLayout) { this.layout.setNavLayout(v); }

  /** Densità dell'interfaccia (compatta desktop / comoda). */
  get density(): Density { return this.layout.density(); }
  setDensity(v: Density) { this.layout.setDensity(v); }
  form: FormGroup;
  filteredCities: CityResult[] = [];
  private cityMap = new Map<string, CityResult>();
  logoPreview: string = '';
  private prefissiOriginali: Record<string, string> = {};

  private readonly PREFISSI_MAP = [
    { field: 'prefissoDdt',        documento: 'Documenti di trasporto' },
    { field: 'prefissoFatture',    documento: 'Fatture' },
    { field: 'prefissoOrdini',     documento: 'Ordini' },
    { field: 'prefissoPreventivi', documento: 'Preventivi' },
    { field: 'prefissoNoteCredito',documento: 'Note di credito' },
    { field: 'prefissoAcquisti',   documento: 'Acquisti' },
    { field: 'prefissoVenditeBanco',documento: 'Vendite al banco' },
    { field: 'prefissoArriviMerce',documento: 'Arrivi merce' },
  ];

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

  noteRapide: NotaRapida[] = [];
  causali: CausalePagamento[] = [];
  notaRapidaColumns = ['testo', 'ordine', 'azioni'];
  causaliColumns = ['nome', 'azioni'];


  emailTesting = false;

  moduli: ModuloDto[] = [];
  moduliSaving = false;

  templateConfig: TemplateConfig = { stile: 'classico' };
  notificheConfig: NotificheConfig = { avvisoInsolutiDdt: true, avvisoInsolutiFattura: true };
  readonly templateBlocks: { key: string; label: string }[] = [
    { key: 'parti', label: 'Mittente / Destinatario' },
    { key: 'tabella', label: 'Tabella prodotti' },
    { key: 'totali', label: 'Totali e IVA' },
    { key: 'pagamento', label: 'Modalità di pagamento' },
    { key: 'trasporto', label: 'Dati trasporto (doc. di trasporto)' },
    { key: 'firme', label: 'Firme (doc. di trasporto)' },
    { key: 'note', label: 'Note' },
    { key: 'immaginiPreventivo', label: 'Immagini prodotti accanto al codice (preventivo)' },
    { key: 'footer', label: 'Piè di pagina' },
  ];

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private cityService: CityService,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private moduliSvc: ModuliService,
    private docLockSvc: DocLockService,
    private printSvc: PrintService,
    private sanitizer: DomSanitizer,
  ) {
    this.form = this.fb.group({
      ragioneSociale: [''], pIva: ['', pIvaValidator], codFiscale: ['', codiceFiscaleValidator],
      indirizzo: [''], cap: [''], citta: [''], provincia: [''], stato: [''],
      telefono: [''], email: [''], pec: [''], sdi: [''],
      iban: ['', ibanValidator], banca: [''], logo: [''],
      smtpHost: [''], smtpPort: [587, [Validators.min(1), Validators.max(65535)]], smtpUser: [''], smtpPass: [''], smtpFrom: [''], smtpSecure: [false],
      emailCorpoDocumento: [''],
      emailMode: ['SMTP'],
      sdiProvider: ['GENERICO'], sdiApiUrl: [''], sdiApiKey: [''],
      riordinoAutomatico: [false], multiUtenteAttivo: [false],
      numerazioneAnnuale: [true],
      lockDocumentiDefault: [true],
      // Fiscale: regime + default precompilati nei nuovi documenti
      regimeFiscale: ['RF01'],
      ritenutaAliquotaDefault: [0], ritenutaCausaleDefault: [''], ritenutaTipoDefault: ['RT02'],
      cassaTipoDefault: [''], cassaAliquotaDefault: [0], cassaIvaDefault: [0],
      prefissoDdt: [''], prefissoFatture: [''], prefissoOrdini: [''],
      prefissoPreventivi: [''], prefissoNoteCredito: [''], prefissoAcquisti: [''],
      prefissoVenditeBanco: [''], prefissoArriviMerce: [''],
    });
  }

  ngOnInit() {
    if (this.offline) this.loadBackupConfig();
    if (this.offline && this.isDesktop) this.loadSistemaPercorsi();
    this.ds.getAzienda().subscribe(a => {
      if (a) {
        this.form.patchValue(a);
        this.logoPreview = a.logo || '';
        const p = a.numeroPrefissi || {};
        const prefissiCaricati = {
          prefissoDdt: p['ddt'] || '', prefissoFatture: p['fatture'] || '',
          prefissoOrdini: p['ordini'] || '', prefissoPreventivi: p['preventivi'] || '',
          prefissoNoteCredito: p['note_credito'] || '', prefissoAcquisti: p['acquisti'] || '',
          prefissoVenditeBanco: p['vendite_banco'] || '', prefissoArriviMerce: p['arrivi_merce'] || '',
        };
        this.form.patchValue(prefissiCaricati);
        this.prefissiOriginali = { ...prefissiCaricati };
        this.templateConfig = a.templateConfig
          ? { ...a.templateConfig, blocks: { ...a.templateConfig.blocks } }
          : { stile: 'classico' };
        if (!this.templateConfig.blocks) this.templateConfig.blocks = {};
        this.initGraficaEditor();
        this.notificheConfig = a.notificheConfig
          ? { ...a.notificheConfig }
          : { avvisoInsolutiDdt: true, avvisoInsolutiFattura: true };
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
    this.loadNoteRapide();
    this.loadCausali();
    this.loadModuli();
  }

  // ── Moduli (Livello 2) ──────────────────────────────────────────────────────
  loadModuli() {
    this.ds.getModuli(true).subscribe(m => this.moduli = m);
  }

  categorieModuli(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of this.moduli) {
      if (!seen.has(m.categoria)) { seen.add(m.categoria); out.push(m.categoria); }
    }
    return out;
  }

  moduliPerCategoria(cat: string): ModuloDto[] {
    return this.moduli.filter(m => m.categoria === cat);
  }

  toggleModulo(m: ModuloDto, attivo: boolean) {
    if (m.core) return;
    this.moduliSaving = true;
    this.ds.setModulo(m.slug, attivo).subscribe({
      next: updated => {
        const i = this.moduli.findIndex(x => x.slug === m.slug);
        if (i >= 0) this.moduli[i] = updated;
        // Aggiorna lo stato globale così menu/HomeApp filtrano subito
        this.ds.invalidateModuli();
        this.moduliSvc.load(true).subscribe();
        this.moduliSaving = false;
        this.snack.open(attivo ? `Modulo "${m.nome}" attivato` : `Modulo "${m.nome}" disattivato`, '', { duration: 2200 });
      },
      error: e => {
        this.moduliSaving = false;
        this.snack.open(e.error?.error || e.message, '', { duration: 3000 });
        this.loadModuli();
      },
    });
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

  /** Endpoint suggerito per i provider noti (l'utente può comunque modificarlo). */
  private readonly SDI_ENDPOINT: Record<string, string> = {
    ARUBA: 'https://ws.fatturazioneelettronica.aruba.it',
    FIC:   'https://api-v2.fattureincloud.it',
  };

  /** Al cambio provider, precompila l'URL noto se il campo è vuoto o standard. */
  onSdiProviderChange(provider: string) {
    const known = Object.values(this.SDI_ENDPOINT);
    const cur = (this.form.get('sdiApiUrl')?.value || '').trim();
    if (provider === 'GENERICO') return;            // URL libero: non tocco
    if (!cur || known.includes(cur)) {
      this.form.patchValue({ sdiApiUrl: this.SDI_ENDPOINT[provider] || '' });
    }
  }

  save() {
    const v = this.form.value;
    const cambiati: PrefissoCambiato[] = this.PREFISSI_MAP
      .filter(({ field }) => (this.prefissiOriginali[field] ?? '') !== (v[field] || ''))
      .map(({ field, documento }) => ({
        documento,
        da: this.prefissiOriginali[field] ?? '',
        a: v[field] || '',
      }));

    if (cambiati.length > 0) {
      const ref = this.dialog.open(PrefissoConfermaDialogComponent, { data: cambiati, width: '560px' });
      ref.afterClosed().subscribe(confirmed => {
        if (confirmed) {
          this.doSave();
        } else {
          this.form.patchValue(this.prefissiOriginali, { emitEvent: false });
        }
      });
    } else {
      this.doSave();
    }
  }

  private doSave() {
    const v = this.form.value;
    const numeroPrefissi = {
      ddt: v.prefissoDdt || '', fatture: v.prefissoFatture || '',
      ordini: v.prefissoOrdini || '', preventivi: v.prefissoPreventivi || '',
      note_credito: v.prefissoNoteCredito || '', acquisti: v.prefissoAcquisti || '',
      vendite_banco: v.prefissoVenditeBanco || '', arrivi_merce: v.prefissoArriviMerce || '',
    };
    this.ds.saveAzienda({ ...v, logo: this.logoPreview, numeroPrefissi, templateConfig: this.templateConfig, notificheConfig: this.notificheConfig } as Azienda).subscribe({
      next: () => {
        this.prefissiOriginali = {
          prefissoDdt: v.prefissoDdt || '', prefissoFatture: v.prefissoFatture || '',
          prefissoOrdini: v.prefissoOrdini || '', prefissoPreventivi: v.prefissoPreventivi || '',
          prefissoNoteCredito: v.prefissoNoteCredito || '', prefissoAcquisti: v.prefissoAcquisti || '',
          prefissoVenditeBanco: v.prefissoVenditeBanco || '', prefissoArriviMerce: v.prefissoArriviMerce || '',
        };
        this.ds.invalidateEmailMode();
        this.docLockSvc.setEnabled(v.lockDocumentiDefault !== false);
        this.snack.open('Dati salvati', '', { duration: 2000 });
      },
      error: e => this.snack.open(e.message, '', { duration: 3000 }),
    });
  }

  saveNotificheConfig() {
    const v = this.form.value;
    const numeroPrefissi = {
      ddt: v.prefissoDdt || '', fatture: v.prefissoFatture || '',
      ordini: v.prefissoOrdini || '', preventivi: v.prefissoPreventivi || '',
      note_credito: v.prefissoNoteCredito || '', acquisti: v.prefissoAcquisti || '',
      vendite_banco: v.prefissoVenditeBanco || '', arrivi_merce: v.prefissoArriviMerce || '',
    };
    this.ds.saveAzienda({ ...v, logo: this.logoPreview, numeroPrefissi, templateConfig: this.templateConfig, notificheConfig: this.notificheConfig } as Azienda).subscribe({
      next: () => this.snack.open('Impostazioni avvisi salvate', '', { duration: 2000 }),
      error: e => this.snack.open(e.message, '', { duration: 3000 }),
    });
  }

  // ── Editor grafica documenti ──────────────────────────────────────────────
  readonly presets = TEMPLATE_PRESETS;
  readonly fontOptions: { value: 'helvetica' | 'times' | 'courier'; label: string }[] = [
    { value: 'helvetica', label: 'Helvetica (lineare)' },
    { value: 'times', label: 'Times (con grazie)' },
    { value: 'courier', label: 'Courier (monospazio)' },
  ];
  readonly colorFields: { key: string; label: string; def: string }[] = [
    { key: 'accent', label: 'Principale', def: '#0e6480' },
    { key: 'text', label: 'Testo', def: '#1a1a2e' },
    { key: 'muted', label: 'Testo secondario', def: '#64748b' },
    { key: 'rowAlt', label: 'Righe alternate', def: '#f8fafc' },
    { key: 'lightBg', label: 'Sfondi tenui', def: '#f0f2f8' },
  ];
  readonly footerFields: { key: string; label: string }[] = [
    { key: 'showRagioneSociale', label: 'Ragione sociale' },
    { key: 'showPiva', label: 'P.IVA' },
    { key: 'showCodFiscale', label: 'Cod. fiscale' },
    { key: 'showPec', label: 'PEC' },
    { key: 'showSdi', label: 'Codice SDI' },
    { key: 'showPageNumber', label: 'Numero pagina' },
  ];
  readonly sectionLabels: Record<string, string> = {
    parti: 'Mittente / Destinatario', tabella: 'Tabella prodotti',
    totali: 'Totali e IVA', pagamento: 'Pagamento', note: 'Note',
  };
  readonly columnLabels: Record<string, string> = {
    num: 'N. riga', codiceDescrizione: 'Codice / Descrizione', quantita: 'Quantità',
    um: 'Unità di misura', prezzo: 'Prezzo', sconto: 'Sconto %', iva: 'IVA', importo: 'Importo',
  };
  // Il numero riga (#) NON è più forzato: si può togliere dalla stampa.
  readonly forcedColumns: string[] = ['codiceDescrizione', 'importo'];

  sectionsOrderList: SectionKey[] = ['parti', 'tabella', 'totali', 'pagamento', 'note'];
  columnsList: { key: ColumnKey; visible: boolean }[] = [];

  previewSafeUrl?: SafeResourceUrl;
  previewLoading = false;
  private previewBlobUrl?: string;
  private previewTimer?: any;

  private initGraficaEditor() {
    const tc = this.templateConfig;
    const baseSections: SectionKey[] = ['parti', 'tabella', 'totali', 'pagamento', 'note'];
    if (tc.sectionsOrder && tc.sectionsOrder.length) {
      const known = tc.sectionsOrder.filter(k => baseSections.includes(k));
      this.sectionsOrderList = [...known, ...baseSections.filter(k => !known.includes(k))];
    } else {
      this.sectionsOrderList = [...baseSections];
    }
    const allCols: ColumnKey[] = ['num', 'codiceDescrizione', 'quantita', 'um', 'prezzo', 'sconto', 'iva', 'importo'];
    if (tc.columns && tc.columns.length) {
      const present = tc.columns.map(c => c.key);
      this.columnsList = [
        ...tc.columns.filter(c => allCols.includes(c.key)).map(c => ({ key: c.key, visible: c.visible !== false })),
        ...allCols.filter(k => !present.includes(k)).map(k => ({ key: k, visible: true })),
      ];
    } else {
      this.columnsList = allCols.map(k => ({ key: k, visible: true }));
    }
    this.schedulePreview();
  }

  private touch() {
    this.templateConfig = { ...this.templateConfig };
    this.schedulePreview();
  }

  private schedulePreview() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.refreshPreview(), 250);
  }

  refreshPreview() {
    this.previewLoading = true;
    const az = { ...this.form.value, logo: this.logoPreview };
    this.printSvc.buildSampleBlobUrl(this.templateConfig, az as any).then(url => {
      if (this.previewBlobUrl) { try { URL.revokeObjectURL(this.previewBlobUrl); } catch (_) {} }
      this.previewBlobUrl = url;
      this.previewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.previewLoading = false;
    }).catch(() => { this.previewLoading = false; });
  }

  // Preset
  applyPreset(p: TemplatePreset) {
    this.templateConfig = JSON.parse(JSON.stringify(p.config));
    if (!this.templateConfig.blocks) this.templateConfig.blocks = {};
    this.initGraficaEditor();
  }
  isPresetActive(p: TemplatePreset): boolean {
    return this.templateConfig.stile === p.config.stile &&
      JSON.stringify(this.templateConfig.colors || null) === JSON.stringify(p.config.colors || null) &&
      (this.templateConfig.typography?.fontFamily || 'helvetica') === (p.config.typography?.fontFamily || 'helvetica');
  }

  // Stile / blocchi (compat con handler esistenti)
  setTemplateStile(stile: 'classico' | 'moderno' | 'minimal') {
    this.templateConfig = { ...this.templateConfig, stile };
    this.schedulePreview();
  }
  isBlockVisible(key: string): boolean {
    return this.templateConfig.blocks?.[key] !== false;
  }
  toggleBlock(key: string, checked: boolean) {
    if (!this.templateConfig.blocks) this.templateConfig.blocks = {};
    this.templateConfig.blocks[key] = checked;
    this.touch();
  }

  // Colori
  colorValue(key: string): string {
    const c = (this.templateConfig.colors as any)?.[key];
    if (c) return c;
    if (key === 'accent' && this.templateConfig.accentColor) return this.templateConfig.accentColor;
    return this.colorFields.find(f => f.key === key)?.def || '#000000';
  }
  onColorChange(key: string, event: Event) { this.setColor(key, (event.target as HTMLInputElement).value); }
  setColor(key: string, val: string) {
    this.templateConfig.colors = { ...(this.templateConfig.colors || {}), [key]: val };
    if (key === 'accent') this.templateConfig.accentColor = val; // mantieni il campo legacy allineato
    this.touch();
  }
  resetColor(key: string) {
    const colors: any = { ...(this.templateConfig.colors || {}) };
    delete colors[key];
    this.templateConfig.colors = colors;
    if (key === 'accent') this.templateConfig.accentColor = undefined;
    this.touch();
  }
  onAccentColorChange(event: Event) { this.setColor('accent', (event.target as HTMLInputElement).value); }
  resetAccentColor() { this.resetColor('accent'); }

  // Tipografia
  get fontFamily(): string { return this.templateConfig.typography?.fontFamily || 'helvetica'; }
  setFontFamily(v: 'helvetica' | 'times' | 'courier') {
    this.templateConfig.typography = { ...(this.templateConfig.typography || {}), fontFamily: v };
    this.touch();
  }
  get fontScale(): number { return this.templateConfig.typography?.fontScale ?? 1; }
  setFontScale(v: number | null) {
    this.templateConfig.typography = { ...(this.templateConfig.typography || {}), fontScale: v ?? 1 };
    this.touch();
  }
  get uppercaseTitles(): boolean { return this.templateConfig.typography?.uppercaseSectionTitles !== false; }
  setUppercaseTitles(v: boolean) {
    this.templateConfig.typography = { ...(this.templateConfig.typography || {}), uppercaseSectionTitles: v };
    this.touch();
  }

  // Logo
  get logoShow(): boolean { return this.templateConfig.logo?.show !== false; }
  setLogoShow(v: boolean) { this.templateConfig.logo = { ...(this.templateConfig.logo || {}), show: v }; this.touch(); }
  get logoAlign(): string { return this.templateConfig.logo?.align || 'left'; }
  setLogoAlign(v: 'left' | 'center' | 'right') { this.templateConfig.logo = { ...(this.templateConfig.logo || {}), align: v }; this.touch(); }
  get logoSize(): string { return this.templateConfig.logo?.size || 'M'; }
  setLogoSize(v: 'S' | 'M' | 'L') { this.templateConfig.logo = { ...(this.templateConfig.logo || {}), size: v }; this.touch(); }

  // Margini
  get marginLeft(): number { return this.templateConfig.margins?.left ?? 14; }
  setMarginLeft(v: number | null) { this.templateConfig.margins = { ...(this.templateConfig.margins || {}), left: v ?? 14 }; this.touch(); }
  get marginRight(): number { return this.templateConfig.margins?.right ?? 14; }
  setMarginRight(v: number | null) { this.templateConfig.margins = { ...(this.templateConfig.margins || {}), right: v ?? 14 }; this.touch(); }

  // Footer
  footerVal(key: string): boolean { return (this.templateConfig.footer as any)?.[key] !== false; }
  setFooter(key: string, val: boolean) { this.templateConfig.footer = { ...(this.templateConfig.footer || {}), [key]: val }; this.touch(); }
  get footerCustomText(): string { return this.templateConfig.footer?.customText || ''; }
  setFooterCustomText(v: string) { this.templateConfig.footer = { ...(this.templateConfig.footer || {}), customText: v }; this.touch(); }

  // Pagamento / visibilità
  get showIban(): boolean { return this.templateConfig.visibility?.showIban !== false; }
  setShowIban(v: boolean) { this.templateConfig.visibility = { ...(this.templateConfig.visibility || {}), showIban: v }; this.touch(); }

  // Riordino sezioni
  dropSection(e: CdkDragDrop<SectionKey[]>) {
    moveItemInArray(this.sectionsOrderList, e.previousIndex, e.currentIndex);
    this.templateConfig.sectionsOrder = [...this.sectionsOrderList];
    this.touch();
  }

  // Colonne tabella
  dropColumn(e: CdkDragDrop<any[]>) {
    moveItemInArray(this.columnsList, e.previousIndex, e.currentIndex);
    this.syncColumns();
  }
  isColumnForced(key: string): boolean { return this.forcedColumns.includes(key); }
  toggleColumn(key: ColumnKey, visible: boolean) {
    const c = this.columnsList.find(x => x.key === key);
    if (c) c.visible = visible;
    this.syncColumns();
  }
  private syncColumns() {
    this.templateConfig.columns = this.columnsList.map(c => ({
      key: c.key, visible: this.forcedColumns.includes(c.key) ? true : c.visible,
    }));
    this.touch();
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

  async deleteTipoPagamento(t: TipoPagamento) {
    if (!await this.confirm.delete(`Eliminare "${t.nome}"?`)) return;
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

  async deleteCategoria(c: CategoriaProdotto) {
    if (!await this.confirm.delete(`Eliminare la categoria "${c.nome}"?`)) return;
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

  async deleteUnitaMisura(u: UnitaMisura) {
    if (!await this.confirm.delete(`Eliminare "${u.nome}"?`)) return;
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

  async deleteAliquotaIva(a: AliquotaIva) {
    if (!await this.confirm.delete(`Eliminare l'aliquota "${a.nome}"?`)) return;
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

  async deleteUtente(u: Utente) {
    if (!await this.confirm.delete(`Eliminare l'utente "${u.username}"?`)) return;
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

  // ── Note Rapide ─────────────────────────────────────────────────────────────
  loadNoteRapide() { this.ds.getNoteRapide().subscribe(n => { this.noteRapide = n; }); }

  openNotaRapida(n?: NotaRapida) {
    this.dialog.open(NotaRapidaDialogComponent, { data: n ?? null, width: '440px' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const op = result.id ? this.ds.updateNotaRapida(result) : this.ds.createNotaRapida(result);
        op.subscribe({
          next: () => { this.loadNoteRapide(); this.snack.open('Salvato', '', { duration: 2000 }); },
          error: e => this.snack.open(e.message, '', { duration: 3000 })
        });
      });
  }

  async deleteNotaRapida(n: NotaRapida) {
    if (!await this.confirm.delete(`Eliminare la nota rapida "${n.testo}"?`)) return;
    this.ds.deleteNotaRapida(n.id!).subscribe({
      next: () => { this.loadNoteRapide(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }

  // ── Causali pagamento ───────────────────────────────────────────────────────
  loadCausali() { this.ds.getCausali().subscribe(c => { this.causali = c; }); }

  openCausale(c?: CausalePagamento) {
    this.dialog.open(CausaleDialogComponent, { data: c ?? null, width: '440px' })
      .afterClosed().subscribe(result => {
        if (!result) return;
        const op = result.id ? this.ds.updateCausale(result) : this.ds.createCausale(result);
        op.subscribe({
          next: () => { this.loadCausali(); this.snack.open('Salvato', '', { duration: 2000 }); },
          error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 })
        });
      });
  }

  async deleteCausale(c: CausalePagamento) {
    if (!await this.confirm.delete(`Eliminare la causale "${c.nome}"?`)) return;
    this.ds.deleteCausale(c.id!).subscribe({
      next: () => { this.loadCausali(); this.snack.open('Eliminato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }

  // ── Backup (offline) ──────────────────────────────────────────────────────
  loadBackupConfig() {
    this.ds.getBackupConfig().subscribe({ next: c => { this.backupCfg = c; this.loadBackupFiles(); }, error: () => {} });
  }
  private loadBackupFiles() {
    this.ds.listBackups().subscribe({ next: r => this.backupFiles = r.files, error: () => this.backupFiles = [] });
  }
  private saveBackup(patch: Partial<BackupConfig>) {
    this.ds.saveBackupConfig(patch).subscribe({ next: c => this.backupCfg = c, error: e => this.snack.open(e.error?.error || 'Errore', '', { duration: 3000 }) });
  }

  async pickBackupFolder() {
    const dir = await this.desktop.pickFolder();
    if (dir) this.saveBackup({ dir });
  }
  openBackupFolder() { if (this.backupCfg?.dir) this.desktop.openPath(this.backupCfg.dir); }
  setBackupEnabled(v: boolean) { this.saveBackup({ enabled: v }); }
  setBackupEncrypt(v: boolean) { this.saveBackup({ encrypt: v }); }
  setBackupAlertDays(v: number) { if (Number.isFinite(v)) this.saveBackup({ alertDays: v }); }
  /** Riattiva gli avvisi di backup disattivati con "non mostrare più". */
  reenableBackupAlert() { this.saveBackup({ alertDisabled: false }); }

  runBackupNow() {
    if (this.backupBusy) return;
    this.backupBusy = true;
    this.ds.runBackup().subscribe({
      next: c => { this.backupCfg = c; this.backupBusy = false; this.loadBackupFiles(); this.snack.open('Backup eseguito', '', { duration: 2500 }); },
      error: e => { this.backupBusy = false; this.snack.open(e.error?.error || 'Backup non riuscito', '', { duration: 4000 }); },
    });
  }

  async restoreBackup(name: string) {
    if (!await this.confirm.delete(`Ripristinare il backup "${name}"? I dati attuali verranno sostituiti (ne salvo prima una copia di sicurezza).`)) return;
    this.ds.restoreBackup(name).subscribe({
      next: () => { this.snack.open('Ripristino completato. Ricarico…', '', { duration: 2500 }); setTimeout(() => location.reload(), 1200); },
      error: e => this.snack.open(e.error?.error || 'Ripristino non riuscito', '', { duration: 5000 }),
    });
  }

  /** Ripristina da un file scelto dall'utente (anche fuori dalla cartella di backup). */
  async restoreBackupFromFile() {
    const filePath = await this.desktop.pickBackupFile();
    if (!filePath) return;
    const nome = filePath.split(/[\\/]/).pop() || filePath;
    // Se il file è cifrato (.enc) chiedo la password usata per crearlo.
    const password = /\.enc$/i.test(filePath) ? (window.prompt('Il backup è cifrato. Inserisci la password usata per crearlo:') || '') : undefined;
    if (!await this.confirm.delete(`Ripristinare da "${nome}"? I dati attuali verranno sostituiti (ne salvo prima una copia di sicurezza).`)) return;
    this.ds.restoreBackupFromFile(filePath, password).subscribe({
      next: () => { this.snack.open('Ripristino completato. Ricarico…', '', { duration: 2500 }); setTimeout(() => location.reload(), 1200); },
      error: e => this.snack.open(e.error?.error || 'Ripristino non riuscito', '', { duration: 5000 }),
    });
  }

  fmtBytes(n: number): string {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
  }

  // ── Dati e sincronizzazione (offline) ───────────────────────────────────────
  loadSistemaPercorsi() {
    this.ds.getSistemaPercorsi().subscribe({
      next: r => { this.dataDir = r.dataDir; this.dataFiles = r.files; },
      error: () => {},
    });
    this.desktop.isAutostart().then(v => this.autostart = v);
    this.loadSnapshots();
    this.ds.getCifratura().subscribe({ next: c => { this.cifraturaAttiva = c.attiva; this.cifraturaPasswordImpostata = c.passwordImpostata; }, error: () => {} });
  }

  /** Attiva/disattiva la cifratura del database a riposo. */
  async toggleCifratura(on: boolean) {
    if (this.cifraturaBusy) return;
    if (on) {
      if (!this.cifraturaPasswordImpostata) {
        this.snack.open('Imposta prima una password d\'accesso (scheda Sicurezza).', '', { duration: 4000 });
        return;
      }
      const pw = window.prompt('Conferma la password d\'accesso: il database verrà cifrato con questa e te la richiederà a ogni avvio.');
      if (!pw) return;
      this.cifraturaBusy = true;
      this.ds.setCifratura(true, pw).subscribe({
        next: r => { this.cifraturaBusy = false; this.cifraturaAttiva = r.attiva; this.snack.open('Cifratura attivata. Il database sarà cifrato alla chiusura.', '', { duration: 4000 }); },
        error: e => { this.cifraturaBusy = false; this.snack.open(e.error?.error || 'Errore', '', { duration: 4000 }); },
      });
    } else {
      if (!await this.confirm.delete('Disattivare la cifratura? Il database tornerà in chiaro sul disco.')) return;
      this.cifraturaBusy = true;
      this.ds.setCifratura(false).subscribe({
        next: r => { this.cifraturaBusy = false; this.cifraturaAttiva = r.attiva; this.snack.open('Cifratura disattivata', '', { duration: 3000 }); },
        error: e => { this.cifraturaBusy = false; this.snack.open(e.error?.error || 'Errore', '', { duration: 4000 }); },
      });
    }
  }

  loadSnapshots() {
    this.ds.getSnapshots().subscribe({
      next: r => this.snapshots = r.snapshots,
      error: () => this.snapshots = [],
    });
  }

  /** Crea ora uno snapshot (punto di ripristino) dei dati. */
  createSnapshot() {
    if (this.snapBusy) return;
    this.snapBusy = true;
    this.ds.createSnapshot().subscribe({
      next: () => { this.snapBusy = false; this.loadSnapshots(); this.snack.open('Snapshot creato', '', { duration: 2000 }); },
      error: e => { this.snapBusy = false; this.snack.open(e.error?.error || 'Snapshot non riuscito', '', { duration: 4000 }); },
    });
  }

  /** Ripristina i dati da uno snapshot (con copia di sicurezza dell'attuale). */
  async restoreSnapshot(s: { name: string; mtime: string }) {
    const quando = new Date(s.mtime).toLocaleString('it-IT');
    if (!await this.confirm.delete(`Riportare i dati allo snapshot del ${quando}? I dati attuali verranno sostituiti (ne salvo prima una copia di sicurezza).`)) return;
    this.snapBusy = true;
    this.ds.restoreSnapshot(s.name).subscribe({
      next: () => { this.snack.open('Ripristino completato. Ricarico…', '', { duration: 2500 }); setTimeout(() => location.reload(), 1200); },
      error: e => { this.snapBusy = false; this.snack.open(e.error?.error || 'Ripristino non riuscito', '', { duration: 5000 }); },
    });
  }

  /** Abilita/disabilita l'avvio di Ordeva all'accensione del computer. */
  async setAutostart(on: boolean) {
    await this.desktop.setAutostart(on);
    this.autostart = await this.desktop.isAutostart();
  }

  /** Apre la cartella dati nel file manager del sistema. */
  openDataFolder() { if (this.dataDir) this.desktop.openPath(this.dataDir); }

  /** Sposta i dati in un'altra cartella (es. dentro Dropbox) e riavvia l'app. */
  async changeDataFolder() {
    const dir = await this.desktop.pickFolder();
    if (!dir) return;
    if (!await this.confirm.delete(`Spostare i dati in "${dir}"? Ordeva copierà i dati lì e si riavvierà. La cartella attuale resta come copia di sicurezza.`)) return;
    this.dataBusy = true;
    this.ds.setSistemaDataDir(dir).subscribe({
      next: () => { this.snack.open('Cartella aggiornata. Riavvio…', '', { duration: 2500 }); setTimeout(() => this.desktop.relaunch(), 1200); },
      error: e => { this.dataBusy = false; this.snack.open(e.error?.error || 'Spostamento non riuscito', '', { duration: 5000 }); },
    });
  }

  /** Chiusura sicura: checkpoint + rilascio lock, poi chiude (così Dropbox sincronizza). */
  async chiudiSicuro() {
    if (this.dataBusy) return;
    this.dataBusy = true;
    this.ds.sistemaFlush().subscribe({
      next: () => this.desktop.exit(0),
      error: () => this.desktop.exit(0),
    });
  }
}

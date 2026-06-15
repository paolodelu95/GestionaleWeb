import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { DesktopService } from '../../services/desktop.service';
import { Azienda } from '../../models';
import { environment } from '../../../environments/environment';

/**
 * Schermata di benvenuto al PRIMO AVVIO dell'edizione offline desktop.
 * Compare a tutto schermo finché l'app è "vergine" (nessuna azienda configurata
 * e nessun dato), e propone due strade:
 *   1. inserire i dati della propria azienda per iniziare a lavorare;
 *   2. caricare dei dati demo per provare subito il gestionale.
 *
 * Stato persistito in localStorage: ordeva_offline_setup_done=1 (non si ripresenta).
 */
@Component({
  selector: 'app-welcome-offline',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatButtonModule,
    MatInputModule, MatFormFieldModule, MatProgressSpinnerModule, MatCheckboxModule,
  ],
  template: `
    @if (visible) {
      <div class="wel-overlay">
        <div class="wel-card">
          <div class="wel-brand"><span class="wel-logo">O</span> Ordeva</div>

          @if (step === 'choice') {
            <h1 class="wel-title">Benvenuto in Ordeva</h1>
            <p class="wel-sub">Il tuo gestionale è pronto. Per cominciare, scegli come partire.</p>

            <div class="wel-choices">
              <button class="wel-choice" type="button" (click)="step = 'form'">
                <span class="wel-choice-ic"><mat-icon>business</mat-icon></span>
                <span class="wel-choice-h">Inserisci la mia azienda</span>
                <span class="wel-choice-t">Ragione sociale, P.IVA e indirizzo: appariranno su fatture e documenti.</span>
              </button>
              <button class="wel-choice" type="button" [disabled]="loading" (click)="caricaDemo()">
                <span class="wel-choice-ic demo"><mat-icon>science</mat-icon></span>
                <span class="wel-choice-h">Prova con dati demo</span>
                <span class="wel-choice-t">Clienti, fornitori e prodotti di esempio per esplorare subito l'app.</span>
              </button>
              <button class="wel-choice" type="button" (click)="step = 'restore'">
                <span class="wel-choice-ic restore"><mat-icon>settings_backup_restore</mat-icon></span>
                <span class="wel-choice-h">Ripristina da un backup</span>
                <span class="wel-choice-t">Cambi PC? Recupera tutto (azienda, logo, fatture, DDT…) da un file di backup.</span>
              </button>
            </div>
            @if (errore) { <div class="wel-err">{{ errore }}</div> }
          }

          @else if (step === 'restore') {
            <h1 class="wel-title">Ripristina i tuoi dati</h1>
            <p class="wel-sub">Seleziona un file di backup di Ordeva (.db o .db.enc). I dati verranno ripristinati così com'erano.</p>
            <div class="wel-form">
              <div class="wel-folder">
                <button mat-stroked-button type="button" (click)="scegliFileRipristino()">
                  <mat-icon>upload_file</mat-icon> Scegli file di backup
                </button>
                @if (restoreFile) { <span class="wel-folder-path" [title]="restoreFile">{{ restoreFileName }}</span> }
                @else { <span class="wel-folder-empty">Nessun file selezionato</span> }
              </div>
              @if (restoreEncrypted) {
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Password del backup (se cifrato)</mat-label>
                  <input matInput [(ngModel)]="restorePwd" type="password" autocomplete="off" />
                </mat-form-field>
              }
            </div>
            @if (errore) { <div class="wel-err">{{ errore }}</div> }
            <div class="wel-actions">
              <button mat-button type="button" [disabled]="loading" (click)="step = 'choice'">Indietro</button>
              <button mat-flat-button color="primary" type="button" [disabled]="loading || !restoreFile" (click)="ripristina()">
                @if (loading) { <mat-spinner diameter="18"></mat-spinner> } @else { Ripristina }
              </button>
            </div>
          }

          @else if (step === 'password') {
            <h1 class="wel-title">Proteggi i tuoi dati</h1>
            <p class="wel-sub">
              Vuoi richiedere una password all'avvio del programma? Protegge i dati del
              magazzino su un PC condiviso. È <b>opzionale</b> e potrai cambiarla in Impostazioni.
            </p>
            <div class="wel-form">
              <mat-form-field appearance="outline" class="full">
                <mat-label>Password (lascia vuoto per non impostarla)</mat-label>
                <input matInput [(ngModel)]="pwd1" type="password" autocomplete="new-password" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full">
                <mat-label>Ripeti password</mat-label>
                <input matInput [(ngModel)]="pwd2" type="password" autocomplete="new-password" />
              </mat-form-field>
            </div>
            @if (errore) { <div class="wel-err">{{ errore }}</div> }
            <div class="wel-actions">
              <button mat-button type="button" [disabled]="loading" (click)="vaiBackup()">Salta</button>
              <button mat-flat-button color="primary" type="button" [disabled]="loading || !pwd1" (click)="impostaPassword()">
                @if (loading) { <mat-spinner diameter="18"></mat-spinner> } @else { Imposta password }
              </button>
            </div>
          }

          @else if (step === 'backup') {
            <h1 class="wel-title">Backup automatico</h1>
            <p class="wel-sub">
              Ogni giorno Ordeva può salvare una copia dei tuoi dati in una cartella a tua scelta.
              Se scegli una cartella di <b>Google Drive</b> o <b>Dropbox</b>, la copia finisce anche nel cloud.
            </p>
            <div class="wel-form">
              <div class="wel-folder">
                <button mat-stroked-button type="button" (click)="scegliCartella()">
                  <mat-icon>folder_open</mat-icon> Scegli cartella
                </button>
                @if (backupDir) { <span class="wel-folder-path" [title]="backupDir">{{ backupDir }}</span> }
                @else { <span class="wel-folder-empty">Nessuna cartella selezionata</span> }
              </div>
              @if (hadPassword) {
                <mat-checkbox [(ngModel)]="backupEncrypt" name="bkEnc">Cifra i backup con la password d'accesso</mat-checkbox>
              } @else {
                <p class="wel-note">Per cifrare i backup serve una password d'accesso (impostabile più tardi in Impostazioni).</p>
              }
            </div>
            @if (errore) { <div class="wel-err">{{ errore }}</div> }
            <div class="wel-actions">
              <button mat-button type="button" [disabled]="loading" (click)="completa()">Salta</button>
              <button mat-flat-button color="primary" type="button" [disabled]="loading || !backupDir" (click)="attivaBackup()">
                @if (loading) { <mat-spinner diameter="18"></mat-spinner> } @else { Attiva backup }
              </button>
            </div>
          }

          @else {
            <h1 class="wel-title">I dati della tua azienda</h1>
            <p class="wel-sub">Bastano pochi campi per iniziare; potrai completarli in Impostazioni.</p>

            <div class="wel-form">
              <mat-form-field appearance="outline" class="full">
                <mat-label>Ragione sociale *</mat-label>
                <input matInput [(ngModel)]="az.ragioneSociale" autocomplete="organization" />
              </mat-form-field>
              <div class="wel-row">
                <mat-form-field appearance="outline">
                  <mat-label>Partita IVA</mat-label>
                  <input matInput [(ngModel)]="az.pIva" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Codice fiscale</mat-label>
                  <input matInput [(ngModel)]="az.codFiscale" />
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="full">
                <mat-label>Indirizzo</mat-label>
                <input matInput [(ngModel)]="az.indirizzo" autocomplete="street-address" />
              </mat-form-field>
              <div class="wel-row">
                <mat-form-field appearance="outline" class="cap">
                  <mat-label>CAP</mat-label>
                  <input matInput [(ngModel)]="az.cap" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Città</mat-label>
                  <input matInput [(ngModel)]="az.citta" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="prov">
                  <mat-label>Prov.</mat-label>
                  <input matInput [(ngModel)]="az.provincia" maxlength="2" />
                </mat-form-field>
              </div>
              <div class="wel-row">
                <mat-form-field appearance="outline">
                  <mat-label>Email</mat-label>
                  <input matInput [(ngModel)]="az.email" type="email" autocomplete="email" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Telefono</mat-label>
                  <input matInput [(ngModel)]="az.telefono" autocomplete="tel" />
                </mat-form-field>
              </div>
            </div>

            @if (errore) { <div class="wel-err">{{ errore }}</div> }

            <div class="wel-actions">
              <button mat-button type="button" [disabled]="loading" (click)="step = 'choice'">Indietro</button>
              <button mat-flat-button color="primary" type="button" [disabled]="loading || !az.ragioneSociale?.trim()" (click)="salvaAzienda()">
                @if (loading) { <mat-spinner diameter="18"></mat-spinner> } @else { Inizia a usare Ordeva }
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .wel-overlay {
      position: fixed; inset: 0; z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 20px;
      background: linear-gradient(135deg, #0e2a38 0%, #11769b 100%);
      overflow: auto;
    }
    .wel-card {
      background: #fff; border-radius: 18px; box-shadow: 0 24px 64px rgba(0,0,0,0.28);
      padding: 34px 36px; width: 100%; max-width: 560px;
    }
    .wel-brand { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 18px; }
    .wel-logo {
      width: 30px; height: 30px; border-radius: 8px; color: #fff; font-weight: 800;
      display: inline-flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #11769b, #15a4a2);
    }
    .wel-title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 6px; letter-spacing: -0.02em; }
    .wel-sub { font-size: 14px; color: #64748b; margin: 0 0 22px; }
    .wel-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .wel-choice {
      display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left;
      padding: 18px; border-radius: 14px; cursor: pointer;
      background: #fafbfd; border: 1.5px solid #eef0f4; transition: border-color .12s, transform .12s, box-shadow .12s;
    }
    .wel-choice:hover:not([disabled]) { border-color: #11769b; transform: translateY(-2px); box-shadow: 0 10px 24px rgba(17,118,155,0.12); }
    .wel-choice[disabled] { opacity: .6; cursor: default; }
    .wel-choice-ic {
      width: 42px; height: 42px; border-radius: 10px; margin-bottom: 4px;
      display: flex; align-items: center; justify-content: center; color: #fff;
      background: linear-gradient(135deg, #11769b, #15a4a2);
    }
    .wel-choice-ic.demo { background: linear-gradient(135deg, #7c3aed, #6d28d9); }
    .wel-choice-ic.restore { background: linear-gradient(135deg, #0891b2, #0e7490); }
    .wel-choice-h { font-size: 15px; font-weight: 700; color: #0f172a; }
    .wel-choice-t { font-size: 12.5px; color: #64748b; line-height: 1.4; }
    .wel-form { display: flex; flex-direction: column; gap: 2px; }
    .wel-form .full { width: 100%; }
    .wel-row { display: flex; gap: 12px; }
    .wel-row mat-form-field { flex: 1; }
    .wel-row .cap { max-width: 110px; }
    .wel-row .prov { max-width: 88px; }
    .wel-folder { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
    .wel-folder-path { font-size: 12.5px; color: #0f172a; word-break: break-all; max-width: 100%; }
    .wel-folder-empty { font-size: 12.5px; color: #94a3b8; }
    .wel-note { font-size: 12.5px; color: #64748b; margin: 2px 0 0; }
    .wel-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
    .wel-actions button mat-spinner { display: inline-block; }
    .wel-err { margin-top: 12px; padding: 10px 14px; border-radius: 10px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
    @media (max-width: 560px) {
      .wel-card { padding: 24px 20px; }
      .wel-choices { grid-template-columns: 1fr; }
      .wel-row { flex-wrap: wrap; }
    }
  `],
})
export class WelcomeOfflineComponent implements OnInit {
  /** Emesso quando il setup è completato: il parent ricarica i dati. */
  @Output() done = new EventEmitter<void>();

  visible = false;
  step: 'choice' | 'form' | 'password' | 'backup' | 'restore' = 'choice';
  loading = false;
  errore = '';
  az: Azienda = { ragioneSociale: '' };
  pwd1 = '';
  pwd2 = '';
  hadPassword = false;
  backupDir = '';
  backupEncrypt = false;
  restoreFile = '';
  restorePwd = '';
  get restoreFileName(): string { return this.restoreFile.split(/[\\/]/).pop() || this.restoreFile; }
  get restoreEncrypted(): boolean { return /\.enc$/i.test(this.restoreFile); }

  /** Dismissione per la sola sessione corrente (dopo i dati demo): alla
   *  riapertura del programma la richiesta dei dati azienda riappare finché
   *  non vengono inseriti dati reali. Vive in sessionStorage, non localStorage. */
  private readonly SESSION_SEEN = 'ordeva_offline_welcome_seen';
  /** Hint per la lock screen: evita il flash all'avvio sapendo subito se c'è password. */
  private readonly PWD_HINT = 'ordeva_app_password_enabled';

  constructor(private ds: DataService, private desktop: DesktopService) {}

  ngOnInit(): void {
    if (!environment.offline) return;
    if (sessionStorage.getItem(this.SESSION_SEEN) === '1') return;  // già gestito in questa sessione

    this.ds.getSetupStatus().pipe(catchError(() => of(null))).subscribe(st => {
      if (!st) return;                       // backend non pronto: niente overlay
      // Si chiede SEMPRE finché non ci sono dati azienda reali (ragione sociale + P.IVA).
      // I soli dati demo NON bastano a considerare l'azienda configurata.
      if (st.aziendaConfigurata) return;
      this.visible = true;
    });
  }

  salvaAzienda(): void {
    if (!this.az.ragioneSociale?.trim() || this.loading) return;
    this.loading = true; this.errore = '';
    this.ds.saveAzienda(this.az).subscribe({
      next: () => { this.loading = false; this.step = 'password'; },   // poi la password (opzionale)
      error: () => { this.errore = 'Salvataggio non riuscito. Riprova.'; this.loading = false; },
    });
  }

  impostaPassword(): void {
    if (this.loading) return;
    if (!this.pwd1) { this.vaiBackup(); return; }
    if (this.pwd1 !== this.pwd2) { this.errore = 'Le due password non coincidono.'; return; }
    this.loading = true; this.errore = '';
    this.ds.setAppPassword(this.pwd1).subscribe({
      next: () => {
        localStorage.setItem(this.PWD_HINT, '1');
        this.hadPassword = true;
        this.loading = false;
        this.vaiBackup();
      },
      error: () => { this.errore = 'Impostazione password non riuscita. Riprova.'; this.loading = false; },
    });
  }

  vaiBackup(): void { this.errore = ''; this.step = 'backup'; }

  async scegliFileRipristino(): Promise<void> {
    const f = await this.desktop.pickBackupFile();
    if (f) { this.restoreFile = f; this.errore = ''; }
  }

  ripristina(): void {
    if (this.loading || !this.restoreFile) return;
    if (this.restoreEncrypted && !this.restorePwd) { this.errore = 'Il backup è cifrato: inserisci la password.'; return; }
    this.loading = true; this.errore = '';
    this.ds.restoreBackupFromFile(this.restoreFile, this.restorePwd || undefined).subscribe({
      next: () => { sessionStorage.setItem(this.SESSION_SEEN, '1'); this.visible = false; setTimeout(() => location.reload(), 400); },
      error: (e) => { this.errore = e?.error?.error || 'Ripristino non riuscito.'; this.loading = false; },
    });
  }

  async scegliCartella(): Promise<void> {
    const dir = await this.desktop.pickFolder();
    if (dir) this.backupDir = dir;
  }

  attivaBackup(): void {
    if (this.loading || !this.backupDir) return;
    this.loading = true; this.errore = '';
    this.ds.saveBackupConfig({
      dir: this.backupDir,
      enabled: true,
      encrypt: this.hadPassword && this.backupEncrypt,
    }).subscribe({
      next: () => { this.ds.runBackup().subscribe({ next: () => {}, error: () => {} }); this.completa(); },
      error: () => { this.errore = 'Attivazione backup non riuscita. Riprova.'; this.loading = false; },
    });
  }

  caricaDemo(): void {
    if (this.loading) return;
    this.loading = true; this.errore = '';
    this.ds.seedDemo().subscribe({
      next: () => this.completa(true),
      error: (e) => {
        this.errore = e?.error?.error || 'Caricamento dati demo non riuscito. Riprova.';
        this.loading = false;
      },
    });
  }

  completa(reload = false): void {
    // Solo dismissione di sessione: niente flag permanente, così i dati reali
    // restano l'unica condizione che chiude definitivamente il benvenuto.
    sessionStorage.setItem(this.SESSION_SEEN, '1');
    this.visible = false;
    this.loading = false;
    this.done.emit();
    // Dopo i dati demo serve ricaricare per popolare tutte le liste già in memoria.
    if (reload) setTimeout(() => location.reload(), 50);
  }
}

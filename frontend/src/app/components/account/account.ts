import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AccountService, MeResponse } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterLink, DatePipe,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <div class="acc-page">
      <div class="acc-hero">
        <h1>Account</h1>
        <p>Gestisci i tuoi dati di accesso e visualizza lo stato del piano.</p>
      </div>

      @if (loading) {
        <div class="acc-loading"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (!me) {
        <div class="acc-error">
          <mat-icon>error_outline</mat-icon>
          Impossibile caricare i dati. Ricarica la pagina.
        </div>
      } @else {

        <!-- ── Stato account ─────────────────────────────────────────────── -->
        <section class="acc-card">
          <div class="acc-card-head">
            <mat-icon class="acc-card-icon">person</mat-icon>
            <div>
              <h3>Stato account</h3>
              <p>Informazioni sul tuo profilo e sul piano corrente.</p>
            </div>
          </div>

          <div class="acc-stats">
            <div class="acc-stat">
              <span class="acc-stat-lbl">Email</span>
              <span class="acc-stat-val">{{ me.email || me.username }}
                @if (me.emailVerified) {
                  <span class="badge badge-ok"><mat-icon>verified</mat-icon> verificata</span>
                } @else {
                  <span class="badge badge-warn"><mat-icon>warning</mat-icon> non verificata</span>
                }
              </span>
            </div>

            <div class="acc-stat">
              <span class="acc-stat-lbl">Ruolo</span>
              <span class="acc-stat-val">{{ me.ruolo }}</span>
            </div>

            <div class="acc-stat">
              <span class="acc-stat-lbl">Piano</span>
              <span class="acc-stat-val">
                @if (me.piano === 'pro') {
                  <span class="badge badge-pro"><mat-icon>verified</mat-icon> Pro</span>
                } @else {
                  <span class="badge badge-trial"><mat-icon>schedule</mat-icon> Trial</span>
                }
              </span>
            </div>

            @if (me.piano === 'trial' && trialDaysLeft !== null) {
              <div class="acc-stat">
                <span class="acc-stat-lbl">Giorni di prova residui</span>
                <span class="acc-stat-val">
                  @if (trialDaysLeft > 0) {
                    <b [class.text-warn]="trialDaysLeft <= 3">{{ trialDaysLeft }} {{ trialDaysLeft === 1 ? 'giorno' : 'giorni' }}</b>
                    · scade il {{ me.trialScadeIl | date:'dd/MM/yyyy' }}
                  } @else {
                    <b class="text-error">Trial scaduto il {{ me.trialScadeIl | date:'dd/MM/yyyy' }}</b>
                  }
                </span>
              </div>
            }
          </div>

          <div class="acc-card-actions">
            @if (me.piano === 'trial') {
              <a mat-flat-button color="primary" routerLink="/billing">
                <mat-icon>upgrade</mat-icon> Passa a Pro
              </a>
            } @else {
              <a mat-stroked-button routerLink="/billing">
                <mat-icon>credit_card</mat-icon> Gestisci abbonamento
              </a>
            }
            @if (!me.emailVerified) {
              <button mat-stroked-button type="button" (click)="resendVerification()" [disabled]="busy">
                <mat-icon>mark_email_unread</mat-icon> Reinvia email di verifica
              </button>
            }
          </div>
        </section>

        <!-- ── Profilo (nome) ───────────────────────────────────────────── -->
        <section class="acc-card">
          <div class="acc-card-head">
            <mat-icon class="acc-card-icon">badge</mat-icon>
            <div>
              <h3>Profilo</h3>
              <p>Il nome mostrato nelle email e nell'app.</p>
            </div>
          </div>
          <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="acc-form">
            <mat-form-field appearance="outline">
              <mat-label>Nome</mat-label>
              <input matInput formControlName="nome" maxlength="120">
            </mat-form-field>
            <div class="acc-form-actions">
              <button mat-flat-button color="primary" type="submit"
                      [disabled]="busy || profileForm.invalid || profileForm.pristine">
                Salva
              </button>
            </div>
          </form>
        </section>

        <!-- ── Cambia email ────────────────────────────────────────────── -->
        <section class="acc-card">
          <div class="acc-card-head">
            <mat-icon class="acc-card-icon">alternate_email</mat-icon>
            <div>
              <h3>Cambia email</h3>
              <p>L'email è anche il tuo username di accesso. Dopo il cambio, riceverai un nuovo link di conferma.</p>
            </div>
          </div>
          <form [formGroup]="emailForm" (ngSubmit)="saveEmail()" class="acc-form">
            <mat-form-field appearance="outline">
              <mat-label>Nuova email</mat-label>
              <input matInput type="email" formControlName="newEmail" autocomplete="email">
              @if (emailForm.get('newEmail')?.touched && emailForm.get('newEmail')?.invalid) {
                <mat-error>Inserisci un'email valida</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Conferma con la password attuale</mat-label>
              <input matInput type="password" formControlName="currentPassword" autocomplete="current-password">
            </mat-form-field>
            <div class="acc-form-actions">
              <button mat-flat-button color="primary" type="submit"
                      [disabled]="busy || emailForm.invalid">
                Aggiorna email
              </button>
            </div>
          </form>
        </section>

        <!-- ── Cambia password ────────────────────────────────────────── -->
        <section class="acc-card">
          <div class="acc-card-head">
            <mat-icon class="acc-card-icon">lock</mat-icon>
            <div>
              <h3>Cambia password</h3>
              <p>Minimo 8 caratteri. Ti consigliamo di usare un gestore di password.</p>
            </div>
          </div>
          <form [formGroup]="passwordForm" (ngSubmit)="savePassword()" class="acc-form">
            <mat-form-field appearance="outline">
              <mat-label>Password attuale</mat-label>
              <input matInput type="password" formControlName="currentPassword" autocomplete="current-password">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Nuova password</mat-label>
              <input matInput type="password" formControlName="newPassword" autocomplete="new-password">
              @if (passwordForm.get('newPassword')?.touched && passwordForm.get('newPassword')?.errors?.['minlength']) {
                <mat-error>Almeno 8 caratteri</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Ripeti nuova password</mat-label>
              <input matInput type="password" formControlName="confirmPassword" autocomplete="new-password">
              @if (passwordForm.errors?.['mismatch'] && passwordForm.get('confirmPassword')?.touched) {
                <mat-error>Le password non coincidono</mat-error>
              }
            </mat-form-field>
            <div class="acc-form-actions">
              <button mat-flat-button color="primary" type="submit"
                      [disabled]="busy || passwordForm.invalid">
                Aggiorna password
              </button>
            </div>
          </form>
        </section>

        <!-- ── Sicurezza / logout ───────────────────────────────────── -->
        <section class="acc-card">
          <div class="acc-card-head">
            <mat-icon class="acc-card-icon" style="color:#dc2626">logout</mat-icon>
            <div>
              <h3>Esci dall'account</h3>
              <p>Chiudi la sessione corrente su questo dispositivo.</p>
            </div>
          </div>
          <div class="acc-card-actions">
            <button mat-stroked-button type="button" (click)="logout()" style="color:#dc2626;border-color:#fca5a5">
              <mat-icon>logout</mat-icon> Logout
            </button>
          </div>
        </section>

      }
    </div>
  `,
  styles: [`
    .acc-page { max-width: 760px; margin: 0 auto; padding: 32px 24px; }
    .acc-hero h1 { margin: 0 0 6px; font-size: 28px; color: var(--text-primary, #0f172a); }
    .acc-hero p  { margin: 0 0 24px; color: #64748b; }

    .acc-loading { display: flex; justify-content: center; padding: 60px; }
    .acc-error { padding: 24px; background: #fef2f2; color: #991b1b; border-radius: 10px; display: flex; gap: 8px; align-items: center; }

    .acc-card {
      background: var(--bg-surface, #fff);
      border: 1px solid var(--border, #e6e8ee);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 18px;
    }
    .acc-card-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
    .acc-card-icon {
      flex-shrink: 0; padding: 8px;
      background: var(--primary-soft, #e6f1f6); color: var(--primary, #11769b);
      border-radius: 10px;
    }
    .acc-card-head h3 { margin: 0 0 4px; font-size: 16px; color: var(--text-primary, #0f172a); }
    .acc-card-head p  { margin: 0; font-size: 13px; color: #64748b; }

    .acc-stats { display: flex; flex-direction: column; gap: 10px; }
    .acc-stat {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px dashed var(--border-subtle, #eef0f4);
      font-size: 14px;
    }
    .acc-stat:last-child { border-bottom: none; }
    .acc-stat-lbl { color: #64748b; }
    .acc-stat-val { font-weight: 600; color: var(--text-primary, #0f172a); display: flex; align-items: center; gap: 8px; }

    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 999px;
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .badge mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .badge-ok    { background: #d1fae5; color: #065f46; }
    .badge-warn  { background: #fef3c7; color: #92400e; }
    .badge-pro   { background: #cffafe; color: #155e75; }
    .badge-trial { background: #fed7aa; color: #9a3412; }

    .text-warn  { color: #d97706; }
    .text-error { color: #dc2626; }

    .acc-card-actions {
      margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;
    }

    .acc-form { display: flex; flex-direction: column; gap: 4px; }
    .acc-form mat-form-field { width: 100%; }
    .acc-form-actions { display: flex; justify-content: flex-end; }

    /* Dark mode override */
    :host-context(body.dark-mode) {
      .acc-hero h1 { color: #e2e8f0; }
      .acc-hero p  { color: #94a3b8; }
      .acc-card {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.10);
      }
      .acc-card-icon {
        background: rgba(17,118,155,0.20); color: #7dd3fc;
      }
      .acc-card-head h3 { color: #e2e8f0; }
      .acc-card-head p  { color: #94a3b8; }
      .acc-stat { border-bottom-color: rgba(255,255,255,0.08); }
      .acc-stat-lbl { color: #94a3b8; }
      .acc-stat-val { color: #e2e8f0; }
      .badge-ok    { background: rgba(16,185,129,0.18); color: #a7f3d0; }
      .badge-warn  { background: rgba(245,158,11,0.18); color: #fde68a; }
      .badge-pro   { background: rgba(34,211,238,0.18); color: #67e8f9; }
      .badge-trial { background: rgba(249,115,22,0.20); color: #fed7aa; }
      .acc-error   { background: rgba(220,38,38,0.15); color: #fecaca; }
    }
  `]
})
export class AccountComponent implements OnInit {
  loading = true;
  busy = false;
  me: MeResponse | null = null;
  trialDaysLeft: number | null = null;

  profileForm!: FormGroup;
  emailForm!: FormGroup;
  passwordForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private accSvc: AccountService,
    private auth: AuthService,
    private snack: MatSnackBar,
  ) {
    this.profileForm = this.fb.group({
      nome: ['', Validators.required],
    });
    this.emailForm = this.fb.group({
      newEmail: ['', [Validators.required, Validators.email]],
      currentPassword: ['', Validators.required],
    });
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    }, { validators: (g) => g.get('newPassword')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true } });
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.accSvc.getMe().subscribe({
      next: m => {
        this.me = m;
        this.profileForm.patchValue({ nome: m.nome || '' });
        if (m.piano === 'trial' && m.trialScadeIl) {
          const end = new Date(m.trialScadeIl + 'T23:59:59');
          const ms = end.getTime() - Date.now();
          this.trialDaysLeft = Math.floor(ms / (1000 * 60 * 60 * 24));
        } else {
          this.trialDaysLeft = null;
        }
        this.loading = false;
      },
      error: e => {
        this.loading = false;
        this.snack.open(e.error?.error || 'Errore caricamento', 'OK', { duration: 4000 });
      },
    });
  }

  saveProfile() {
    if (this.profileForm.invalid) return;
    this.busy = true;
    this.accSvc.updateProfile(this.profileForm.value.nome).subscribe({
      next: () => {
        this.busy = false;
        this.snack.open('Profilo aggiornato', '', { duration: 2500 });
        this.profileForm.markAsPristine();
      },
      error: e => {
        this.busy = false;
        this.snack.open(e.error?.error || 'Errore', 'OK', { duration: 4000 });
      },
    });
  }

  saveEmail() {
    if (this.emailForm.invalid) return;
    this.busy = true;
    const { newEmail, currentPassword } = this.emailForm.value;
    this.accSvc.updateEmail(newEmail, currentPassword).subscribe({
      next: () => {
        this.busy = false;
        this.snack.open('Email aggiornata. Controlla la nuova casella per la conferma.', 'OK', { duration: 5000 });
        this.emailForm.reset();
        this.load();
      },
      error: e => {
        this.busy = false;
        this.snack.open(e.error?.error || 'Errore aggiornamento email', 'OK', { duration: 4500 });
      },
    });
  }

  savePassword() {
    if (this.passwordForm.invalid) return;
    this.busy = true;
    const { currentPassword, newPassword } = this.passwordForm.value;
    this.accSvc.updatePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.busy = false;
        this.snack.open('Password aggiornata', '', { duration: 2800 });
        this.passwordForm.reset();
      },
      error: e => {
        this.busy = false;
        this.snack.open(e.error?.error || 'Errore aggiornamento password', 'OK', { duration: 4500 });
      },
    });
  }

  resendVerification() {
    this.busy = true;
    // Reuse l'auth service se esiste un metodo, altrimenti chiamata diretta
    const apiUrl = '/api/auth/resend-verification';
    const token = localStorage.getItem('ordeva_token');
    fetch(apiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => {
        this.busy = false;
        this.snack.open(j.message || 'Email di verifica inviata', '', { duration: 3500 });
      })
      .catch(e => {
        this.busy = false;
        this.snack.open('Errore invio email', 'OK', { duration: 4000 });
      });
  }

  logout() {
    this.auth.logout();
  }
}

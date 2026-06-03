import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import type { RegisterPayload } from '../../services/auth.service';
import { FieldHelpComponent } from '../shared/field-help';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, FieldHelpComponent],
  template: `
    <div class="login-overlay">
      <div class="login-bg">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>
        <div class="grid-overlay"></div>
      </div>

      <div class="login-card">
        <div class="login-logo">
          <div class="logo-mark">
            <img src="icons/ordeva-icon.png" alt="Ordeva" width="80" height="80">
          </div>
          <h1>Ordeva</h1>
          <p>{{ mode === 'login' ? 'Gestionale ERP' : 'Crea il tuo account' }}</p>
        </div>

        <!--
          Honeypot anti-bot: campo "website" visivamente nascosto fuori
          schermo (NON display:none, alcuni bot lo rilevano e skippano).
          Gli utenti reali non lo vedono né compilano. I bot stupidi sì.
          Il backend rifiuta silenziosamente se valorizzato.
        -->
        <input type="text" name="website" autocomplete="off" tabindex="-1"
               aria-hidden="true" class="hp-field"
               [(ngModel)]="honeypot" [ngModelOptions]="{ standalone: true }">

        <!-- ── Form Login ─────────────────────────────────────────── -->
        @if (mode === 'login') {
          <form class="login-form" (ngSubmit)="submitLogin()">
            <mat-form-field appearance="outline">
              <mat-label>Username / Email</mat-label>
              <input matInput [(ngModel)]="username" name="username"
                     autocomplete="username" [disabled]="loading">
              <mat-icon matSuffix>person_outline</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Password</mat-label>
              <input matInput [(ngModel)]="password" name="password"
                     [type]="showPass ? 'text' : 'password'"
                     autocomplete="current-password" [disabled]="loading">
              <button mat-icon-button matSuffix type="button" (click)="showPass = !showPass" tabindex="-1">
                <mat-icon>{{ showPass ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>

            @if (error) {
              <div class="login-error">
                <mat-icon>error_outline</mat-icon> {{ error }}
              </div>
            }

            <button mat-flat-button type="submit" class="login-btn"
                    [disabled]="loading || !username || !password">
              @if (loading) {
                <span class="btn-content"><span class="btn-spinner"></span><span>Accesso in corso…</span></span>
              } @else {
                <span class="btn-content"><span>Accedi</span><mat-icon>arrow_forward</mat-icon></span>
              }
            </button>
          </form>

          <div class="mode-switch">
            <button type="button" class="link-btn-soft" (click)="switchMode('forgot')">
              Password dimenticata?
            </button>
          </div>
          <div class="mode-switch">
            Primo accesso?
            <button type="button" class="link-btn" (click)="switchMode('register')">
              Registra la tua azienda
            </button>
          </div>
        }

        <!-- ── Form Password Dimenticata ──────────────────────────── -->
        @if (mode === 'forgot') {
          <form class="login-form" (ngSubmit)="submitForgot()">
            <p class="form-intro">
              Inserisci l'email del tuo account. Ti invieremo un link
              per impostare una nuova password.
            </p>

            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput [(ngModel)]="forgotEmail" name="forgotEmail"
                     type="email" autocomplete="email" [disabled]="loading">
              <mat-icon matSuffix>email</mat-icon>
            </mat-form-field>

            @if (error) {
              <div class="login-error">
                <mat-icon>error_outline</mat-icon> {{ error }}
              </div>
            }
            @if (success) {
              <div class="login-success">
                <mat-icon>check_circle_outline</mat-icon> {{ success }}
              </div>
            }

            <button mat-flat-button type="submit" class="login-btn"
                    [disabled]="loading || !forgotEmail">
              @if (loading) {
                <span class="btn-content"><span class="btn-spinner"></span><span>Invio in corso…</span></span>
              } @else {
                <span class="btn-content"><span>Invia link di reset</span><mat-icon>send</mat-icon></span>
              }
            </button>
          </form>

          <div class="mode-switch">
            <button type="button" class="link-btn" (click)="switchMode('login')">
              ← Torna al login
            </button>
          </div>
        }

        <!-- ── Form Registrazione ─────────────────────────────────── -->
        @if (mode === 'register') {
          <form class="login-form" (ngSubmit)="submitRegister()">
            <mat-form-field appearance="outline">
              <mat-label>Ragione Sociale *</mat-label>
              <input matInput [(ngModel)]="reg.ragioneSociale" name="ragioneSociale"
                     autocomplete="organization" [disabled]="loading">
              <mat-icon matSuffix>business</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Partita IVA</mat-label>
              <input matInput [(ngModel)]="reg.piva" name="piva"
                     autocomplete="off" [disabled]="loading">
              <app-field-help matSuffix text="11 cifre. Puoi lasciarla vuota ora e aggiungerla dopo dalle Impostazioni." />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Email *</mat-label>
              <input matInput [(ngModel)]="reg.email" name="email"
                     type="email" autocomplete="email" [disabled]="loading">
              <mat-icon matSuffix>email</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Il tuo nome</mat-label>
              <input matInput [(ngModel)]="reg.nome" name="nome"
                     autocomplete="name" [disabled]="loading">
              <mat-icon matSuffix>person_outline</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Password *</mat-label>
              <input matInput [(ngModel)]="reg.password" name="password"
                     [type]="showPass ? 'text' : 'password'"
                     autocomplete="new-password" [disabled]="loading">
              <button mat-icon-button matSuffix type="button" (click)="showPass = !showPass" tabindex="-1">
                <mat-icon>{{ showPass ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>

            @if (error) {
              <div class="login-error">
                <mat-icon>error_outline</mat-icon> {{ error }}
              </div>
            }
            @if (success) {
              <div class="login-success">
                <mat-icon>check_circle_outline</mat-icon> {{ success }}
              </div>
            }

            <button mat-flat-button type="submit" class="login-btn"
                    [disabled]="loading || !reg.ragioneSociale || !reg.email || !reg.password">
              @if (loading) {
                <span class="btn-content"><span class="btn-spinner"></span><span>Creazione account…</span></span>
              } @else {
                <span class="btn-content"><span>Inizia gratis — 14 giorni di prova</span><mat-icon>arrow_forward</mat-icon></span>
              }
            </button>
          </form>

          <div class="mode-switch">
            Hai già un account?
            <button type="button" class="link-btn" (click)="switchMode('login')">
              Accedi
            </button>
          </div>
        }

        <div class="login-footer">
          <span>© {{ year }} Ordeva</span>
          <span class="dot">·</span>
          <a routerLink="/faq" class="footer-link">FAQ &amp; Guida</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Honeypot field: invisibile agli utenti reali, visibile ai bot stupidi.
       Off-screen invece di display:none perché alcuni bot skippano gli
       elementi nascosti via CSS. */
    .hp-field {
      position: absolute !important;
      left: -10000px; top: -10000px;
      width: 1px; height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .login-overlay {
      position: fixed; inset: 0;
      background: #0e2a38;
      display: flex; align-items: flex-start; justify-content: center;
      z-index: 9999;
      overflow-y: auto; overflow-x: hidden;
      padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
    }

    .login-bg {
      position: fixed; inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.55;
      animation: blob-float 18s ease-in-out infinite;
      will-change: transform;
    }

    .blob-1 {
      width: 520px; height: 520px;
      background: radial-gradient(circle, #11769b 0%, transparent 70%);
      top: -180px; left: -140px;
      animation-delay: 0s;
    }
    .blob-2 {
      width: 580px; height: 580px;
      background: radial-gradient(circle, #15a4a2 0%, transparent 70%);
      bottom: -200px; right: -120px;
      animation-delay: -6s;
    }
    .blob-3 {
      width: 380px; height: 380px;
      background: radial-gradient(circle, #128498 0%, transparent 70%);
      top: 40%; left: 50%;
      transform: translate(-50%, -50%);
      animation-delay: -12s;
      opacity: 0.35;
    }

    .grid-overlay {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, transparent 75%);
      -webkit-mask-image: radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, transparent 75%);
    }

    @keyframes blob-float {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33%      { transform: translate(40px, -30px) scale(1.05); }
      66%      { transform: translate(-30px, 40px) scale(0.95); }
    }
    .blob-3 {
      animation-name: blob-float-center;
    }
    @keyframes blob-float-center {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50%      { transform: translate(-50%, -50%) scale(1.15); }
    }

    .login-card {
      position: relative;
      background: rgba(17, 24, 39, 0.65);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 20px;
      padding: 40px 36px 28px;
      width: 100%;
      max-width: 400px;
      box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.40),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      animation: card-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes card-in {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .login-logo {
      text-align: center;
      margin-bottom: 28px;

      .logo-mark {
        width: 80px;
        height: 80px;
        margin: 0 auto 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 8px 16px rgba(17, 118, 155, 0.35));

        img {
          width: 80px;
          height: 80px;
          object-fit: contain;
          display: block;
        }
      }

      h1 {
        margin: 0 0 4px;
        font-size: 26px;
        font-weight: 800;
        color: #f1f5f9;
        letter-spacing: -0.02em;
      }
      p {
        margin: 0;
        font-size: 12px;
        color: #94a3b8;
        font-weight: 500;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .login-form mat-form-field {
      width: 100%;

      ::ng-deep {
        .mdc-text-field--outlined {
          --mdc-outlined-text-field-container-shape: 10px;
          --mdc-outlined-text-field-outline-color: rgba(255, 255, 255, 0.15);
          --mdc-outlined-text-field-hover-outline-color: rgba(255, 255, 255, 0.30);
          --mdc-outlined-text-field-focus-outline-color: #818cf8;
          --mdc-outlined-text-field-label-text-color: #e2e8f0;
          --mdc-outlined-text-field-hover-label-text-color: #f1f5f9;
          --mdc-outlined-text-field-input-text-color: #f1f5f9;
          --mdc-outlined-text-field-focus-label-text-color: #a5b4fc;
          --mdc-outlined-text-field-caret-color: #818cf8;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 10px;
        }
        .mat-mdc-input-element {
          color: #f1f5f9 !important;
          caret-color: #818cf8 !important;
        }
        .mat-mdc-input-element::placeholder {
          color: #94a3b8 !important;
          opacity: 1 !important;
        }
        /* Label in resting position (inside the field, acts as placeholder) */
        .mdc-floating-label:not(.mdc-floating-label--float-above) {
          color: #94a3b8 !important;
        }
        /* Floating label: sfondo solido per non compenetrare la cornice */
        .mdc-floating-label--float-above {
          background: #101e2d;
          padding: 0 4px;
          margin-left: -4px;
          border-radius: 2px;
          color: #e2e8f0;
        }
        .mdc-text-field--outlined:hover .mdc-floating-label--float-above {
          color: #f1f5f9;
        }
        .mdc-text-field--outlined.mdc-text-field--focused .mdc-floating-label--float-above {
          color: #a5b4fc;
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #f1f5f9 !important;
          -webkit-box-shadow: 0 0 0px 1000px #131c2e inset !important;
          caret-color: #818cf8;
        }
        .mat-mdc-form-field-icon-suffix mat-icon,
        .mat-mdc-form-field-icon-suffix .mat-mdc-icon-button mat-icon {
          color: #94a3b8;
          display: inline-block !important;
        }
      }
    }

    .login-error {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #fca5a5;
      background: rgba(239, 68, 68, 0.10);
      border: 1px solid rgba(239, 68, 68, 0.25);
      font-size: 13px;
      font-weight: 500;
      padding: 10px 12px;
      border-radius: 8px;
      margin: 8px 0 4px;
      animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);

      mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }

    .login-btn {
      width: 100%;
      margin-top: 16px;
      height: 46px !important;
      font-size: 15px !important;
      font-weight: 600 !important;
      border-radius: 10px !important;
      background: linear-gradient(135deg, #11769b 0%, #128498 50%, #15a4a2 100%) !important;
      color: white !important;
      box-shadow:
        0 8px 20px -4px rgba(17, 118, 155, 0.50),
        0 0 0 1px rgba(255, 255, 255, 0.10) inset !important;
      transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1),
                  box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1),
                  filter 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;

      .btn-content {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
      }

      mat-icon { font-size: 18px; width: 18px; height: 18px; transition: transform 0.18s; }

      &:hover:not([disabled]) {
        transform: translateY(-1px);
        box-shadow:
          0 12px 28px -6px rgba(17, 118, 155, 0.60),
          0 0 0 1px rgba(255, 255, 255, 0.15) inset !important;
        mat-icon { transform: translateX(2px); }
      }

      &:active:not([disabled]) { transform: translateY(0); }

      &[disabled] {
        opacity: 0.55;
        filter: saturate(0.6);
      }
    }

    .btn-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .login-footer {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
      letter-spacing: 0.02em;
      .dot { opacity: 0.6; }
      .footer-link {
        color: #5eead4;
        text-decoration: none;
        transition: color 0.15s;
      }
      .footer-link:hover { color: #99f6e4; text-decoration: underline; }
    }

    .mode-switch {
      margin-top: 16px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }

    .link-btn {
      background: none;
      border: none;
      padding: 0;
      margin-left: 4px;
      color: #38bdf8;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
      &:hover { color: #7dd3fc; }
    }

    .link-btn-soft {
      background: none;
      border: none;
      padding: 0;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: color 0.15s;
      &:hover { color: #cbd5e1; text-decoration: underline; text-underline-offset: 2px; }
    }

    .form-intro {
      font-size: 13px;
      color: #94a3b8;
      margin: 0 0 8px;
      line-height: 1.5;
    }

    .login-success {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #86efac;
      background: rgba(34, 197, 94, 0.10);
      border: 1px solid rgba(34, 197, 94, 0.25);
      font-size: 13px;
      font-weight: 500;
      padding: 10px 12px;
      border-radius: 8px;
      margin: 8px 0 4px;
      mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    }

    @media (max-width: 480px) {
      .login-card {
        padding: 32px 24px 22px;
        border-radius: 16px;
      }
      .login-logo h1 { font-size: 24px; }
      .blob { filter: blur(60px); }
    }
  `]
})
export class LoginComponent {
  @Output() loggedIn = new EventEmitter<void>();

  mode: 'login' | 'register' | 'forgot' = 'login';

  // Login
  username = '';
  password = '';

  // Registrazione
  reg: RegisterPayload = { ragioneSociale: '', piva: '', email: '', password: '', nome: '' };

  // Forgot password
  forgotEmail = '';

  // Honeypot anti-bot (campo nascosto via CSS off-screen).
  // Se valorizzato, il backend rifiuta silenziosamente.
  honeypot = '';

  error = '';
  success = '';
  loading = false;
  showPass = false;
  readonly year = new Date().getFullYear();

  constructor(private authSvc: AuthService) {}

  switchMode(m: 'login' | 'register' | 'forgot') {
    this.mode = m;
    this.error = '';
    this.success = '';
    this.showPass = false;
  }

  submitLogin() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = '';
    this.authSvc.login(this.username, this.password).subscribe({
      next: () => { this.loading = false; this.loggedIn.emit(); },
      error: (err) => {
        this.loading = false;
        if (err.status === 0) {
          this.error = 'Server non raggiungibile — avvia il backend (npm run dev)';
        } else if (err.status === 429) {
          this.error = 'Troppi tentativi — riprova tra qualche minuto';
        } else {
          this.error = 'Username o password non corretti';
        }
      }
    });
  }

  submitForgot() {
    if (!this.forgotEmail) return;
    this.loading = true;
    this.error = '';
    this.success = '';
    this.authSvc.forgotPassword(this.forgotEmail, this.honeypot).subscribe({
      next: (r) => {
        this.loading = false;
        this.success = r?.message || 'Se l\'email è registrata, riceverai un\'email con le istruzioni.';
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 429) {
          this.error = 'Troppe richieste — riprova tra qualche minuto.';
        } else {
          this.error = err.error?.error || 'Errore durante la richiesta. Riprova più tardi.';
        }
      }
    });
  }

  submitRegister() {
    if (!this.reg.ragioneSociale || !this.reg.email || !this.reg.password) return;
    this.loading = true;
    this.error = '';
    this.success = '';
    this.authSvc.register(this.reg, this.honeypot).subscribe({
      next: () => { this.loading = false; this.loggedIn.emit(); },
      error: (err) => {
        this.loading = false;
        if (err.status === 0) {
          this.error = 'Server non raggiungibile — avvia il backend (npm run dev)';
        } else if (err.status === 429) {
          this.error = 'Troppi tentativi — riprova più tardi';
        } else {
          this.error = err.error?.error || 'Errore durante la registrazione';
        }
      }
    });
  }
}

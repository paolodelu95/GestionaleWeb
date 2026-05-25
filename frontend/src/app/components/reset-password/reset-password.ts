import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';

/**
 * Pagina pubblica /reset-password?token=XXX
 *
 * Sicurezza:
 *  - Componente statico che chiama solo gli endpoint pubblici
 *    /api/auth/reset-password/* del backend, MAI le API protette.
 *  - Il token è validato lato server: se invalido/scaduto/used,
 *    il backend rifiuta. Nessuna logica di sicurezza lato client.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <div class="reset-overlay">
      <div class="reset-bg">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
      </div>

      <div class="reset-card">
        <div class="reset-logo">
          <div class="logo-mark">
            <img src="icons/ordeva-icon.png" alt="Ordeva" width="72" height="72">
          </div>
          <h1>Reimposta password</h1>
          <p>{{ subtitle }}</p>
        </div>

        @if (state === 'loading') {
          <div class="state-info">
            <span class="spinner"></span>
            <span>Verifico il link…</span>
          </div>
        }

        @if (state === 'invalid') {
          <div class="state-error">
            <mat-icon>link_off</mat-icon>
            <div>
              <b>Link non valido</b>
              <p>{{ invalidReason || 'Il link di reset è scaduto o è già stato usato.' }}</p>
            </div>
          </div>
          <a routerLink="/" class="alt-action">Torna al login</a>
        }

        @if (state === 'form') {
          <form class="reset-form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline">
              <mat-label>Nuova password</mat-label>
              <input matInput [(ngModel)]="password" name="password"
                     [type]="showPass ? 'text' : 'password'"
                     autocomplete="new-password" [disabled]="loading"
                     minlength="8" required>
              <button mat-icon-button matSuffix type="button" (click)="showPass = !showPass" tabindex="-1">
                <mat-icon>{{ showPass ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
              <mat-hint>Minimo 8 caratteri</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Conferma nuova password</mat-label>
              <input matInput [(ngModel)]="passwordConfirm" name="passwordConfirm"
                     [type]="showPass ? 'text' : 'password'"
                     autocomplete="new-password" [disabled]="loading"
                     minlength="8" required>
            </mat-form-field>

            @if (error) {
              <div class="login-error">
                <mat-icon>error_outline</mat-icon> {{ error }}
              </div>
            }

            <button mat-flat-button type="submit" class="login-btn"
                    [disabled]="loading || !canSubmit()">
              @if (loading) {
                <span class="btn-content"><span class="btn-spinner"></span><span>Aggiornamento…</span></span>
              } @else {
                <span class="btn-content"><span>Aggiorna password</span><mat-icon>lock_reset</mat-icon></span>
              }
            </button>
          </form>
        }

        @if (state === 'success') {
          <div class="state-success">
            <mat-icon>check_circle</mat-icon>
            <div>
              <b>Password aggiornata!</b>
              <p>Ora puoi accedere con la nuova password.</p>
            </div>
          </div>
          <a routerLink="/" class="alt-action alt-action-primary">Vai al login</a>
        }

        <div class="reset-footer">
          <span>© {{ year }} Ordeva</span>
          <span class="dot">·</span>
          <a routerLink="/faq" class="footer-link">FAQ &amp; Guida</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .reset-overlay {
      position: fixed; inset: 0;
      background: #0e2a38;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
      padding: 20px;
    }
    .reset-bg {
      position: absolute; inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.55;
    }
    .blob-1 {
      width: 520px; height: 520px;
      background: radial-gradient(circle, #11769b 0%, transparent 70%);
      top: -180px; left: -140px;
    }
    .blob-2 {
      width: 580px; height: 580px;
      background: radial-gradient(circle, #15a4a2 0%, transparent 70%);
      bottom: -200px; right: -120px;
    }

    .reset-card {
      position: relative;
      background: rgba(17, 24, 39, 0.65);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 20px;
      padding: 40px 36px 28px;
      width: 100%; max-width: 420px;
      box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.40),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      color: #f1f5f9;
    }

    .reset-logo {
      text-align: center;
      margin-bottom: 28px;

      .logo-mark {
        width: 72px;
        height: 72px;
        margin: 0 auto 14px;
        display: flex; align-items: center; justify-content: center;
        filter: drop-shadow(0 8px 16px rgba(17, 118, 155, 0.35));
        img { width: 72px; height: 72px; object-fit: contain; display: block; }
      }
      h1 {
        font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
        margin: 0 0 6px; color: #ffffff;
      }
      p {
        font-size: 13px; color: #94a3b8;
        margin: 0;
      }
    }

    .reset-form {
      display: flex; flex-direction: column; gap: 8px;
      ::ng-deep .mat-mdc-form-field { width: 100%; }
    }

    .state-info {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      color: #cbd5e1; font-size: 14px;
      padding: 24px 0;
    }
    .spinner {
      width: 18px; height: 18px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #5eead4;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .btn-spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      display: inline-block; margin-right: 8px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .state-error {
      display: flex; gap: 12px;
      background: rgba(239, 68, 68, 0.10);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 10px;
      padding: 16px;
      color: #fca5a5;
      mat-icon { color: #f87171; flex-shrink: 0; }
      b { color: #fca5a5; font-weight: 600; }
      p { margin: 4px 0 0; font-size: 13px; color: #fda4af; }
    }

    .state-success {
      display: flex; gap: 12px;
      background: rgba(34, 197, 94, 0.10);
      border: 1px solid rgba(34, 197, 94, 0.25);
      border-radius: 10px;
      padding: 16px;
      color: #86efac;
      margin-bottom: 16px;
      mat-icon { color: #4ade80; flex-shrink: 0; }
      b { color: #86efac; font-weight: 600; }
      p { margin: 4px 0 0; font-size: 13px; color: #bbf7d0; }
    }

    .login-error {
      display: flex; align-items: center; gap: 8px;
      color: #fca5a5;
      background: rgba(239, 68, 68, 0.10);
      border: 1px solid rgba(239, 68, 68, 0.25);
      font-size: 13px; font-weight: 500;
      padding: 10px 12px; border-radius: 8px;
      margin: 8px 0 4px;
      mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
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
      transition: transform 0.18s, box-shadow 0.18s !important;
      .btn-content { display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%; }
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
      &:hover:not([disabled]) { transform: translateY(-1px); }
      &[disabled] { opacity: 0.5 !important; cursor: not-allowed; }
    }

    .alt-action {
      display: block; text-align: center;
      margin-top: 20px;
      padding: 11px 18px; border-radius: 10px;
      font-size: 14px; font-weight: 600;
      text-decoration: none;
      color: #cbd5e1;
      border: 1px solid rgba(255,255,255,0.15);
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      &:hover {
        background: rgba(255,255,255,0.05);
        color: #ffffff; border-color: rgba(255,255,255,0.25);
      }
    }
    .alt-action-primary {
      background: linear-gradient(135deg, #11769b 0%, #15a4a2 100%);
      border: none; color: #fff;
      box-shadow: 0 8px 20px -4px rgba(17, 118, 155, 0.50);
      &:hover { color: #fff; background: linear-gradient(135deg, #0e6480 0%, #128498 100%); }
    }

    .reset-footer {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; justify-content: center; align-items: center; gap: 8px;
      font-size: 11px;
      color: #64748b; font-weight: 500; letter-spacing: 0.02em;
      .dot { opacity: 0.6; }
      .footer-link { color: #5eead4; text-decoration: none; transition: color 0.15s; }
      .footer-link:hover { color: #99f6e4; text-decoration: underline; }
    }
  `]
})
export class ResetPasswordComponent implements OnInit {
  state: 'loading' | 'invalid' | 'form' | 'success' = 'loading';
  token = '';
  password = '';
  passwordConfirm = '';
  error = '';
  invalidReason = '';
  loading = false;
  showPass = false;
  readonly year = new Date().getFullYear();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authSvc: AuthService,
  ) {}

  get subtitle(): string {
    if (this.state === 'success') return 'Tutto a posto';
    if (this.state === 'invalid') return 'Link scaduto o non valido';
    if (this.state === 'form')    return 'Scegli una nuova password sicura';
    return '';
  }

  ngOnInit() {
    this.token = (this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (!this.token) {
      this.state = 'invalid';
      this.invalidReason = 'Manca il token nel link.';
      return;
    }
    this.authSvc.checkResetToken(this.token).subscribe({
      next: (r) => {
        this.state = r?.valid ? 'form' : 'invalid';
        if (!r?.valid) this.invalidReason = r?.reason || '';
      },
      error: (err) => {
        this.state = 'invalid';
        this.invalidReason = err.error?.reason || 'Il link non è più valido.';
      },
    });
  }

  canSubmit(): boolean {
    return this.password.length >= 8 && this.password === this.passwordConfirm;
  }

  submit() {
    if (!this.canSubmit()) {
      this.error = this.password.length < 8
        ? 'La password deve essere di almeno 8 caratteri.'
        : 'Le due password non corrispondono.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.authSvc.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.state = 'success';
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 429) {
          this.error = 'Troppe richieste — riprova tra qualche minuto.';
        } else {
          this.error = err.error?.error || 'Errore durante l\'aggiornamento.';
        }
      },
    });
  }
}

import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
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
            <mat-icon>business_center</mat-icon>
          </div>
          <h1>Invoxa</h1>
          <p>Gestionale ERP</p>
        </div>

        <form class="login-form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline">
            <mat-label>Username</mat-label>
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

        <div class="login-footer">
          <span>© {{ year }} Invoxa</span>
          <span class="dot">·</span>
          <span>Gestione aziendale moderna</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-overlay {
      position: fixed; inset: 0;
      background: #0a0e17;
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
      overflow: hidden;
      padding: 20px;
    }

    .login-bg {
      position: absolute; inset: 0;
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
      background: radial-gradient(circle, #4f46e5 0%, transparent 70%);
      top: -180px; left: -140px;
      animation-delay: 0s;
    }
    .blob-2 {
      width: 580px; height: 580px;
      background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
      bottom: -200px; right: -120px;
      animation-delay: -6s;
    }
    .blob-3 {
      width: 380px; height: 380px;
      background: radial-gradient(circle, #06b6d4 0%, transparent 70%);
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
        width: 56px;
        height: 56px;
        border-radius: 14px;
        background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #8b5cf6 100%);
        margin: 0 auto 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow:
          0 8px 24px -4px rgba(79, 70, 229, 0.55),
          0 0 0 1px rgba(255, 255, 255, 0.10) inset;

        mat-icon {
          font-size: 28px;
          width: 28px;
          height: 28px;
          color: white;
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
          --mdc-outlined-text-field-outline-color: rgba(255, 255, 255, 0.15);
          --mdc-outlined-text-field-hover-outline-color: rgba(255, 255, 255, 0.30);
          --mdc-outlined-text-field-focus-outline-color: #818cf8;
          --mdc-outlined-text-field-label-text-color: #94a3b8;
          --mdc-outlined-text-field-input-text-color: #f1f5f9;
          --mdc-outlined-text-field-focus-label-text-color: #a5b4fc;
          --mdc-outlined-text-field-caret-color: #818cf8;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 10px;
        }
        .mdc-notched-outline__leading,
        .mdc-notched-outline__notch,
        .mdc-notched-outline__trailing {
          border-radius: 10px 0 0 10px;
        }
        .mat-mdc-form-field-icon-suffix mat-icon {
          color: #94a3b8;
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
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%) !important;
      color: white !important;
      box-shadow:
        0 8px 20px -4px rgba(79, 70, 229, 0.50),
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
          0 12px 28px -6px rgba(79, 70, 229, 0.60),
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

  username = '';
  password = '';
  error = '';
  loading = false;
  showPass = false;
  readonly year = new Date().getFullYear();

  constructor(private authSvc: AuthService) {}

  submit() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = '';
    this.authSvc.login(this.username, this.password).subscribe({
      next: () => { this.loading = false; this.loggedIn.emit(); },
      error: () => { this.loading = false; this.error = 'Username o password non corretti'; }
    });
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';

/**
 * Pagina pubblica /verify-email?token=XXX
 * Chiama il backend per validare il token e mostra l'esito.
 */
@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="verify-overlay">
      <div class="verify-bg">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
      </div>

      <div class="verify-card">
        <div class="verify-logo">
          <div class="logo-mark">
            <img src="icons/ordeva-icon.png" alt="Ordeva" width="64" height="64">
          </div>
          <h1>Conferma email</h1>
        </div>

        @if (state === 'loading') {
          <div class="state-info">
            <span class="spinner"></span>
            <span>Verifica del link in corso…</span>
          </div>
        }
        @if (state === 'success') {
          <div class="state-success">
            <mat-icon>verified</mat-icon>
            <div>
              <b>Email confermata!</b>
              <p>Il tuo account è attivo. Ora puoi accedere a tutte le funzioni.</p>
            </div>
          </div>
          <a routerLink="/" class="cta cta-primary">Vai al login</a>
        }
        @if (state === 'failed') {
          <div class="state-error">
            <mat-icon>link_off</mat-icon>
            <div>
              <b>Link non valido</b>
              <p>{{ reason || 'Il link di conferma è scaduto o è già stato usato.' }}</p>
            </div>
          </div>
          <a routerLink="/" class="cta">Torna al login</a>
          <p class="hint">Una volta loggato, dal banner in alto puoi inviare un nuovo link di conferma.</p>
        }

        <div class="verify-footer">
          <span>© {{ year }} Ordeva</span>
          <span class="dot">·</span>
          <a routerLink="/faq" class="footer-link">FAQ &amp; Guida</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .verify-overlay {
      position: fixed; inset: 0;
      background: #0e2a38;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
      padding: 20px;
    }
    .verify-bg {
      position: absolute; inset: 0;
      overflow: hidden; pointer-events: none;
    }
    .blob {
      position: absolute; border-radius: 50%;
      filter: blur(80px); opacity: 0.55;
    }
    .blob-1 { width: 520px; height: 520px; background: radial-gradient(circle, #11769b 0%, transparent 70%); top: -180px; left: -140px; }
    .blob-2 { width: 580px; height: 580px; background: radial-gradient(circle, #15a4a2 0%, transparent 70%); bottom: -200px; right: -120px; }

    .verify-card {
      position: relative;
      background: rgba(17, 24, 39, 0.65);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 20px;
      padding: 40px 36px 28px;
      width: 100%; max-width: 420px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.40), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      color: #f1f5f9;
    }
    .verify-logo {
      text-align: center;
      margin-bottom: 28px;
      .logo-mark {
        width: 64px; height: 64px;
        margin: 0 auto 14px;
        display: flex; align-items: center; justify-content: center;
        filter: drop-shadow(0 8px 16px rgba(17, 118, 155, 0.35));
        img { width: 64px; height: 64px; object-fit: contain; display: block; }
      }
      h1 {
        font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
        margin: 0; color: #ffffff;
      }
    }

    .state-info {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      color: #cbd5e1; font-size: 14px; padding: 24px 0;
    }
    .spinner {
      width: 18px; height: 18px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #5eead4;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .state-success, .state-error {
      display: flex; gap: 12px;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
      mat-icon { flex-shrink: 0; }
      b { font-weight: 600; }
      p { margin: 4px 0 0; font-size: 13px; }
    }
    .state-success {
      background: rgba(34, 197, 94, 0.10);
      border: 1px solid rgba(34, 197, 94, 0.25);
      color: #86efac;
      mat-icon { color: #4ade80; }
      b { color: #86efac; }
      p { color: #bbf7d0; }
    }
    .state-error {
      background: rgba(239, 68, 68, 0.10);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #fca5a5;
      mat-icon { color: #f87171; }
      b { color: #fca5a5; }
      p { color: #fda4af; }
    }

    .cta {
      display: block; text-align: center;
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
    .cta-primary {
      background: linear-gradient(135deg, #11769b 0%, #15a4a2 100%);
      border: none; color: #fff;
      box-shadow: 0 8px 20px -4px rgba(17, 118, 155, 0.50);
      &:hover { color: #fff; background: linear-gradient(135deg, #0e6480 0%, #128498 100%); }
    }
    .hint {
      font-size: 12px; color: #94a3b8;
      text-align: center; margin: 14px 0 0; line-height: 1.5;
    }

    .verify-footer {
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
export class VerifyEmailComponent implements OnInit {
  state: 'loading' | 'success' | 'failed' = 'loading';
  reason = '';
  readonly year = new Date().getFullYear();

  constructor(private route: ActivatedRoute, private authSvc: AuthService) {}

  ngOnInit() {
    const token = (this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (!token) {
      this.state = 'failed';
      this.reason = 'Manca il token nel link.';
      return;
    }
    this.authSvc.verifyEmail(token).subscribe({
      next: r => {
        this.state = r?.verified ? 'success' : 'failed';
        if (!r?.verified) this.reason = r?.reason || '';
      },
      error: err => {
        this.state = 'failed';
        this.reason = err.error?.reason || 'Il link non è più valido.';
      },
    });
  }
}

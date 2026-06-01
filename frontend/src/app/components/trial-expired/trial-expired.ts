import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../services/auth.service';

/**
 * Pagina /trial-expired mostrata quando il backend ritorna 402
 * (TRIAL_EXPIRED). L'utente può:
 *  - vedere quando è scaduto il trial
 *  - sottoscrivere un piano (link a FAQ#prezzi finché Stripe non è attivo)
 *  - richiedere l'export dei propri dati (via email a supporto)
 *  - fare logout / cambiare account
 */
@Component({
  selector: 'app-trial-expired',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, MatIconModule, MatButtonModule],
  template: `
    <div class="te-page">
      <div class="te-bg">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
      </div>

      <div class="te-card">
        <div class="te-logo">
          <img src="icons/ordeva-icon.png" alt="Ordeva" width="64" height="64">
        </div>
        <h1>Il periodo di prova è terminato</h1>
        <p class="te-sub">
          @if (trialScadeIl) {
            La prova gratuita di Ordeva per <b>{{ ragioneSociale }}</b> è scaduta il
            <b>{{ trialScadeIl | date:'d MMMM y' }}</b>.
          } @else {
            La prova gratuita di Ordeva è terminata.
          }
        </p>
        <p class="te-msg">
          Sottoscrivi un piano per continuare a usare tutte le funzioni:
          fatturazione SDI, magazzino, agenda e tutto il resto restano
          esattamente come li hai lasciati. I tuoi dati sono al sicuro e
          intoccati.
        </p>

        <div class="te-actions">
          <a routerLink="/faq" fragment="prezzi" class="te-cta te-cta-primary">
            <mat-icon>credit_card</mat-icon>
            Vedi i piani disponibili
          </a>
          <a href="mailto:contatti&#64;ordeva.it?subject=Richiesta%20export%20dati%20Ordeva" class="te-cta">
            <mat-icon>download</mat-icon>
            Esporta i miei dati
          </a>
        </div>

        <div class="te-divider"><span>oppure</span></div>

        <button mat-button class="te-logout" (click)="logout()">
          <mat-icon>logout</mat-icon> Esci e cambia account
        </button>

        <div class="te-footer">
          <span>Hai bisogno di aiuto?</span>
          <a href="mailto:contatti&#64;ordeva.it">contatti&#64;ordeva.it</a>
          <span class="dot">·</span>
          <a routerLink="/faq">FAQ</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .te-page {
      position: fixed; inset: 0;
      background: #0e2a38;
      display: flex; align-items: center; justify-content: center;
      overflow: auto; padding: 24px;
      color: #f1f5f9;
    }
    .te-bg {
      position: absolute; inset: 0;
      overflow: hidden; pointer-events: none;
    }
    .blob {
      position: absolute; border-radius: 50%;
      filter: blur(80px); opacity: 0.45;
    }
    .blob-1 { width: 540px; height: 540px; background: radial-gradient(circle, #d97706 0%, transparent 70%); top: -180px; left: -140px; }
    .blob-2 { width: 600px; height: 600px; background: radial-gradient(circle, #11769b 0%, transparent 70%); bottom: -200px; right: -120px; }

    .te-card {
      position: relative;
      background: rgba(17, 24, 39, 0.72);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 20px;
      padding: 40px 36px 28px;
      width: 100%; max-width: 520px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.40), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    }

    .te-logo {
      text-align: center; margin-bottom: 20px;
      img {
        filter: drop-shadow(0 8px 20px rgba(217, 119, 6, 0.40));
      }
    }
    h1 {
      font-size: 24px; font-weight: 800; letter-spacing: -0.02em;
      margin: 0 0 12px; color: #ffffff; text-align: center;
    }
    .te-sub {
      font-size: 14px; color: #cbd5e1;
      margin: 0 0 16px; text-align: center; line-height: 1.55;
    }
    .te-msg {
      font-size: 13px; color: #94a3b8;
      margin: 0 0 28px; line-height: 1.6;
    }

    .te-actions {
      display: flex; flex-direction: column; gap: 10px;
      margin-bottom: 24px;
    }
    .te-cta {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px;
      padding: 13px 22px; border-radius: 10px;
      font-weight: 600; font-size: 14px;
      text-decoration: none;
      color: #cbd5e1;
      border: 1px solid rgba(255,255,255,0.15);
      background: transparent;
      transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.15s;
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
      &:hover {
        background: rgba(255,255,255,0.05);
        color: #ffffff; border-color: rgba(255,255,255,0.25);
        transform: translateY(-1px);
      }
    }
    .te-cta-primary {
      background: linear-gradient(135deg, #11769b 0%, #15a4a2 100%);
      border: none; color: #fff;
      box-shadow: 0 8px 20px -4px rgba(17, 118, 155, 0.50);
      &:hover {
        color: #fff;
        background: linear-gradient(135deg, #0e6480 0%, #128498 100%);
      }
    }

    .te-divider {
      text-align: center;
      position: relative;
      margin: 8px 0 16px;
      &:before {
        content: ''; position: absolute;
        left: 0; right: 0; top: 50%;
        border-top: 1px solid rgba(255,255,255,0.10);
      }
      span {
        position: relative;
        background: rgba(17,24,39,0.92);
        padding: 0 12px;
        font-size: 11px; color: #64748b;
        text-transform: uppercase; letter-spacing: 0.1em;
      }
    }

    .te-logout {
      width: 100%; color: #94a3b8 !important;
      font-size: 13px !important;
      mat-icon { font-size: 16px; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px; }
      &:hover { color: #cbd5e1 !important; }
    }

    .te-footer {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; justify-content: center; align-items: center;
      flex-wrap: wrap; gap: 6px;
      font-size: 12px; color: #64748b;
      a { color: #5eead4; text-decoration: none; }
      a:hover { color: #99f6e4; text-decoration: underline; }
      .dot { opacity: 0.6; }
    }
  `]
})
export class TrialExpiredComponent implements OnInit {
  trialScadeIl: string | null = null;
  ragioneSociale = 'la tua azienda';

  constructor(private router: Router, private authSvc: AuthService) {}

  ngOnInit() {
    const state = this.router.getCurrentNavigation()?.extras?.state
      ?? history.state;
    if (state?.trialScadeIl) this.trialScadeIl = state.trialScadeIl;
    if (state?.ragioneSociale) this.ragioneSociale = state.ragioneSociale;

    // Fallback: leggo da /me se non c'è stato passato
    if (!this.trialScadeIl) {
      this.authSvc.refreshUser().subscribe({
        next: (u: any) => {
          if (u?.trialScadeIl) this.trialScadeIl = u.trialScadeIl;
        },
        error: () => {},
      });
    }
  }

  logout() {
    this.authSvc.logout();
    window.location.href = '/';
  }
}

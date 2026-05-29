import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';

/** Versione del consenso: incrementare per ri-chiedere il consenso a tutti gli utenti. */
const CONSENT_VERSION = 1;
const STORAGE_KEY = 'ordeva_cookie_consent';

export interface CookieConsent {
  version: number;
  timestamp: string;
  necessari: true;        // sempre attivi
  preferenze: boolean;
  statistiche: boolean;
  marketing: boolean;
}

/**
 * Banner di consenso ai cookie conforme al GDPR / Direttiva ePrivacy.
 * - I cookie tecnici (necessari) sono sempre attivi e non disattivabili.
 * - "Accetta tutti" e "Solo necessari" hanno pari evidenza (no dark pattern).
 * - Consenso granulare per categoria tramite "Personalizza".
 * - Esito + timestamp + versione salvati in localStorage come prova del consenso.
 * Montato a livello di root: visibile su login, pagine pubbliche e app.
 */
@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatSlideToggleModule, FormsModule],
  template: `
    @if (visible) {
      <div class="cc-backdrop" [class.cc-prefs]="showPrefs"></div>
      <div class="cc-banner" role="dialog" aria-modal="true" aria-label="Preferenze cookie" aria-live="polite">
        @if (!showPrefs) {
          <!-- Vista iniziale -->
          <div class="cc-body">
            <div class="cc-head">
              <mat-icon>cookie</mat-icon>
              <h2>Rispettiamo la tua privacy</h2>
            </div>
            <p class="cc-text">
              Utilizziamo cookie tecnici necessari al funzionamento del servizio e, previo tuo consenso,
              cookie per preferenze, statistiche e marketing. Puoi accettarli tutti, rifiutare quelli non
              essenziali o scegliere quali attivare. Per maggiori dettagli leggi la
              <a routerLink="/cookie" (click)="dismiss()">Cookie Policy</a>.
            </p>
          </div>
          <div class="cc-actions">
            <button mat-stroked-button type="button" (click)="showPrefs = true">
              <mat-icon>tune</mat-icon> Personalizza
            </button>
            <button mat-stroked-button type="button" (click)="acceptNecessary()">Solo necessari</button>
            <button mat-flat-button color="primary" type="button" (click)="acceptAll()">Accetta tutti</button>
          </div>
        } @else {
          <!-- Vista personalizzazione -->
          <div class="cc-body">
            <div class="cc-head">
              <mat-icon>tune</mat-icon>
              <h2>Preferenze cookie</h2>
            </div>
            <div class="cc-cat">
              <div class="cc-cat-info">
                <strong>Necessari</strong>
                <span>Indispensabili per l'autenticazione, la sicurezza e le funzioni di base. Sempre attivi.</span>
              </div>
              <mat-slide-toggle [checked]="true" [disabled]="true"></mat-slide-toggle>
            </div>
            <div class="cc-cat">
              <div class="cc-cat-info">
                <strong>Preferenze</strong>
                <span>Ricordano impostazioni come tema, lingua e layout per migliorare l'esperienza.</span>
              </div>
              <mat-slide-toggle [(ngModel)]="prefs.preferenze"></mat-slide-toggle>
            </div>
            <div class="cc-cat">
              <div class="cc-cat-info">
                <strong>Statistiche</strong>
                <span>Ci aiutano a capire come viene usato il gestionale in forma aggregata e anonima.</span>
              </div>
              <mat-slide-toggle [(ngModel)]="prefs.statistiche"></mat-slide-toggle>
            </div>
            <div class="cc-cat">
              <div class="cc-cat-info">
                <strong>Marketing</strong>
                <span>Usati per mostrare comunicazioni e offerte pertinenti. Disattivati per impostazione predefinita.</span>
              </div>
              <mat-slide-toggle [(ngModel)]="prefs.marketing"></mat-slide-toggle>
            </div>
          </div>
          <div class="cc-actions">
            <button mat-button type="button" (click)="showPrefs = false">
              <mat-icon>arrow_back</mat-icon> Indietro
            </button>
            <button mat-stroked-button type="button" (click)="acceptNecessary()">Rifiuta tutti</button>
            <button mat-flat-button color="primary" type="button" (click)="savePrefs()">Salva preferenze</button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .cc-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, .28); z-index: 1200; animation: cc-fade .2s ease; }
    .cc-backdrop.cc-prefs { background: rgba(15, 23, 42, .5); }
    .cc-banner {
      position: fixed; z-index: 1201; left: 50%; bottom: 16px; transform: translateX(-50%);
      width: min(720px, calc(100vw - 24px)); box-sizing: border-box;
      background: var(--bg-surface, #fff); color: var(--text-primary, #0f172a);
      border: 1px solid var(--border-subtle, #e6e8ee); border-radius: 16px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, .24); padding: 20px 22px;
      animation: cc-slide .26s cubic-bezier(.2, .8, .2, 1);
    }
    .cc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .cc-head mat-icon { color: var(--primary, #11769b); font-size: 26px; width: 26px; height: 26px; }
    .cc-head h2 { margin: 0; font-size: 18px; font-weight: 700; }
    .cc-text { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--text-secondary, #475569); }
    .cc-text a { color: var(--primary, #11769b); font-weight: 600; text-decoration: underline; }
    .cc-body { margin-bottom: 16px; }
    .cc-cat { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--border-subtle, #eef0f4); }
    .cc-cat:first-of-type { border-top: none; }
    .cc-cat-info { display: flex; flex-direction: column; gap: 2px; }
    .cc-cat-info strong { font-size: 14px; font-weight: 700; }
    .cc-cat-info span { font-size: 12.5px; line-height: 1.45; color: var(--text-secondary, #64748b); }
    .cc-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; align-items: center; }
    .cc-actions button { flex: 0 0 auto; }
    @keyframes cc-slide { from { opacity: 0; transform: translate(-50%, 24px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes cc-fade { from { opacity: 0; } to { opacity: 1; } }
    @media (max-width: 600px) {
      .cc-banner { left: 8px; right: 8px; bottom: 8px; transform: none; width: auto; padding: 16px; border-radius: 14px; max-height: calc(100dvh - 16px); overflow-y: auto; }
      @keyframes cc-slide { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
      .cc-actions { gap: 8px; }
      .cc-actions button { flex: 1 1 100%; }
    }
  `]
})
export class CookieConsentComponent implements OnInit {
  visible = false;
  showPrefs = false;
  prefs = { preferenze: false, statistiche: false, marketing: false };

  ngOnInit() {
    this.visible = !this.hasValidConsent();
  }

  private hasValidConsent(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const c = JSON.parse(raw) as CookieConsent;
      return !!c && c.version === CONSENT_VERSION;
    } catch { return false; }
  }

  acceptAll() {
    this.save({ preferenze: true, statistiche: true, marketing: true });
  }

  acceptNecessary() {
    this.save({ preferenze: false, statistiche: false, marketing: false });
  }

  savePrefs() {
    this.save({ ...this.prefs });
  }

  /** Chiude il banner senza salvare scelte (es. click sul link policy): ricomparirà al prossimo accesso. */
  dismiss() {
    this.visible = false;
  }

  private save(choices: { preferenze: boolean; statistiche: boolean; marketing: boolean }) {
    const consent: CookieConsent = {
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      necessari: true,
      ...choices,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(consent)); } catch { /* storage disabilitato */ }
    this.visible = false;
    this.showPrefs = false;
  }
}

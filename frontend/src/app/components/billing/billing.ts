import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BillingService, BillingStatus } from '../../services/billing.service';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="bill-page">
      <div class="bill-hero">
        <h1>Abbonamento</h1>
        <p>Gestisci il tuo piano Ordeva e i dati di fatturazione.</p>
      </div>

      @if (loading) {
        <div class="bill-loading"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (!status) {
        <div class="bill-error">
          <mat-icon>error_outline</mat-icon>
          Impossibile caricare lo stato dell'abbonamento. Ricarica la pagina.
        </div>
      } @else {

        <!-- Banner stato corrente -->
        <div class="bill-state" [class.is-active]="status.effectiveState === 'active'"
                                [class.is-trial]="status.effectiveState === 'trial'"
                                [class.is-expired]="status.effectiveState === 'expired' || status.effectiveState === 'past_due'">
          <div class="state-icon">
            @switch (status.effectiveState) {
              @case ('active')   { <mat-icon>verified</mat-icon> }
              @case ('trial')    { <mat-icon>schedule</mat-icon> }
              @case ('past_due') { <mat-icon>warning</mat-icon> }
              @case ('expired')  { <mat-icon>lock</mat-icon> }
            }
          </div>
          <div class="state-text">
            @switch (status.effectiveState) {
              @case ('active') {
                <div class="state-title">Pro attivo</div>
                <div class="state-sub">
                  Rinnovo: {{ status.currentPeriodEnd | date:'dd/MM/yyyy' }}
                  · Fatturazione {{ status.billingInterval === 'year' ? 'annuale' : 'mensile' }}
                </div>
              }
              @case ('trial') {
                <div class="state-title">Periodo di prova</div>
                <div class="state-sub">Scade il {{ status.trialScadeIl | date:'dd/MM/yyyy' }}. Sottoscrivi Pro per continuare oltre.</div>
              }
              @case ('past_due') {
                <div class="state-title">Pagamento in sospeso</div>
                <div class="state-sub">Il rinnovo non è andato a buon fine. Aggiorna il metodo di pagamento dal Customer Portal.</div>
              }
              @case ('expired') {
                <div class="state-title">Abbonamento non attivo</div>
                <div class="state-sub">Puoi consultare ed esportare i tuoi dati, ma le modifiche sono disabilitate finché non riattivi.</div>
              }
            }
          </div>
        </div>

        <!-- Sezione piani / portal -->
        @if (status.effectiveState === 'active' || status.effectiveState === 'past_due') {
          <div class="bill-portal">
            <h3>Gestisci abbonamento</h3>
            <p>Cambia carta di credito, scarica fatture, sospendi o annulla il piano.</p>
            <button mat-flat-button color="primary" (click)="openPortal()" [disabled]="busy">
              <mat-icon>settings</mat-icon> Apri Customer Portal
            </button>
          </div>
        } @else {
          <!-- Trial o expired: mostra i piani -->
          <div class="bill-plans">
            <h3>Sottoscrivi Pro</h3>
            <p>Sblocca tutte le funzionalità di Ordeva senza limiti.</p>

            <div class="plan-grid">
              <div class="plan-card">
                <div class="plan-badge">Mensile</div>
                <div class="plan-price">€19<span>/mese</span></div>
                <div class="plan-features">
                  <div><mat-icon>check_circle</mat-icon> Tutti i moduli inclusi</div>
                  <div><mat-icon>check_circle</mat-icon> OCR fatture illimitato</div>
                  <div><mat-icon>check_circle</mat-icon> Export massivi</div>
                  <div><mat-icon>check_circle</mat-icon> Branding personalizzato</div>
                  <div><mat-icon>check_circle</mat-icon> Cancella quando vuoi</div>
                </div>
                <button mat-flat-button color="primary" (click)="checkout('month')"
                        [disabled]="busy || !status.stripeConfigured">
                  Sottoscrivi mensile
                </button>
              </div>

              <div class="plan-card plan-recommended">
                <div class="plan-badge">Annuale · -16%</div>
                <div class="plan-price">€190<span>/anno</span></div>
                <div class="plan-savings">Risparmi €38 vs mensile</div>
                <div class="plan-features">
                  <div><mat-icon>check_circle</mat-icon> Tutti i moduli inclusi</div>
                  <div><mat-icon>check_circle</mat-icon> OCR fatture illimitato</div>
                  <div><mat-icon>check_circle</mat-icon> Export massivi</div>
                  <div><mat-icon>check_circle</mat-icon> Branding personalizzato</div>
                  <div><mat-icon>check_circle</mat-icon> Supporto prioritario</div>
                </div>
                <button mat-flat-button color="primary" (click)="checkout('year')"
                        [disabled]="busy || !status.stripeConfigured">
                  Sottoscrivi annuale
                </button>
              </div>
            </div>

            @if (!status.stripeConfigured) {
              <div class="bill-notice">
                <mat-icon>info</mat-icon>
                I pagamenti non sono ancora configurati su questo ambiente. Contatta il supporto per attivare l'abbonamento.
              </div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .bill-page { max-width: 880px; margin: 0 auto; padding: 32px 24px; }
    .bill-hero h1 { margin: 0 0 6px; font-size: 28px; }
    .bill-hero p  { margin: 0 0 24px; color: #64748b; }

    .bill-loading { display: flex; justify-content: center; padding: 60px; }
    .bill-error { padding: 24px; background: #fef2f2; color: #991b1b; border-radius: 10px; display: flex; gap: 8px; align-items: center; }

    .bill-state {
      display: flex; gap: 16px; align-items: center;
      padding: 20px 24px; border-radius: 14px; margin-bottom: 28px;
      border: 1px solid;
    }
    .bill-state .state-icon mat-icon { font-size: 32px; width: 32px; height: 32px; }
    .state-title { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
    .state-sub   { font-size: 13px; color: #475569; }

    .bill-state.is-active   { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
    .bill-state.is-active   .state-icon mat-icon { color: #10b981; }
    .bill-state.is-trial    { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
    .bill-state.is-trial    .state-icon mat-icon { color: #f59e0b; }
    .bill-state.is-expired  { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
    .bill-state.is-expired  .state-icon mat-icon { color: #dc2626; }

    .bill-portal {
      padding: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
    }
    .bill-portal h3 { margin: 0 0 6px; }
    .bill-portal p  { margin: 0 0 16px; color: #64748b; font-size: 14px; }

    .bill-plans h3 { margin: 0 0 6px; }
    .bill-plans > p { margin: 0 0 20px; color: #64748b; font-size: 14px; }
    .plan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    @media (max-width: 640px) { .plan-grid { grid-template-columns: 1fr; } }

    .plan-card {
      background: white; border: 1px solid #e2e8f0; border-radius: 14px;
      padding: 24px; position: relative;
    }
    .plan-recommended { border-color: #11769b; box-shadow: 0 6px 20px -8px rgba(17,118,155,0.25); }
    .plan-badge {
      display: inline-block; background: #e6f1f6; color: #0e6480;
      font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px;
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;
    }
    .plan-recommended .plan-badge { background: #11769b; color: white; }
    .plan-price { font-size: 36px; font-weight: 800; color: #0e2a38; }
    .plan-price span { font-size: 16px; font-weight: 500; color: #64748b; }
    .plan-savings { font-size: 12px; color: #16a34a; font-weight: 600; margin-bottom: 14px; }
    .plan-features { margin: 14px 0 20px; display: flex; flex-direction: column; gap: 8px; }
    .plan-features > div { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #334155; }
    .plan-features mat-icon { font-size: 18px; width: 18px; height: 18px; color: #10b981; }

    .bill-notice {
      margin-top: 18px; padding: 12px 16px; background: #fffbeb;
      border: 1px solid #fde68a; border-radius: 8px; color: #78716c;
      display: flex; gap: 8px; align-items: center; font-size: 13px;
    }
    .bill-notice mat-icon { color: #d97706; flex-shrink: 0; }
  `]
})
export class BillingComponent implements OnInit {
  loading = true;
  busy = false;
  status: BillingStatus | null = null;

  constructor(
    private billing: BillingService,
    private snack: MatSnackBar,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Messaggio post-redirect da Stripe
    const checkout = this.route.snapshot.queryParamMap.get('checkout');
    if (checkout === 'success') {
      this.snack.open('Pagamento ricevuto. Aggiorno lo stato dell\'abbonamento...', '', { duration: 3000 });
    } else if (checkout === 'cancel') {
      this.snack.open('Sottoscrizione annullata.', '', { duration: 3000 });
    }
    this.load();
  }

  load() {
    this.loading = true;
    this.billing.getStatus().subscribe({
      next: s => { this.status = s; this.loading = false; },
      error: e => {
        this.loading = false;
        this.snack.open(e.error?.error || 'Errore caricamento stato', 'OK', { duration: 4000 });
      },
    });
  }

  checkout(interval: 'month' | 'year') {
    this.busy = true;
    this.billing.createCheckout(interval).subscribe({
      next: r => { window.location.href = r.url; },
      error: e => {
        this.busy = false;
        this.snack.open(e.error?.error || 'Errore avvio checkout', 'OK', { duration: 4500 });
      },
    });
  }

  openPortal() {
    this.busy = true;
    this.billing.openPortal().subscribe({
      next: r => { window.location.href = r.url; },
      error: e => {
        this.busy = false;
        this.snack.open(e.error?.error || 'Errore apertura portal', 'OK', { duration: 4500 });
      },
    });
  }
}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface BillingStatus {
  plan: 'trial' | 'pro';
  /** Stato effettivo che il frontend usa per l'UI. */
  effectiveState: 'trial' | 'active' | 'expired' | 'past_due';
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  trialScadeIl: string | null;
  billingInterval: 'month' | 'year' | null;
  hasStripeCustomer: boolean;
  stripeConfigured: boolean;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  constructor(private api: ApiService) {}

  getStatus(): Observable<BillingStatus> {
    return this.api.get<BillingStatus>('billing/status');
  }

  /** Crea una sessione Stripe Checkout. Risponde con l'URL da aprire. */
  createCheckout(interval: 'month' | 'year'): Observable<{ url: string }> {
    return this.api.post<{ url: string }>('billing/checkout', { interval });
  }

  /** Apre il Customer Portal di Stripe per gestire abbonamento. */
  openPortal(): Observable<{ url: string }> {
    return this.api.post<{ url: string }>('billing/portal', {});
  }
}

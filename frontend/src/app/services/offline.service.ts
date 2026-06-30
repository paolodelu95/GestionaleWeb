import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OfflineService {
  private readonly _offline = new BehaviorSubject<boolean>(!navigator.onLine);
  readonly offline$ = this._offline.asObservable();

  /**
   * Errori di rete consecutivi (status 0). Prima di mostrare il banner "server non
   * raggiungibile" serve una soglia di conferme, così una singola richiesta annullata
   * o un blip transitorio non lo fanno lampeggiare. È il caso tipico dell'edizione
   * desktop, dove il backend è in-process (ordeva.localhost) e non dipende da internet.
   */
  private consecutiveErrors = 0;
  private static readonly ERROR_THRESHOLD = 2;

  /** Imposta esplicitamente lo stato (eventi di rete del browser, solo su web). */
  setOffline(v: boolean) {
    if (this._offline.value !== v) this._offline.next(v);
  }

  /** Una chiamata API ha avuto risposta dal server (anche di errore) → raggiungibile. */
  reportReachable() {
    this.consecutiveErrors = 0;
    this.setOffline(false);
  }

  /** Errore di rete (status 0): mostra il banner solo dopo ERROR_THRESHOLD di fila. */
  reportNetworkError() {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= OfflineService.ERROR_THRESHOLD) this.setOffline(true);
  }
}

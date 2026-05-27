import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Stato globale del flag "blocca documenti già salvati".
 *
 * Quando attivo, i dialog di edit di Fattura/DDT/Preventivo/Ordine/
 * NotaCredito/Acquisto si aprono in modalità READONLY: tutti i campi
 * sono disabled e c'è un bottone lucchetto nell'header del dialog.
 * L'utente clicca il lucchetto per sbloccare temporaneamente.
 *
 * Il flag è persistente in `azienda.lock_documenti_default` (vedi
 * Impostazioni → Documenti). Qui lo cachiamo per riuso fra dialog.
 */
@Injectable({ providedIn: 'root' })
export class DocLockService {
  private _enabled$ = new BehaviorSubject<boolean>(true);
  enabled$ = this._enabled$.asObservable();

  setEnabled(v: boolean) { this._enabled$.next(!!v); }
  get enabled(): boolean { return this._enabled$.value; }
}

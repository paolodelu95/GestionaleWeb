import { ErrorHandler, Injectable, Injector, NgZone, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Rete di sicurezza per gli errori HTTP che nessuno gestisce.
 *
 * Il problema che risolve: in decine di punti l'app scrive
 * `this.ds.deleteX(id).subscribe(() => this.load())` — senza ramo `error:`. Se il
 * server rifiuta, RxJS rilancia l'errore come "unhandled" e lì finisce: l'utente
 * clicca "Elimina", non succede niente, nessun messaggio, e resta convinto che
 * l'operazione sia andata a buon fine. `authInterceptor` gestisce 401/402/rete ma
 * non mostra nulla di generico.
 *
 * Perché a livello di `ErrorHandler` e non nell'interceptor: un interceptor non
 * sa se qualcuno gestirà l'errore, quindi mostrerebbe un messaggio anche dove la
 * schermata ne mostra già uno suo (doppio avviso). Gli errori che arrivano qui,
 * invece, sono per definizione quelli che **nessuno ha gestito** — RxJS li rilancia
 * solo in assenza di un `error:` callback. È esattamente il caso da coprire, e le
 * schermate già corrette restano intatte.
 *
 * Si verifica dalla galleria di anteprima con lo stato dati "Scritture KO"
 * (vedi frontend/src/preview/README.md).
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly injector = inject(Injector);

  /** Ultimo messaggio mostrato: evita pile di snackbar quando falliscono più chiamate insieme. */
  private ultimo = { testo: '', quando: 0 };

  handleError(error: unknown): void {
    // Il log resta il comportamento di default: qui si aggiunge solo la parte visibile.
    console.error(error);

    const http = this.estraiHttp(error);
    if (!http) return;

    // Casi già coperti altrove, che qui darebbero solo rumore:
    //  0   → backend irraggiungibile: OfflineService mostra già la sua barra
    //  401 → sessione scaduta: authInterceptor fa logout e riporta al login
    //  402 → trial/abbonamento: authInterceptor porta a /billing
    if (http.status === 0 || http.status === 401 || http.status === 402) return;

    const testo = this.messaggio(http);
    const ora = Date.now();
    if (testo === this.ultimo.testo && ora - this.ultimo.quando < 3000) return;
    this.ultimo = { testo, quando: ora };

    // Un errore qui non deve poter innescare un ciclo: se il messaggio non si
    // riesce a mostrare, resta il log in console.
    try {
      const zone = this.injector.get(NgZone);
      const snack = this.injector.get(MatSnackBar);
      zone.run(() => snack.open(testo, 'OK', { duration: 6000, panelClass: 'snack-error' }));
    } catch { /* niente da fare */ }
  }

  /**
   * L'errore arriva in forme diverse a seconda di come è stato rilanciato: diretto,
   * dentro una promise rifiutata, o incapsulato da Angular. Le si scartano tutte.
   */
  private estraiHttp(error: unknown): HttpErrorResponse | null {
    const candidati = [
      error,
      (error as { rejection?: unknown })?.rejection,
      (error as { error?: unknown })?.error,
      (error as { cause?: unknown })?.cause,
    ];
    return (candidati.find((c) => c instanceof HttpErrorResponse) as HttpErrorResponse) ?? null;
  }

  /** Messaggio del backend se c'è, altrimenti una frase utile in base allo stato. */
  private messaggio(e: HttpErrorResponse): string {
    const corpo = e.error;
    const dalServer =
      (corpo && typeof corpo === 'object' && (corpo.error || corpo.message)) ||
      (typeof corpo === 'string' && corpo.length < 200 && !corpo.startsWith('<') ? corpo : null);
    if (dalServer && typeof dalServer === 'string' && dalServer.trim()) return dalServer.trim();

    switch (e.status) {
      case 400:
      case 422: return 'Dati non validi: controlla i campi e riprova.';
      case 403: return 'Operazione non consentita.';
      case 404: return 'Elemento non trovato: potrebbe essere stato eliminato altrove.';
      case 409: return 'Operazione in conflitto con dati già presenti.';
      case 413: return 'File troppo grande.';
      default:  return 'Operazione non riuscita. Riprova; se il problema resta, riavvia il programma.';
    }
  }
}

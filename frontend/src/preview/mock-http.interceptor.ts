/**
 * Interceptor HTTP della GALLERIA SCHERMATE: risponde a ogni chiamata `/api/…`
 * con le fixture, senza backend. Compilato solo dalla configurazione `preview`.
 *
 * Perché a livello HTTP e non mockando i servizi: `DataService` è un involucro
 * sottile su `ApiService` → `HttpClient`, e diversi componenti chiamano `ApiService`
 * (o `HttpClient`) direttamente. Intercettare qui copre tutti i casi senza toccare
 * una sola riga dei componenti di produzione.
 *
 * Resta in coda ad `authInterceptor`, che così viene esercitato per davvero.
 */
import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { PreviewState, risolvi } from './fixtures';

export interface MockOptions {
  state: PreviewState;
  /** Ritardo artificiale in ms: serve a rendere osservabili gli stati di caricamento. */
  latency: number;
}

/** Endpoint che non devono essere finti (asset, font, icone, sorgenti). */
function daIntercettare(url: string): boolean {
  return url.includes('/api/') || url.startsWith('api/') || /^\/?api\//.test(url);
}

function errore(url: string, status: number, messaggio: string): HttpErrorResponse {
  return new HttpErrorResponse({
    url, status, statusText: status === 500 ? 'Internal Server Error' : 'Error',
    error: { error: messaggio, code: 'PREVIEW_MOCK' },
  });
}

export function creaMockHttpInterceptor(opts: MockOptions): HttpInterceptorFn {
  return (req, next) => {
    if (!daIntercettare(req.url)) return next(req);

    const lettura = req.method === 'GET';
    const ritardo = Math.max(0, opts.latency);

    // Stato "error-load": ogni lettura fallisce → si verifica come reagisce la schermata
    // a un fetch fallito (oggi quasi sempre: schermo vuoto e nessun messaggio).
    if (lettura && opts.state === 'error-load') {
      return throwError(() => errore(req.url, 500, 'Errore di caricamento simulato')).pipe(delay(ritardo)) as Observable<HttpEvent<unknown>>;
    }

    // Stato "error": ogni SCRITTURA fallisce → è il test diretto del bug B1
    // (salvataggi e cancellazioni che falliscono in silenzio). Se dopo il clic non
    // compare nulla, la schermata ha il difetto.
    if (!lettura && opts.state === 'error') {
      return throwError(() => errore(req.url, 500, 'Operazione rifiutata dal server (simulazione)')).pipe(delay(ritardo)) as Observable<HttpEvent<unknown>>;
    }

    let corpo: unknown;
    try {
      corpo = risolvi(req.method, req.url, req.body, opts.state);
    } catch (e) {
      // Una fixture rotta non deve far sparire la schermata: si degrada a lista vuota.
      corpo = [];
    }

    const risposta = new HttpResponse({ status: 200, url: req.url, body: corpo });
    return of(risposta).pipe(delay(ritardo)) as Observable<HttpEvent<unknown>>;
  };
}

/** Legge stato e latenza dai parametri dell'URL (li imposta la galleria). */
export function opzioniDaUrl(search: string): MockOptions {
  const p = new URLSearchParams(search);
  const s = p.get('state');
  const state: PreviewState =
    s === 'empty' || s === 'error' || s === 'error-load' ? s : 'full';
  const l = Number(p.get('latency'));
  return { state, latency: Number.isFinite(l) && l >= 0 ? l : 200 };
}

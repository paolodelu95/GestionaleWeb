import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { OfflineService } from '../services/offline.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const offlineSvc = inject(OfflineService);
  const router = inject(Router);
  const token = auth.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    tap(() => offlineSvc.reportReachable()),
    catchError(err => {
      // status 0 = errore di rete (backend irraggiungibile o richiesta annullata):
      // segnalo con soglia anti falsi-positivi. Qualsiasi risposta del server (anche
      // di errore) significa invece che è raggiungibile.
      if (err.status === 0) offlineSvc.reportNetworkError();
      else offlineSvc.reportReachable();
      // Logout solo se è il nostro backend a dire che il token è invalido,
      // non se è un proxy 401 da servizi esterni (es. Mindee via /api/ocr)
      // Sessione scaduta/revocata sul nostro backend: logout + reset pulito allo
      // stato di login. Solo se c'era davvero un token (evita loop al bootstrap),
      // escludendo i 401 esterni (/ocr/) e i login falliti (/auth/).
      if (err.status === 401 && token && !req.url.includes('/ocr/') && !req.url.includes('/auth/')) {
        auth.logout();
        if (typeof window !== 'undefined') window.location.assign('/');
      }
      // 402 Payment Required → trial scaduto o subscription non attiva.
      // Reindirizza a /billing dove l'utente può sottoscrivere o riattivare.
      if (err.status === 402 &&
          (err.error?.code === 'TRIAL_EXPIRED' || err.error?.code === 'SUBSCRIPTION_INACTIVE')) {
        if (router.url !== '/billing' && router.url !== '/trial-expired') {
          router.navigate(['/billing']);
        }
      }
      return throwError(() => err);
    })
  );
};

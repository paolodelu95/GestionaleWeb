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
    tap(() => offlineSvc.setOffline(false)),
    catchError(err => {
      if (err.status === 0) offlineSvc.setOffline(true);
      // Logout solo se è il nostro backend a dire che il token è invalido,
      // non se è un proxy 401 da servizi esterni (es. Mindee via /api/ocr)
      if (err.status === 401 && !req.url.includes('/ocr/')) auth.logout();
      // 402 Payment Required → trial scaduto. Reindirizza a pagina dedicata.
      if (err.status === 402 && err.error?.code === 'TRIAL_EXPIRED') {
        if (router.url !== '/trial-expired') {
          router.navigate(['/trial-expired'], {
            state: {
              trialScadeIl: err.error.trialScadeIl,
              ragioneSociale: err.error.ragioneSociale,
            },
          });
        }
      }
      return throwError(() => err);
    })
  );
};

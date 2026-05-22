import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideServiceWorker } from '@angular/service-worker';
import { italianPaginatorIntl } from './it-paginator-intl';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    { provide: LOCALE_ID, useValue: 'it' },
    { provide: MatPaginatorIntl, useFactory: italianPaginatorIntl },
    provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};

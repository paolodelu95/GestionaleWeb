/**
 * Bootstrap SEPARATO per l'HARNESS DI ANTEPRIMA (screenshot dei dialog documento).
 * Avvia un host minimale (niente shell/auth/HTTP reali) con DataService mockato.
 * Build/serve: `ng serve --configuration preview` (vedi angular.json).
 */
import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { LOCALE_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';

import { PreviewHostComponent } from './preview/preview-host';
import { DataService } from './app/services/data.service';
import { createMockDataService } from './preview/mock-data';

registerLocaleData(localeIt);

bootstrapApplication(PreviewHostComponent, {
  providers: [
    provideHttpClient(),
    provideAnimationsAsync(),
    provideNativeDateAdapter(),
    { provide: LOCALE_ID, useValue: 'it' },
    { provide: MAT_DATE_LOCALE, useValue: 'it-IT' },
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: { maxWidth: '95vw', autoFocus: false } },
    { provide: DataService, useFactory: createMockDataService },
  ],
}).catch((err) => console.error(err));

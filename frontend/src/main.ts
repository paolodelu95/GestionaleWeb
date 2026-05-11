import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { appConfig } from './app/app.config';
import { App } from './app/app';

registerLocaleData(localeIt);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

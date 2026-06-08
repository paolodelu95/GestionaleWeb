import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { appConfig } from './app/app.config';
import { App } from './app/app';

registerLocaleData(localeIt);

bootstrapApplication(App, appConfig)
  .catch((err) => {
    console.error(err);
    // Fallback visibile invece di una pagina bianca se il bootstrap fallisce
    // (es. localStorage bloccato in navigazione privata / cookie disabilitati).
    try {
      const host = document.querySelector('app-root') || document.body;
      if (host && !host.textContent?.trim()) {
        host.innerHTML =
          '<div style="font-family:system-ui,sans-serif;max-width:460px;margin:18vh auto;padding:0 24px;text-align:center;color:#334155">' +
          '<h2 style="color:#11769b">Impossibile avviare l\'app</h2>' +
          '<p>Si è verificato un problema nell\'avvio. Ricarica la pagina. Se usi la navigazione privata o hai i cookie bloccati, disattivali per questo sito.</p>' +
          '<button onclick="location.reload()" style="margin-top:8px;padding:10px 18px;border:none;border-radius:10px;background:#11769b;color:#fff;font-weight:600;cursor:pointer">Ricarica</button>' +
          '</div>';
      }
    } catch { /* niente da fare */ }
  });

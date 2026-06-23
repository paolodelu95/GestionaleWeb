import { Injectable } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Notifiche di sistema native. Nell'edizione desktop (Tauri) usa il plugin nativo
 * `@tauri-apps/plugin-notification` — affidabile su Windows/macOS/Linux, a differenza
 * dell'API Notification del WebView. Nell'edizione web degrada all'API Notification del
 * browser. Un solo punto da cui far partire le notifiche (promemoria, scadenze, scorte…).
 */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private asked = false;

  /** Invia una notifica di sistema. Best-effort: non solleva mai. */
  async notify(title: string, body?: string): Promise<void> {
    if (isTauri()) {
      try {
        const mod = await import('@tauri-apps/plugin-notification');
        let ok = await mod.isPermissionGranted();
        if (!ok) ok = (await mod.requestPermission()) === 'granted';
        if (ok) mod.sendNotification(body ? { title, body } : { title });
        return;
      } catch {
        /* se il plugin non è disponibile, prova il fallback web sotto */
      }
    }
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        new Notification(title, body ? { body } : undefined);
        return;
      }
      if (Notification.permission === 'default' && !this.asked) {
        this.asked = true;
        if ((await Notification.requestPermission()) === 'granted') {
          new Notification(title, body ? { body } : undefined);
        }
      }
    } catch {
      /* noop */
    }
  }
}

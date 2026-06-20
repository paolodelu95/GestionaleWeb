import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LayoutService } from './layout.service';

/**
 * Ponte tra il menu nativo (Tauri, definito in src-tauri/src/main.rs) e la SPA.
 * Le voci custom del menu emettono l'evento "menu" con il proprio id; qui lo
 * traduciamo nell'azione corrispondente. Per "Nuovo"/"Salva" rilanciamo le
 * stesse scorciatoie già gestite dai componenti (Cmd+N / Cmd+S), così non
 * serve duplicare la logica. Su web è un no-op.
 */
@Injectable({ providedIn: 'root' })
export class NativeMenuService {
  private router = inject(Router);
  private layout = inject(LayoutService);
  private zone = inject(NgZone);
  private started = false;

  start(): void {
    if (this.started || !isTauri()) return;
    this.started = true;
    listen<string>('menu', (e) => this.zone.run(() => this.handle(e.payload)))
      .catch(() => { /* no-op */ });
  }

  private handle(id: string): void {
    switch (id) {
      case 'new':  this.dispatchShortcut('n'); break;
      case 'save': this.dispatchShortcut('s'); break;
      case 'backup': this.router.navigate(['/impostazioni']); break;
      case 'density':
        this.layout.setDensity(this.layout.density() === 'compatto' ? 'comodo' : 'compatto');
        break;
      case 'help':  this.router.navigate(['/aiuto']); break;
      case 'about': this.router.navigate(['/impostazioni']); break;
    }
  }

  /** Rilancia una scorciatoia Cmd/Ctrl+<key> sull'elemento attivo (bubbla fino
   * agli @HostListener dei componenti che già gestiscono la combinazione). */
  private dispatchShortcut(key: string): void {
    const target = (document.activeElement as HTMLElement) ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }));
  }
}

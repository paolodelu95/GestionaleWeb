import { Injectable, signal } from '@angular/core';

export type NavLayout = 'side' | 'top';

/**
 * Preferenza utente sul layout della navigazione: barra laterale ('side',
 * default, collassabile) oppure barra superiore ('top', con overflow "Altro").
 * Persistita in localStorage e condivisa tra App (rendering) e Impostazioni
 * (selettore). Signal così App reagisce al cambio in tempo reale.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly KEY = 'nav-layout';
  readonly navLayout = signal<NavLayout>(this.read());

  private read(): NavLayout {
    return localStorage.getItem(this.KEY) === 'top' ? 'top' : 'side';
  }

  setNavLayout(v: NavLayout) {
    localStorage.setItem(this.KEY, v);
    this.navLayout.set(v);
  }
}

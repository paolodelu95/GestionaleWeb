import { Injectable, signal } from '@angular/core';
import { lsGet, lsSet } from '../utils/safe-storage';

export type NavLayout = 'side' | 'floating';

/**
 * Preferenza utente sul layout della navigazione:
 *  - 'floating' (default): dock fluttuante traslucido in basso, stile iOS.
 *  - 'side': barra laterale classica, collassabile.
 * Persistita in localStorage e condivisa tra App (rendering) e Impostazioni.
 * I valori legacy ('top') vengono ricondotti a 'floating'.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly KEY = 'nav-layout';
  readonly navLayout = signal<NavLayout>(this.read());

  private read(): NavLayout {
    return lsGet(this.KEY) === 'side' ? 'side' : 'floating';
  }

  setNavLayout(v: NavLayout) {
    const norm: NavLayout = v === 'side' ? 'side' : 'floating';
    lsSet(this.KEY, norm);
    this.navLayout.set(norm);
  }
}

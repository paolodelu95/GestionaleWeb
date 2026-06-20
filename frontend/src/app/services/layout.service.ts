import { Injectable, signal } from '@angular/core';
import { lsGet, lsSet } from '../utils/safe-storage';

export type NavLayout = 'side' | 'floating';

/** Densità dell'interfaccia:
 *  - 'compatto' (default): look gestionale desktop, righe/menu/spaziature ridotte.
 *  - 'comodo': spaziature ampie pensate per il web/touch (look storico).
 * Applicata come classe `density-compact` su <html> così copre anche i layer
 * dell'overlay CDK (dialog, menu, tooltip) che vivono fuori dalla shell. */
export type Density = 'comodo' | 'compatto';

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
  private readonly DENSITY_KEY = 'ui-density';
  readonly navLayout = signal<NavLayout>(this.read());
  readonly density = signal<Density>(this.readDensity());

  constructor() {
    this.applyDensityClass(this.density());
  }

  private read(): NavLayout {
    return lsGet(this.KEY) === 'side' ? 'side' : 'floating';
  }

  setNavLayout(v: NavLayout) {
    const norm: NavLayout = v === 'side' ? 'side' : 'floating';
    lsSet(this.KEY, norm);
    this.navLayout.set(norm);
  }

  private readDensity(): Density {
    // default 'compatto': l'app offline è usata come software desktop classico.
    return lsGet(this.DENSITY_KEY) === 'comodo' ? 'comodo' : 'compatto';
  }

  setDensity(v: Density) {
    const norm: Density = v === 'comodo' ? 'comodo' : 'compatto';
    lsSet(this.DENSITY_KEY, norm);
    this.density.set(norm);
    this.applyDensityClass(norm);
  }

  private applyDensityClass(v: Density) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('density-compact', v === 'compatto');
  }
}

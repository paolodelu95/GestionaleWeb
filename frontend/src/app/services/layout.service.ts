import { Injectable, signal } from '@angular/core';
import { lsGet, lsSet } from '../utils/safe-storage';
import { environment } from '../../environments/environment';

export type NavLayout = 'side' | 'floating' | 'top';

/** Densità dell'interfaccia:
 *  - 'compatto' (default): look gestionale desktop, righe/menu/spaziature ridotte.
 *  - 'comodo': spaziature ampie pensate per il web/touch (look storico).
 * Applicata come classe `density-compact` su <html> così copre anche i layer
 * dell'overlay CDK (dialog, menu, tooltip) che vivono fuori dalla shell. */
export type Density = 'comodo' | 'compatto';

/**
 * Preferenza utente sul layout della navigazione:
 *  - 'floating' (default sul web): dock fluttuante traslucido in basso, stile iOS.
 *  - 'side' (default nell'edizione offline): barra laterale classica, collassabile.
 *  - 'top': barra di navigazione orizzontale in alto, riga singola con overflow
 *    "Altro" (stesso meccanismo priority-nav del dock fluttuante).
 * Persistita in localStorage e condivisa tra App (rendering) e Impostazioni.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly KEY = 'nav-layout';
  private readonly DENSITY_KEY = 'ui-density';
  private readonly DARK_KEY = 'dark-mode';
  readonly navLayout = signal<NavLayout>(this.read());
  readonly density = signal<Density>(this.readDensity());
  readonly darkMode = signal<boolean>(this.readDarkMode());

  constructor() {
    this.applyDensityClass(this.density());
    this.applyDarkClass(this.darkMode());
  }

  private read(): NavLayout {
    const saved = lsGet(this.KEY);
    if (saved === 'side' || saved === 'floating' || saved === 'top') return saved;
    // Default: barra laterale classica nell'edizione desktop offline (il dock
    // fluttuante stile iOS è pensato per il web/touch); dock sul web.
    return environment.offline ? 'side' : 'floating';
  }

  setNavLayout(v: NavLayout) {
    const norm: NavLayout = v === 'side' || v === 'top' ? v : 'floating';
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

  private readDarkMode(): boolean {
    return lsGet(this.DARK_KEY) === '1';
  }

  setDarkMode(v: boolean) {
    lsSet(this.DARK_KEY, v ? '1' : '0');
    this.darkMode.set(v);
    this.applyDarkClass(v);
  }

  toggleDarkMode() {
    this.setDarkMode(!this.darkMode());
  }

  private applyDarkClass(v: boolean) {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('dark-mode', v);
  }
}

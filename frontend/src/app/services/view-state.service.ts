import { Injectable } from '@angular/core';
import { lsGet, lsSet } from '../utils/safe-storage';

/**
 * Persistenza dello stato di vista delle liste (filtri, ordinamento, colonne)
 * tra le sessioni — comportamento atteso da un software desktop: tornando su
 * "Fatture" ritrovi i filtri e l'ordinamento che avevi impostato.
 *
 * Una chiave per sezione (es. 'fatture'); il valore è un oggetto serializzato.
 * Degrada in modo sicuro se lo storage non è disponibile o il JSON è corrotto.
 */
@Injectable({ providedIn: 'root' })
export class ViewStateService {
  private key(section: string): string { return `view-state:${section}`; }

  /** Legge lo stato salvato per la sezione, o null se assente/illeggibile. */
  read<T = Record<string, unknown>>(section: string): T | null {
    const raw = lsGet(this.key(section));
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  /** Salva (merge) lo stato della sezione. */
  write(section: string, state: Record<string, unknown>): void {
    const current = this.read(section) ?? {};
    lsSet(this.key(section), JSON.stringify({ ...current, ...state }));
  }
}

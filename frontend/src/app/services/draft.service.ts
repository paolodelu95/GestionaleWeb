import { Injectable } from '@angular/core';

/**
 * Bozze locali dei documenti in compilazione (autosalvataggio). Conserva in
 * localStorage l'ultimo stato di un documento NUOVO, così un'app chiusa per errore
 * non fa perdere le righe già inserite. Tutto è best-effort: nessun errore propaga.
 */
@Injectable({ providedIn: 'root' })
export class DraftService {
  private key(tipo: string): string {
    return `ordeva:draft:${tipo}`;
  }

  save(tipo: string, data: unknown): void {
    try {
      localStorage.setItem(this.key(tipo), JSON.stringify({ at: Date.now(), data }));
    } catch { /* quota/serializzazione: ignora */ }
  }

  load(tipo: string): any | null {
    try {
      const s = localStorage.getItem(this.key(tipo));
      if (!s) return null;
      const o = JSON.parse(s);
      return o?.data ?? null;
    } catch {
      return null;
    }
  }

  clear(tipo: string): void {
    try {
      localStorage.removeItem(this.key(tipo));
    } catch { /* ignora */ }
  }
}

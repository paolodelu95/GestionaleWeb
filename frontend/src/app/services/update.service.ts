import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export interface UpdateInfo {
  /** Versione disponibile (es. "1.2.0"). */
  version: string;
  /** Pagina della release su GitHub da cui scaricare. */
  url: string;
}

const REPO = 'paolodelu95/GestionaleWeb';
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * Controllo aggiornamenti per l'edizione offline (desktop).
 * Confronta la versione installata (esposta da /healthz, fonte: Cargo.toml) con
 * l'ultima release pubblicata su GitHub. Se ce n'è una più recente, espone le
 * info così la shell può mostrare un avviso con il link per scaricarla.
 *
 * Usa `fetch` (non HttpClient) di proposito: evita l'interceptor che aggiunge il
 * Bearer token, che GitHub rifiuterebbe.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  /** Aggiornamento disponibile (null = nessuno / non ancora controllato). */
  readonly disponibile = signal<UpdateInfo | null>(null);
  /** Versione attualmente installata. */
  readonly corrente = signal<string>('');

  /** Esegue il controllo. No-op fuori dall'edizione offline. */
  async check(): Promise<void> {
    if (!environment.offline) return;
    try {
      const current = await this.versioneCorrente();
      if (!current) return;
      this.corrente.set(current);

      const res = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return;                       // nessuna release pubblicata o offline
      const rel = await res.json();
      const tag: string = (rel?.tag_name ?? '').toString();
      const latest = tag.replace(/^v/i, '').trim();
      if (latest && this.isNewer(latest, current)) {
        this.disponibile.set({ version: latest, url: rel?.html_url || `https://github.com/${REPO}/releases/latest` });
      }
    } catch {
      /* nessuna connessione / GitHub irraggiungibile: silenzioso */
    }
  }

  /** Versione installata, letta da /healthz del backend locale. */
  private async versioneCorrente(): Promise<string> {
    try {
      const base = environment.apiUrl.replace(/\/api\/?$/, '');
      const res = await fetch(`${base}/healthz`);
      if (!res.ok) return '';
      const h = await res.json();
      return (h?.version ?? '').toString();
    } catch {
      return '';
    }
  }

  /** Confronto "semver-lite": true se `latest` > `current`. */
  private isNewer(latest: string, current: string): boolean {
    const a = latest.split('.').map(n => parseInt(n, 10) || 0);
    const b = current.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }
}

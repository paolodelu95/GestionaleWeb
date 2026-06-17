import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export interface UpdateInfo {
  /** Versione disponibile (es. "1.2.0"). */
  version: string;
  /** Pagina della release su GitHub (fallback "scarica a mano"). */
  url: string;
}

const REPO = 'paolodelu95/Ordeva';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

/**
 * Controllo + installazione aggiornamenti per l'edizione offline (Tauri).
 *
 * Usa il plugin updater di Tauri: `check()` legge `latest.json` dalla release più
 * recente (endpoint in tauri.conf.json), verifica la firma con la chiave pubblica
 * e, se c'è una versione più nuova, permette `downloadAndInstall()` + riavvio —
 * l'app si aggiorna da sola. Se non siamo in Tauri (es. dev su browser) o manca
 * la rete, fallisce in silenzio e resta il link "scarica a mano".
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  /** Aggiornamento disponibile (null = nessuno / non ancora controllato). */
  readonly disponibile = signal<UpdateInfo | null>(null);
  /** Versione attualmente installata (per il messaggio). */
  readonly corrente = signal<string>('');
  /** Download/installazione in corso. */
  readonly inCorso = signal(false);

  /** Oggetto Update di Tauri tenuto da parte tra check e install. */
  private pending: { version: string; currentVersion?: string; downloadAndInstall: (cb?: unknown) => Promise<void> } | null = null;

  /** Controllo all'avvio. No-op fuori dall'edizione offline. */
  async check(): Promise<void> {
    if (!environment.offline) return;
    this.corrente.set(await this.versioneCorrente());
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        this.pending = update as any;
        if (update.currentVersion) this.corrente.set(update.currentVersion);
        this.disponibile.set({ version: update.version, url: RELEASES_URL });
      }
    } catch {
      /* non in Tauri / updater non configurato / nessuna rete: nessun avviso in-app */
    }
  }

  /** Scarica e installa l'aggiornamento, poi riavvia l'app. */
  async installaERiavvia(): Promise<void> {
    if (!this.pending || this.inCorso()) return;
    this.inCorso.set(true);
    try {
      await this.pending.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      // Fallito (es. macOS non firmato): l'utente usa il link "scarica a mano".
      this.inCorso.set(false);
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
}

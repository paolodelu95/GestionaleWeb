import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, interval, of } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface Reminder {
  id: number;
  titolo: string;
  inizio: string;          // ISO locale "YYYY-MM-DDTHH:mm:ss" (ora locale, senza fuso)
  fine?: string | null;
  luogo?: string;
  clienteNome?: string;
  promemoria: number;      // minuti prima dell'inizio
  colore?: string;
}

/**
 * Sorveglia gli appuntamenti con promemoria e li fa "scattare" come su un
 * telefono: quando l'ora locale raggiunge (inizio − promemoria) emette una
 * notifica (toast in-app via `scattato$` + notifica desktop del browser) e li
 * tiene nella lista `attivi` per la campanella finché non iniziano o vengono
 * ignorati.
 *
 * Il backend (`GET agenda/promemoria`) fornisce solo candidati in una finestra
 * ampia: il momento esatto lo decidiamo qui col clock del browser, perché
 * `inizio` è in ora locale mentre il server è in UTC.
 */
@Injectable({ providedIn: 'root' })
export class RemindersService implements OnDestroy {
  private readonly POLL_MS = 30000;
  private readonly FIRED_KEY = 'agenda-promemoria-fired';
  private readonly DISMISS_KEY = 'agenda-promemoria-dismessi';

  private attivi$ = new BehaviorSubject<Reminder[]>([]);
  /** Promemoria attualmente scattati e non ignorati (per la campanella). */
  readonly attivi: Observable<Reminder[]> = this.attivi$.asObservable();

  private scattatoSub = new Subject<Reminder>();
  /** Emette quando un promemoria scatta per la PRIMA volta (per il toast). */
  readonly scattato: Observable<Reminder> = this.scattatoSub.asObservable();

  private candidati: Reminder[] = [];
  private sub?: Subscription;
  private tick?: Subscription;
  private fired = new Set<string>(this.readSet(this.FIRED_KEY));
  private dismessi = new Set<string>(this.readSet(this.DISMISS_KEY));

  constructor(private api: ApiService) {}

  /** Avvia il polling + un tick locale (rivaluta lo scatto anche tra un fetch e l'altro). */
  start() {
    this.stop();
    this.sub = interval(this.POLL_MS).pipe(
      startWith(0),
      // Su errore restituiamo null (sentinella) e teniamo i candidati precedenti:
      // così la campanella non lampeggia a vuoto e nulla riscatta per un blip di rete.
      switchMap(() => this.api.get<Reminder[]>('agenda/promemoria').pipe(
        catchError(() => of(null)),
      )),
    ).subscribe(list => { if (Array.isArray(list)) this.candidati = list; this.valuta(); });
    // Tick locale ogni 15s: lo scatto è preciso al quarto di minuto senza
    // martellare il server (la lista candidati cambia di rado).
    this.tick = interval(15000).subscribe(() => this.valuta());
  }

  stop() {
    this.sub?.unsubscribe(); this.sub = undefined;
    this.tick?.unsubscribe(); this.tick = undefined;
  }
  ngOnDestroy() { this.stop(); }

  /** Ignora un promemoria: sparisce dalla campanella e non riscatta. */
  dismiss(r: Reminder) {
    this.dismessi.add(this.key(r));
    this.persist();
    this.valuta();
  }

  /** Stato del permesso notifiche desktop ('default' | 'granted' | 'denied' | 'unsupported'). */
  desktopPermission(): NotificationPermission | 'unsupported' {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  }

  /** Richiede il permesso per le notifiche desktop (da invocare su gesto utente). */
  async requestDesktop(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try { return await Notification.requestPermission(); }
    catch { return Notification.permission; }
  }

  // ── interno ────────────────────────────────────────────────────────────────
  /** Chiave stabile: include l'orario, così spostando l'appuntamento può riscattare. */
  private key(r: Reminder) { return `${r.id}@${r.inizio}`; }

  private valuta() {
    const now = Date.now();
    const attivi: Reminder[] = [];
    for (const r of this.candidati) {
      if (!r.promemoria) continue;
      const inizio = new Date(r.inizio).getTime();
      if (isNaN(inizio)) continue;
      const scatta = inizio - r.promemoria * 60000;
      const k = this.key(r);
      // Finestra attiva: dal momento del promemoria fino all'inizio dell'evento.
      if (now >= scatta && now < inizio) {
        if (!this.dismessi.has(k)) attivi.push(r);
        if (!this.fired.has(k)) {              // primo scatto → notifica una sola volta
          this.fired.add(k);
          this.persist();
          if (!this.dismessi.has(k)) this.notifica(r);
        }
      }
    }
    attivi.sort((a, b) => new Date(a.inizio).getTime() - new Date(b.inizio).getTime());
    this.attivi$.next(attivi);
    this.prune(now);
  }

  /** Notifica desktop (se permessa) + segnale per il toast in-app. */
  private notifica(r: Reminder) {
    this.scattatoSub.next(r);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const ora = this.oraDi(r.inizio);
        const corpo = [ora, r.luogo, r.clienteNome].filter(Boolean).join(' · ');
        const n = new Notification(r.titolo || 'Promemoria appuntamento', {
          body: corpo || 'Appuntamento in arrivo',
          icon: 'icons/ordeva-icon.png',
          tag: this.key(r),                    // sostituisce eventuali duplicati
        });
        n.onclick = () => { try { window.focus(); } catch { /* noop */ } n.close(); };
      } catch { /* alcuni browser bloccano se non in foreground: il toast resta */ }
    }
  }

  private oraDi(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Pulisce dai set le chiavi di eventi iniziati da oltre 6h (evita crescita
   * infinita). Si basa sul timestamp dentro la chiave (`id@inizio`), NON sulla
   * presenza nei candidati: così un fetch fallito non azzera lo stato "fired".
   */
  private prune(now: number) {
    let changed = false;
    for (const set of [this.fired, this.dismessi]) {
      for (const k of [...set]) {
        const t = new Date(k.slice(k.indexOf('@') + 1)).getTime();
        if (!isNaN(t) && t < now - 6 * 3600e3) { set.delete(k); changed = true; }
      }
    }
    if (changed) this.persist();
  }

  private persist() {
    try {
      localStorage.setItem(this.FIRED_KEY, JSON.stringify([...this.fired]));
      localStorage.setItem(this.DISMISS_KEY, JSON.stringify([...this.dismessi]));
    } catch { /* storage pieno/non disponibile: degradiamo silenziosamente */ }
  }

  private readSet(key: string): string[] {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
}

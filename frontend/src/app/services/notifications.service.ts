import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { switchMap, startWith, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { NotifyService } from './notify.service';

export interface NotificationBadges {
  scadenzeScadute: number;
  prodottiSottoSoglia: number;
  solleciti: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private badges$ = new BehaviorSubject<NotificationBadges>({ scadenzeScadute: 0, prodottiSottoSoglia: 0, solleciti: 0 });
  readonly badges = this.badges$.asObservable();
  private sub?: Subscription;
  private notify = inject(NotifyService);
  /** Conteggi del giro precedente: notifico a sistema solo quando AUMENTANO. */
  private prev: NotificationBadges | null = null;

  constructor(private http: HttpClient) {}

  start() {
    // L'header Authorization è aggiunto dall'authInterceptor (con la chiave
    // token corretta): qui non serve impostarlo a mano (prima usava una chiave
    // errata 'auth_token').
    this.sub = interval(30000).pipe(
      startWith(0),
      switchMap(() => this.http.get<NotificationBadges>('/api/notifications/badges').pipe(
        catchError(() => of({ scadenzeScadute: 0, prodottiSottoSoglia: 0, solleciti: 0 }))
      ))
    ).subscribe(b => { this.badges$.next(b); this.maybeNotify(b); });
  }

  /**
   * Notifica di sistema quando un conteggio cresce rispetto al giro precedente.
   * Il primo giro (prev === null) imposta solo la baseline: niente notifica all'avvio,
   * così non "spara" tutto ciò che era già in sospeso ogni volta che apri l'app.
   */
  private maybeNotify(b: NotificationBadges) {
    const prev = this.prev;
    this.prev = b;
    if (!prev) return;
    const righe: string[] = [];
    if (b.scadenzeScadute > prev.scadenzeScadute) righe.push(`${b.scadenzeScadute} scadenze scadute`);
    if (b.prodottiSottoSoglia > prev.prodottiSottoSoglia) righe.push(`${b.prodottiSottoSoglia} prodotti sotto soglia`);
    if (b.solleciti > prev.solleciti) righe.push(`${b.solleciti} solleciti da inviare`);
    if (righe.length) this.notify.notify('Ordeva', righe.join(' · '));
  }

  stop() { this.sub?.unsubscribe(); }
  ngOnDestroy() { this.stop(); }
}

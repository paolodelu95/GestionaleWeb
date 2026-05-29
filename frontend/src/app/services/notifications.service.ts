import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { switchMap, startWith, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

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
    ).subscribe(b => this.badges$.next(b));
  }

  stop() { this.sub?.unsubscribe(); }
  ngOnDestroy() { this.stop(); }
}

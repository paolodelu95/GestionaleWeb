import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.sub = interval(30000).pipe(
      startWith(0),
      switchMap(() => this.http.get<NotificationBadges>('/api/notifications/badges', { headers }).pipe(
        catchError(() => of({ scadenzeScadute: 0, prodottiSottoSoglia: 0, solleciti: 0 }))
      ))
    ).subscribe(b => this.badges$.next(b));
  }

  stop() { this.sub?.unsubscribe(); }
  ngOnDestroy() { this.stop(); }
}

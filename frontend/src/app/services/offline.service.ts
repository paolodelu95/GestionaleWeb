import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OfflineService {
  private readonly _offline = new BehaviorSubject<boolean>(!navigator.onLine);
  readonly offline$ = this._offline.asObservable();

  setOffline(v: boolean) {
    if (this._offline.value !== v) this._offline.next(v);
  }
}

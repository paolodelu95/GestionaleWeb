import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly KEY = 'invoxa_token';

  constructor(private http: HttpClient) {}

  login(username: string, password: string) {
    return this.http
      .post<{ token: string }>(`${environment.apiUrl}/auth/login`, { username, password })
      .pipe(tap(res => localStorage.setItem(this.KEY, res.token)));
  }

  logout() { localStorage.removeItem(this.KEY); }

  getToken(): string | null { return localStorage.getItem(this.KEY); }

  isLoggedIn(): boolean { return !!this.getToken(); }
}

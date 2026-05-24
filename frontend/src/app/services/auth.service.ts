import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

interface AuthUser {
  id: number;
  username: string;
  nome?: string;
  email?: string;
  ruolo: string;
  tenant: string;
}

interface LoginResponse {
  token: string;
  user?: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly KEY = 'folvera_token';
  private readonly USER_KEY = 'folvera_user';
  private readonly LEGACY_KEY = 'invoxa_token';
  private readonly LEGACY_USER_KEY = 'invoxa_user';

  constructor(private http: HttpClient) {
    // Migrazione storage da invoxa_* a folvera_* per non sloggare gli utenti esistenti.
    const legacyToken = localStorage.getItem(this.LEGACY_KEY);
    if (legacyToken && !localStorage.getItem(this.KEY)) {
      localStorage.setItem(this.KEY, legacyToken);
      localStorage.removeItem(this.LEGACY_KEY);
    }
    const legacyUser = localStorage.getItem(this.LEGACY_USER_KEY);
    if (legacyUser && !localStorage.getItem(this.USER_KEY)) {
      localStorage.setItem(this.USER_KEY, legacyUser);
      localStorage.removeItem(this.LEGACY_USER_KEY);
    }
  }

  login(username: string, password: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password })
      .pipe(tap(res => {
        localStorage.setItem(this.KEY, res.token);
        if (res.user) localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
      }));
  }

  logout() {
    localStorage.removeItem(this.KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  getToken(): string | null { return localStorage.getItem(this.KEY); }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  getTenant(): string | null { return this.getUser()?.tenant ?? null; }

  isLoggedIn(): boolean { return !!this.getToken(); }
}

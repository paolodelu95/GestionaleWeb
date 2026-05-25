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

export interface RegisterPayload {
  ragioneSociale: string;
  piva?: string;
  email: string;
  password: string;
  nome?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly KEY = 'ordeva_token';
  private readonly USER_KEY = 'ordeva_user';
  // Chiavi precedenti (in ordine di anzianità): folvera_*, invoxa_*
  private readonly LEGACY_KEYS = [
    { token: 'folvera_token', user: 'folvera_user' },
    { token: 'invoxa_token',  user: 'invoxa_user'  },
  ];

  constructor(private http: HttpClient) {
    // Migrazione storage dalle chiavi precedenti per non sloggare gli utenti esistenti.
    for (const legacy of this.LEGACY_KEYS) {
      const lt = localStorage.getItem(legacy.token);
      if (lt && !localStorage.getItem(this.KEY)) {
        localStorage.setItem(this.KEY, lt);
      }
      if (lt) localStorage.removeItem(legacy.token);

      const lu = localStorage.getItem(legacy.user);
      if (lu && !localStorage.getItem(this.USER_KEY)) {
        localStorage.setItem(this.USER_KEY, lu);
      }
      if (lu) localStorage.removeItem(legacy.user);
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

  register(payload: RegisterPayload, honeypot = '') {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/register`, { ...payload, website: honeypot })
      .pipe(tap(res => {
        if (res.token) localStorage.setItem(this.KEY, res.token);
        if (res.user) localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
      }));
  }

  logout() {
    localStorage.removeItem(this.KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  forgotPassword(email: string, honeypot = '') {
    return this.http.post<{ ok: boolean; message: string }>(
      `${environment.apiUrl}/auth/forgot-password`,
      { email, website: honeypot },
    );
  }

  checkResetToken(token: string) {
    return this.http.get<{ valid: boolean; reason?: string }>(
      `${environment.apiUrl}/auth/reset-password/${encodeURIComponent(token)}`,
    );
  }

  resetPassword(token: string, password: string) {
    return this.http.post<{ ok: boolean; message: string }>(
      `${environment.apiUrl}/auth/reset-password`,
      { token, password },
    );
  }

  getToken(): string | null { return localStorage.getItem(this.KEY); }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  getTenant(): string | null { return this.getUser()?.tenant ?? null; }

  isLoggedIn(): boolean { return !!this.getToken(); }
}

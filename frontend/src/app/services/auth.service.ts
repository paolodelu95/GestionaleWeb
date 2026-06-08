import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { lsGet, lsSet, lsRemove } from '../utils/safe-storage';

interface AuthUser {
  id: number;
  username: string;
  nome?: string;
  email?: string;
  ruolo: string;
  tenant: string;
  emailVerified?: boolean;
  piano?: string;
  trialScadeIl?: string | null;
  tenantAttivo?: boolean;
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
      const lt = lsGet(legacy.token);
      if (lt && !lsGet(this.KEY)) {
        lsSet(this.KEY, lt);
      }
      if (lt) lsRemove(legacy.token);

      const lu = lsGet(legacy.user);
      if (lu && !lsGet(this.USER_KEY)) {
        lsSet(this.USER_KEY, lu);
      }
      if (lu) lsRemove(legacy.user);
    }
  }

  login(username: string, password: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password })
      .pipe(tap(res => {
        lsSet(this.KEY, res.token);
        if (res.user) lsSet(this.USER_KEY, JSON.stringify(res.user));
      }));
  }

  register(payload: RegisterPayload, honeypot = '') {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/register`, { ...payload, website: honeypot })
      .pipe(tap(res => {
        if (res.token) lsSet(this.KEY, res.token);
        if (res.user) lsSet(this.USER_KEY, JSON.stringify(res.user));
      }));
  }

  logout() {
    lsRemove(this.KEY);
    lsRemove(this.USER_KEY);
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

  verifyEmail(token: string) {
    return this.http.get<{ verified: boolean; reason?: string; message?: string }>(
      `${environment.apiUrl}/auth/verify-email/${encodeURIComponent(token)}`,
    );
  }

  resendVerification() {
    return this.http.post<{ ok: boolean; message: string }>(
      `${environment.apiUrl}/auth/resend-verification`, {},
    ).pipe(tap(() => {
      // dopo il resend, niente di particolare lato client
    }));
  }

  /** Refresh dei dati utente dal server (utile dopo verifica email). */
  refreshUser() {
    return this.http.get<AuthUser>(`${environment.apiUrl}/me`).pipe(tap(u => {
      if (u) lsSet(this.USER_KEY, JSON.stringify(u));
    }));
  }

  getToken(): string | null { return lsGet(this.KEY); }

  getUser(): AuthUser | null {
    const raw = lsGet(this.USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch { lsRemove(this.USER_KEY); return null; }
  }

  getTenant(): string | null { return this.getUser()?.tenant ?? null; }

  isLoggedIn(): boolean { return !!this.getToken(); }
}

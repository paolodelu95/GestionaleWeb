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
  private readonly KEY = 'invoxa_token';
  private readonly USER_KEY = 'invoxa_user';

  constructor(private http: HttpClient) {}

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

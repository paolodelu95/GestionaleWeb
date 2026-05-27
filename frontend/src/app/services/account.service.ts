import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface MeResponse {
  id: number;
  username: string;
  nome: string;
  email: string;
  ruolo: string;
  tenant: string;
  emailVerified: boolean;
  piano: 'trial' | 'pro' | null;
  trialScadeIl: string | null;
  tenantAttivo: boolean;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  constructor(private api: ApiService) {}

  getMe(): Observable<MeResponse> {
    return this.api.get<MeResponse>('me');
  }

  updateProfile(nome: string): Observable<{ ok: boolean }> {
    return this.api.put<{ ok: boolean }>('me/profile', { nome });
  }

  updateEmail(newEmail: string, currentPassword: string): Observable<{ ok: boolean; email: string }> {
    return this.api.put<{ ok: boolean; email: string }>('me/email', { newEmail, currentPassword });
  }

  updatePassword(currentPassword: string, newPassword: string): Observable<{ ok: boolean }> {
    return this.api.put<{ ok: boolean }>('me/password', { currentPassword, newPassword });
  }
}

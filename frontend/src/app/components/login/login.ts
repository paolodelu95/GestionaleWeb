import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="login-overlay">
      <div class="login-card">
        <div class="login-logo">
          <mat-icon>business</mat-icon>
          <h1>Invoxa</h1>
          <p>Gestionale ERP</p>
        </div>

        <form class="login-form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline">
            <mat-label>Username</mat-label>
            <input matInput [(ngModel)]="username" name="username"
                   autocomplete="username" [disabled]="loading">
            <mat-icon matSuffix>person</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Password</mat-label>
            <input matInput [(ngModel)]="password" name="password"
                   [type]="showPass ? 'text' : 'password'"
                   autocomplete="current-password" [disabled]="loading">
            <button mat-icon-button matSuffix type="button" (click)="showPass = !showPass">
              <mat-icon>{{ showPass ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>

          @if (error) {
            <div class="login-error">
              <mat-icon>error_outline</mat-icon> {{ error }}
            </div>
          }

          <button mat-flat-button type="submit" class="login-btn"
                  [disabled]="loading || !username || !password">
            {{ loading ? 'Accesso in corso...' : 'Accedi' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-overlay {
      position: fixed; inset: 0;
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
    }
    .login-card {
      background: #fff; border-radius: 16px;
      padding: 40px 36px; width: 100%; max-width: 380px;
      box-shadow: 0 24px 64px rgba(0,0,0,.35);
    }
    .login-logo {
      text-align: center; margin-bottom: 28px;
      mat-icon { font-size: 48px; width: 48px; height: 48px; color: #6366f1; }
      h1 { margin: 8px 0 4px; font-size: 24px; font-weight: 700; color: #1e293b; }
      p { margin: 0; font-size: 13px; color: #94a3b8; }
    }
    .login-form { display: flex; flex-direction: column; gap: 4px; }
    .login-form mat-form-field { width: 100%; }
    .login-error {
      display: flex; align-items: center; gap: 6px;
      color: #dc2626; font-size: 13px; padding: 8px 0;
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }
    .login-btn { width: 100%; margin-top: 8px; height: 44px; font-size: 15px; }
  `]
})
export class LoginComponent {
  @Output() loggedIn = new EventEmitter<void>();

  username = '';
  password = '';
  error = '';
  loading = false;
  showPass = false;

  constructor(private authSvc: AuthService) {}

  submit() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = '';
    this.authSvc.login(this.username, this.password).subscribe({
      next: () => { this.loading = false; this.loggedIn.emit(); },
      error: () => { this.loading = false; this.error = 'Username o password non corretti'; }
    });
  }
}

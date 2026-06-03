import { inject, Component, OnInit, Inject } from '@angular/core';
import { ConfirmService } from '../shared/confirm-dialog';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data.service';
import { MatListModule } from '@angular/material/list';
import { Gruppo } from '../../models';

interface TenantRow { tenant: string; nome: string; moduli: { slug: string; attivo: boolean; core: boolean }[]; }
interface User { id: number; username: string; nome: string; email: string; ruolo: string; tenant: string; attivo: boolean; }

@Component({
  selector: 'app-tenant-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.isNew ? 'Nuovo cliente (tenant)' : 'Modifica tenant ' + data.t.slug }}</h2>
    <mat-dialog-content style="min-width:380px">
      <mat-form-field style="width:100%"><mat-label>Slug (univoco, no spazi) *</mat-label>
        <input matInput [(ngModel)]="data.t.slug" [disabled]="!data.isNew" required>
      </mat-form-field>
      <mat-form-field style="width:100%"><mat-label>Nome cliente</mat-label>
        <input matInput [(ngModel)]="data.t.nome">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button [disabled]="!data.t.slug" (click)="ref.close(data.t)">
        <mat-icon>save</mat-icon> Salva
      </button>
    </mat-dialog-actions>`,
})
export class TenantDialogComponent {
  constructor(public ref: MatDialogRef<TenantDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { t: { slug: string; nome: string }; isNew: boolean }) {}
}

@Component({
  selector: 'app-user-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.u.id ? 'Modifica utente' : 'Nuovo utente' }}</h2>
    <mat-dialog-content style="min-width:420px">
      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Username *</mat-label>
          <input matInput [(ngModel)]="data.u.username" required>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Password{{ data.u.id ? ' (lascia vuoto per non cambiare)' : ' *' }}</mat-label>
          <input matInput type="password" [(ngModel)]="data.u.password" autocomplete="new-password">
        </mat-form-field>
      </div>
      <mat-form-field style="width:100%"><mat-label>Nome</mat-label>
        <input matInput [(ngModel)]="data.u.nome">
      </mat-form-field>
      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Email</mat-label>
          <input matInput [(ngModel)]="data.u.email" type="email">
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Ruolo</mat-label>
          <mat-select [(ngModel)]="data.u.ruolo">
            <mat-option value="SUPERADMIN">SUPERADMIN</mat-option>
            <mat-option value="ADMIN">Admin</mat-option>
            <mat-option value="OPERATORE">Operatore</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Tenant</mat-label>
          <mat-select [(ngModel)]="data.u.tenant">
            @for (t of data.tenants; track t.slug) {
              <mat-option [value]="t.slug">{{ t.slug }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button [disabled]="!data.u.username || (!data.u.id && !data.u.password)"
              (click)="ref.close(data.u)"><mat-icon>save</mat-icon> Salva</button>
    </mat-dialog-actions>`,
})
export class UserDialogComponent {
  constructor(public ref: MatDialogRef<UserDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { u: any; tenants: { slug: string }[] }) {}
}

@Component({
  selector: 'app-gruppo-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.g.id ? 'Modifica gruppo' : 'Nuovo gruppo' }}</h2>
    <mat-dialog-content style="min-width:380px;max-width:520px">
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Nome gruppo *</mat-label>
        <input matInput [(ngModel)]="data.g.nome" placeholder="es. Rappresentanti, Amministrazione" required>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Descrizione</mat-label>
        <textarea matInput rows="2" [(ngModel)]="data.g.descrizione"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" [disabled]="!data.g.nome" (click)="ref.close(data.g)">
        <mat-icon>save</mat-icon> Salva
      </button>
    </mat-dialog-actions>`,
})
export class GruppoDialogComponent {
  constructor(public ref: MatDialogRef<GruppoDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { g: { id?: number; nome: string; descrizione?: string } }) {}
}

@Component({
  selector: 'app-membri-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatListModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon style="vertical-align:middle">people</mat-icon>
      Membri di "{{ data.gruppo.nome }}"
    </h2>
    <mat-dialog-content style="min-width:420px;max-width:560px;max-height:60vh">
      <p style="font-size:13px;color:#64748b;margin:0 0 12px">
        Seleziona gli utenti che condividono questo gruppo. Quando uno di loro
        crea un appuntamento marcato "condiviso", tutti gli altri lo vedranno.
      </p>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:100%;margin-bottom:12px">
        <mat-label>Filtra utenti</mat-label>
        <input matInput [(ngModel)]="filtro" placeholder="username o nome">
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <div style="border:1px solid #e2e8f0;border-radius:8px;max-height:340px;overflow-y:auto">
        @for (u of utentiFiltrati(); track u.id) {
          <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer">
            <input type="checkbox" [checked]="isMember(u.id)" (change)="toggle(u.id, $event)">
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">{{ u.username }} <span style="color:#94a3b8;font-weight:400">· {{ u.nome }}</span></div>
              <div style="font-size:11px;color:#64748b">{{ u.ruolo }} · {{ u.email || '—' }}</div>
            </div>
          </label>
        }
        @if (utentiFiltrati().length === 0) {
          <p style="text-align:center;color:#94a3b8;padding:20px">Nessun utente corrisponde</p>
        }
      </div>
      <p style="font-size:12px;color:#64748b;margin-top:8px">Selezionati: <b>{{ selezionati.size }}</b></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" (click)="ref.close([...selezionati])">
        <mat-icon>save</mat-icon> Salva membri
      </button>
    </mat-dialog-actions>`,
})
export class MembriDialogComponent {
  selezionati = new Set<number>();
  filtro = '';
  constructor(public ref: MatDialogRef<MembriDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { gruppo: any; utentiTenant: any[] }) {
    for (const m of (data.gruppo.membri || [])) this.selezionati.add(m.id);
  }
  utentiFiltrati() {
    const f = this.filtro.trim().toLowerCase();
    if (!f) return this.data.utentiTenant;
    return this.data.utentiTenant.filter(u =>
      String(u.username).toLowerCase().includes(f) ||
      String(u.nome || '').toLowerCase().includes(f));
  }
  isMember(id: number) { return this.selezionati.has(id); }
  toggle(id: number, ev: any) {
    if (ev.target.checked) this.selezionati.add(id); else this.selezionati.delete(id);
  }
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatDialogModule, MatSnackBarModule, MatMenuModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Amministrazione</h1>
        <p style="color:#64748b;font-size:13px;margin:4px 0 0">
          Gestisci utenti e gruppi del tuo magazzino.
          @if (isSuper) { Da SUPERADMIN puoi anche gestire altri clienti (tenant) e i loro moduli. }
        </p>
      </div>

      @if (!isAdmin) {
        <div class="card" style="text-align:center;color:#dc2626;padding:32px">
          <mat-icon style="font-size:48px;width:48px;height:48px">block</mat-icon>
          <div style="font-size:18px;margin-top:8px">Accesso riservato ad ADMIN o SUPERADMIN</div>
        </div>
      } @else {
        <mat-tab-group animationDuration="0">
          @if (isSuper) {
          <!-- Clienti (tenant) -->
          <mat-tab label="Clienti (tenant)">
            <div class="card" style="margin-top:16px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div style="color:#64748b;font-size:13px">{{ tenants.length }} clienti</div>
                <button mat-flat-button (click)="nuovoTenant()"><mat-icon>add</mat-icon> Nuovo cliente</button>
              </div>
              <table class="adm-table">
                <thead><tr><th>Slug</th><th>Nome</th><th>Attivo</th><th>Utenti</th><th></th></tr></thead>
                <tbody>
                  @for (t of tenants; track t.slug) {
                    <tr>
                      <td><code>{{ t.slug }}</code></td>
                      <td><b>{{ t.nome }}</b></td>
                      <td>{{ t.attivo ? '✓' : '—' }}</td>
                      <td>{{ countUtenti(t.slug) }}</td>
                      <td>
                        <button mat-icon-button [matMenuTriggerFor]="tMenu"><mat-icon>more_vert</mat-icon></button>
                        <mat-menu #tMenu="matMenu">
                          <button mat-menu-item (click)="modificaTenant(t)"><mat-icon>edit</mat-icon> Modifica</button>
                          <button mat-menu-item (click)="eliminaTenant(t)" style="color:#dc2626">
                            <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                          </button>
                        </mat-menu>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-tab>

          <!-- Moduli cross-tenant -->
          <mat-tab label="Moduli per cliente">
            <div class="card" style="margin-top:16px;overflow-x:auto">
              @if (matrice.length === 0) {
                <p style="color:#94a3b8;text-align:center;padding:24px">Caricamento…</p>
              } @else {
                <table class="adm-table">
                  <thead>
                    <tr>
                      <th style="position:sticky;left:0;background:#f8fafc;z-index:2">Tenant</th>
                      @for (m of slugsOrdinati; track m) {
                        <th style="text-align:center;min-width:80px;font-size:11px">{{ m }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of matrice; track row.tenant) {
                      <tr>
                        <td style="position:sticky;left:0;background:#fff;font-weight:600">{{ row.nome || row.tenant }}<div style="font-size:11px;color:#94a3b8">{{ row.tenant }}</div></td>
                        @for (m of slugsOrdinati; track m) {
                          <td style="text-align:center">
                            @if (findM(row, m); as cell) {
                              @if (cell.core) {
                                <mat-icon style="color:#94a3b8;font-size:18px" title="Modulo core (sempre attivo)">lock</mat-icon>
                              } @else {
                                <mat-slide-toggle [checked]="cell.attivo"
                                  (change)="setModulo(row, m, $event.checked)"></mat-slide-toggle>
                              }
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
                <p style="font-size:12px;color:#94a3b8;margin-top:12px">
                  <mat-icon style="font-size:14px;width:14px;height:14px;vertical-align:middle">lock</mat-icon>
                  = modulo core (sempre attivo). Le modifiche sono salvate immediatamente.
                </p>
              }
            </div>
          </mat-tab>
          }

          <!-- Gruppi -->
          <mat-tab label="Gruppi">
            <div class="card" style="margin-top:16px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div style="color:#64748b;font-size:13px">{{ gruppi.length }} gruppi</div>
                <button mat-flat-button (click)="nuovoGruppo()"><mat-icon>group_add</mat-icon> Nuovo gruppo</button>
              </div>
              <table class="adm-table">
                <thead><tr><th>Nome</th><th>Descrizione</th><th>Membri</th><th></th></tr></thead>
                <tbody>
                  @for (g of gruppi; track g.id) {
                    <tr>
                      <td><b>{{ g.nome }}</b></td>
                      <td style="color:#64748b">{{ g.descrizione || '—' }}</td>
                      <td>
                        <span class="ruolo-chip" style="background:#dbeafe;color:#1e40af">
                          <mat-icon style="font-size:13px;width:13px;height:13px;vertical-align:middle">people</mat-icon>
                          {{ g.num_membri }}
                        </span>
                      </td>
                      <td>
                        <button mat-icon-button [matMenuTriggerFor]="gMenu"><mat-icon>more_vert</mat-icon></button>
                        <mat-menu #gMenu="matMenu">
                          <button mat-menu-item (click)="modificaMembri(g)"><mat-icon>people</mat-icon> Gestisci membri</button>
                          <button mat-menu-item (click)="modificaGruppo(g)"><mat-icon>edit</mat-icon> Modifica</button>
                          <button mat-menu-item (click)="eliminaGruppo(g)" style="color:#dc2626">
                            <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                          </button>
                        </mat-menu>
                      </td>
                    </tr>
                  }
                  @if (gruppi.length === 0) {
                    <tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px">
                      Nessun gruppo. Crea il primo per organizzare utenti che condividono le agende.
                    </td></tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-tab>

          <!-- Utenti -->
          <mat-tab label="Utenti">
            <div class="card" style="margin-top:16px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div style="color:#64748b;font-size:13px">{{ utenti.length }} utenti</div>
                <button mat-flat-button (click)="nuovoUtente()"><mat-icon>person_add</mat-icon> Nuovo utente</button>
              </div>
              <table class="adm-table">
                <thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Tenant</th><th>Attivo</th><th></th></tr></thead>
                <tbody>
                  @for (u of utenti; track u.id) {
                    <tr>
                      <td><b>{{ u.username }}</b></td>
                      <td>{{ u.nome }}</td>
                      <td>
                        <span class="ruolo-chip" [class.super]="u.ruolo==='SUPERADMIN'" [class.admin]="u.ruolo==='ADMIN'">
                          {{ u.ruolo }}
                        </span>
                      </td>
                      <td><code>{{ u.tenant }}</code></td>
                      <td>{{ u.attivo ? '✓' : '—' }}</td>
                      <td>
                        <button mat-icon-button [matMenuTriggerFor]="uMenu"><mat-icon>more_vert</mat-icon></button>
                        <mat-menu #uMenu="matMenu">
                          <button mat-menu-item (click)="modificaUtente(u)"><mat-icon>edit</mat-icon> Modifica</button>
                          <button mat-menu-item (click)="eliminaUtente(u)" style="color:#dc2626">
                            <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                          </button>
                        </mat-menu>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-tab>
        </mat-tab-group>
      }
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .page-header { margin-bottom: 16px; }
    .page-title { font-size: 24px; font-weight: 700; margin: 0; }
    .card { background: var(--bg-surface, #fff); border-radius: 10px; padding: 16px; border: 1px solid var(--border-subtle, #e2e8f0); }
    .adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .adm-table th { background: var(--bg-surface-2, #f8fafc); padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary, #64748b); border-bottom: 1px solid var(--border-subtle, #e2e8f0); }
    .adm-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-subtle, #e2e8f0); vertical-align: middle; }
    .ruolo-chip { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; background: #e2e8f0; color: #475569; }
    .ruolo-chip.super { background: #fef3c7; color: #92400e; }
    .ruolo-chip.admin { background: #dbeafe; color: #1e40af; }
    code { background: var(--bg-surface-2, #f1f5f9); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
  `],
})
export class AdminComponent implements OnInit {
  private confirm = inject(ConfirmService);
  isSuper = false;
  isAdmin = false;  // ADMIN o SUPERADMIN — può gestire gruppi/utenti
  tenants: any[] = [];
  utenti: User[] = [];
  matrice: TenantRow[] = [];
  slugsOrdinati: string[] = [];
  gruppi: Gruppo[] = [];

  constructor(private api: ApiService, private auth: AuthService, private ds: DataService,
              private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() {
    const u = this.auth.getUser();
    this.isSuper = u?.ruolo === 'SUPERADMIN';
    this.isAdmin = this.isSuper || u?.ruolo === 'ADMIN';
    if (!this.isAdmin) return;
    this.loadAll();
  }

  loadAll() {
    this.api.get<any[]>('tenants').subscribe(t => this.tenants = t);
    this.api.get<User[]>('utenti').subscribe(u => this.utenti = u);
    this.api.get<TenantRow[]>('moduli/admin/all').subscribe(r => {
      this.matrice = r;
      // Calcola elenco unico moduli (slug) preservando l'ordine dal primo tenant
      const seen = new Set<string>();
      this.slugsOrdinati = [];
      for (const t of r) for (const m of t.moduli) if (!seen.has(m.slug)) { seen.add(m.slug); this.slugsOrdinati.push(m.slug); }
    });
    this.loadGruppi();
  }

  loadGruppi() {
    this.ds.listGruppi().subscribe(g => this.gruppi = g);
  }

  nuovoGruppo() {
    this.dialog.open(GruppoDialogComponent, { data: { g: { nome: '', descrizione: '' } } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.ds.createGruppo(saved).subscribe({
          next: () => { this.loadGruppi(); this.snack.open('Gruppo creato', '', { duration: 2000 }); },
          error: e => this.snack.open(e.error?.error || e.message, 'OK', { duration: 4000 }),
        });
      });
  }

  modificaGruppo(g: Gruppo) {
    this.dialog.open(GruppoDialogComponent, { data: { g: { ...g } } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.ds.updateGruppo(g.id, saved).subscribe(() => this.loadGruppi());
      });
  }

  async eliminaGruppo(g: Gruppo) {
    if (!await this.confirm.delete(`Eliminare il gruppo "${g.nome}"?`)) return;
    this.ds.deleteGruppo(g.id).subscribe(() => this.loadGruppi());
  }

  modificaMembri(g: Gruppo) {
    // Pre-carica i membri attuali + lista utenti del tenant del gruppo
    this.ds.getGruppo(g.id).subscribe(full => {
      const utentiTenant = this.utenti.filter(u => u.tenant === this.auth.getUser()?.tenant);
      this.dialog.open(MembriDialogComponent, { data: { gruppo: full, utentiTenant } })
        .afterClosed().subscribe((ids: number[] | undefined) => {
          if (!ids) return;
          this.ds.setGruppoMembri(g.id, ids).subscribe(() => {
            this.loadGruppi();
            this.snack.open('Membri aggiornati', '', { duration: 2000 });
          });
        });
    });
  }

  countUtenti(slug: string): number {
    return this.utenti.filter(u => u.tenant === slug).length;
  }

  findM(row: TenantRow, slug: string) { return row.moduli.find(m => m.slug === slug); }

  setModulo(row: TenantRow, slug: string, attivo: boolean) {
    this.api.put<any>(`moduli/admin/${row.tenant}/${slug}`, { attivo }).subscribe({
      next: m => { const c = this.findM(row, slug); if (c) c.attivo = m.attivo; this.snack.open('Aggiornato', '', { duration: 1500 }); },
      error: e => { this.snack.open(e.error?.error || e.message, '', { duration: 3000 }); this.loadAll(); },
    });
  }

  // ── Tenants ─────────────────────────────────────────────────────────────
  nuovoTenant() {
    this.dialog.open(TenantDialogComponent, { data: { t: { slug: '', nome: '' }, isNew: true } })
      .afterClosed().subscribe(t => {
        if (!t) return;
        this.api.post('tenants', t).subscribe({
          next: () => { this.loadAll(); this.snack.open('Cliente creato', '', { duration: 2000 }); },
          error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 }),
        });
      });
  }
  modificaTenant(t: any) {
    this.dialog.open(TenantDialogComponent, { data: { t: { ...t }, isNew: false } })
      .afterClosed().subscribe(upd => {
        if (!upd) return;
        this.api.put(`tenants/${upd.slug}`, { nome: upd.nome, attivo: upd.attivo }).subscribe(() => this.loadAll());
      });
  }
  async eliminaTenant(t: any) {
    if (!await this.confirm.delete(`Eliminare il cliente "${t.slug}"? Il file dati NON viene cancellato.`)) return;
    this.api.delete(`tenants/${t.slug}`).subscribe({
      next: () => { this.loadAll(); this.snack.open('Cliente rimosso', '', { duration: 2000 }); },
      error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 }),
    });
  }

  // ── Utenti ──────────────────────────────────────────────────────────────
  nuovoUtente() {
    this.dialog.open(UserDialogComponent, {
      data: { u: { username: '', password: '', nome: '', email: '', ruolo: 'OPERATORE', tenant: this.tenants[0]?.slug }, tenants: this.tenants }
    }).afterClosed().subscribe(u => {
      if (!u) return;
      this.api.post('utenti', u).subscribe({
        next: () => { this.loadAll(); this.snack.open('Utente creato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.error?.error || e.message, '', { duration: 3000 }),
      });
    });
  }
  modificaUtente(u: User) {
    this.dialog.open(UserDialogComponent, { data: { u: { ...u, password: '' }, tenants: this.tenants } })
      .afterClosed().subscribe(upd => {
        if (!upd) return;
        const payload: any = { ...upd };
        if (!payload.password) delete payload.password;
        this.api.put(`utenti/${u.id}`, payload).subscribe(() => this.loadAll());
      });
  }
  async eliminaUtente(u: User) {
    if (!await this.confirm.delete(`Eliminare l'utente "${u.username}"?`)) return;
    this.api.delete(`utenti/${u.id}`).subscribe(() => this.loadAll());
  }
}

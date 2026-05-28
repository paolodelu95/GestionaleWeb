import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface Stats {
  totaleTenant: number;
  attivi: number;
  sospesi: number;
  trial: number;
  paying: number;
  perPiano: Record<string, number>;
  perStato: Record<string, number>;
  utentiTotali: number;
  utentiAttivi: number;
  registratiUltimi30Giorni: number;
  mrr: number;
}

interface AdminTenant {
  slug: string;
  nome: string;
  attivo: boolean;
  ragioneSociale: string;
  piva: string;
  piano: string;
  stato: string;
  trialScadeIl: string | null;
  created_at: string;
  utenti: number;
  utentiAttivi: number;
  owner?: { id: number; username: string; nome?: string; email?: string } | null;
}

interface RecentUser {
  id: number;
  username: string;
  nome: string;
  email: string;
  ruolo: string;
  tenant_slug: string;
  attivo: boolean;
  emailVerified: boolean;
  created_at: string;
}

@Component({
  selector: 'app-super-tenant-edit-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Tenant <code>{{ data.tenant.slug }}</code></h2>
    <mat-dialog-content style="min-width:480px">
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Ragione sociale</mat-label>
        <input matInput [(ngModel)]="form.ragioneSociale">
      </mat-form-field>
      <div style="display:flex;gap:12px">
        <mat-form-field appearance="outline" style="flex:1">
          <mat-label>Piano</mat-label>
          <mat-select [(ngModel)]="form.piano">
            <mat-option value="trial">Trial</mat-option>
            <mat-option value="starter">Starter</mat-option>
            <mat-option value="business">Business</mat-option>
            <mat-option value="pro">Pro</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="flex:1">
          <mat-label>Stato</mat-label>
          <mat-select [(ngModel)]="form.stato">
            <mat-option value="attiva">Attiva</mat-option>
            <mat-option value="sospesa">Sospesa</mat-option>
            <mat-option value="cancellata">Cancellata</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Trial scade il</mat-label>
        <input matInput type="date" [(ngModel)]="form.trialScadeIl">
        <mat-hint>Lascia vuoto se piano non è trial</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Annulla</button>
      <button mat-flat-button color="primary" (click)="save()">Salva</button>
    </mat-dialog-actions>
  `,
})
export class SuperTenantEditDialogComponent {
  form: { ragioneSociale: string; piano: string; stato: string; trialScadeIl: string | null };
  constructor(
    public dialogRef: MatDialogRef<SuperTenantEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { tenant: AdminTenant; api: ApiService },
  ) {
    this.form = {
      ragioneSociale: data.tenant.ragioneSociale || data.tenant.nome || '',
      piano: data.tenant.piano || 'trial',
      stato: data.tenant.stato || 'attiva',
      trialScadeIl: data.tenant.trialScadeIl || null,
    };
  }
  save() {
    this.data.api.put(`tenants/${this.data.tenant.slug}`, {
      ...this.form,
      attivo: this.form.stato === 'attiva',
    }).subscribe({
      next: () => this.dialogRef.close({ saved: true }),
      error: e => alert(e.error?.error || 'Errore salvataggio'),
    });
  }
}

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DatePipe,
    MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule,
    MatSnackBarModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
  ],
  template: `
    <div class="sa-page">
      <header class="sa-header">
        <div>
          <h1>Console SUPERADMIN</h1>
          <p>Monitoraggio e gestione del SaaS Ordeva — tutti i tenant, abbonamenti, attività commerciale.</p>
        </div>
        <button mat-stroked-button (click)="reload()" [disabled]="loading">
          <mat-icon>refresh</mat-icon> Aggiorna
        </button>
      </header>

      @if (!isSuperAdmin) {
        <div class="forbid">
          <mat-icon>lock</mat-icon>
          Solo gli utenti SUPERADMIN possono accedere a questa pagina.
        </div>
      } @else {
        <section class="kpis">
          <div class="kpi">
            <span class="kpi-label">Tenant totali</span>
            <span class="kpi-value">{{ stats?.totaleTenant ?? '—' }}</span>
            <span class="kpi-sub">{{ stats?.attivi ?? 0 }} attivi · {{ stats?.sospesi ?? 0 }} sospesi</span>
          </div>
          <div class="kpi kpi-success">
            <span class="kpi-label">In trial</span>
            <span class="kpi-value">{{ stats?.trial ?? 0 }}</span>
            <span class="kpi-sub">in attesa di conversione</span>
          </div>
          <div class="kpi kpi-info">
            <span class="kpi-label">Paganti</span>
            <span class="kpi-value">{{ stats?.paying ?? 0 }}</span>
            <span class="kpi-sub">Starter / Business / Pro</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Utenti totali</span>
            <span class="kpi-value">{{ stats?.utentiTotali ?? '—' }}</span>
            <span class="kpi-sub">{{ stats?.registratiUltimi30Giorni ?? 0 }} negli ultimi 30gg</span>
          </div>
          <div class="kpi kpi-mrr">
            <span class="kpi-label">MRR stimato</span>
            <span class="kpi-value">€ {{ stats?.mrr ?? 0 }}</span>
            <span class="kpi-sub">richiede Stripe Subscription</span>
          </div>
        </section>

        <section class="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="filterText" placeholder="Cerca slug / ragione sociale / P.IVA / email owner">
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="select">
            <mat-label>Piano</mat-label>
            <mat-select [(ngModel)]="filterPiano">
              <mat-option value="">Tutti</mat-option>
              <mat-option value="trial">Trial</mat-option>
              <mat-option value="starter">Starter</mat-option>
              <mat-option value="business">Business</mat-option>
              <mat-option value="pro">Pro</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="select">
            <mat-label>Stato</mat-label>
            <mat-select [(ngModel)]="filterStato">
              <mat-option value="">Tutti</mat-option>
              <mat-option value="attiva">Attiva</mat-option>
              <mat-option value="sospesa">Sospesa</mat-option>
              <mat-option value="cancellata">Cancellata</mat-option>
            </mat-select>
          </mat-form-field>
        </section>

        <section class="tenants-section">
          <div class="section-head">
            <h2>Tenant ({{ filteredTenants.length }})</h2>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Slug</th>
                  <th>Ragione sociale</th>
                  <th>Owner</th>
                  <th>Piano</th>
                  <th>Stato</th>
                  <th class="num">Utenti</th>
                  <th>Trial</th>
                  <th>Creato</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (t of filteredTenants; track t.slug) {
                  <tr [class.row-suspended]="!t.attivo">
                    <td data-label="Slug"><code>{{ t.slug }}</code></td>
                    <td data-label="Ragione sociale">{{ t.ragioneSociale || t.nome }}</td>
                    <td data-label="Owner">{{ t.owner?.email || t.owner?.username || '—' }}</td>
                    <td data-label="Piano"><span class="badge" [class]="'badge-piano-' + (t.piano || 'trial')">{{ t.piano || 'trial' }}</span></td>
                    <td data-label="Stato"><span class="badge" [class]="'badge-stato-' + (t.stato || 'attiva')">{{ t.stato || 'attiva' }}</span></td>
                    <td class="num" data-label="Utenti">{{ t.utentiAttivi }} / {{ t.utenti }}</td>
                    <td data-label="Trial">
                      @if (t.trialScadeIl) {
                        <span [class.text-warn]="isTrialExpiring(t.trialScadeIl)" [class.text-danger]="isTrialExpired(t.trialScadeIl)">
                          {{ t.trialScadeIl | date:'dd/MM/yyyy' }}
                        </span>
                      } @else { — }
                    </td>
                    <td data-label="Creato">{{ t.created_at | date:'dd/MM/yyyy' }}</td>
                    <td class="row-actions">
                      <button mat-icon-button [matMenuTriggerFor]="menu" matTooltip="Azioni">
                        <mat-icon>more_vert</mat-icon>
                      </button>
                      <mat-menu #menu="matMenu">
                        <button mat-menu-item (click)="editTenant(t)">
                          <mat-icon>edit</mat-icon> Modifica piano/stato
                        </button>
                        @if (t.attivo) {
                          <button mat-menu-item (click)="toggleSuspend(t, false)">
                            <mat-icon>pause_circle</mat-icon> Sospendi
                          </button>
                        } @else {
                          <button mat-menu-item (click)="toggleSuspend(t, true)">
                            <mat-icon>play_circle</mat-icon> Riattiva
                          </button>
                        }
                        <button mat-menu-item (click)="extendTrial(t)">
                          <mat-icon>schedule_send</mat-icon> Estendi trial +14gg
                        </button>
                        <button mat-menu-item (click)="deleteTenant(t)" class="menu-danger">
                          <mat-icon style="color:#dc2626">delete_forever</mat-icon>
                          <span style="color:#dc2626">Elimina tenant</span>
                        </button>
                      </mat-menu>
                    </td>
                  </tr>
                }
                @if (filteredTenants.length === 0 && !loading) {
                  <tr><td colspan="9" class="empty">Nessun tenant trovato.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="recent-section">
          <div class="section-head">
            <h2>Utenti registrati di recente</h2>
            <span class="muted">ultimi {{ recentUsers.length }}</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Email / Username</th>
                  <th>Nome</th>
                  <th>Tenant</th>
                  <th>Ruolo</th>
                  <th>Verifica</th>
                  <th>Registrato</th>
                </tr>
              </thead>
              <tbody>
                @for (u of recentUsers; track u.id) {
                  <tr>
                    <td data-label="Email / Username">{{ u.email || u.username }}</td>
                    <td data-label="Nome">{{ u.nome || '—' }}</td>
                    <td data-label="Tenant"><code>{{ u.tenant_slug }}</code></td>
                    <td data-label="Ruolo"><span class="badge badge-ruolo">{{ u.ruolo }}</span></td>
                    <td data-label="Verifica">
                      @if (u.emailVerified) {
                        <span class="check ok"><mat-icon>verified</mat-icon> Verificata</span>
                      } @else {
                        <span class="check warn"><mat-icon>schedule</mat-icon> In attesa</span>
                      }
                    </td>
                    <td data-label="Registrato">{{ u.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .sa-page { padding: 24px 28px; max-width: 1400px; margin: 0 auto; }
    .sa-header {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: 16px; margin-bottom: 24px;
      h1 { font-size: 26px; font-weight: 800; margin: 0 0 4px; color: var(--text-primary); letter-spacing: -0.02em; }
      p { font-size: 14px; color: var(--text-secondary); margin: 0; }
    }
    .forbid {
      display: flex; align-items: center; gap: 12px;
      padding: 32px;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.20);
      border-radius: 12px;
      color: #b91c1c; font-weight: 500;
      mat-icon { color: #dc2626; font-size: 28px; width: 28px; height: 28px; }
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px; margin-bottom: 32px;
    }
    .kpi {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .kpi-label { font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
    .kpi-value { font-size: 28px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
    .kpi-sub { font-size: 12px; color: var(--text-secondary); }
    .kpi-success { border-left: 3px solid #16a34a; }
    .kpi-info { border-left: 3px solid #11769b; }
    .kpi-mrr { background: linear-gradient(135deg, rgba(17,118,155,0.05), rgba(21,164,162,0.06)); border-left: 3px solid #15a4a2; }
    .filters {
      display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
      .search { flex: 1; min-width: 280px; }
      .select { width: 160px; }
    }
    .section-head {
      display: flex; align-items: baseline; justify-content: space-between;
      margin: 24px 0 10px;
      h2 { font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: -0.01em; }
      .muted { font-size: 12px; color: var(--text-tertiary); }
    }
    .tenants-section, .recent-section { margin-bottom: 16px; }
    .table-wrap {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow-x: auto;
    }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table thead th {
      text-align: left;
      padding: 12px 14px;
      background: var(--bg-subtle);
      color: var(--text-tertiary);
      font-weight: 600; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .data-table tbody td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
      vertical-align: middle;
    }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table tbody tr:hover { background: var(--bg-subtle); }
    .data-table code {
      background: var(--bg-subtle);
      padding: 2px 6px; border-radius: 4px;
      font-size: 12px; color: var(--text-secondary);
      font-family: 'SF Mono', Menlo, monospace;
    }
    .data-table .num { text-align: right; }
    .data-table .empty {
      text-align: center; padding: 32px 0;
      color: var(--text-tertiary); font-style: italic;
    }
    .row-suspended { opacity: 0.55; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.04em;
      background: var(--bg-subtle);
      color: var(--text-secondary);
    }
    .badge-piano-trial    { background: rgba(217,119,6,0.12); color: #b45309; }
    .badge-piano-starter  { background: rgba(14,116,144,0.12); color: #0e7490; }
    .badge-piano-business { background: rgba(17,118,155,0.12); color: #11769b; }
    .badge-piano-pro      { background: rgba(21,164,162,0.14); color: #0f766e; }
    .badge-stato-attiva     { background: rgba(22,163,74,0.14); color: #15803d; }
    .badge-stato-sospesa    { background: rgba(217,119,6,0.14); color: #b45309; }
    .badge-stato-cancellata { background: rgba(239,68,68,0.14); color: #b91c1c; }
    .badge-ruolo { background: rgba(17,118,155,0.10); color: #11769b; }
    .text-warn { color: #b45309; font-weight: 600; }
    .text-danger { color: #b91c1c; font-weight: 600; }
    .check {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; font-weight: 500;
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }
    .check.ok { color: #15803d; }
    .check.warn { color: #b45309; }
    .menu-danger:hover { background: rgba(239,68,68,0.06); }
    @media (max-width: 700px) {
      .sa-page { padding: 16px 14px; }
      .sa-header { flex-direction: column; align-items: stretch; }
      .filters .search, .filters .select { width: 100%; }

      /* Tabelle -> card impilate (niente scroll orizzontale) */
      .table-wrap { overflow-x: visible; background: transparent; border: none; border-radius: 0; }
      .data-table { font-size: 14px; }
      .data-table thead { display: none; }
      .data-table, .data-table tbody { display: block; width: 100%; }
      .data-table tr {
        display: block;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 6px 14px;
        margin-bottom: 12px;
      }
      .data-table tbody tr:hover { background: var(--bg-surface); }
      .data-table tbody td {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        padding: 8px 0 !important;
        border-bottom: 1px solid var(--border-subtle);
        text-align: right;
      }
      .data-table tbody tr td:last-child { border-bottom: none; }
      .data-table tbody td::before {
        content: attr(data-label);
        flex: 0 0 auto;
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.04em;
        color: var(--text-tertiary);
        text-align: left;
      }
      .data-table td.num { text-align: right; }
      .data-table td.row-actions { justify-content: flex-end; padding-top: 4px !important; }
      .data-table td.row-actions::before { content: none; }
      .data-table td.empty { justify-content: center; text-align: center; }
      .data-table td.empty::before { content: none; }
    }
  `]
})
export class SuperAdminComponent implements OnInit {
  isSuperAdmin = false;
  loading = false;
  stats: Stats | null = null;
  tenants: AdminTenant[] = [];
  recentUsers: RecentUser[] = [];

  filterText = '';
  filterPiano = '';
  filterStato = '';

  constructor(
    private api: ApiService,
    private authSvc: AuthService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit() {
    this.isSuperAdmin = this.authSvc.getUser()?.ruolo === 'SUPERADMIN';
    if (this.isSuperAdmin) this.reload();
  }

  reload() {
    this.loading = true;
    this.api.get<Stats>('admin/stats').subscribe({
      next: s => this.stats = s, error: () => {},
    });
    this.api.get<AdminTenant[]>('admin/tenants').subscribe({
      next: t => { this.tenants = t; this.loading = false; },
      error: () => { this.loading = false; },
    });
    this.api.get<RecentUser[]>('admin/recent-users?limit=30').subscribe({
      next: u => this.recentUsers = u, error: () => {},
    });
  }

  get filteredTenants(): AdminTenant[] {
    const q = this.filterText.trim().toLowerCase();
    return this.tenants.filter(t => {
      if (this.filterPiano && (t.piano || 'trial') !== this.filterPiano) return false;
      if (this.filterStato && (t.stato || 'attiva') !== this.filterStato) return false;
      if (!q) return true;
      const haystack = [
        t.slug, t.ragioneSociale, t.nome, t.piva,
        t.owner?.email, t.owner?.username, t.owner?.nome,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  isTrialExpired(date: string | null): boolean {
    if (!date) return false;
    return new Date(date) < new Date();
  }
  isTrialExpiring(date: string | null): boolean {
    if (!date) return false;
    const days = (new Date(date).getTime() - Date.now()) / 86400000;
    return days > 0 && days < 5;
  }

  editTenant(t: AdminTenant) {
    const ref = this.dialog.open(SuperTenantEditDialogComponent, {
      data: { tenant: t, api: this.api }, maxWidth: '90vw',
    });
    ref.afterClosed().subscribe(r => {
      if (r?.saved) {
        this.snack.open('Tenant aggiornato', '', { duration: 2500 });
        this.reload();
      }
    });
  }

  toggleSuspend(t: AdminTenant, riattiva: boolean) {
    const azione = riattiva ? 'riattivare' : 'sospendere';
    if (!confirm(`Sei sicuro di voler ${azione} il tenant "${t.ragioneSociale || t.slug}"?`)) return;
    this.api.put(`tenants/${t.slug}`, { attivo: riattiva, stato: riattiva ? 'attiva' : 'sospesa' }).subscribe({
      next: () => {
        this.snack.open(`Tenant ${riattiva ? 'riattivato' : 'sospeso'}`, '', { duration: 2500 });
        this.reload();
      },
      error: e => this.snack.open(e.error?.error || 'Errore', 'OK', { duration: 4000 }),
    });
  }

  extendTrial(t: AdminTenant) {
    const base = t.trialScadeIl ? new Date(t.trialScadeIl) : new Date();
    if (base < new Date()) base.setTime(Date.now());
    base.setDate(base.getDate() + 14);
    const newDate = base.toISOString().substring(0, 10);
    this.api.put(`tenants/${t.slug}`, { trialScadeIl: newDate }).subscribe({
      next: () => {
        this.snack.open(`Trial esteso fino al ${newDate}`, '', { duration: 3000 });
        this.reload();
      },
      error: e => this.snack.open(e.error?.error || 'Errore', 'OK', { duration: 4000 }),
    });
  }

  deleteTenant(t: AdminTenant) {
    const conferma = prompt(
      `Per eliminare DEFINITIVAMENTE il tenant "${t.ragioneSociale || t.slug}" e tutti i suoi dati,\n` +
      `digita lo slug "${t.slug}" qui sotto:`
    );
    if (conferma !== t.slug) {
      if (conferma !== null) this.snack.open('Slug non corrispondente, eliminazione annullata.', 'OK', { duration: 4000 });
      return;
    }
    this.api.delete(`tenants/${t.slug}`).subscribe({
      next: () => {
        this.snack.open('Tenant eliminato', '', { duration: 2500 });
        this.reload();
      },
      error: e => this.snack.open(e.error?.error || 'Errore', 'OK', { duration: 4000 }),
    });
  }
}

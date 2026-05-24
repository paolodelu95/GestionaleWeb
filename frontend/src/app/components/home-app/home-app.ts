import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { ModuliService } from '../../services/moduli.service';

interface App {
  label: string;
  description: string;
  icon: string;
  route: string;
  color: string;     // colore di sfondo della tile
  category: string;
}

@Component({
  selector: 'app-home-app',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="home-app">
      <div class="home-app-hero">
        <h1>Benvenuto{{ userName ? ', ' + userName : '' }} 👋</h1>
        <p>Scegli un'area per iniziare. Tutte le app sono attive nel tuo account.</p>
      </div>

      @for (cat of categories; track cat) {
        @if (appsVisibili(cat).length > 0) {
          <div class="app-section">
            <h2 class="app-section-title">{{ cat }}</h2>
            <div class="app-grid">
              @for (a of appsVisibili(cat); track a.route) {
                <a class="app-tile" [routerLink]="a.route" [style.background]="a.color">
                  <div class="app-tile-icon">
                    <mat-icon>{{ a.icon }}</mat-icon>
                  </div>
                  <div class="app-tile-text">
                    <div class="app-tile-label">{{ a.label }}</div>
                    <div class="app-tile-desc">{{ a.description }}</div>
                  </div>
                </a>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .home-app { padding: 32px; max-width: 1400px; margin: 0 auto; }
    .home-app-hero { margin-bottom: 32px; }
    .home-app-hero h1 { font-size: 28px; font-weight: 700; margin: 0 0 6px; color: var(--text-primary, #0f172a); }
    .home-app-hero p { font-size: 14px; color: var(--text-secondary, #64748b); margin: 0; }

    .app-section { margin-bottom: 28px; }
    .app-section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
      color: var(--text-tertiary, #94a3b8); margin: 0 0 12px;
    }
    .app-grid {
      display: grid; gap: 14px;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }

    .app-tile {
      display: flex; gap: 14px; align-items: center;
      padding: 18px; border-radius: 14px;
      color: #fff; text-decoration: none;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08);
      transition: transform 0.12s ease, box-shadow 0.12s ease;
      cursor: pointer;
    }
    .app-tile:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.08), 0 12px 24px rgba(0,0,0,0.12);
    }
    .app-tile:active { transform: translateY(0); }

    .app-tile-icon {
      width: 44px; height: 44px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
    }
    .app-tile-icon mat-icon {
      font-size: 26px; width: 26px; height: 26px; color: #fff;
    }

    .app-tile-text { min-width: 0; flex: 1; }
    .app-tile-label {
      font-size: 15px; font-weight: 700; line-height: 1.2;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .app-tile-desc {
      font-size: 12px; opacity: 0.85; margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    @media (max-width: 640px) {
      .home-app { padding: 16px; }
      .app-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    }
  `],
})
export class HomeAppComponent {
  userName: string;

  readonly categories = ['Anagrafica', 'Vendite', 'Acquisti', 'Magazzino', 'Contabilità', 'Operativo', 'Sistema'];

  readonly apps: App[] = [
    // ── Anagrafica ──────────────────────────────────────────────────────────
    { label: 'Clienti',    description: 'Anagrafica clienti', icon: 'people',         route: '/clienti',   color: 'linear-gradient(135deg,#0ea5e9,#0284c7)', category: 'Anagrafica' },
    { label: 'Fornitori',  description: 'Anagrafica fornitori', icon: 'local_shipping', route: '/fornitori', color: 'linear-gradient(135deg,#06b6d4,#0891b2)', category: 'Anagrafica' },
    { label: 'Prodotti',   description: 'Catalogo, varianti, listini', icon: 'inventory_2', route: '/prodotti', color: 'linear-gradient(135deg,#14b8a6,#0d9488)', category: 'Anagrafica' },

    // ── Vendite ─────────────────────────────────────────────────────────────
    { label: 'Preventivi',        description: 'Offerte commerciali',    icon: 'request_quote',   route: '/preventivi',         color: 'linear-gradient(135deg,#6366f1,#4f46e5)', category: 'Vendite' },
    { label: 'Ordini cliente',    description: 'Ordini da clienti',      icon: 'shopping_cart',   route: '/ordini',             color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', category: 'Vendite' },
    { label: 'DDT',               description: 'Documenti di trasporto', icon: 'receipt_long',    route: '/ddt',                color: 'linear-gradient(135deg,#a855f7,#9333ea)', category: 'Vendite' },
    { label: 'Fatture',           description: 'Emissione fatture + XML SDI', icon: 'receipt',    route: '/fatture',            color: 'linear-gradient(135deg,#ec4899,#db2777)', category: 'Vendite' },
    { label: 'Note di credito',   description: 'Storni e rimborsi',      icon: 'note_alt',        route: '/note-credito',       color: 'linear-gradient(135deg,#f43f5e,#e11d48)', category: 'Vendite' },
    { label: 'Ricorrenti',        description: 'Fatturazione periodica', icon: 'autorenew',       route: '/fatture-ricorrenti', color: 'linear-gradient(135deg,#f97316,#ea580c)', category: 'Vendite' },

    // ── Acquisti ────────────────────────────────────────────────────────────
    { label: 'Acquisti',     description: 'Fatture passive e ordini fornitore', icon: 'shopping_bag',  route: '/acquisti',     color: 'linear-gradient(135deg,#f59e0b,#d97706)', category: 'Acquisti' },
    { label: 'Arrivi merce', description: 'Entrate magazzino', icon: 'move_to_inbox', route: '/arrivi-merce', color: 'linear-gradient(135deg,#eab308,#ca8a04)', category: 'Acquisti' },

    // ── Magazzino ───────────────────────────────────────────────────────────
    { label: 'Movimenti', description: 'Storico carichi/scarichi', icon: 'warehouse', route: '/magazzino', color: 'linear-gradient(135deg,#84cc16,#65a30d)', category: 'Magazzino' },

    // ── Contabilità ─────────────────────────────────────────────────────────
    { label: 'Pagamenti',       description: 'Incassi e pagamenti',     icon: 'payments',        route: '/pagamenti',       color: 'linear-gradient(135deg,#22c55e,#16a34a)', category: 'Contabilità' },
    { label: 'Scadenzario',     description: 'Scadenze attive e passive', icon: 'event',         route: '/scadenzario',     color: 'linear-gradient(135deg,#10b981,#059669)', category: 'Contabilità' },
    { label: 'Prima nota',      description: 'Movimenti cassa/banca',   icon: 'menu_book',       route: '/prima-nota',      color: 'linear-gradient(135deg,#14b8a6,#0d9488)', category: 'Contabilità' },
    { label: 'Riconciliazione', description: 'Import OFX/CSV bancario', icon: 'account_balance', route: '/riconciliazione', color: 'linear-gradient(135deg,#0ea5e9,#0284c7)', category: 'Contabilità' },
    { label: 'Compliance',      description: 'LIPE, esterometro, export', icon: 'verified',     route: '/compliance',      color: 'linear-gradient(135deg,#0284c7,#0369a1)', category: 'Contabilità' },

    // ── Operativo ───────────────────────────────────────────────────────────
    { label: 'CRM',              description: 'Pipeline opportunità',    icon: 'group_work',     route: '/crm',           color: 'linear-gradient(135deg,#a855f7,#9333ea)', category: 'Operativo' },
    { label: 'Timesheet',        description: 'Progetti e ore lavorate', icon: 'schedule',       route: '/timesheet',     color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', category: 'Operativo' },
    { label: 'Vendita al banco', description: 'Cassa veloce',            icon: 'point_of_sale',  route: '/vendita-banco', color: 'linear-gradient(135deg,#ef4444,#dc2626)', category: 'Operativo' },

    // ── Sistema ─────────────────────────────────────────────────────────────
    { label: 'Dashboard',    description: 'KPI e grafici',         icon: 'dashboard',  route: '/dashboard',    color: 'linear-gradient(135deg,#475569,#334155)', category: 'Sistema' },
    { label: 'Report',       description: 'Statistiche e analisi', icon: 'bar_chart',  route: '/report',       color: 'linear-gradient(135deg,#64748b,#475569)', category: 'Sistema' },
    { label: 'Storico',      description: 'Audit log',             icon: 'history',    route: '/storico',      color: 'linear-gradient(135deg,#94a3b8,#64748b)', category: 'Sistema' },
    { label: 'Impostazioni', description: 'Configurazione azienda', icon: 'settings',  route: '/impostazioni', color: 'linear-gradient(135deg,#71717a,#52525b)', category: 'Sistema' },
  ];

  constructor(auth: AuthService, private moduli: ModuliService) {
    const u = auth.getUser();
    this.userName = u?.nome || u?.username || '';
  }

  /** Tile visibili per una categoria: filtra in base ai moduli attivi. */
  appsVisibili(categoria: string): App[] {
    return this.apps.filter(a => a.category === categoria && this.moduli.routeAbilitata(a.route));
  }
}

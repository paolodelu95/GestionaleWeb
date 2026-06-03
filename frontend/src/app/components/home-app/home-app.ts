import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { ModuliService } from '../../services/moduli.service';
import { OnboardingChecklistComponent } from '../shared/onboarding-checklist';

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
  imports: [CommonModule, RouterLink, MatIconModule, OnboardingChecklistComponent],
  template: `
    <div class="home-app">
      <div class="home-app-hero">
        <h1>Benvenuto{{ userName ? ', ' + userName : '' }} 👋</h1>
        <p>Da dove vuoi iniziare? Le azioni più comuni sono qui sotto.</p>
      </div>

      <app-onboarding-checklist />

      @if (quickActionsVisibili.length > 0) {
        <div class="app-section">
          <h2 class="app-section-title">Cosa vuoi fare?</h2>
          <div class="qa-grid">
            @for (q of quickActionsVisibili; track q.route) {
              <a class="qa-tile" [routerLink]="q.route">
                <span class="qa-icon"><mat-icon>{{ q.icon }}</mat-icon></span>
                <span class="qa-label">{{ q.label }}</span>
              </a>
            }
          </div>
        </div>
      }

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

    /* Azioni rapide (task-first) */
    .qa-grid {
      display: grid; gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    }
    .qa-tile {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; border-radius: 12px; text-decoration: none;
      background: var(--bg-surface, #fff); color: var(--text-primary, #0f172a);
      border: 1px solid var(--border-subtle, #eef0f4); box-shadow: var(--shadow-xs);
      transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
    }
    .qa-tile:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--primary, #11769b); }
    .qa-tile:active { transform: translateY(0); }
    .qa-icon {
      width: 38px; height: 38px; flex-shrink: 0; border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      background: var(--primary-soft, #e6f1f6); color: var(--primary, #11769b);
    }
    .qa-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .qa-label { font-size: 14px; font-weight: 600; }

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
      .home-app { padding: 12px; }
      .home-app-hero h1 { font-size: 22px; }
      .home-app-hero p { font-size: 13px; }
      .app-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .app-tile { padding: 12px; gap: 10px; border-radius: 12px; }
      .app-tile-icon { width: 36px; height: 36px; border-radius: 8px; }
      .app-tile-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
      .app-tile-label { font-size: 13px; }
      .app-tile-desc { font-size: 11px; white-space: normal; line-height: 1.25; overflow: visible; }
    }
    @media (max-width: 380px) {
      .app-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class HomeAppComponent {
  userName: string;

  readonly categories = ['Anagrafica', 'Vendite', 'Acquisti', 'Magazzino', 'Contabilità', 'Operativo', 'Sistema'];

  // Azioni rapide: i compiti più frequenti, in cima alla Home. Filtrate per modulo attivo.
  readonly quickActions: { label: string; icon: string; route: string }[] = [
    { label: 'Nuova fattura',    icon: 'receipt',        route: '/fatture' },
    { label: 'Nuovo preventivo', icon: 'request_quote',  route: '/preventivi' },
    { label: 'Nuovo DDT',        icon: 'local_shipping', route: '/ddt' },
    { label: 'Vendita al banco', icon: 'point_of_sale',  route: '/vendita-banco' },
    { label: 'Nuovo cliente',    icon: 'person_add',     route: '/clienti' },
    { label: 'Registra acquisto',icon: 'shopping_bag',   route: '/acquisti' },
  ];

  get quickActionsVisibili(): { label: string; icon: string; route: string }[] {
    return this.quickActions.filter(q => this.moduli.routeAbilitata(q.route));
  }

  // Tile della home: palette distintiva ma elegante (pesi Material 600-700,
  // niente tonalità sature/neon). Ogni macro-categoria ha la sua famiglia di
  // colore così che i tile siano subito identificabili senza essere "arlecchino".
  readonly apps: App[] = [
    // ── Anagrafica ── cool blues / cyan / teal ────────────────────────────
    { label: 'Clienti',    description: 'Anagrafica clienti', icon: 'people',         route: '/clienti',   color: 'linear-gradient(135deg,#0284c7,#0369a1)', category: 'Anagrafica' },
    { label: 'Fornitori',  description: 'Anagrafica fornitori', icon: 'local_shipping', route: '/fornitori', color: 'linear-gradient(135deg,#0891b2,#0e7490)', category: 'Anagrafica' },
    { label: 'Prodotti',   description: 'Catalogo, varianti, listini', icon: 'inventory_2', route: '/prodotti', color: 'linear-gradient(135deg,#0d9488,#0f766e)', category: 'Anagrafica' },

    // ── Vendite ── indigo / violet / pink scuri ────────────────────────────
    { label: 'Preventivi',        description: 'Offerte commerciali',    icon: 'request_quote',   route: '/preventivi',         color: 'linear-gradient(135deg,#4f46e5,#4338ca)', category: 'Vendite' },
    { label: 'Ordini cliente',    description: 'Ordini da clienti',      icon: 'shopping_cart',   route: '/ordini',             color: 'linear-gradient(135deg,#7c3aed,#6d28d9)', category: 'Vendite' },
    { label: 'DDT',               description: 'Documenti di trasporto', icon: 'receipt_long',    route: '/ddt',                color: 'linear-gradient(135deg,#9333ea,#7e22ce)', category: 'Vendite' },
    { label: 'Fatture',           description: 'Emissione fatture + XML SDI', icon: 'receipt',    route: '/fatture',            color: 'linear-gradient(135deg,#db2777,#be185d)', category: 'Vendite' },
    { label: 'Note di credito',   description: 'Storni e rimborsi',      icon: 'note_alt',        route: '/note-credito',       color: 'linear-gradient(135deg,#e11d48,#be123c)', category: 'Vendite' },
    { label: 'Ricorrenti',        description: 'Fatturazione periodica', icon: 'autorenew',       route: '/fatture-ricorrenti', color: 'linear-gradient(135deg,#ea580c,#c2410c)', category: 'Vendite' },

    // ── Acquisti ── amber / yellow scuri (warm, "outgoing") ───────────────
    { label: 'Acquisti',     description: 'Fatture passive e ordini fornitore', icon: 'shopping_bag',  route: '/acquisti',     color: 'linear-gradient(135deg,#d97706,#b45309)', category: 'Acquisti' },
    { label: 'Arrivi merce', description: 'Entrate magazzino', icon: 'move_to_inbox', route: '/arrivi-merce', color: 'linear-gradient(135deg,#ca8a04,#a16207)', category: 'Acquisti' },

    // ── Magazzino ── lime scuro (movimento/freschezza) ────────────────────
    { label: 'Movimenti', description: 'Storico carichi/scarichi', icon: 'warehouse', route: '/magazzino', color: 'linear-gradient(135deg,#65a30d,#4d7c0f)', category: 'Magazzino' },

    // ── Contabilità ── verdi / teal (money flow) ──────────────────────────
    { label: 'Pagamenti',       description: 'Incassi e pagamenti',     icon: 'payments',        route: '/pagamenti',       color: 'linear-gradient(135deg,#16a34a,#15803d)', category: 'Contabilità' },
    { label: 'Scadenzario',     description: 'Scadenze attive e passive', icon: 'event',         route: '/scadenzario',     color: 'linear-gradient(135deg,#059669,#047857)', category: 'Contabilità' },
    { label: 'Prima nota',      description: 'Movimenti cassa/banca',   icon: 'menu_book',       route: '/prima-nota',      color: 'linear-gradient(135deg,#0d9488,#0f766e)', category: 'Contabilità' },
    { label: 'Riconciliazione', description: 'Import OFX/CSV bancario', icon: 'account_balance', route: '/riconciliazione', color: 'linear-gradient(135deg,#0284c7,#0369a1)', category: 'Contabilità' },
    { label: 'Compliance',      description: 'LIPE, esterometro, export', icon: 'verified',     route: '/compliance',      color: 'linear-gradient(135deg,#0369a1,#075985)', category: 'Contabilità' },

    // ── Operativo ── purple / violet / red scuri ──────────────────────────
    { label: 'Agenda',           description: 'Appuntamenti, todo, calendario', icon: 'event_note', route: '/agenda',     color: 'linear-gradient(135deg,#4f46e5,#4338ca)', category: 'Operativo' },
    // Nascosti (CRM, Timesheet): troppo complessi per il target attuale. Riattivare in futuro.
    { label: 'Vendita al banco', description: 'Cassa veloce',            icon: 'point_of_sale',  route: '/vendita-banco', color: 'linear-gradient(135deg,#dc2626,#b91c1c)', category: 'Operativo' },

    // ── Sistema ── slate / zinc (utility, neutri) ─────────────────────────
    { label: 'Dashboard',    description: 'KPI e grafici',         icon: 'dashboard',  route: '/dashboard',    color: 'linear-gradient(135deg,#475569,#334155)', category: 'Sistema' },
    { label: 'Report',       description: 'Statistiche e analisi', icon: 'bar_chart',  route: '/report',       color: 'linear-gradient(135deg,#64748b,#475569)', category: 'Sistema' },
    { label: 'Storico',      description: 'Audit log',             icon: 'history',    route: '/storico',      color: 'linear-gradient(135deg,#94a3b8,#64748b)', category: 'Sistema' },
    { label: 'Aiuto',        description: 'Manuale + FAQ + scorciatoie', icon: 'menu_book', route: '/aiuto',     color: 'linear-gradient(135deg,#11769b,#15a4a2)', category: 'Sistema' },
    { label: 'Impostazioni', description: 'Configurazione azienda', icon: 'settings',  route: '/impostazioni', color: 'linear-gradient(135deg,#3f3f46,#27272a)', category: 'Sistema' },
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

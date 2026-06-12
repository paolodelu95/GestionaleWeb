import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { ModuliService } from '../../services/moduli.service';
import { DataService } from '../../services/data.service';
import { OnboardingChecklistComponent } from '../shared/onboarding-checklist';
import { StatsKpiAnno, ScadenzarioEntry, Ddt, Prodotto, Preventivo, StatsVenditeMensili } from '../../models';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface App {
  label: string;
  description: string;
  icon: string;
  route: string;
  color: string;     // gradiente dell'icona (accento di categoria)
  category: string;
}

interface StatCard {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  tone: Tone;
  route: string;
}

interface AttentionItem {
  label: string;
  count: number;
  detail?: string;
  icon: string;
  tone: Tone;
  route: string;
}

interface TrendBar { label: string; value: string; pct: number; last: boolean; }

@Component({
  selector: 'app-home-app',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, OnboardingChecklistComponent],
  template: `
    <div class="home">

      <!-- ── Hero: saluto + data ─────────────────────────────────────────── -->
      <header class="home-hero">
        <div class="home-hero-text">
          <h1>{{ greeting }}{{ userName ? ', ' + userName : '' }} <span class="wave">👋</span></h1>
          <p class="home-hero-date">{{ oggi | date:'EEEE d MMMM y' | titlecase }}</p>
        </div>
      </header>

      <app-onboarding-checklist />

      <!-- ── Strip KPI economici ─────────────────────────────────────────── -->
      <section class="home-block">
        <div class="stat-strip">
          @if (!loaded) {
            @for (s of [1,2,3,4]; track s) { <div class="stat-card skeleton"></div> }
          } @else {
            @for (s of stats; track s.label) {
              <a class="stat-card" [class]="'tone-' + s.tone" [routerLink]="s.route">
                <span class="stat-icon"><mat-icon>{{ s.icon }}</mat-icon></span>
                <span class="stat-body">
                  <span class="stat-label">{{ s.label }}</span>
                  <span class="stat-value">{{ s.value }}</span>
                  @if (s.sub) { <span class="stat-sub">{{ s.sub }}</span> }
                </span>
              </a>
            }
          }
        </div>
      </section>

      <!-- ── Riga: Richiede attenzione | Andamento ───────────────────────── -->
      <div class="home-cols">

        <section class="home-panel">
          <div class="panel-head">
            <h2><mat-icon>notifications_active</mat-icon> Richiede attenzione</h2>
          </div>
          @if (!loaded) {
            <div class="att-list">
              @for (s of [1,2,3]; track s) { <div class="att-row skeleton-row"></div> }
            </div>
          } @else if (attention.length === 0) {
            <div class="all-clear">
              <mat-icon>task_alt</mat-icon>
              <div>
                <strong>Tutto sotto controllo</strong>
                <span>Nessuna scadenza o attività in sospeso. Ottimo lavoro!</span>
              </div>
            </div>
          } @else {
            <div class="att-list">
              @for (a of attention; track a.label) {
                <a class="att-row" [class]="'tone-' + a.tone" [routerLink]="a.route">
                  <span class="att-icon"><mat-icon>{{ a.icon }}</mat-icon></span>
                  <span class="att-text">
                    <span class="att-label">{{ a.label }}</span>
                    @if (a.detail) { <span class="att-detail">{{ a.detail }}</span> }
                  </span>
                  <span class="att-count">{{ a.count }}</span>
                  <mat-icon class="att-go">chevron_right</mat-icon>
                </a>
              }
            </div>
          }
        </section>

        @if (loaded && trend.length > 0) {
          <section class="home-panel">
            <div class="panel-head">
              <h2><mat-icon>show_chart</mat-icon> Andamento fatturato</h2>
              <a class="panel-link" routerLink="/dashboard">Dettagli</a>
            </div>
            <div class="trend">
              <div class="trend-bars">
                @for (b of trend; track b.label) {
                  <div class="trend-col" [title]="b.label + ': ' + b.value">
                    <div class="trend-bar-wrap">
                      <span class="trend-bar" [class.is-last]="b.last" [style.height.%]="b.pct"></span>
                    </div>
                    <span class="trend-month">{{ b.label }}</span>
                  </div>
                }
              </div>
              <div class="trend-foot">
                <span>Ultimo mese</span>
                <strong>{{ trendLastValue }}</strong>
              </div>
            </div>
          </section>
        }
      </div>

      <!-- ── Azioni rapide ───────────────────────────────────────────────── -->
      @if (quickActionsVisibili.length > 0) {
        <section class="home-block">
          <h2 class="block-title">Azioni rapide</h2>
          <div class="qa-grid">
            @for (q of quickActionsVisibili; track q.route) {
              <a class="qa-tile" [routerLink]="q.route">
                <span class="qa-icon"><mat-icon>{{ q.icon }}</mat-icon></span>
                <span class="qa-label">{{ q.label }}</span>
                <mat-icon class="qa-plus">add</mat-icon>
              </a>
            }
          </div>
        </section>
      }

      <!-- ── Esplora moduli (calmo, icona colorata) ──────────────────────── -->
      @for (cat of categories; track cat) {
        @if (appsVisibili(cat).length > 0) {
          <section class="home-block">
            <h2 class="block-title">{{ cat }}</h2>
            <div class="mod-grid">
              @for (a of appsVisibili(cat); track a.route) {
                <a class="mod-card" [routerLink]="a.route">
                  <span class="mod-icon" [style.background]="a.color"><mat-icon>{{ a.icon }}</mat-icon></span>
                  <span class="mod-text">
                    <span class="mod-label">{{ a.label }}</span>
                    <span class="mod-desc">{{ a.description }}</span>
                  </span>
                </a>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .home { padding: var(--sp-8); max-width: 1280px; margin: 0 auto; }

    /* ── Hero ── */
    .home-hero { margin-bottom: var(--sp-6); }
    .home-hero h1 {
      font-size: 28px; font-weight: 800; letter-spacing: -0.02em;
      margin: 0 0 2px; color: var(--text-primary);
    }
    .home-hero h1 .wave { font-weight: 400; }
    .home-hero-date { font-size: 14px; color: var(--text-tertiary); margin: 0; }

    .home-block { margin-top: var(--sp-6); }
    .block-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--text-tertiary); margin: 0 0 var(--sp-3);
    }

    /* ── Strip KPI ── */
    .stat-strip {
      display: grid; gap: var(--sp-3);
      grid-template-columns: repeat(4, 1fr);
    }
    .stat-card {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-4); border-radius: var(--radius-xl);
      background: var(--bg-surface); border: 1px solid var(--border-subtle);
      box-shadow: var(--shadow-xs); text-decoration: none;
      transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease;
      min-width: 0;
    }
    .stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--border-strong); }
    .stat-icon {
      width: 44px; height: 44px; flex-shrink: 0; border-radius: var(--radius-lg);
      display: flex; align-items: center; justify-content: center;
      background: var(--primary-soft); color: var(--primary);
    }
    .stat-icon mat-icon { font-size: 24px; width: 24px; height: 24px; }
    .stat-body { display: flex; flex-direction: column; min-width: 0; }
    .stat-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stat-value { font-size: 21px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; line-height: 1.15; }
    .stat-sub { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .stat-card.tone-primary .stat-icon { background: var(--primary-soft); color: var(--primary); }
    .stat-card.tone-success .stat-icon { background: var(--success-soft); color: var(--success-on); }
    .stat-card.tone-warning .stat-icon { background: var(--warning-soft); color: var(--warning-on); }
    .stat-card.tone-danger  .stat-icon { background: var(--danger-soft);  color: var(--danger-on); }
    .stat-card.tone-info    .stat-icon { background: var(--info-soft);    color: var(--info-on); }
    .stat-card.tone-danger .stat-sub { color: var(--danger-on); font-weight: 600; }

    /* ── Colonne: attenzione + andamento ── */
    .home-cols {
      margin-top: var(--sp-6);
      display: grid; gap: var(--sp-4);
      grid-template-columns: 1.4fr 1fr;
      align-items: start;
    }
    .home-panel {
      background: var(--bg-surface); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl); padding: var(--sp-5); box-shadow: var(--shadow-xs);
    }
    .panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
    .panel-head h2 {
      display: flex; align-items: center; gap: var(--sp-2);
      font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0;
    }
    .panel-head h2 mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--text-tertiary); }
    .panel-link { font-size: 12px; font-weight: 600; color: var(--primary); text-decoration: none; }
    .panel-link:hover { text-decoration: underline; }

    /* ── Lista "richiede attenzione" ── */
    .att-list { display: flex; flex-direction: column; gap: var(--sp-2); }
    .att-row {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-3); border-radius: var(--radius-lg);
      background: var(--bg-surface-2); border: 1px solid var(--border-subtle);
      text-decoration: none; transition: background .12s ease, border-color .12s ease, transform .12s ease;
    }
    .att-row:hover { background: var(--bg-subtle); border-color: var(--border-strong); transform: translateX(2px); }
    .att-icon {
      width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      background: var(--primary-soft); color: var(--primary);
    }
    .att-icon mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .att-row.tone-warning .att-icon { background: var(--warning-soft); color: var(--warning-on); }
    .att-row.tone-danger  .att-icon { background: var(--danger-soft);  color: var(--danger-on); }
    .att-row.tone-info    .att-icon { background: var(--info-soft);    color: var(--info-on); }
    .att-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .att-label { font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
    .att-detail { font-size: 12px; color: var(--text-tertiary); }
    .att-count {
      font-size: 14px; font-weight: 800; color: var(--text-primary);
      min-width: 26px; text-align: center; font-variant-numeric: tabular-nums;
    }
    .att-row.tone-danger .att-count { color: var(--danger-on); }
    .att-go { color: var(--text-muted); font-size: 20px; width: 20px; height: 20px; flex-shrink: 0; }

    .all-clear {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-4); border-radius: var(--radius-lg);
      background: var(--success-soft); border: 1px solid transparent;
    }
    .all-clear mat-icon { color: var(--success-on); font-size: 28px; width: 28px; height: 28px; flex-shrink: 0; }
    .all-clear strong { display: block; font-size: 14px; color: var(--text-primary); }
    .all-clear span { font-size: 12.5px; color: var(--text-secondary); }

    /* ── Mini trend (barre CSS) ── */
    .trend { display: flex; flex-direction: column; gap: var(--sp-3); }
    .trend-bars { display: flex; align-items: flex-end; gap: var(--sp-2); height: 132px; }
    .trend-col { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
    .trend-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .trend-bar {
      width: 70%; max-width: 34px; min-height: 4px; border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      background: var(--primary); opacity: .34;
      transition: height .4s cubic-bezier(.16,1,.3,1);
    }
    .trend-bar.is-last { background: linear-gradient(180deg, var(--primary) 0%, var(--brand-teal) 100%); opacity: 1; }
    .trend-month { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: capitalize; }
    .trend-foot {
      display: flex; align-items: baseline; justify-content: space-between;
      border-top: 1px solid var(--border-subtle); padding-top: var(--sp-2);
    }
    .trend-foot span { font-size: 12px; color: var(--text-tertiary); }
    .trend-foot strong { font-size: 16px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }

    /* ── Azioni rapide ── */
    .qa-grid { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
    .qa-tile {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-lg); text-decoration: none;
      background: var(--bg-surface); color: var(--text-primary);
      border: 1px solid var(--border-subtle); box-shadow: var(--shadow-xs);
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
    }
    .qa-tile:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--primary); }
    .qa-tile:hover .qa-plus { opacity: 1; transform: none; }
    .qa-icon {
      width: 38px; height: 38px; flex-shrink: 0; border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      background: var(--primary-soft); color: var(--primary);
    }
    .qa-icon mat-icon { font-size: 21px; width: 21px; height: 21px; }
    .qa-label { font-size: 14px; font-weight: 600; flex: 1; }
    .qa-plus { color: var(--primary); opacity: 0; transform: translateX(-4px); transition: opacity .12s ease, transform .12s ease; }

    /* ── Esplora moduli ── */
    .mod-grid { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(216px, 1fr)); }
    .mod-card {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-lg); text-decoration: none;
      background: var(--bg-surface); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-xs);
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
      min-width: 0;
    }
    .mod-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--border-strong); }
    .mod-icon {
      width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--shadow-xs);
    }
    .mod-icon mat-icon { font-size: 22px; width: 22px; height: 22px; color: #fff; }
    .mod-text { display: flex; flex-direction: column; min-width: 0; }
    .mod-label { font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mod-desc { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ── Skeleton ── */
    .skeleton, .skeleton-row {
      background: linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-subtle) 50%, var(--bg-surface-2) 75%);
      background-size: 200% 100%; animation: shimmer 1.2s infinite;
    }
    .stat-card.skeleton { height: 76px; border: 1px solid var(--border-subtle); }
    .att-row.skeleton-row { height: 60px; border: none; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Responsive ── */
    @media (max-width: 1000px) {
      .home-cols { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      .stat-strip { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      .home { padding: var(--sp-4); }
      .home-hero h1 { font-size: 23px; }
      .stat-value { font-size: 19px; }
      .qa-grid, .mod-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 380px) {
      .stat-strip { grid-template-columns: 1fr; }
    }
  `],
})
export class HomeAppComponent implements OnInit {
  userName: string;
  greeting = 'Ciao';
  oggi = new Date();
  loaded = false;

  stats: StatCard[] = [];
  attention: AttentionItem[] = [];
  trend: TrendBar[] = [];
  trendLastValue = '';

  readonly categories = ['Anagrafica', 'Vendite', 'Acquisti', 'Magazzino', 'Contabilità', 'Operativo', 'Sistema'];

  // Azioni rapide: i compiti più frequenti, in cima alla Home. Filtrate per modulo attivo.
  readonly quickActions: { label: string; icon: string; route: string }[] = [
    { label: 'Nuova fattura',    icon: 'receipt',        route: '/fatture' },
    { label: 'Nuovo preventivo', icon: 'request_quote',  route: '/preventivi' },
    { label: 'Nuovo documento di trasporto', icon: 'local_shipping', route: '/ddt' },
    { label: 'Vendita al banco', icon: 'point_of_sale',  route: '/vendita-banco' },
    { label: 'Nuovo cliente',    icon: 'person_add',     route: '/clienti' },
    { label: 'Registra acquisto',icon: 'shopping_bag',   route: '/acquisti' },
  ];

  get quickActionsVisibili(): { label: string; icon: string; route: string }[] {
    return this.quickActions.filter(q => this.moduli.routeAbilitata(q.route));
  }

  // Tile dei moduli: l'accento di colore vive solo sull'icona (no più "muro" di
  // gradienti saturi), così la Home resta calma ma riconoscibile per categoria.
  readonly apps: App[] = [
    // ── Anagrafica ──
    { label: 'Clienti',    description: 'Anagrafica clienti', icon: 'people',         route: '/clienti',   color: 'linear-gradient(135deg,#0284c7,#0369a1)', category: 'Anagrafica' },
    { label: 'Fornitori',  description: 'Anagrafica fornitori', icon: 'local_shipping', route: '/fornitori', color: 'linear-gradient(135deg,#0891b2,#0e7490)', category: 'Anagrafica' },
    { label: 'Prodotti',   description: 'Catalogo, varianti, listini', icon: 'inventory_2', route: '/prodotti', color: 'linear-gradient(135deg,#0d9488,#0f766e)', category: 'Anagrafica' },

    // ── Vendite ──
    { label: 'Preventivi',        description: 'Offerte commerciali',    icon: 'request_quote',   route: '/preventivi',         color: 'linear-gradient(135deg,#4f46e5,#4338ca)', category: 'Vendite' },
    { label: 'Ordini cliente',    description: 'Ordini da clienti',      icon: 'shopping_cart',   route: '/ordini',             color: 'linear-gradient(135deg,#7c3aed,#6d28d9)', category: 'Vendite' },
    { label: 'Documenti di trasporto', description: 'Trasporto e consegna merci', icon: 'receipt_long',    route: '/ddt',                color: 'linear-gradient(135deg,#9333ea,#7e22ce)', category: 'Vendite' },
    { label: 'Fatture',           description: 'Emissione fatture + XML SDI', icon: 'receipt',    route: '/fatture',            color: 'linear-gradient(135deg,#db2777,#be185d)', category: 'Vendite' },
    { label: 'Note di credito',   description: 'Storni e rimborsi',      icon: 'note_alt',        route: '/note-credito',       color: 'linear-gradient(135deg,#e11d48,#be123c)', category: 'Vendite' },
    { label: 'Ricorrenti',        description: 'Fatturazione periodica', icon: 'autorenew',       route: '/fatture-ricorrenti', color: 'linear-gradient(135deg,#ea580c,#c2410c)', category: 'Vendite' },
    { label: 'Listini',           description: 'Prezzi e sconti per cliente', icon: 'sell',       route: '/listini',            color: 'linear-gradient(135deg,#6d28d9,#5b21b6)', category: 'Vendite' },

    // ── Acquisti ──
    { label: 'Acquisti',     description: 'Fatture passive ricevute', icon: 'shopping_bag',  route: '/acquisti',     color: 'linear-gradient(135deg,#d97706,#b45309)', category: 'Acquisti' },
    { label: 'Ordini fornitore', description: 'Ordini verso i fornitori', icon: 'shopping_cart', route: '/ordini-fornitore', color: 'linear-gradient(135deg,#ea580c,#c2410c)', category: 'Acquisti' },
    { label: 'Arrivi merce', description: 'Entrate magazzino', icon: 'move_to_inbox', route: '/arrivi-merce', color: 'linear-gradient(135deg,#ca8a04,#a16207)', category: 'Acquisti' },

    // ── Magazzino ──
    { label: 'Movimenti', description: 'Storico carichi/scarichi', icon: 'warehouse', route: '/magazzino', color: 'linear-gradient(135deg,#65a30d,#4d7c0f)', category: 'Magazzino' },

    // ── Contabilità ──
    { label: 'Pagamenti',       description: 'Incassi e pagamenti',     icon: 'payments',        route: '/pagamenti',       color: 'linear-gradient(135deg,#16a34a,#15803d)', category: 'Contabilità' },
    { label: 'Scadenzario',     description: 'Scadenze attive e passive', icon: 'event',         route: '/scadenzario',     color: 'linear-gradient(135deg,#059669,#047857)', category: 'Contabilità' },
    { label: 'Prima nota',      description: 'Movimenti cassa/banca',   icon: 'menu_book',       route: '/prima-nota',      color: 'linear-gradient(135deg,#0d9488,#0f766e)', category: 'Contabilità' },
    { label: 'Riconciliazione', description: 'Import OFX/CSV bancario', icon: 'account_balance', route: '/riconciliazione', color: 'linear-gradient(135deg,#0284c7,#0369a1)', category: 'Contabilità' },
    { label: 'Compliance',      description: 'LIPE, esterometro, export', icon: 'verified',     route: '/compliance',      color: 'linear-gradient(135deg,#0369a1,#075985)', category: 'Contabilità' },

    // ── Operativo ──
    { label: 'Agenda',           description: 'Appuntamenti, todo, calendario', icon: 'event_note', route: '/agenda',     color: 'linear-gradient(135deg,#4f46e5,#4338ca)', category: 'Operativo' },
    { label: 'Vendita al banco', description: 'Cassa veloce',            icon: 'point_of_sale',  route: '/vendita-banco', color: 'linear-gradient(135deg,#dc2626,#b91c1c)', category: 'Operativo' },

    // ── Sistema ──
    { label: 'Dashboard',    description: 'KPI e grafici',         icon: 'dashboard',  route: '/dashboard',    color: 'linear-gradient(135deg,#475569,#334155)', category: 'Sistema' },
    { label: 'Report',       description: 'Statistiche e analisi', icon: 'bar_chart',  route: '/report',       color: 'linear-gradient(135deg,#64748b,#475569)', category: 'Sistema' },
    { label: 'Storico',      description: 'Audit log',             icon: 'history',    route: '/storico',      color: 'linear-gradient(135deg,#94a3b8,#64748b)', category: 'Sistema' },
    { label: 'Aiuto',        description: 'Manuale + FAQ + scorciatoie', icon: 'menu_book', route: '/aiuto',     color: 'linear-gradient(135deg,#11769b,#15a4a2)', category: 'Sistema' },
    { label: 'Impostazioni', description: 'Configurazione azienda', icon: 'settings',  route: '/impostazioni', color: 'linear-gradient(135deg,#3f3f46,#27272a)', category: 'Sistema' },
  ];

  private readonly mesiBrevi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  constructor(auth: AuthService, private moduli: ModuliService, private ds: DataService) {
    const u = auth.getUser();
    this.userName = u?.nome || u?.username || '';
    const h = new Date().getHours();
    this.greeting = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  }

  ngOnInit() {
    const safe = <T>(o: Observable<T>, fb: T) => o.pipe(catchError(() => of(fb)));
    forkJoin({
      kpi:     safe(this.ds.getKpiAnno(),            { fatturato: 0, costi: 0, margine: 0 } as StatsKpiAnno),
      scad:    safe(this.ds.getScadenzario(),        [] as ScadenzarioEntry[]),
      ddtNF:   safe(this.ds.getDdtNonFatturati(),    [] as Ddt[]),
      sotto:   safe(this.ds.getProdottiSottoSoglia(),[] as Prodotto[]),
      prev:    safe(this.ds.getPreventivi(),         [] as Preventivo[]),
      ordini:  safe(this.ds.getOrdiniApertiCount(),  0),
      vendite: safe(this.ds.getVenditeMensili(),     [] as StatsVenditeMensili[]),
    }).subscribe(r => {
      this.build(r);
      this.loaded = true;
    });
  }

  /** Tile visibili per una categoria: filtra in base ai moduli attivi. */
  appsVisibili(categoria: string): App[] {
    return this.apps.filter(a => a.category === categoria && this.moduli.routeAbilitata(a.route));
  }

  private build(r: {
    kpi: StatsKpiAnno; scad: ScadenzarioEntry[]; ddtNF: Ddt[]; sotto: Prodotto[];
    prev: Preventivo[]; ordini: number; vendite: StatsVenditeMensili[];
  }) {
    const anno = new Date().getFullYear();
    const oggiIso = new Date().toISOString().slice(0, 10);

    // ── Scadenzario: attive (da incassare) e passive (da pagare) ──
    const attive  = r.scad.filter(s => s.tipoEntry === 'FATTURA' && s.rimanente > 0.005);
    const passive = r.scad.filter(s => s.tipoEntry === 'ACQUISTO' && s.rimanente > 0.005);
    const scadute = attive.filter(s => s.dataScadenza && s.dataScadenza < oggiIso);
    const totIncassare = attive.reduce((a, s) => a + s.rimanente, 0);
    const totPagare    = passive.reduce((a, s) => a + s.rimanente, 0);
    const totScadute   = scadute.reduce((a, s) => a + s.rimanente, 0);

    // ── KPI economici ──
    this.stats = [
      { label: 'Fatturato ' + anno, value: this.eur(r.kpi.fatturato), sub: 'Margine ' + this.eur(r.kpi.margine), icon: 'trending_up', tone: 'primary', route: '/dashboard' },
      { label: 'Da incassare', value: this.eur(totIncassare),
        sub: scadute.length ? scadute.length + ' scadut' + (scadute.length === 1 ? 'a' : 'e') : attive.length + ' in attesa',
        icon: 'south_west', tone: scadute.length ? 'danger' : 'info', route: '/scadenzario' },
      { label: 'Da pagare', value: this.eur(totPagare), sub: passive.length + ' fatture passive', icon: 'north_east', tone: 'warning', route: '/scadenzario' },
      { label: 'Margine ' + anno, value: this.eur(r.kpi.margine), sub: 'su ' + this.eur(r.kpi.fatturato) + ' di ricavi', icon: 'savings', tone: 'success', route: '/report' },
    ];

    // ── Richiede attenzione: solo voci con count>0 e modulo attivo ──
    const totDdt = r.ddtNF.reduce((a, d) => a + (d.totale ?? 0), 0);
    const prevAttesa = r.prev.filter(p => p.stato === 'INVIATO').length;
    const items: AttentionItem[] = [
      { label: 'Fatture scadute da incassare', count: scadute.length, detail: this.eur(totScadute), icon: 'event_busy', tone: 'danger', route: '/scadenzario' },
      { label: 'DDT da fatturare', count: r.ddtNF.length, detail: totDdt > 0 ? this.eur(totDdt) : undefined, icon: 'local_shipping', tone: 'info', route: '/ddt' },
      { label: 'Preventivi in attesa di risposta', count: prevAttesa, icon: 'request_quote', tone: 'info', route: '/preventivi' },
      { label: 'Ordini da evadere', count: r.ordini, icon: 'shopping_cart', tone: 'warning', route: '/ordini' },
      { label: 'Prodotti sotto scorta', count: r.sotto.length, detail: r.sotto.length ? 'Riordino consigliato' : undefined, icon: 'inventory_2', tone: 'warning', route: '/magazzino' },
    ];
    this.attention = items.filter(it => it.count > 0 && this.moduli.routeAbilitata(it.route));

    // ── Mini trend fatturato (ultimi 6 mesi disponibili) ──
    const ultimi = r.vendite.slice(-6);
    const max = Math.max(1, ...ultimi.map(v => v.totale));
    this.trend = ultimi.map((v, i) => ({
      label: this.meseLabel(v.mese),
      value: this.eur(v.totale),
      pct: Math.max(3, Math.round((v.totale / max) * 100)),
      last: i === ultimi.length - 1,
    }));
    this.trendLastValue = ultimi.length ? this.eur(ultimi[ultimi.length - 1].totale) : '';
  }

  private eur(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
  }

  private meseLabel(mese: string): string {
    const m = parseInt((mese || '').slice(5, 7), 10);
    return this.mesiBrevi[m - 1] ?? mese;
  }
}

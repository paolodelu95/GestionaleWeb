import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { ModuliService } from '../../services/moduli.service';
import { DataService } from '../../services/data.service';
import { environment } from '../../../environments/environment';
import { OnboardingChecklistComponent } from '../shared/onboarding-checklist';
import { WelcomeOfflineComponent } from '../shared/welcome-offline';
import { ScadenzarioEntry, Ddt, Prodotto, Preventivo } from '../../models';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';

interface App {
  label: string;
  description: string;
  icon: string;
  route: string;
  category: string;
}

/** Un solo tono per categoria (non uno a caso per modulo): la Home resta
 *  riconoscibile per sezione senza il "muro" di gradienti saturi di prima. */
const CATEGORY_TONE: Record<string, Tone> = {
  Anagrafica: 'primary',
  Vendite: 'primary',
  Acquisti: 'warning',
  Magazzino: 'success',
  Contabilità: 'info',
  Operativo: 'purple',
  Sistema: 'neutral',
};

interface AttentionItem {
  label: string;
  count: number;
  detail?: string;
  icon: string;
  tone: Tone;
  route: string;
}

@Component({
  selector: 'app-home-app',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, OnboardingChecklistComponent, WelcomeOfflineComponent],
  template: `
    <app-welcome-offline (done)="ngOnInit()" />
    <div class="home">

      <!-- ── Hero: saluto + data ─────────────────────────────────────────── -->
      <header class="home-hero">
        <div class="home-hero-text">
          <h1>{{ greeting }}{{ userName ? ', ' + userName : '' }}</h1>
          <p class="home-hero-date">{{ oggi | date:'EEEE d MMMM y' | titlecase }}</p>
        </div>
      </header>

      <app-onboarding-checklist />

      <!-- ── Riga: Richiede attenzione | Dashboard (i numeri sono là) ─────── -->
      <div class="home-cols">

        <section class="home-panel">
          <div class="panel-head">
            <h2><mat-icon>notifications_active</mat-icon> Richiede attenzione</h2>
            @if (loaded && attention.length > 0) {
              <span class="panel-badge">{{ attention.length }}</span>
            }
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

        <!-- I KPI e i grafici vivono nella Dashboard: qui solo il rimando,
             così Home (cosa fare) e Dashboard (come va) non si sovrappongono. -->
        <a class="dash-cta" routerLink="/dashboard">
          <span class="dash-cta-icon"><mat-icon>insights</mat-icon></span>
          <span class="dash-cta-title">Apri la Dashboard</span>
          <span class="dash-cta-text">Fatturato, margine, cashflow e grafici: l'andamento dell'azienda in un colpo d'occhio.</span>
          <span class="dash-cta-go">Vai ai numeri <mat-icon>arrow_forward</mat-icon></span>
        </a>
      </div>

      <!-- ── Azioni rapide ───────────────────────────────────────────────── -->
      @if (quickActionsVisibili.length > 0) {
        <section class="home-block">
          <h2 class="block-title">Azioni rapide</h2>
          <div class="qa-grid">
            @for (q of quickActionsVisibili; track q.route) {
              <a class="qa-tile" role="button" tabindex="0"
                 (click)="apriAzione(q)" (keydown.enter)="apriAzione(q)"
                 (keydown.space)="$event.preventDefault(); apriAzione(q)">
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
                  <span class="mod-icon" [class]="'tone-' + toneFor(a.category)"><mat-icon>{{ a.icon }}</mat-icon></span>
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
      font-size: 21px; font-weight: 700; letter-spacing: -0.01em;
      margin: 0 0 2px; color: var(--text-primary);
    }
    .home-hero-date { font-size: 14px; color: var(--text-tertiary); margin: 0; }

    .home-block { margin-top: var(--sp-6); }
    .block-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--text-tertiary); margin: 0 0 var(--sp-3);
    }

    /* ── Colonne: attenzione + rimando dashboard ── */
    .home-cols {
      margin-top: var(--sp-6);
      display: grid; gap: var(--sp-4);
      grid-template-columns: 1.5fr 1fr;
      align-items: stretch;
    }
    .home-panel {
      background: var(--bg-surface); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl); padding: var(--sp-5); box-shadow: var(--shadow-xs);
    }
    .panel-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
    .panel-head h2 {
      display: flex; align-items: center; gap: var(--sp-2);
      font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0;
    }
    .panel-head h2 mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--text-tertiary); }
    .panel-badge {
      font-size: 12px; font-weight: 800; color: var(--primary);
      background: var(--primary-soft); border-radius: var(--radius-full);
      min-width: 22px; height: 22px; padding: 0 7px;
      display: inline-flex; align-items: center; justify-content: center;
    }

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

    /* ── Rimando alla Dashboard (i numeri stanno là) ── */
    .dash-cta {
      display: flex; flex-direction: column; align-items: flex-start;
      padding: var(--sp-5); border-radius: var(--radius-xl);
      background: linear-gradient(135deg, var(--primary) 0%, var(--brand-teal) 100%);
      color: #fff; text-decoration: none; box-shadow: var(--shadow-sm);
      transition: transform .14s ease, box-shadow .14s ease;
    }
    .dash-cta:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
    .dash-cta:hover .dash-cta-go mat-icon { transform: translateX(3px); }
    .dash-cta-icon {
      width: 46px; height: 46px; border-radius: var(--radius-lg); margin-bottom: var(--sp-3);
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.18);
    }
    .dash-cta-icon mat-icon { font-size: 26px; width: 26px; height: 26px; color: #fff; }
    .dash-cta-title { font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
    .dash-cta-text { font-size: 13px; line-height: 1.45; opacity: 0.92; margin-top: 4px; }
    .dash-cta-go {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: var(--sp-4); font-size: 13px; font-weight: 700;
    }
    .dash-cta-go mat-icon { font-size: 18px; width: 18px; height: 18px; transition: transform .14s ease; }

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
      background: var(--primary-soft); color: var(--primary);
    }
    .mod-icon.tone-success { background: var(--success-soft); color: var(--success-on); }
    .mod-icon.tone-warning { background: var(--warning-soft); color: var(--warning-on); }
    .mod-icon.tone-danger  { background: var(--danger-soft);  color: var(--danger-on); }
    .mod-icon.tone-info    { background: var(--info-soft);    color: var(--info-on); }
    .mod-icon.tone-purple  { background: var(--purple-soft);  color: var(--purple-on); }
    .mod-icon.tone-neutral { background: var(--bg-subtle);    color: var(--text-secondary); }
    .mod-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .mod-text { display: flex; flex-direction: column; min-width: 0; }
    .mod-label { font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mod-desc { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ── Skeleton ── */
    .skeleton-row {
      height: 60px; border-radius: var(--radius-lg);
      background: linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-subtle) 50%, var(--bg-surface-2) 75%);
      background-size: 200% 100%; animation: shimmer 1.2s infinite;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .home-cols { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .home { padding: var(--sp-4); }
      .home-hero h1 { font-size: 23px; }
      .qa-grid, .mod-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class HomeAppComponent implements OnInit {
  userName: string;
  greeting = 'Ciao';
  oggi = new Date();
  loaded = false;

  attention: AttentionItem[] = [];

  readonly categories = ['Anagrafica', 'Vendite', 'Acquisti', 'Magazzino', 'Contabilità', 'Operativo', 'Sistema'];

  // Azioni rapide: i compiti più frequenti, in cima alla Home. Filtrate per modulo attivo.
  readonly quickActions: { label: string; icon: string; route: string; state?: Record<string, any> }[] = [
    { label: 'Nuova fattura',    icon: 'receipt',        route: '/fatture',    state: { nuovaBozza: {} } },
    { label: 'Nuovo preventivo', icon: 'request_quote',  route: '/preventivi', state: { nuovaBozza: {} } },
    { label: 'Nuovo documento di trasporto', icon: 'local_shipping', route: '/ddt', state: { nuovaBozza: {} } },
    { label: 'Vendita al banco', icon: 'point_of_sale',  route: '/vendita-banco' },
    { label: 'Nuovo cliente',    icon: 'person_add',     route: '/clienti',    state: { prefill: {} } },
    { label: 'Registra acquisto',icon: 'shopping_bag',   route: '/acquisti',   state: { nuovaBozza: {} } },
  ];

  /** Naviga a un'azione rapida passando lo stato che apre subito il dialog "nuovo" (B.3). */
  apriAzione(q: { route: string; state?: Record<string, any> }) {
    this.router.navigate([q.route], q.state ? { state: q.state } : undefined);
  }

  get quickActionsVisibili(): { label: string; icon: string; route: string }[] {
    return this.quickActions.filter(q => this.moduli.routeAbilitata(q.route));
  }

  // Tile dei moduli: l'accento di colore vive solo sull'icona (no più "muro" di
  // gradienti saturi), così la Home resta calma ma riconoscibile per categoria.
  readonly apps: App[] = [
    // ── Anagrafica ──
    { label: 'Clienti',    description: 'Anagrafica clienti', icon: 'people',         route: '/clienti',   category: 'Anagrafica' },
    { label: 'Fornitori',  description: 'Anagrafica fornitori', icon: 'local_shipping', route: '/fornitori', category: 'Anagrafica' },
    { label: 'Prodotti',   description: 'Catalogo, varianti, listini', icon: 'inventory_2', route: '/prodotti', category: 'Anagrafica' },

    // ── Vendite ──
    { label: 'Preventivi',        description: 'Offerte commerciali',    icon: 'request_quote',   route: '/preventivi',         category: 'Vendite' },
    { label: 'Ordini cliente',    description: 'Ordini da clienti',      icon: 'shopping_cart',   route: '/ordini',             category: 'Vendite' },
    { label: 'Documenti di trasporto', description: 'Trasporto e consegna merci', icon: 'receipt_long',    route: '/ddt',                category: 'Vendite' },
    { label: 'Fatture',           description: 'Emissione fatture + XML SDI', icon: 'receipt',    route: '/fatture',            category: 'Vendite' },
    { label: 'Note di credito',   description: 'Storni e rimborsi',      icon: 'note_alt',        route: '/note-credito',       category: 'Vendite' },
    { label: 'Ricorrenti',        description: 'Fatturazione periodica', icon: 'autorenew',       route: '/fatture-ricorrenti', category: 'Vendite' },
    { label: 'Listini',           description: 'Prezzi e sconti per cliente', icon: 'sell',       route: '/listini',            category: 'Vendite' },

    // ── Acquisti ──
    { label: 'Acquisti',     description: 'Fatture passive ricevute', icon: 'shopping_bag',  route: '/acquisti',     category: 'Acquisti' },
    { label: 'Ordini fornitore', description: 'Ordini verso i fornitori', icon: 'shopping_cart', route: '/ordini-fornitore', category: 'Acquisti' },
    { label: 'Arrivi merce', description: 'Entrate magazzino', icon: 'move_to_inbox', route: '/arrivi-merce', category: 'Acquisti' },

    // ── Magazzino ──
    { label: 'Movimenti', description: 'Storico carichi/scarichi', icon: 'warehouse', route: '/magazzino', category: 'Magazzino' },

    // ── Contabilità ──
    { label: 'Pagamenti',       description: 'Incassi e pagamenti',     icon: 'payments',        route: '/pagamenti',       category: 'Contabilità' },
    { label: 'Scadenzario',     description: 'Scadenze attive e passive', icon: 'event',         route: '/scadenzario',     category: 'Contabilità' },
    { label: 'Prima nota',      description: 'Movimenti cassa/banca',   icon: 'menu_book',       route: '/prima-nota',      category: 'Contabilità' },
    { label: 'Riconciliazione', description: 'Import OFX/CSV bancario', icon: 'account_balance', route: '/riconciliazione', category: 'Contabilità' },
    { label: 'Compliance',      description: 'LIPE, esterometro, export', icon: 'verified',     route: '/compliance',      category: 'Contabilità' },

    // ── Operativo ──
    { label: 'Agenda',           description: 'Appuntamenti, todo, calendario', icon: 'event_note', route: '/agenda',     category: 'Operativo' },
    { label: 'Lavagna',          description: 'Bacheca di post-it', icon: 'sticky_note_2', route: '/lavagna', category: 'Operativo' },
    { label: 'Vendita al banco', description: 'Cassa veloce',            icon: 'point_of_sale',  route: '/vendita-banco', category: 'Operativo' },

    // ── Sistema ──
    { label: 'Dashboard',    description: 'KPI, grafici e cashflow', icon: 'dashboard',  route: '/dashboard',    category: 'Sistema' },
    { label: 'Report',       description: 'Statistiche e analisi', icon: 'bar_chart',  route: '/report',       category: 'Sistema' },
    { label: 'Storico',      description: 'Audit log',             icon: 'history',    route: '/storico',      category: 'Sistema' },
    { label: 'Aiuto',        description: 'Manuale + FAQ + scorciatoie', icon: 'menu_book', route: '/aiuto',     category: 'Sistema' },
    { label: 'Impostazioni', description: 'Configurazione azienda', icon: 'settings',  route: '/impostazioni', category: 'Sistema' },
  ];

  toneFor(category: string): Tone { return CATEGORY_TONE[category] ?? 'primary'; }

  constructor(auth: AuthService, private moduli: ModuliService, private ds: DataService, private router: Router) {
    // Edizione desktop offline: l'utente è sempre il placeholder "Utente locale",
    // quindi il saluto resta neutro ("Buongiorno"). Sul web (multi-tenant) usa il nome.
    const u = auth.getUser();
    this.userName = environment.offline ? '' : (u?.nome || u?.username || '');
    const h = new Date().getHours();
    this.greeting = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  }

  ngOnInit() {
    const safe = <T>(o: Observable<T>, fb: T) => o.pipe(catchError(() => of(fb)));
    forkJoin({
      scad:   safe(this.ds.getScadenzario(),         [] as ScadenzarioEntry[]),
      ddtNF:  safe(this.ds.getDdtNonFatturati(),     [] as Ddt[]),
      sotto:  safe(this.ds.getProdottiSottoSoglia(), [] as Prodotto[]),
      prev:   safe(this.ds.getPreventivi(),          [] as Preventivo[]),
      ordini: safe(this.ds.getOrdiniApertiCount(),   0),
    }).subscribe(r => {
      this.build(r);
      this.loaded = true;
    });
  }

  /** Tile visibili per una categoria: filtra in base ai moduli attivi. */
  appsVisibili(categoria: string): App[] {
    return this.apps.filter(a => a.category === categoria && this.moduli.routeAbilitata(a.route));
  }

  /** Costruisce la lista "richiede attenzione": solo cose che richiedono un'azione
   *  (count > 0) e solo per i moduli attivi. Niente KPI/grafici: quelli sono in Dashboard. */
  private build(r: { scad: ScadenzarioEntry[]; ddtNF: Ddt[]; sotto: Prodotto[]; prev: Preventivo[]; ordini: number; }) {
    const oggiIso = new Date().toISOString().slice(0, 10);

    const attive  = r.scad.filter(s => s.tipoEntry === 'FATTURA' && s.rimanente > 0.005);
    const scadute = attive.filter(s => s.dataScadenza && s.dataScadenza < oggiIso);
    const totScadute = scadute.reduce((a, s) => a + s.rimanente, 0);
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
  }

  private eur(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
  }
}

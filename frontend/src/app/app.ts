import { Component, OnInit, AfterViewInit, AfterViewChecked, OnDestroy, HostListener, ElementRef, ViewChild, NgZone, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { DataService } from './services/data.service';
import { AuthService } from './services/auth.service';
import { NotificationService, NotificationBadges } from './services/notifications.service';
import { OfflineService } from './services/offline.service';
import { ModuliService } from './services/moduli.service';
import { DocLockService } from './services/doc-lock.service';
import { LayoutService } from './services/layout.service';
import { LoginComponent } from './components/login/login';
import { CookieConsentComponent } from './components/shared/cookie-consent';
import { BugReportDialogComponent } from './components/shared/bug-report-dialog';
import { Azienda } from './models';
import { SwUpdate } from '@angular/service-worker';

interface NavItem {
  label: string;
  icon: string;
  route?: string;
  children?: NavItem[];
  /** Se true, la voce è visibile solo agli utenti con ruolo SUPERADMIN. */
  superadminOnly?: boolean;
  /** Se true, la voce è visibile a SUPERADMIN o ADMIN. */
  adminOnly?: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatToolbarModule, MatListModule,
    MatIconModule, MatExpansionModule, MatMenuModule, MatButtonModule, MatTooltipModule,
    MatBadgeModule, MatInputModule, MatFormFieldModule, FormsModule,
    LoginComponent, CookieConsentComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  /** Container della barra superiore: serve a calcolare quante voci entrano. */
  @ViewChild('topNavEl') topNavEl?: ElementRef<HTMLElement>;

  azienda: Azienda | null = null;
  collapsed = false;
  loggedIn = false;

  /** Data odierna in italiano per la topbar (es. "Lunedì 8 giugno 2026"). */
  readonly oggiLabel = (() => {
    const s = new Date().toLocaleDateString('it-IT',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  // ── Barra superiore: priority-nav ("⋯ Altro") ───────────────────────────────
  /** Quante voci mostrare in barra; le restanti finiscono nel menu "Altro". */
  navMaxVisible = 99;
  private navLastTotal = -1;
  private navRecomputePending = false;
  private navRO?: ResizeObserver;
  private navObservedEl?: HTMLElement;
  /**
   * True quando l'URL corrente è una route pubblica (es. /faq).
   * Le public route NON richiedono autenticazione: vengono renderizzate
   * direttamente senza login overlay né sidebar/shell. Sono pagine
   * statiche che NON chiamano API protette — quindi non rappresentano
   * un bypass dell'auth, che resta enforced dal backend.
   */
  publicRoute = false;
  private readonly PUBLIC_PATHS = ['/faq', '/guida', '/termini', '/privacy', '/cookie', '/reset-password', '/verify-email', '/trial-expired'];
  badges: NotificationBadges = { scadenzeScadute: 0, prodottiSottoSoglia: 0, solleciti: 0 };
  darkMode = false;
  searchQuery = '';
  searchResults: { label: string; tipo: string; route: string; id: number }[] = [];
  /** Comandi di navigazione/azione filtrati (palette ⌘K). */
  commandResults: { label: string; icon: string; route: string }[] = [];
  /** Risposta/bozza interpretata dalla barra comandi (parser deterministico server). */
  smartItem: any = null;
  /** Indice evidenziato nella palette (navigazione con ↑/↓). */
  highlightedIndex = 0;
  showSearch = false;
  showNotif = false;
  notifItems: any[] = [];
  loadingNotif = false;
  readonly quickActions: { label: string; icon: string; route: string }[] = [
    { label: 'Nuova fattura',     icon: 'receipt_long',   route: '/fatture' },
    { label: 'Nuovo cliente',     icon: 'person_add',     route: '/clienti' },
    { label: 'Nuovo prodotto',    icon: 'add_box',        route: '/prodotti' },
    { label: 'Nuovo preventivo',  icon: 'description',    route: '/preventivi' },
    { label: 'Nuovo DDT',         icon: 'local_shipping', route: '/ddt' },
    { label: 'Vendita al banco',  icon: 'point_of_sale',  route: '/vendita-banco' },
    { label: 'Vai a dashboard',   icon: 'dashboard',      route: '/dashboard' },
    { label: 'Vai a magazzino',   icon: 'inventory',      route: '/magazzino' },
    { label: 'Vai a scadenzario', icon: 'event',          route: '/scadenzario' },
    { label: 'Vai a report',      icon: 'analytics',      route: '/report' },
  ];
  showInstallBanner = false;
  showUpdateBanner = false;
  showEmailVerifyBanner = false;
  resendingVerification = false;
  /** Giorni residui del trial; null se non in trial o oltre 7gg. */
  trialDaysLeft: number | null = null;
  isOffline = false;
  private searchSubject = new Subject<string>();
  private cmdSubject = new Subject<string>();
  private installPromptEvent: any = null;

  constructor(
    private ds: DataService,
    private authSvc: AuthService,
    private notifSvc: NotificationService,
    private router: Router,
    private elRef: ElementRef,
    private swUpdate: SwUpdate,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private offlineSvc: OfflineService,
    public moduli: ModuliService,
    private docLockSvc: DocLockService,
    public layout: LayoutService,
    private zone: NgZone,
  ) {
    this.loggedIn = authSvc.isLoggedIn();
    this.updatePublicRoute(this.router.url);
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) this.updatePublicRoute(e.urlAfterRedirects);
    });
    // Tema "liquid glass" attivo col layout fluttuante: classe sul <body> così
    // coprono anche gli overlay (dialog/menu) renderizzati fuori dalla shell.
    effect(() => document.body.classList.toggle('glass-ui', this.layout.navLayout() === 'floating'));
  }

  private updatePublicRoute(url: string) {
    const path = (url.split('?')[0] || '').toLowerCase();
    this.publicRoute = this.PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
  }

  ngOnInit() {
    this.darkMode = localStorage.getItem('dark-mode') === '1';
    document.body.classList.toggle('dark-mode', this.darkMode);

    // Quando cambiano i moduli attivi (login, caricamento, modifiche in Impostazioni)
    // cambia il numero di voci in barra: ricalcolo l'overflow del priority-nav.
    this.moduli.attivi$.subscribe(() =>
      requestAnimationFrame(() => this.zone.run(() => this.computeNavOverflow())));

    this.offlineSvc.offline$.subscribe(v => this.isOffline = v);
    window.addEventListener('online',  () => this.offlineSvc.setOffline(false));
    window.addEventListener('offline', () => this.offlineSvc.setOffline(true));

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.installPromptEvent = e;
      if (localStorage.getItem('pwa-install-dismissed') !== '1') {
        this.showInstallBanner = true;
      }
    });

    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(evt => {
        if (evt.type === 'VERSION_READY') this.showUpdateBanner = true;
      });
    }

    if (!this.loggedIn) return;
    this.ds.getAzienda().subscribe({
      next: a => {
        this.azienda = a;
        // Inizializza il flag globale "blocca documenti salvati" dal valore
        // persistito sull'azienda; default true se non impostato.
        this.docLockSvc.setEnabled(a?.lockDocumentiDefault !== false);
      },
      error: () => {},
    });
    this.moduli.load().subscribe();
    if (window.innerWidth < 768) this.collapsed = true;

    // Verifica freshness dello stato email del'utente: se ha appena confermato
    // da un altro tab, il banner deve sparire automaticamente.
    this.authSvc.refreshUser().subscribe({
      next: (u: any) => {
        const dismissed = sessionStorage.getItem('email-verify-dismissed') === '1';
        this.showEmailVerifyBanner = !!u && u.emailVerified === false && !dismissed;
        // Countdown trial
        if (u?.piano === 'trial' && u?.trialScadeIl) {
          const diff = (new Date(u.trialScadeIl + 'T23:59:59').getTime() - Date.now()) / 86400000;
          this.trialDaysLeft = diff >= 0 && diff <= 7 ? Math.ceil(diff) : null;
        } else {
          this.trialDaysLeft = null;
        }
      },
      error: () => {},
    });

    this.notifSvc.start();
    this.notifSvc.badges.subscribe(b => this.badges = b);

    this.searchSubject.pipe(
      debounceTime(250), distinctUntilChanged(),
      switchMap(q => q.length >= 2 ? this.ds.searchGlobal(q) : [{ clienti: [], fornitori: [], prodotti: [], fatture: [], ddt: [], ordini: [], preventivi: [] }])
    ).subscribe(r => {
      this.searchResults = [
        ...r.clienti.map((x: any)    => ({ ...x, tipo: 'Cliente' })),
        ...r.fornitori.map((x: any)  => ({ ...x, tipo: 'Fornitore' })),
        ...r.prodotti.map((x: any)   => ({ ...x, tipo: 'Prodotto' })),
        ...r.fatture.map((x: any)    => ({ ...x, tipo: 'Fattura' })),
        ...r.ddt.map((x: any)        => ({ ...x, tipo: 'DDT' })),
        ...r.ordini.map((x: any)     => ({ ...x, tipo: 'Ordine' })),
        ...r.preventivi.map((x: any) => ({ ...x, tipo: 'Preventivo' })),
      ];
      this.showSearch = this.searchResults.length > 0;
    });

    // Barra comandi: interpreta la frase lato server (parser deterministico, nessun
    // costo). Per frasi corte non chiama nulla. Il risultato diventa la prima voce
    // della palette; se non riconosce nulla, smartItem=null e resta la ricerca.
    this.cmdSubject.pipe(
      debounceTime(280), distinctUntilChanged(),
      switchMap(q => q.trim().length >= 3 ? this.ds.interpretaComando(q) : [{ tipo: 'nessuno' }])
    ).subscribe({
      next: r => {
        this.smartItem = (r && r.tipo && r.tipo !== 'nessuno') ? r : null;
        if (this.smartItem) this.showSearch = true;
      },
      error: () => { this.smartItem = null; },
    });
  }

  onLogin() {
    this.loggedIn = true;
    this.ds.getAzienda().subscribe({ next: a => this.azienda = a, error: () => {} });
    this.moduli.load(true).subscribe();
    if (window.innerWidth < 768) this.collapsed = true;
    this.notifSvc.start();
  }

  logout() {
    this.authSvc.logout();
    this.loggedIn = false;
    this.azienda = null;
    this.notifSvc.stop();
    this.moduli.reset();
    this.ds.invalidateModuli();
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth < 768) this.collapsed = true;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.searchInputRef?.nativeElement.focus();
      this.searchInputRef?.nativeElement.select();
      this.showSearch = true;
    }
    if (e.key === 'Escape' && this.showSearch) {
      this.showSearch = false;
      this.searchQuery = '';
      this.searchResults = [];
      this.smartItem = null;
    }
  }

  onSearchFocus() {
    // Apri SEMPRE il pannello al focus/click (anche con testo residuo nella casella,
    // altrimenti dopo un click-fuori non si riaprirebbe). Se c'è già del testo ma i
    // risultati erano stati svuotati, li ricalcola.
    this.showSearch = true;
    const q = (this.searchQuery || '').trim();
    if (q.length >= 2 && !this.searchResults.length) this.searchSubject.next(this.searchQuery);
    if (q.length >= 3 && !this.smartItem) this.cmdSubject.next(this.searchQuery);
  }

  navigateToAction(a: { route: string }) {
    this.showSearch = false;
    this.searchQuery = '';
    this.router.navigate([a.route]);
  }

  toggleNotif(e: MouseEvent) {
    e.stopPropagation();
    this.showNotif = !this.showNotif;
    if (this.showNotif && !this.notifItems.length) this.loadNotif();
  }

  loadNotif() {
    this.loadingNotif = true;
    this.ds.getScadenzarioFull().subscribe({
      next: items => {
        this.notifItems = (items || [])
          .filter((i: any) => i.scaduto || (i.giorniMancanti !== null && i.giorniMancanti <= 7))
          .slice(0, 20);
        this.loadingNotif = false;
      },
      error: () => { this.notifItems = []; this.loadingNotif = false; }
    });
  }

  navigateToScadenzario() {
    this.showNotif = false;
    this.router.navigate(['/scadenzario']);
  }

  get notifBadgeCount(): number {
    return this.badges.scadenzeScadute || 0;
  }

  toggleSidebar() { this.collapsed = !this.collapsed; }
  closeOnMobile() { if (window.innerWidth < 768) this.collapsed = true; }

  // ── Barra superiore: priority-nav ("⋯ Altro") ───────────────────────────────
  /** Voci mostrate direttamente in barra. */
  get priorityNavItems(): NavItem[] {
    if (this.layout.navLayout() !== 'floating') return this.visibleNavItems;
    return this.visibleNavItems.slice(0, this.navMaxVisible);
  }
  /** Voci che non entrano → finiscono nel menu "Altro". */
  get overflowNavItems(): NavItem[] {
    if (this.layout.navLayout() !== 'floating') return [];
    return this.visibleNavItems.slice(this.navMaxVisible);
  }
  get hasNavOverflow(): boolean { return this.overflowNavItems.length > 0; }
  /** Versione flat delle voci in overflow (i gruppi diventano i loro figli). */
  get overflowFlatNavItems(): NavItem[] {
    return this.overflowNavItems.flatMap(it => it.children ?? [it]);
  }
  /** True se una voce in overflow ha un badge: lo segnaliamo sul bottone "Altro". */
  get overflowHasBadge(): boolean {
    return this.overflowFlatNavItems.some(o =>
      o.route === '/pagamenti' && this.badges.scadenzeScadute > 0);
  }

  /** True se `route` corrisponde alla rotta corrente (anche come prefisso, es. /prodotti/123). */
  private isRouteActive(route?: string): boolean {
    if (!route) return false;
    const url = this.router.url.split(/[?#]/)[0];
    return url === route || url.startsWith(route + '/');
  }
  /**
   * True se la voce è quella attiva: per un gruppo controlla i figli. Serve a
   * colorare il pulsante-gruppo del dock (che usa matMenuTriggerFor e non ha
   * routerLink, quindi routerLinkActive non lo evidenzierebbe mai).
   */
  isGroupActive(item: NavItem): boolean {
    if (item.children) return item.children.some(c => this.isRouteActive(c.route));
    return this.isRouteActive(item.route);
  }
  /** True se una qualsiasi voce in overflow ("Altro") è quella attiva. */
  get overflowActive(): boolean {
    return this.overflowNavItems.some(it => this.isGroupActive(it));
  }

  ngAfterViewInit() { this.syncNavObserver(); }

  ngAfterViewChecked() {
    this.syncNavObserver();
    if (this.layout.navLayout() !== 'floating') return;
    // Ricalcola se cambia il numero di voci (login/moduli/ruolo) senza un resize.
    const total = this.visibleNavItems.length;
    if (total !== this.navLastTotal && !this.navRecomputePending) {
      this.navRecomputePending = true;
      requestAnimationFrame(() => {
        this.navRecomputePending = false;
        this.zone.run(() => this.computeNavOverflow());
      });
    }
  }

  ngOnDestroy() { this.navRO?.disconnect(); }

  /** Collega il ResizeObserver alla barra solo quando la top-nav è montata. */
  private syncNavObserver() {
    const el = this.layout.navLayout() === 'floating' ? this.topNavEl?.nativeElement : undefined;
    if (el) {
      if (this.navObservedEl !== el) {
        this.navRO?.disconnect();
        if (typeof ResizeObserver !== 'undefined') {
          this.navRO = new ResizeObserver(() => this.zone.run(() => this.computeNavOverflow()));
          this.navRO.observe(el);
        }
        this.navObservedEl = el;
        this.navLastTotal = -1;
        requestAnimationFrame(() => this.zone.run(() => this.computeNavOverflow()));
      }
    } else if (this.navObservedEl) {
      this.navRO?.disconnect();
      this.navObservedEl = undefined;
    }
  }

  /**
   * Calcola quante voci entrano in UNA riga; le altre vanno nel menu "Altro".
   * Su mobile i bottoni sono a sola icona (larghezza uniforme), quindi basta
   * misurarne uno. Niente scroll, niente righe multiple: una riga + "⋯".
   */
  computeNavOverflow() {
    if (this.layout.navLayout() !== 'floating') return;
    const el = this.topNavEl?.nativeElement;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('.top-nav-item'));
    const total = this.visibleNavItems.length;
    this.navLastTotal = total;
    if (!items.length) return;

    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap || style.gap) || 2;
    // Larghezza voce: uso la PIÙ larga tra quelle visibili (le etichette desktop
    // hanno lunghezze diverse), così non sottostimo e non taglio l'ultima voce.
    const itemW = Math.max(...items.map(i => i.offsetWidth)) + gap;
    // Capienza reale del dock: NON uso el.clientWidth perché il dock-inner fa
    // shrink-to-fit (width:max-content), quindi da "pieno" è già tagliato da
    // overflow:hidden e da "vuoto" misurerebbe troppo poco. Prendo il MINORE tra
    // il max-width risolto e lo spazio utile del contenitore padre (.dock), meno
    // il padding interno. Così non dipende dalla larghezza istantanea della barra.
    let cap = parseFloat(style.maxWidth);
    const parent = el.parentElement;
    if (parent) {
      const ps = getComputedStyle(parent);
      const parentInner = parent.clientWidth
        - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
      cap = Number.isFinite(cap) ? Math.min(cap, parentInner) : parentInner;
    }
    if (!Number.isFinite(cap)) cap = el.clientWidth;
    const containerW = cap - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (itemW <= 0 || containerW <= 0) return;

    let next: number;
    if (total * itemW <= containerW) {
      next = total;                                   // entrano tutte: niente "Altro"
    } else {
      const moreW = itemW;                            // spazio per il bottone "⋯"
      next = Math.max(1, Math.floor((containerW - moreW) / itemW));
    }
    if (next !== this.navMaxVisible) this.navMaxVisible = next;
  }

  onSearchInput(q: string) {
    this.highlightedIndex = 0;
    const query = (q || '').trim().toLowerCase();
    // Comandi (sezioni navigabili + azioni rapide): match istantaneo dal 1° carattere.
    this.commandResults = query.length >= 1
      ? this.allCommands.filter(c => c.label.toLowerCase().includes(query)).slice(0, 8)
      : [];
    if (q.length < 2) this.searchResults = [];
    if (query.length < 3) this.smartItem = null;
    this.showSearch = this.commandResults.length > 0 || q.length >= 2 || !q;
    this.searchSubject.next(q);
    this.cmdSubject.next(q);
  }

  /** Sezioni navigabili (filtrate per ruolo/moduli) + azioni rapide → comandi della palette. */
  private get allCommands(): { label: string; icon: string; route: string }[] {
    const sezioni = this.visibleFlatNavItems
      .filter(i => !!i.route)
      .map(i => ({ label: i.label, icon: i.icon, route: i.route! }));
    return [...this.quickActions, ...sezioni];
  }

  /** Lista unificata (comandi + risultati dati) per la navigazione da tastiera. */
  get paletteItems(): { kind: 'cmd' | 'data' | 'smart'; label: string; icon?: string; tipo?: string; route: string; dettaglio?: string; smart?: any }[] {
    const smart = this.smartItem
      ? [{ kind: 'smart' as const, label: this.smartItem.titolo, icon: this.smartItem.icona || 'auto_awesome', dettaglio: this.smartItem.dettaglio, route: this.smartItem.route || '#', smart: this.smartItem }]
      : [];
    return [
      ...smart,
      ...this.commandResults.map(c => ({ kind: 'cmd' as const, label: c.label, icon: c.icon, route: c.route })),
      ...this.searchResults.map(r => ({ kind: 'data' as const, label: r.label, tipo: r.tipo, route: r.route, id: r.id })),
    ];
  }

  /** Per cliente/fornitore/prodotto apre direttamente la scheda dell'elemento
   *  (non la lista). Restituisce true se ha gestito la navigazione. */
  private openCard(tipo?: string, id?: number): boolean {
    const rotte: Record<string, string> = { Cliente: '/clienti', Fornitore: '/fornitori', Prodotto: '/prodotti' };
    const route = tipo ? rotte[tipo] : undefined;
    if (!route || id == null) return false;
    const nav = () => this.router.navigate([route], { state: { openId: id } });
    // Se siamo già su quella pagina, Angular riuserebbe il componente senza
    // rilanciare ngOnInit: forziamo un rimbalzo così la scheda si apre comunque.
    if (this.router.url.split('?')[0] === route) {
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(nav);
    } else { nav(); }
    return true;
  }

  paletteMove(delta: number) {
    const n = this.paletteItems.length;
    if (n) this.highlightedIndex = (this.highlightedIndex + delta + n) % n;
  }

  paletteEnter() {
    const it = this.paletteItems[this.highlightedIndex];
    if (it) this.executePalette(it);
  }

  executePalette(it: { kind?: string; route: string; tipo?: string; id?: number; smart?: any }) {
    this.showSearch = false;
    this.searchQuery = '';
    this.searchResults = [];
    this.commandResults = [];
    this.smartItem = null;
    if (it.smart) { this.runSmart(it.smart); return; }
    if (it.kind === 'data' && this.openCard(it.tipo, it.id)) return;
    this.router.navigate([it.route]);
  }

  /** Esegue la voce "intelligente": apre la pagina con la bozza pre-compilata,
   *  oppure naviga al dettaglio per le risposte di lettura. */
  private runSmart(s: any) {
    if (s.tipo === 'bozza') {
      const rotte: Record<string, string> = {
        fattura: '/fatture', preventivo: '/preventivi', ddt: '/ddt',
        cliente: '/clienti', prodotto: '/prodotti',
      };
      const route = rotte[s.target];
      if (!route) return;
      const stateKey = (s.target === 'cliente' || s.target === 'prodotto') ? 'prefill' : 'nuovaBozza';
      this.router.navigate([route], { state: { [stateKey]: s.dati } });
    } else if (s.tipo === 'risposta' && s.route) {
      this.router.navigate([s.route]);
    }
  }

  navigateToResult(r: { route: string }) {
    this.showSearch = false;
    this.searchQuery = '';
    this.searchResults = [];
    this.router.navigate([r.route]);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    if (!this.elRef.nativeElement.querySelector('.search-box')?.contains(e.target)) {
      this.showSearch = false;
    }
    if (!this.elRef.nativeElement.querySelector('.notif-wrap')?.contains(e.target)) {
      this.showNotif = false;
    }
  }

  toggleDark() {
    this.darkMode = !this.darkMode;
    document.body.classList.toggle('dark-mode', this.darkMode);
    localStorage.setItem('dark-mode', this.darkMode ? '1' : '0');
  }

  installApp() {
    this.installPromptEvent?.prompt();
    this.installPromptEvent?.userChoice.then(() => {
      this.showInstallBanner = false;
      this.installPromptEvent = null;
    });
  }

  dismissInstall() {
    this.showInstallBanner = false;
    localStorage.setItem('pwa-install-dismissed', '1');
  }

  reloadForUpdate() {
    this.swUpdate.activateUpdate().then(() => window.location.reload());
  }

  dismissVerifyBanner() {
    this.showEmailVerifyBanner = false;
    sessionStorage.setItem('email-verify-dismissed', '1');
  }

  resendVerification() {
    if (this.resendingVerification) return;
    this.resendingVerification = true;
    this.authSvc.resendVerification().subscribe({
      next: () => {
        this.resendingVerification = false;
        this.showEmailVerifyBanner = false;
        sessionStorage.setItem('email-verify-dismissed', '1');
        this.snack.open(
          'Email di verifica inviata. Controlla la tua casella (anche spam).',
          'OK', { duration: 5000 },
        );
      },
      error: (err) => {
        this.resendingVerification = false;
        this.snack.open(
          err.error?.error || 'Errore durante l\'invio. Riprova più tardi.',
          'OK', { duration: 5000 },
        );
      },
    });
  }

  openBugReport() {
    const pagina = this.router.url.replace(/^\//, '').split('/')[0];
    this.dialog.open(BugReportDialogComponent, { data: { pagina }, width: '540px' });
  }

  readonly navItems: NavItem[] = [
    { label: 'Home',         icon: 'apps',           route: '/app' },
    { label: 'Dashboard',    icon: 'dashboard',      route: '/dashboard' },
    {
      label: 'Anagrafiche', icon: 'contacts',
      children: [
        { label: 'Clienti',   icon: 'people',         route: '/clienti' },
        { label: 'Fornitori', icon: 'local_shipping', route: '/fornitori' },
      ]
    },
    {
      label: 'Vendite', icon: 'point_of_sale',
      children: [
        { label: 'Preventivi',       icon: 'request_quote',   route: '/preventivi' },
        { label: 'Ordini cliente',   icon: 'shopping_cart',   route: '/ordini' },
        { label: 'DDT',              icon: 'receipt_long',    route: '/ddt' },
        { label: 'Fatture',          icon: 'receipt',         route: '/fatture' },
        { label: 'Fatture elettroniche (SDI)', icon: 'fact_check', route: '/fatture-elettroniche' },
        { label: 'Note di Credito',  icon: 'note_alt',        route: '/note-credito' },
        { label: 'Ricorrenti',       icon: 'autorenew',       route: '/fatture-ricorrenti' },
        { label: 'Vendita al banco', icon: 'point_of_sale',   route: '/vendita-banco' },
      ]
    },
    {
      label: 'Acquisti', icon: 'shopping_bag',
      children: [
        { label: 'Acquisti',          icon: 'shopping_bag',     route: '/acquisti' },
        { label: 'Ordini fornitore',  icon: 'shopping_cart',    route: '/ordini-fornitore' },
        { label: 'Arrivi merce',      icon: 'move_to_inbox',    route: '/arrivi-merce' },
        { label: 'OCR fatture (PDF)', icon: 'document_scanner', route: '/ocr-fatture' },
        { label: 'SDI ricezione',     icon: 'cloud_download',   route: '/sdi-passive' },
      ]
    },
    {
      label: 'Magazzino', icon: 'warehouse',
      children: [
        { label: 'Prodotti',  icon: 'inventory_2', route: '/prodotti' },
        { label: 'Movimenti', icon: 'warehouse',   route: '/magazzino' },
      ]
    },
    {
      label: 'Contabilità', icon: 'account_balance',
      children: [
        { label: 'Pagamenti',       icon: 'payments',         route: '/pagamenti' },
        { label: 'Scadenzario',     icon: 'event',            route: '/scadenzario' },
        { label: 'Prima nota',      icon: 'menu_book',        route: '/prima-nota' },
        { label: 'Riconciliazione', icon: 'account_balance',  route: '/riconciliazione' },
        { label: 'Compliance',      icon: 'verified',         route: '/compliance' },
      ]
    },
    { label: 'Agenda',    icon: 'event_note',     route: '/agenda' },
    // Nascosti: CRM e Timesheet troppo complessi per il target attuale. Riattivare in futuro.
    // { label: 'CRM',       icon: 'group_work',     route: '/crm' },
    // { label: 'Timesheet', icon: 'schedule',       route: '/timesheet' },
    { label: 'E-commerce', icon: 'shopping_basket', route: '/ecommerce' },
    {
      label: 'Report', icon: 'bar_chart',
      children: [
        { label: 'Andamento',           icon: 'analytics',  route: '/report' },
        { label: 'Report tabellari',    icon: 'table_chart', route: '/reports' },
      ]
    },
    {
      label: 'Sistema', icon: 'tune',
      children: [
        { label: 'Account',      icon: 'person',   route: '/account' },
        { label: 'Abbonamento',  icon: 'credit_card', route: '/billing' },
        { label: 'Aiuto',        icon: 'menu_book', route: '/aiuto' },
        { label: 'Storico',      icon: 'history',  route: '/storico' },
        // Impostazioni è ora accessibile dall'icona ingranaggio nella topbar (vicino a Esci).
      ]
    },
    // Amministrazione e Console SaaS ora sono schede dentro Impostazioni (gated per ruolo),
    // così non ingombrano la barra laterale/superiore. Le route /admin e /super-admin restano
    // attive per il deep-link diretto.
  ];

  /** Voci di menu filtrate dai moduli attivi e dal ruolo dell'utente. */
  get visibleNavItems(): NavItem[] {
    const ruolo = this.authSvc.getUser()?.ruolo;
    const isSuper = ruolo === 'SUPERADMIN';
    const isAdmin = isSuper || ruolo === 'ADMIN';
    const allowed = (it: NavItem) => {
      if (it.superadminOnly && !isSuper) return false;
      if (it.adminOnly && !isAdmin) return false;
      return true;
    };
    return this.navItems
      .filter(allowed)
      .map(item => {
        if (item.children) {
          const visibleChildren = item.children
            .filter(allowed)
            .filter(c => !c.route || this.moduli.routeAbilitata(c.route));
          return visibleChildren.length ? { ...item, children: visibleChildren } : null;
        }
        return (!item.route || this.moduli.routeAbilitata(item.route)) ? item : null;
      })
      .filter((x): x is NavItem => x !== null);
  }

  /** Versione "flat" delle voci visibili (per la sidebar collassata). */
  get visibleFlatNavItems(): NavItem[] {
    return this.visibleNavItems.flatMap(item => item.children ?? [item]);
  }

  get flatNavItems(): NavItem[] {
    return this.navItems.flatMap(item => item.children ?? [item]);
  }
}

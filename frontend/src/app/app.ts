import { Component, OnInit, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
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
    MatIconModule, MatExpansionModule, MatButtonModule, MatTooltipModule,
    MatBadgeModule, MatInputModule, MatFormFieldModule, FormsModule,
    LoginComponent, CookieConsentComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  azienda: Azienda | null = null;
  collapsed = false;
  loggedIn = false;
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
  ) {
    this.loggedIn = authSvc.isLoggedIn();
    this.updatePublicRoute(this.router.url);
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) this.updatePublicRoute(e.urlAfterRedirects);
    });
  }

  private updatePublicRoute(url: string) {
    const path = (url.split('?')[0] || '').toLowerCase();
    this.publicRoute = this.PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
  }

  ngOnInit() {
    this.darkMode = localStorage.getItem('dark-mode') === '1';
    document.body.classList.toggle('dark-mode', this.darkMode);

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
    }
  }

  onSearchFocus() {
    if (!this.searchQuery) this.showSearch = true;
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

  onSearchInput(q: string) {
    if (q.length < 2) { this.showSearch = false; this.searchResults = []; }
    this.searchSubject.next(q);
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
      label: 'Anagrafica', icon: 'contacts',
      children: [
        { label: 'Clienti',   icon: 'people',         route: '/clienti' },
        { label: 'Fornitori', icon: 'local_shipping', route: '/fornitori' },
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
    { label: 'CRM',       icon: 'group_work',     route: '/crm' },
    { label: 'Timesheet', icon: 'schedule',       route: '/timesheet' },
    { label: 'E-commerce', icon: 'shopping_basket', route: '/ecommerce' },
    {
      label: 'Report', icon: 'bar_chart',
      children: [
        { label: 'Dashboard analitica', icon: 'analytics',  route: '/report' },
        { label: 'Report tabellari',    icon: 'table_chart', route: '/reports' },
      ]
    },
    {
      label: 'Sistema', icon: 'settings',
      children: [
        { label: 'Account',      icon: 'person',   route: '/account' },
        { label: 'Abbonamento',  icon: 'credit_card', route: '/billing' },
        { label: 'Aiuto',        icon: 'menu_book', route: '/aiuto' },
        { label: 'Storico',      icon: 'history',  route: '/storico' },
        { label: 'Impostazioni', icon: 'settings', route: '/impostazioni' },
      ]
    },
    { label: 'Amministrazione', icon: 'admin_panel_settings', route: '/admin', adminOnly: true },
    { label: 'Console SaaS',    icon: 'space_dashboard', route: '/super-admin', superadminOnly: true },
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

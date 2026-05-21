import { Component, OnInit, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
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
import { FormsModule } from '@angular/forms';
import { DataService } from './services/data.service';
import { AuthService } from './services/auth.service';
import { NotificationService, NotificationBadges } from './services/notifications.service';
import { LoginComponent } from './components/login/login';
import { BugReportDialogComponent } from './components/shared/bug-report-dialog';
import { Azienda } from './models';
import { SwUpdate } from '@angular/service-worker';

interface NavItem {
  label: string;
  icon: string;
  route?: string;
  children?: NavItem[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatToolbarModule, MatListModule,
    MatIconModule, MatExpansionModule, MatButtonModule, MatTooltipModule,
    MatBadgeModule, MatInputModule, MatFormFieldModule, FormsModule,
    LoginComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  azienda: Azienda | null = null;
  collapsed = false;
  loggedIn = false;
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
  ) {
    this.loggedIn = authSvc.isLoggedIn();
  }

  ngOnInit() {
    this.darkMode = localStorage.getItem('dark-mode') === '1';
    document.body.classList.toggle('dark-mode', this.darkMode);

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
    this.ds.getAzienda().subscribe({ next: a => this.azienda = a, error: () => {} });
    if (window.innerWidth < 768) this.collapsed = true;

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
    if (window.innerWidth < 768) this.collapsed = true;
    this.notifSvc.start();
  }

  logout() {
    this.authSvc.logout();
    this.loggedIn = false;
    this.azienda = null;
    this.notifSvc.stop();
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
        const oggi = new Date().toISOString().slice(0, 10);
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

  openBugReport() {
    const pagina = this.router.url.replace(/^\//, '').split('/')[0];
    this.dialog.open(BugReportDialogComponent, { data: { pagina }, width: '540px' });
  }

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',    icon: 'dashboard',      route: '/dashboard' },
    { label: 'Prodotti',     icon: 'inventory_2',    route: '/prodotti' },
    {
      label: 'Magazzino', icon: 'warehouse',
      children: [
        { label: 'Movimenti',     icon: 'warehouse',       route: '/magazzino' },
        { label: 'Arrivi Merce',  icon: 'move_to_inbox',   route: '/arrivi-merce' },
      ]
    },
    { label: 'Clienti',      icon: 'people',         route: '/clienti' },
    { label: 'Fornitori',    icon: 'local_shipping', route: '/fornitori' },
    {
      label: 'Documenti', icon: 'description',
      children: [
        { label: 'DDT',             icon: 'receipt_long',  route: '/ddt' },
        { label: 'Fatture',         icon: 'receipt',       route: '/fatture' },
        { label: 'Note di Credito', icon: 'note_alt',      route: '/note-credito' },
        { label: 'Ordini',          icon: 'shopping_cart', route: '/ordini' },
        { label: 'Preventivi',      icon: 'request_quote', route: '/preventivi' },
        { label: 'Acquisti',        icon: 'shopping_bag',  route: '/acquisti' },
        { label: 'Ricorrenti',      icon: 'autorenew',     route: '/fatture-ricorrenti' },
      ]
    },
    { label: 'Vendita al banco', icon: 'point_of_sale', route: '/vendita-banco' },
    { label: 'Pagamenti',    icon: 'payments',       route: '/pagamenti' },
    { label: 'Scadenzario', icon: 'event',           route: '/scadenzario' },
    { label: 'Prima Nota',   icon: 'menu_book',       route: '/prima-nota' },
    { label: 'Report',       icon: 'bar_chart',      route: '/report' },
    { label: 'Impostazioni', icon: 'settings',       route: '/impostazioni' },
  ];

  get flatNavItems(): NavItem[] {
    return this.navItems.flatMap(item => item.children ?? [item]);
  }
}

import { Component, OnInit, HostListener, ElementRef } from '@angular/core';
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
import { FormsModule } from '@angular/forms';
import { DataService } from './services/data.service';
import { AuthService } from './services/auth.service';
import { NotificationService, NotificationBadges } from './services/notifications.service';
import { LoginComponent } from './components/login/login';
import { Azienda } from './models';

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
    LoginComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  azienda: Azienda | null = null;
  collapsed = false;
  loggedIn = false;
  badges: NotificationBadges = { scadenzeScadute: 0, prodottiSottoSoglia: 0, solleciti: 0 };
  darkMode = false;
  searchQuery = '';
  searchResults: { label: string; tipo: string; route: string; id: number }[] = [];
  showSearch = false;
  private searchSubject = new Subject<string>();

  constructor(
    private ds: DataService,
    private authSvc: AuthService,
    private notifSvc: NotificationService,
    private router: Router,
    private elRef: ElementRef
  ) {
    this.loggedIn = authSvc.isLoggedIn();
  }

  ngOnInit() {
    this.darkMode = localStorage.getItem('dark-mode') === '1';
    document.body.classList.toggle('dark-mode', this.darkMode);

    if (!this.loggedIn) return;
    this.ds.getAzienda().subscribe({ next: a => this.azienda = a, error: () => {} });
    if (window.innerWidth < 768) this.collapsed = true;

    this.notifSvc.start();
    this.notifSvc.badges.subscribe(b => this.badges = b);

    this.searchSubject.pipe(
      debounceTime(250), distinctUntilChanged(),
      switchMap(q => q.length >= 2 ? this.ds.searchGlobal(q) : [{ clienti: [], prodotti: [], fatture: [], ddt: [] }])
    ).subscribe(r => {
      this.searchResults = [
        ...r.clienti.map((x: any) => ({ ...x, tipo: 'Cliente' })),
        ...r.prodotti.map((x: any) => ({ ...x, tipo: 'Prodotto' })),
        ...r.fatture.map((x: any) => ({ ...x, tipo: 'Fattura' })),
        ...r.ddt.map((x: any)    => ({ ...x, tipo: 'DDT' })),
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
  }

  toggleDark() {
    this.darkMode = !this.darkMode;
    document.body.classList.toggle('dark-mode', this.darkMode);
    localStorage.setItem('dark-mode', this.darkMode ? '1' : '0');
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
      ]
    },
    { label: 'Vendita al banco', icon: 'point_of_sale', route: '/vendita-banco' },
    { label: 'Pagamenti',    icon: 'payments',       route: '/pagamenti' },
    { label: 'Report',       icon: 'bar_chart',      route: '/report' },
    { label: 'Impostazioni', icon: 'settings',       route: '/impostazioni' },
  ];

  get flatNavItems(): NavItem[] {
    return this.navItems.flatMap(item => item.children ?? [item]);
  }
}

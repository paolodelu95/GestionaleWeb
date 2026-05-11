import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { DataService } from './services/data.service';
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
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatExpansionModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  azienda: Azienda | null = null;

  constructor(private ds: DataService) {}

  ngOnInit() {
    this.ds.getAzienda().subscribe({ next: a => this.azienda = a, error: () => {} });
  }

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',    icon: 'dashboard',      route: '/dashboard' },
    { label: 'Prodotti',     icon: 'inventory_2',    route: '/prodotti' },
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
    { label: 'Scadenzario',  icon: 'event',          route: '/scadenzario' },
    { label: 'Pagamenti',    icon: 'payments',       route: '/pagamenti' },
    { label: 'Report',       icon: 'bar_chart',      route: '/report' },
    { label: 'Impostazioni', icon: 'settings',       route: '/impostazioni' },
  ];
}

import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard',    loadComponent: () => import('./components/dashboard/dashboard').then(m => m.DashboardComponent) },
  { path: 'prodotti',     loadComponent: () => import('./components/prodotti/prodotti').then(m => m.ProdottiComponent) },
  { path: 'clienti',      loadComponent: () => import('./components/clienti/clienti').then(m => m.ClientiComponent) },
  { path: 'fornitori',    loadComponent: () => import('./components/fornitori/fornitori').then(m => m.FornitoriComponent) },
  { path: 'ddt',          loadComponent: () => import('./components/ddt/ddt').then(m => m.DdtComponent) },
  { path: 'fatture',      loadComponent: () => import('./components/fatture/fatture').then(m => m.FattureComponent) },
  { path: 'note-credito', loadComponent: () => import('./components/note-credito/note-credito').then(m => m.NoteCreditoComponent) },
  { path: 'ordini',       loadComponent: () => import('./components/ordini/ordini').then(m => m.OrdiniComponent) },
  { path: 'preventivi',   loadComponent: () => import('./components/preventivi/preventivi').then(m => m.PreventiviComponent) },
  { path: 'acquisti',     loadComponent: () => import('./components/acquisti/acquisti').then(m => m.AcquistiComponent) },
  { path: 'pagamenti',    loadComponent: () => import('./components/pagamenti/pagamenti').then(m => m.PagamentiComponent) },
  { path: 'magazzino',      loadComponent: () => import('./components/magazzino/magazzino').then(m => m.MagazzinoComponent) },
  { path: 'vendita-banco',  loadComponent: () => import('./components/vendita-banco/vendita-banco').then(m => m.VenditaBancoComponent) },
  { path: 'report',       loadComponent: () => import('./components/report/report').then(m => m.ReportComponent) },
  { path: 'impostazioni', loadComponent: () => import('./components/impostazioni/impostazioni').then(m => m.ImpostazioniComponent) },
];

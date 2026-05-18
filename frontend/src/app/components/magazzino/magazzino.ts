import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';
import { MovimentoMagazzino, GiacenzaStorica, Prodotto, Cliente } from '../../models';

@Component({
  selector: 'app-magazzino',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatTabsModule, MatTooltipModule, MatSnackBarModule,
  ],
  templateUrl: './magazzino.html',
  styles: [`
    .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,.08); overflow-x: auto; padding: 0; }
    .filter-bar { display: flex; flex-wrap: wrap; gap: 10px; padding: 16px; border-bottom: 1px solid #f1f5f9; align-items: center; }
    .filter-bar mat-select { min-width: 150px; }
    .filter-bar input[type=date] { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 13px; color: #334155; height: 36px; }
    .filter-label { font-size: 12px; color: #94a3b8; font-weight: 600; letter-spacing:.5px; }
    .filter-group { display: flex; align-items: center; gap: 6px; }
    mat-table { width: 100%; }
    th.mat-header-cell { font-weight: 700; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .5px; background: #f8fafc; }
    td.mat-cell { font-size: 13px; color: #334155; padding: 8px 16px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .chip.carico  { background: #dcfce7; color: #15803d; }
    .chip.scarico { background: #fee2e2; color: #dc2626; }
    .causale-label { font-size: 11px; color: #64748b; font-weight: 600; }
    .doc-link { font-weight: 600; color: #4f46e5; }
    .empty-msg { text-align: center; padding: 40px; color: #94a3b8; }
    .storico-bar { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
    .storico-bar input[type=date] { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; font-size: 14px; }
    .qty-low { color: #dc2626; font-weight: 700; }
    .qty-ok  { color: #15803d; font-weight: 700; }
    .summary-bar { display: flex; gap: 20px; padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
    .summary-item { font-size: 13px; color: #64748b; }
    .summary-item b { color: #1a1a2e; }
  `]
})
export class MagazzinoComponent implements OnInit, AfterViewInit {

  // ── Movimenti ──────────────────────────────────────────────────────────────
  movimenti: MovimentoMagazzino[] = [];
  dsMovimenti = new MatTableDataSource<MovimentoMagazzino>([]);
  colMovimenti = ['data', 'prodotto', 'variante', 'tipo', 'quantita', 'causale', 'documento', 'controparte'];

  filtroProdotto: number | null = null;
  filtroCliente: number | null = null;
  filtroTipo: string = '';
  filtroAnno: number | null = null;
  filtroMese: number | null = null;
  filtroDataFrom: string = '';
  filtroDataTo: string = '';

  prodottiList: Prodotto[] = [];
  clientiList: Cliente[] = [];

  anni: number[] = [];
  mesi = [
    { v: 1, l: 'Gennaio' }, { v: 2, l: 'Febbraio' }, { v: 3, l: 'Marzo' },
    { v: 4, l: 'Aprile' },  { v: 5, l: 'Maggio' },   { v: 6, l: 'Giugno' },
    { v: 7, l: 'Luglio' },  { v: 8, l: 'Agosto' },   { v: 9, l: 'Settembre' },
    { v: 10, l: 'Ottobre' },{ v: 11, l: 'Novembre' },{ v: 12, l: 'Dicembre' },
  ];
  causali = [
    { v: 'DDT', l: 'DDT' }, { v: 'FATTURA', l: 'Fattura' },
    { v: 'STORNO', l: 'Storno' }, { v: 'ELIMINAZIONE', l: 'Eliminazione' },
    { v: 'ANNULLAMENTO', l: 'Annullamento' }, { v: 'RIATTIVAZIONE', l: 'Riattivazione' },
  ];
  filtroCausale: string = '';

  get hasFiltri(): boolean {
    return !!(this.filtroProdotto || this.filtroCliente || this.filtroTipo || this.filtroAnno || this.filtroMese || this.filtroDataFrom || this.filtroDataTo || this.filtroCausale);
  }

  get totaleCarichi(): number { return this.movimenti.filter(m => m.tipo === 'CARICO').reduce((s, m) => s + m.quantita, 0); }
  get totaleScarichi(): number { return this.movimenti.filter(m => m.tipo === 'SCARICO').reduce((s, m) => s + m.quantita, 0); }

  @ViewChild('sortMov') sortMov!: MatSort;

  // ── Storico ────────────────────────────────────────────────────────────────
  dataStorico: string = '';
  giacenze: GiacenzaStorica[] = [];
  dsStorico = new MatTableDataSource<GiacenzaStorica>([]);
  colStorico = ['nome', 'categoria', 'quantita', 'unitaMisura', 'sogliaMinima'];
  loadingStorico = false;
  searchStorico = '';

  @ViewChild('sortStor') sortStor!: MatSort;

  constructor(private ds: DataService, private snack: MatSnackBar) {}

  ngOnInit() {
    const y = new Date().getFullYear();
    this.anni = Array.from({ length: 5 }, (_, i) => y - i);
    this.ds.getProdotti().subscribe(p => this.prodottiList = p);
    this.ds.getClienti().subscribe(c => this.clientiList = c);
    this.loadMovimenti();
  }

  ngAfterViewInit() {
    this.dsMovimenti.sort = this.sortMov;
    this.dsMovimenti.sortingDataAccessor = (item, col) => {
      if (col === 'data') return item.data;
      if (col === 'quantita') return item.quantita;
      if (col === 'prodotto') return item.prodottoNome || '';
      return '';
    };
    this.dsStorico.sort = this.sortStor;
    this.dsStorico.sortingDataAccessor = (item, col) => {
      if (col === 'quantita') return item.quantita;
      if (col === 'nome') return item.nome;
      return (item as any)[col] ?? '';
    };
    this.dsStorico.filterPredicate = (item, f) =>
      [item.nome, item.categoria].some(v => v?.toLowerCase().includes(f));
  }

  loadMovimenti() {
    const f: Record<string, any> = {};
    if (this.filtroProdotto) f['prodottoId'] = this.filtroProdotto;
    if (this.filtroCliente)  f['clienteId']  = this.filtroCliente;
    if (this.filtroTipo)     f['tipo']        = this.filtroTipo;
    if (this.filtroCausale)  f['causale']     = this.filtroCausale;
    if (this.filtroAnno)     f['anno']        = this.filtroAnno;
    if (this.filtroMese)     f['mese']        = this.filtroMese;
    if (this.filtroDataFrom) f['dataFrom']    = this.filtroDataFrom;
    if (this.filtroDataTo)   f['dataTo']      = this.filtroDataTo;
    this.ds.getMovimentiMagazzino(f).subscribe({
      next: data => { this.movimenti = data; this.dsMovimenti.data = data; },
      error: () => this.snack.open('Errore caricamento movimenti', '', { duration: 2000 })
    });
  }

  resetFiltri() {
    this.filtroProdotto = null; this.filtroCliente = null; this.filtroTipo = '';
    this.filtroCausale = ''; this.filtroAnno = null; this.filtroMese = null;
    this.filtroDataFrom = ''; this.filtroDataTo = '';
    this.loadMovimenti();
  }

  loadStorico() {
    if (!this.dataStorico) return;
    this.loadingStorico = true;
    this.ds.getMagazzinoStorico(this.dataStorico).subscribe({
      next: data => { this.giacenze = data; this.dsStorico.data = data; this.loadingStorico = false; },
      error: () => { this.snack.open('Errore caricamento storico', '', { duration: 2000 }); this.loadingStorico = false; }
    });
  }

  filterStorico(e: Event) {
    const v = (e.target as HTMLInputElement).value.toLowerCase();
    this.searchStorico = v;
    this.dsStorico.filter = v;
  }

  labelCausale(causale: string): string {
    const map: Record<string, string> = {
      DDT: 'DDT', FATTURA: 'Fattura', STORNO: 'Storno',
      ELIMINAZIONE: 'Eliminazione', ANNULLAMENTO: 'Annullamento', RIATTIVAZIONE: 'Riattivazione',
    };
    return map[causale] || causale;
  }

  fd(s: string): string {
    if (!s) return '—';
    const p = s.substring(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
  }
}

import { Component, OnInit, AfterViewInit, ViewChild, Inject } from '@angular/core';
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
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { EmptyStateComponent } from '../shared/empty-state';
import { InventarioScanComponent } from './inventario-scan';
import { DataService } from '../../services/data.service';
import { MovimentoMagazzino, GiacenzaStorica, Prodotto, Cliente, PropostaRiordino } from '../../models';

// ── Rettifica giacenza con scelta prodotto (dal Magazzino) ───────────────────
@Component({
  selector: 'app-magazzino-rettifica-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Rettifica giacenza</h2>
    <mat-dialog-content style="min-width:380px">
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Prodotto *</mat-label>
        <mat-select [(ngModel)]="prodottoId" (ngModelChange)="onProdotto()">
          @for (p of data.prodotti; track p.id) {
            <mat-option [value]="p.id">{{ p.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (sel) {
        <p style="margin:0 0 12px;font-size:13px;color:var(--text-tertiary,#94a3b8)">
          Giacenza attuale: <b>{{ sel.quantita }}</b> {{ sel.unitaMisura || '' }}
        </p>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Nuova giacenza reale *</mat-label>
          <input matInput type="number" step="0.001" [(ngModel)]="nuova" (keyup.enter)="save()">
        </mat-form-field>
        @if (nuova !== null && delta !== 0) {
          <p style="margin:-6px 0 12px;font-size:13px" [style.color]="delta > 0 ? '#16a34a' : '#dc2626'">
            <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle">{{ delta > 0 ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
            {{ delta > 0 ? '+' : '' }}{{ delta }} — verrà registrato un movimento di rettifica.
          </p>
        }
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Motivo (facoltativo)</mat-label>
          <input matInput [(ngModel)]="note" placeholder="es. inventario, rottura, ammanco…">
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!sel || nuova === null">Salva rettifica</button>
    </mat-dialog-actions>`
})
export class MagazzinoRettificaDialogComponent {
  prodottoId: number | null = null;
  nuova: number | null = null;
  note = '';
  sel: Prodotto | null = null;
  constructor(
    public dialogRef: MatDialogRef<MagazzinoRettificaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { prodotti: Prodotto[] }
  ) {}
  onProdotto() {
    this.sel = this.data.prodotti.find(p => p.id === this.prodottoId) || null;
    this.nuova = this.sel?.quantita ?? 0;
  }
  get delta(): number { return (this.nuova ?? 0) - (this.sel?.quantita ?? 0); }
  save() {
    if (this.sel && this.nuova !== null)
      this.dialogRef.close({ prodottoId: this.sel.id, quantita: this.nuova, note: this.note });
  }
}

@Component({
  selector: 'app-magazzino',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatTabsModule, MatTooltipModule, MatSnackBarModule, MatDialogModule, EmptyStateComponent,
  ],
  templateUrl: './magazzino.html',
  styles: [`
    .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .card { background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-xs); border: 1px solid var(--border-subtle); overflow-x: auto; padding: 0; }
    .filter-bar { display: flex; flex-wrap: wrap; gap: 10px; padding: 16px; border-bottom: 1px solid var(--border-subtle); align-items: center; }
    .filter-bar mat-select { min-width: 150px; }
    .filter-bar input[type=date] { border: 1px solid var(--border-strong); border-radius: 6px; padding: 6px 10px; font-size: 13px; color: var(--text-primary); background: var(--bg-surface); height: 36px; }
    .filter-label { font-size: 12px; color: var(--text-tertiary); font-weight: 600; letter-spacing:.5px; }
    .filter-group { display: flex; align-items: center; gap: 6px; }
    mat-table { width: 100%; }
    th.mat-header-cell { font-weight: 700; font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .5px; background: var(--bg-surface-2); }
    td.mat-cell { font-size: 13px; color: var(--text-primary); padding: 8px 16px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .chip.carico  { background: var(--success-soft); color: var(--success-on); }
    .chip.scarico { background: var(--danger-soft); color: var(--danger-on); }
    .causale-label { font-size: 11px; color: var(--text-tertiary); font-weight: 600; }
    .doc-link { font-weight: 600; color: var(--primary); }
    .empty-msg { text-align: center; padding: 40px; color: var(--text-tertiary); }
    .storico-bar { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border-subtle); flex-wrap: wrap; }
    .storico-bar input[type=date] { border: 1px solid var(--border-strong); border-radius: 6px; padding: 8px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg-surface); }
    .qty-low { color: var(--danger-on); font-weight: 700; }
    .qty-ok  { color: var(--success-on); font-weight: 700; }
    .summary-bar { display: flex; gap: 20px; padding: 12px 16px; background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
    .summary-item { font-size: 13px; color: var(--text-secondary); }
    .summary-item b { color: var(--text-primary); }
    .riordino-table { width: 100%; border-collapse: collapse; }
    .riordino-table th { font-weight: 700; font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .5px; background: var(--bg-surface-2); padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border-subtle); }
    .riordino-table td { font-size: 13px; color: var(--text-primary); padding: 8px 16px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    .riordino-no-forn { opacity: .65; }
    .riordino-qty { width: 90px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 6px 8px; font-size: 13px; text-align: right; background: var(--bg-surface); color: var(--text-primary); }
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
    { v: 'RETTIFICA', l: 'Rettifica' },
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

  // ── Da riordinare ────────────────────────────────────────────────────────
  proposte: PropostaRiordino[] = [];
  generando = false;
  selectedTab = 0;

  loadProposte() {
    this.ds.getProposteRiordino().subscribe(p => {
      this.proposte = p.map(x => ({ ...x, selected: x.fornitoreId != null }));
    });
  }
  get proposteSelezionate(): PropostaRiordino[] {
    return this.proposte.filter(p => p.selected && p.fornitoreId);
  }
  generaOrdini() {
    const items = this.proposteSelezionate.map(p => ({
      prodottoId: p.prodottoId, quantita: p.quantitaSuggerita, fornitoreId: p.fornitoreId!,
    }));
    if (!items.length) { this.snack.open('Seleziona almeno un prodotto con fornitore preferito', '', { duration: 2800 }); return; }
    this.generando = true;
    this.ds.generaRiordino(items).subscribe({
      next: r => {
        this.generando = false;
        const n = r.created.length;
        this.snack.open(`${n} ordine${n === 1 ? '' : 'i'} fornitore creat${n === 1 ? 'o' : 'i'}`, '', { duration: 3000, panelClass: 'snack-ok' });
        this.loadProposte();
      },
      error: e => { this.generando = false; this.snack.open(e.error?.error || 'Errore generazione ordini', '', { duration: 3000 }); },
    });
  }

  constructor(private ds: DataService, private snack: MatSnackBar, private dialog: MatDialog, private route: ActivatedRoute) {}

  openRettifica() {
    this.dialog.open(MagazzinoRettificaDialogComponent, { data: { prodotti: this.prodottiList }, width: '440px' })
      .afterClosed().subscribe(res => {
        if (!res) return;
        this.ds.rettificaGiacenza(res.prodottoId, res.quantita, res.note).subscribe({
          next: () => {
            this.snack.open('Giacenza aggiornata', '', { duration: 2000 });
            this.ds.getProdotti().subscribe(p => this.prodottiList = p);
            this.loadMovimenti();
          },
          error: e => this.snack.open(e.error?.error || 'Errore rettifica', '', { duration: 3000 })
        });
      });
  }

  openInventario() {
    this.dialog.open(InventarioScanComponent, {
      data: { prodotti: this.prodottiList },
      panelClass: 'inventario-scan-dialog',
      maxWidth: '560px', width: '96vw', height: '92vh', maxHeight: '92vh',
      autoFocus: false,
    }).afterClosed().subscribe(res => {
      if (!res) return;
      const n = res.movimenti;
      this.snack.open(
        n ? `Inventario applicato: ${n} giacenz${n === 1 ? 'a aggiornata' : 'e aggiornate'}`
          : 'Inventario applicato: nessuna differenza rilevata',
        '', { duration: 3000, panelClass: 'snack-ok' });
      this.ds.getProdotti().subscribe(p => this.prodottiList = p);
      this.loadMovimenti();
    });
  }

  ngOnInit() {
    const y = new Date().getFullYear();
    this.anni = Array.from({ length: 5 }, (_, i) => y - i);
    this.ds.getProdotti().subscribe(p => this.prodottiList = p);
    this.ds.getClienti().subscribe(c => this.clientiList = c);
    this.loadMovimenti();
    this.loadProposte();
    this.route.queryParams.subscribe(q => { if (q['tab'] === 'riordino') this.selectedTab = 2; });
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
      DDT: 'DDT', FATTURA: 'Fattura', RETTIFICA: 'Rettifica', STORNO: 'Storno',
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

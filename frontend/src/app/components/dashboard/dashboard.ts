import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { DataService } from '../../services/data.service';
import { Prodotto, Ddt, Fattura, Acquisto, TipoPagamento,
         StatsVenditeMensili, StatsTopProdotto, StatsCashflow, StatsKpiAnno } from '../../models';

Chart.register(...registerables);

export interface DashboardWidget {
  id: string;
  label: string;
  icon: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'alerts',          label: 'Avvisi',                  icon: 'warning',       visible: true },
  { id: 'kpi-magazzino',   label: 'KPI magazzino e clienti', icon: 'analytics',     visible: true },
  { id: 'kpi-anno',        label: 'KPI anno + cashflow',     icon: 'monitoring',    visible: true },
  { id: 'chart-vendite',   label: 'Grafico vendite mensili', icon: 'bar_chart',     visible: true },
  { id: 'chart-top',       label: 'Top 5 prodotti',          icon: 'pie_chart',     visible: true },
  { id: 'table-sotto',     label: 'Prodotti sotto soglia',   icon: 'inventory',     visible: true },
  { id: 'table-ddt',       label: 'DDT da fatturare',        icon: 'receipt_long',  visible: true },
  { id: 'table-incassare', label: 'Fatture da incassare',    icon: 'request_quote', visible: true },
  { id: 'table-pagare',    label: 'Fatture da pagare',       icon: 'payments',      visible: true },
];

const LS_KEY = 'dashboard-widgets-v1';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    MatCardModule, MatTableModule, MatIconModule, MatButtonModule, MatMenuModule,
    MatTooltipModule, MatCheckboxModule, MatSnackBarModule, DragDropModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartVendite') chartVenditeRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartTop')     chartTopRef!: ElementRef<HTMLCanvasElement>;

  prodottiCount = 0;
  valoremagazzino = 0;
  ordiniAperti = 0;
  clientiCount = 0;

  kpi: StatsKpiAnno = { fatturato: 0, costi: 0, margine: 0 };
  cashflow: StatsCashflow = { daIncassare: 0, daPagare: 0 };

  prodottiSottoSoglia: Prodotto[] = [];
  ddtDaFatturare: Ddt[] = [];
  fattureDaIncassare: Fattura[] = [];
  fattureDaPagare: Acquisto[] = [];
  tipiPagamento: TipoPagamento[] = [];

  ddtCols = ['numero', 'dataEmissione', 'clienteNome', 'totale', 'azione'];
  fattureCols = ['numero', 'dataEmissione', 'clienteNome', 'totale'];
  acquistiCols = ['numero', 'dataEmissione', 'fornitoreNome', 'totale'];
  prodottiCols = ['nome', 'categoria', 'quantita', 'sogliaMinima'];

  readonly oggi = new Date().toISOString().substring(0, 10);

  // ── Customization state ────────────────────────────────────────────────────
  widgets: DashboardWidget[] = [];
  editMode = false;

  private venditeMensili: StatsVenditeMensili[] = [];
  private topProdotti: StatsTopProdotto[] = [];
  private chartsReady = false;
  private dataReady = false;
  private chartVendite?: Chart;
  private chartTop?: Chart;

  constructor(private ds: DataService, private snack: MatSnackBar) {
    this.loadWidgets();
  }

  ngOnInit() {
    forkJoin({
      count: this.ds.getProdottiCount(),
      valore: this.ds.getProdottiValore(),
      ordini: this.ds.getOrdiniApertiCount(),
      clienti: this.ds.getClientiCount(),
      sotto: this.ds.getProdottiSottoSoglia(),
      ddt: this.ds.getDdt(),
      fatture: this.ds.getFatture(),
      acquisti: this.ds.getAcquisti(),
      tipi: this.ds.getTipiPagamento(),
      vendite: this.ds.getVenditeMensili(),
      top: this.ds.getTopProdotti(),
      cashflow: this.ds.getCashflow(),
      kpi: this.ds.getKpiAnno(),
    }).subscribe(r => {
      this.prodottiCount = r.count;
      this.valoremagazzino = r.valore;
      this.ordiniAperti = r.ordini;
      this.clientiCount = r.clienti;
      this.prodottiSottoSoglia = r.sotto;
      this.tipiPagamento = r.tipi;
      this.kpi = r.kpi;
      this.cashflow = r.cashflow;
      this.venditeMensili = r.vendite;
      this.topProdotti = r.top;
      this.ddtDaFatturare = r.ddt
        .filter(d => !d.fatturaId && d.stato !== 'ANNULLATO')
        .slice(0, 10);
      this.fattureDaIncassare = r.fatture
        .filter(f => f.stato === 'EMESSA')
        .slice(0, 10);
      this.fattureDaPagare = r.acquisti
        .filter(a => a.stato !== 'PAGATA' && a.stato !== 'ANNULLATA')
        .slice(0, 10);
      this.dataReady = true;
      this.tryRenderCharts();
    });
  }

  ngAfterViewInit() {
    this.chartsReady = true;
    this.tryRenderCharts();
  }

  ngOnDestroy() {
    this.chartVendite?.destroy();
    this.chartTop?.destroy();
  }

  // ── Widget management ──────────────────────────────────────────────────────
  private loadWidgets() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved: DashboardWidget[] = JSON.parse(raw);
        // Merge: keep user's order and visibility, add any new default widgets at the end
        const savedIds = new Set(saved.map(w => w.id));
        const missing = DEFAULT_WIDGETS.filter(w => !savedIds.has(w.id));
        this.widgets = saved
          .filter(w => DEFAULT_WIDGETS.some(d => d.id === w.id))
          .map(w => {
            const def = DEFAULT_WIDGETS.find(d => d.id === w.id)!;
            return { ...def, visible: w.visible };
          })
          .concat(missing);
        return;
      }
    } catch {}
    this.widgets = [...DEFAULT_WIDGETS];
  }

  private saveWidgets() {
    localStorage.setItem(LS_KEY, JSON.stringify(this.widgets));
  }

  isVisible(id: string): boolean {
    return this.widgets.find(w => w.id === id)?.visible ?? true;
  }

  toggleEdit() {
    this.editMode = !this.editMode;
    if (!this.editMode) this.tryRenderCharts();
  }

  toggleVisible(w: DashboardWidget) {
    w.visible = !w.visible;
    this.saveWidgets();
    if (w.visible) this.tryRenderCharts();
  }

  dropWidget(event: CdkDragDrop<DashboardWidget[]>) {
    moveItemInArray(this.widgets, event.previousIndex, event.currentIndex);
    this.saveWidgets();
    this.tryRenderCharts();
  }

  resetWidgets() {
    if (!confirm('Ripristinare la dashboard di default?')) return;
    this.widgets = [...DEFAULT_WIDGETS];
    this.saveWidgets();
    this.tryRenderCharts();
  }

  // ── Charts ─────────────────────────────────────────────────────────────────
  private tryRenderCharts() {
    if (!this.chartsReady || !this.dataReady) return;
    setTimeout(() => {
      this.renderVenditeChart();
      this.renderTopChart();
    }, 50);
  }

  private renderVenditeChart() {
    if (!this.chartVenditeRef || !this.isVisible('chart-vendite')) return;
    this.chartVendite?.destroy();
    const labels = this.venditeMensili.map(v => v.mese);
    const data = this.venditeMensili.map(v => v.imponibile);
    this.chartVendite = new Chart(this.chartVenditeRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Imponibile (€)',
          data,
          backgroundColor: 'rgba(99,102,241,0.7)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v: any) => `€${Number(v).toLocaleString('it-IT')}` } } }
      }
    });
  }

  private renderTopChart() {
    if (!this.chartTopRef || !this.topProdotti.length || !this.isVisible('chart-top')) return;
    this.chartTop?.destroy();
    const top5 = this.topProdotti.slice(0, 5);
    const colors = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];
    this.chartTop = new Chart(this.chartTopRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: top5.map(p => p.nome || 'N/D'),
        datasets: [{ data: top5.map(p => p.fatturato), backgroundColor: colors }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  getScadenza(f: Fattura): string | null {
    if (!f.tipoPagamentoId) return null;
    const tp = this.tipiPagamento.find(t => t.id === f.tipoPagamentoId);
    if (!tp) return null;
    const d = new Date(f.dataEmissione);
    d.setDate(d.getDate() + (tp.giorniScadenza || 0));
    if (tp.fineMese) { d.setMonth(d.getMonth() + 1); d.setDate(0); }
    return d.toISOString().substring(0, 10);
  }

  isScaduta(f: Fattura): boolean {
    const scadenza = this.getScadenza(f);
    return !!scadenza && scadenza < this.oggi;
  }

  giorniRitardo(f: Fattura): number {
    const scadenza = this.getScadenza(f);
    if (!scadenza) return 0;
    const ms = new Date(this.oggi).getTime() - new Date(scadenza).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }

  get fattureSCadute(): number {
    return this.fattureDaIncassare.filter(f => this.isScaduta(f)).length;
  }

  get visibleCount(): number {
    return this.widgets.filter(w => w.visible).length;
  }

  convertiDdtInFattura(d: Ddt) {
    this.ds.ddtToFattura(d.id!).subscribe({
      next: r => {
        this.ddtDaFatturare = this.ddtDaFatturare.filter(x => x.id !== d.id);
        this.snack.open(`Fattura ${r.numero} creata`, '', { duration: 3000 });
      },
      error: () => this.snack.open('Errore nella creazione fattura', '', { duration: 3000 }),
    });
  }
}

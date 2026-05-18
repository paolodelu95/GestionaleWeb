import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../services/data.service';

interface ScadenzarioItem {
  id: number;
  numero: string;
  tipo: 'fattura' | 'acquisto';
  direzione: 'ENTRATA' | 'USCITA';
  dataScadenza: string | null;
  dataEmissione: string;
  totale: number;
  stato: string;
  controparte: string | null;
  giorniMancanti: number | null;
  scaduto: boolean;
}

@Component({
  selector: 'app-scadenzario',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatButtonModule, MatIconModule,
    MatSelectModule, MatFormFieldModule, MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './scadenzario.html',
  styleUrl: './scadenzario.scss',
})
export class ScadenzarioComponent implements OnInit, AfterViewInit {
  private allItems: ScadenzarioItem[] = [];
  dataSource = new MatTableDataSource<ScadenzarioItem>();
  displayedColumns = ['direzione', 'numero', 'dataScadenza', 'controparte', 'totale', 'stato', 'giorni', 'azioni'];

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  // Filtri
  filtroMese = '';
  filtroVista: 'tutti' | 'in-scadenza' | 'scaduti' = 'tutti';

  // Mesi selezionabili: mese corrente + 5 precedenti + 5 successivi
  readonly mesiOptions: { value: string; label: string }[] = this.buildMesiOptions();

  // KPI
  get totDaIncassare() {
    return this.allItems
      .filter(i => i.direzione === 'ENTRATA')
      .reduce((s, i) => s + i.totale, 0);
  }
  get totDaPagare() {
    return this.allItems
      .filter(i => i.direzione === 'USCITA')
      .reduce((s, i) => s + i.totale, 0);
  }
  get countScaduti() {
    return this.allItems.filter(i => i.scaduto).length;
  }
  get countInScadenza30() {
    return this.allItems.filter(
      i => !i.scaduto && i.giorniMancanti !== null && i.giorniMancanti <= 30
    ).length;
  }

  constructor(private ds: DataService, private router: Router) {}

  ngOnInit() {
    this.load();
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, prop) => {
      switch (prop) {
        case 'totale':       return item.totale ?? 0;
        case 'dataScadenza': return item.dataScadenza ?? '';
        case 'giorni':       return item.giorniMancanti ?? 99999;
        default:             return (item as any)[prop] ?? '';
      }
    };
  }

  load() {
    this.ds.getScadenzarioFull(this.filtroMese || undefined).subscribe({
      next: items => {
        this.allItems = items as ScadenzarioItem[];
        this.applyVista();
      },
      error: () => { this.allItems = []; this.applyVista(); },
    });
  }

  applyVista() {
    let data = [...this.allItems];
    if (this.filtroVista === 'scaduti')     data = data.filter(i => i.scaduto);
    if (this.filtroVista === 'in-scadenza') data = data.filter(i => !i.scaduto && i.giorniMancanti !== null && i.giorniMancanti <= 30);
    this.dataSource.data = data;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  onMeseChange() { this.load(); }
  setVista(v: 'tutti' | 'in-scadenza' | 'scaduti') {
    this.filtroVista = v;
    this.applyVista();
  }

  goToPagamenti(item: ScadenzarioItem) {
    this.router.navigate(['/pagamenti']);
  }

  giorniBadgeClass(item: ScadenzarioItem): string {
    if (item.scaduto) return 'badge-scaduto';
    if (item.giorniMancanti !== null && item.giorniMancanti <= 7) return 'badge-warning';
    return 'badge-ok';
  }

  private buildMesiOptions(): { value: string; label: string }[] {
    const mesiIt = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const today = new Date();
    const options: { value: string; label: string }[] = [];
    for (let delta = -5; delta <= 6; delta++) {
      const d = new Date(today.getFullYear(), today.getMonth() + delta, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const value = `${y}-${String(m + 1).padStart(2, '0')}`;
      options.push({ value, label: `${mesiIt[m]} ${y}` });
    }
    return options;
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';
import { Prodotto, Ddt, Fattura, Acquisto, TipoPagamento } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatTableModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {
  prodottiCount = 0;
  valoremagazzino = 0;
  ordiniAperti = 0;
  clientiCount = 0;

  prodottiSottoSoglia: Prodotto[] = [];
  ddtDaFatturare: Ddt[] = [];
  fattureDaIncassare: Fattura[] = [];
  fattureDaPagare: Acquisto[] = [];
  tipiPagamento: TipoPagamento[] = [];

  ddtCols = ['numero', 'dataEmissione', 'clienteNome', 'totale'];
  fattureCols = ['numero', 'dataEmissione', 'clienteNome', 'totale'];
  acquistiCols = ['numero', 'fornitoreNome', 'totale'];
  prodottiCols = ['nome', 'categoria', 'quantita', 'sogliaMinima'];

  readonly oggi = new Date().toISOString().substring(0, 10);

  constructor(private ds: DataService) {}

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
    }).subscribe(r => {
      this.prodottiCount = r.count;
      this.valoremagazzino = r.valore;
      this.ordiniAperti = r.ordini;
      this.clientiCount = r.clienti;
      this.prodottiSottoSoglia = r.sotto;
      this.tipiPagamento = r.tipi;
      this.ddtDaFatturare = r.ddt
        .filter(d => !d.fatturaId && d.stato !== 'ANNULLATO')
        .slice(0, 10);
      this.fattureDaIncassare = r.fatture
        .filter(f => f.stato === 'EMESSA')
        .slice(0, 10);
      this.fattureDaPagare = r.acquisti
        .filter(a => a.stato !== 'PAGATA' && a.stato !== 'ANNULLATA')
        .slice(0, 10);
    });
  }

  getScadenza(f: Fattura): string | null {
    if (!f.tipoPagamentoId) return null;
    const tp = this.tipiPagamento.find(t => t.id === f.tipoPagamentoId);
    if (!tp) return null;
    const d = new Date(f.dataEmissione);
    d.setDate(d.getDate() + (tp.giorniScadenza || 0));
    if (tp.fineMese) {
      d.setMonth(d.getMonth() + 1);
      d.setDate(0);
    }
    return d.toISOString().substring(0, 10);
  }

  isScaduta(f: Fattura): boolean {
    const scadenza = this.getScadenza(f);
    if (!scadenza) return false;
    return scadenza < this.oggi;
  }
}

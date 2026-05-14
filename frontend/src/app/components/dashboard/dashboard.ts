import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';
import { Prodotto, Ddt, Fattura, Acquisto } from '../../models';

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

  ddtCols = ['numero', 'dataEmissione', 'clienteNome', 'totale'];
  fattureCols = ['numero', 'clienteNome', 'totale'];
  acquistiCols = ['numero', 'fornitoreNome', 'totale'];
  prodottiCols = ['nome', 'categoria', 'quantita', 'sogliaMinima'];

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
    }).subscribe(r => {
      this.prodottiCount = r.count;
      this.valoremagazzino = r.valore;
      this.ordiniAperti = r.ordini;
      this.clientiCount = r.clienti;
      this.prodottiSottoSoglia = r.sotto;
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
}

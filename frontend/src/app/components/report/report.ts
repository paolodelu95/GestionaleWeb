import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';

interface ReportData {
  totaleFatturato: number;
  totalePagato: number;
  totaleAperto: number;
  fatturePerStato: { stato: string; count: number; totale: number }[];
  topClienti: { nome: string; fatturato: number }[];
  prodottiLow: { nome: string; quantita: number; soglia: number }[];
}

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './report.html',
  styleUrl: './report.scss'
})
export class ReportComponent implements OnInit {
  data: ReportData | null = null;
  loading = true;

  constructor(private ds: DataService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    forkJoin({
      fatture: this.ds.getFatture(),
      pagamenti: this.ds.getPagamenti(),
      clienti: this.ds.getClienti(),
      prodotti: this.ds.getProdotti(),
      scadenzario: this.ds.getScadenzario(),
    }).subscribe(({ fatture, pagamenti, prodotti, scadenzario }) => {
      const totaleFatturato = fatture.filter(f => f.stato !== 'ANNULLATA')
        .reduce((s, f) => s + (f.totale ?? 0), 0);
      const totalePagato = pagamenti.reduce((s, p) => s + p.importo, 0);
      const totaleAperto = scadenzario.reduce((s, e) => s + (e.rimanente ?? 0), 0);

      const statiMap = new Map<string, { count: number; totale: number }>();
      fatture.forEach(f => {
        const cur = statiMap.get(f.stato) ?? { count: 0, totale: 0 };
        statiMap.set(f.stato, { count: cur.count + 1, totale: cur.totale + (f.totale ?? 0) });
      });
      const fatturePerStato = Array.from(statiMap.entries()).map(([stato, v]) => ({ stato, ...v }));

      const clientiMap = new Map<string, number>();
      fatture.filter(f => f.stato !== 'ANNULLATA' && f.clienteNome).forEach(f => {
        clientiMap.set(f.clienteNome!, (clientiMap.get(f.clienteNome!) ?? 0) + (f.totale ?? 0));
      });
      const topClienti = Array.from(clientiMap.entries())
        .map(([nome, fatturato]) => ({ nome, fatturato }))
        .sort((a, b) => b.fatturato - a.fatturato)
        .slice(0, 10);

      const prodottiLow = prodotti
        .filter(p => p.quantita != null && p.sogliaMinima != null && p.quantita <= p.sogliaMinima)
        .map(p => ({ nome: p.nome, quantita: p.quantita!, soglia: p.sogliaMinima! }));

      this.data = { totaleFatturato, totalePagato, totaleAperto, fatturePerStato, topClienti, prodottiLow };
      this.loading = false;
    });
  }
}

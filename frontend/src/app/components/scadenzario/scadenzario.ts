import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';
import { ScadenzarioEntry } from '../../models';

@Component({
  selector: 'app-scadenzario',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './scadenzario.html',
  styleUrl: './scadenzario.scss'
})
export class ScadenzarioComponent implements OnInit {
  entries: ScadenzarioEntry[] = [];
  readonly oggi = new Date().toISOString().substring(0, 10);
  displayedColumns = ['tipo', 'numero', 'dataEmissione', 'dataScadenza', 'controparte', 'tipoPagamento', 'importoTotale', 'importoPagato', 'rimanente', 'azioni'];

  constructor(private ds: DataService, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }
  load() { this.ds.getScadenzario().subscribe(e => { this.entries = e; }); }

  get totaleEntrate() { return this.entries.filter(e => e.tipoEntry === 'FATTURA').reduce((s, e) => s + (e.rimanente || 0), 0); }
  get totaleUscite() { return this.entries.filter(e => e.tipoEntry === 'ACQUISTO').reduce((s, e) => s + (e.rimanente || 0), 0); }

  salda(entry: ScadenzarioEntry) {
    const today = new Date().toISOString().substring(0, 10);
    const pagamento = {
      dataPagamento: today,
      importo: entry.rimanente,
      tipo: entry.tipoEntry === 'FATTURA' ? 'ENTRATA' : 'USCITA',
      conto: entry.conto ?? 'BANCA',
      fatturaId: entry.tipoEntry === 'FATTURA' ? entry.id : null,
      acquistoId: entry.tipoEntry === 'ACQUISTO' ? entry.id : null,
      metodo: entry.tipoPagamentoNome ?? 'Bonifico',
      note: 'Saldato da scadenzario',
    };
    this.ds.createPagamento(pagamento as any).subscribe({
      next: () => { this.load(); this.snack.open('Saldato', '', { duration: 2000 }); },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }
}

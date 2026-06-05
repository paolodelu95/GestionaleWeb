/**
 * Host dell'HARNESS DI ANTEPRIMA. Apre uno dei dialog documento (in modalità
 * creazione precompilata) in base al query param ?doc=, per gli screenshot
 * responsive. Non fa parte dell'app di produzione.
 */
import { Component, OnInit, inject, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DocLockService } from '../app/services/doc-lock.service';
import { VenditaBancoComponent } from '../app/components/vendita-banco/vendita-banco';

import { FatturaDialogComponent } from '../app/components/fatture/fatture';
import { DdtDialogComponent } from '../app/components/ddt/ddt';
import { NotaCreditoDialogComponent } from '../app/components/note-credito/note-credito';
import { PreventivoDialogComponent } from '../app/components/preventivi/preventivi';
import { OrdineDialogComponent } from '../app/components/ordini/ordini';
import { AcquistoDialogComponent } from '../app/components/acquisti/acquisti';
import { FatturaRicorrenteDialogComponent } from '../app/components/fatture-ricorrenti/fatture-ricorrenti';

const RIGHE = [
  { prodottoId: 1, codiceProdotto: 'MAT-001', descrizione: 'Cemento Portland 25kg', quantita: 50, unitaMisura: 'pz', prezzo: 8.5, sconto: 0, iva: 22, tipo: 'PRODOTTO' },
  { prodottoId: 3, codiceProdotto: 'SRV-001', descrizione: 'Manodopera posa in opera', quantita: 4, unitaMisura: 'h', prezzo: 35, sconto: 5, iva: 22, tipo: 'PRODOTTO' },
  { descrizione: 'Consegna prevista entro 10 giorni lavorativi', tipo: 'NOTA', quantita: 0, prezzo: 0, sconto: 0, iva: 0 },
];

const BASE = { numero: '42', dataEmissione: '2026-06-05', clienteId: 1, righe: RIGHE, stato: 'EMESSA' };

const DOCS: Record<string, { cmp: Type<any>; data: any }> = {
  fatture:    { cmp: FatturaDialogComponent, data: { ...BASE } },
  ddt:        { cmp: DdtDialogComponent, data: { ...BASE } },
  'note-credito': { cmp: NotaCreditoDialogComponent, data: { ...BASE, fatturaId: 5 } },
  preventivi: { cmp: PreventivoDialogComponent, data: { ...BASE, validitaGiorni: 30 } },
  ordini:     { cmp: OrdineDialogComponent, data: { ...BASE, tipo: 'CLIENTE' } },
  'ordini-fornitore': { cmp: OrdineDialogComponent, data: { numero: '42', dataEmissione: '2026-06-05', fornitoreId: 1, tipo: 'FORNITORE', righe: RIGHE } },
  acquisti:   { cmp: AcquistoDialogComponent, data: { numero: '42', dataEmissione: '2026-06-05', fornitoreId: 1, righe: RIGHE } },
  'fatture-ricorrenti': { cmp: FatturaRicorrenteDialogComponent, data: { descrizione: 'Canone mensile assistenza', frequenza: 'MENSILE', giornoEmissione: 1, prossimaEmissione: '2026-07-01', clienteId: 1, attiva: true, righe: RIGHE } },
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatDialogModule, CommonModule, VenditaBancoComponent],
  template: `
    @if (isPage) {
      <app-vendita-banco></app-vendita-banco>
    } @else {
      <div style="padding:24px;font:14px Inter,sans-serif;color:#64748b">Anteprima dialog: <b>{{ docKey }}</b></div>
    }
  `,
})
export class PreviewHostComponent implements OnInit {
  private dialog = inject(MatDialog);
  private lock = inject(DocLockService);
  docKey = '';
  isPage = false;

  ngOnInit() {
    this.lock.setEnabled(false);
    const params = new URLSearchParams(location.search);
    if (params.get('dark') === '1') document.body.classList.add('dark-mode');
    this.docKey = params.get('doc') || 'fatture';
    if (this.docKey === 'vendita-banco') { this.isPage = true; return; }
    const entry = DOCS[this.docKey] ?? DOCS['fatture'];
    this.dialog.open(entry.cmp, {
      data: entry.data,
      width: '92vw',
      maxWidth: '1400px',
      maxHeight: '94vh',
      autoFocus: false,
    });
  }
}

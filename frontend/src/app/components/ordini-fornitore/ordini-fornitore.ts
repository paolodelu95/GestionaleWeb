import { Component, OnInit, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { ConfirmService } from '../shared/confirm-dialog';
import { EmptyStateComponent } from '../shared/empty-state';
import { OrdineDialogComponent } from '../ordini/ordini';
import { Ordine, Acquisto } from '../../models';

// ── Dialog: collega fattura ricevuta (acquisto) ──────────────────────────────
@Component({
  selector: 'app-collega-fattura-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Collega fattura ricevuta</h2>
    <mat-dialog-content style="min-width:380px">
      @if (acquisti.length) {
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Fattura ricevuta (acquisto)</mat-label>
          <mat-select [(ngModel)]="acquistoId">
            <mat-option [value]="null">— nessuna —</mat-option>
            @for (a of acquisti; track a.id) {
              <mat-option [value]="a.id">{{ a.numero }} — {{ a.dataEmissione | date:'dd/MM/yyyy' }} ({{ a.totale | currency:'EUR':'symbol':'1.2-2':'it' }})</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <p style="font-size:12px;color:var(--text-tertiary);margin:0">Mostro le fatture passive di {{ data.ordine.fornitoreNome || 'questo fornitore' }}. Le fatture ricevute via SDI arrivano qui da "Acquisti".</p>
      } @else {
        <p style="font-size:13px;color:var(--text-secondary);margin:0">Nessuna fattura di acquisto trovata per questo fornitore. Le fatture ricevute via SDI compaiono in "Acquisti".</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="{ acquistoId }">Collega</button>
    </mat-dialog-actions>`,
})
export class CollegaFatturaDialogComponent {
  acquistoId: number | null;
  acquisti: Acquisto[];
  constructor(
    public dialogRef: MatDialogRef<CollegaFatturaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { ordine: Ordine; acquisti: Acquisto[] },
  ) {
    this.acquistoId = data.ordine.acquistoId ?? null;
    this.acquisti = (data.acquisti || []).filter(a => a.fornitoreId === data.ordine.fornitoreId);
  }
}

// ── Componente principale ────────────────────────────────────────────────────
@Component({
  selector: 'app-ordini-fornitore',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, MatMenuModule,
            MatTooltipModule, MatSnackBarModule, MatDialogModule, EmptyStateComponent],
  templateUrl: './ordini-fornitore.html',
})
export class OrdiniFornitoreComponent implements OnInit {
  private confirm = inject(ConfirmService);
  ordini: Ordine[] = [];
  acquisti: Acquisto[] = [];
  cols = ['numero', 'data', 'fornitore', 'stato', 'fattura', 'totale', 'azioni'];

  constructor(private ds: DataService, private dialog: MatDialog,
              private snack: MatSnackBar, private printSvc: PrintService) {}

  ngOnInit() { this.load(); this.ds.getAcquisti().subscribe(a => this.acquisti = a); }

  load() {
    this.ds.getOrdini().subscribe(o => this.ordini = o.filter(x => x.tipo === 'FORNITORE'));
  }

  private nextNumero(): string {
    const nums = this.ordini.map(o => { const m = /^RO-(\d+)$/.exec(o.numero || ''); return m ? +m[1] : 0; });
    return `RO-${Math.max(0, ...nums) + 1}`;
  }

  nuovo() {
    const numeriEsistenti = this.ordini.map(x => x.numero);
    this.dialog.open(OrdineDialogComponent, {
      data: { tipo: 'FORNITORE', numero: this.nextNumero(), numeriEsistenti }, width: '90vw', maxWidth: '1200px', maxHeight: '95vh',
    }).afterClosed().subscribe(result => {
      if (!result) return;
      result.tipo = 'FORNITORE';
      result.stato = result.stato || 'BOZZA';
      this.ds.createOrdine(result).subscribe({
        next: () => { this.load(); this.snack.open('Ordine creato', '', { duration: 2000, panelClass: 'snack-ok' }); },
        error: e => this.snack.open(e.error?.error || e.message, 'OK', { duration: 4000, panelClass: 'snack-error' }),
      });
    });
  }

  modifica(o: Ordine) {
    const numeriEsistenti = this.ordini.filter(x => x.id !== o.id).map(x => x.numero);
    this.dialog.open(OrdineDialogComponent, {
      data: { ...o, numeriEsistenti }, width: '90vw', maxWidth: '1200px', maxHeight: '95vh',
    }).afterClosed().subscribe(result => {
      if (!result) return;
      result.tipo = 'FORNITORE';
      this.ds.updateOrdine({ ...o, ...result }).subscribe({
        next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.error?.error || e.message, 'OK', { duration: 4000, panelClass: 'snack-error' }),
      });
    });
  }

  setStato(o: Ordine, stato: string) {
    this.ds.setOrdineStato(o.id!, stato).subscribe(() => { o.stato = stato; this.snack.open('Stato aggiornato', '', { duration: 1800 }); });
  }

  collegaFattura(o: Ordine) {
    this.dialog.open(CollegaFatturaDialogComponent, { data: { ordine: o, acquisti: this.acquisti }, width: '440px' })
      .afterClosed().subscribe(res => {
        if (res === undefined) return;
        this.ds.collegaAcquistoOrdine(o.id!, res.acquistoId).subscribe(() => {
          this.load();
          this.snack.open(res.acquistoId ? 'Fattura collegata' : 'Fattura scollegata', '', { duration: 1800 });
        });
      });
  }

  stampa(o: Ordine) { this.printSvc.printOrdine(o.id!); }

  async elimina(o: Ordine) {
    if (!await this.confirm.delete(`Eliminare l'ordine ${o.numero}?`)) return;
    this.ds.deleteOrdine(o.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

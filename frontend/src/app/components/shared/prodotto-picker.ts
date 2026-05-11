import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { DataService } from '../../services/data.service';
import { Prodotto } from '../../models';

@Component({
  selector: 'app-prodotto-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
            MatInputModule, MatFormFieldModule],
  template: `
    <h2 mat-dialog-title>Seleziona prodotto</h2>
    <mat-dialog-content style="width:580px; min-height:420px">
      <mat-form-field style="width:100%; margin-bottom:8px">
        <mat-label>Cerca per codice o nome</mat-label>
        <input matInput [(ngModel)]="query" (ngModelChange)="filter()" autofocus placeholder="es. PROD001 o martello">
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <div class="picker-list">
        @for (p of filtered; track p.id) {
          <div class="picker-row" (click)="select(p)">
            <span class="picker-code">{{ p.codice || '—' }}</span>
            <span class="picker-nome">{{ p.nome }}</span>
            <span class="picker-cat">{{ p.categoria }}</span>
            <span class="picker-price">{{ p.prezzo | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
            <span class="picker-iva">{{ p.iva }}%</span>
          </div>
        }
        @if (!filtered.length) {
          <p style="color:#94a3b8; padding:24px 0; text-align:center">Nessun prodotto trovato</p>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
    </mat-dialog-actions>`,
  styles: [`
    .picker-list { max-height: 380px; overflow-y: auto; }
    .picker-row {
      display: flex; align-items: center; padding: 10px 8px; cursor: pointer;
      gap: 12px; border-bottom: 1px solid #f1f5f9;
    }
    .picker-row:hover { background: #f0f4ff; }
    .picker-code { font-family: monospace; font-weight: 700; min-width: 90px; color: #4f46e5; font-size: 13px; }
    .picker-nome { flex: 1; font-weight: 500; }
    .picker-cat { color: #64748b; font-size: 12px; min-width: 80px; }
    .picker-price { color: #059669; font-weight: 600; min-width: 80px; text-align: right; }
    .picker-iva { color: #94a3b8; font-size: 12px; min-width: 40px; text-align: right; }
  `]
})
export class ProdottoPickerComponent implements OnInit {
  query = '';
  prodotti: Prodotto[] = [];
  filtered: Prodotto[] = [];

  constructor(
    private ds: DataService,
    public dialogRef: MatDialogRef<ProdottoPickerComponent>,
    @Inject(MAT_DIALOG_DATA) passedProdotti: Prodotto[]
  ) {
    // Use passed data as immediate placeholder while the fresh API call loads
    if (passedProdotti?.length) {
      this.prodotti = passedProdotti;
      this.filtered = [...passedProdotti];
    }
  }

  ngOnInit() {
    // Always fetch fresh data — fixes empty picker when dialog opens before parent API call completes
    this.ds.getProdotti().subscribe(p => {
      this.prodotti = p;
      this.filtered = this.query ? this.prodotti.filter(x =>
        (x.codice ?? '').toLowerCase().includes(this.query.toLowerCase()) ||
        x.nome.toLowerCase().includes(this.query.toLowerCase()) ||
        (x.categoria ?? '').toLowerCase().includes(this.query.toLowerCase())
      ) : [...p];
    });
  }

  filter() {
    const q = this.query.toLowerCase();
    this.filtered = this.prodotti.filter(p =>
      (p.codice ?? '').toLowerCase().includes(q) ||
      p.nome.toLowerCase().includes(q) ||
      (p.categoria ?? '').toLowerCase().includes(q)
    );
  }

  select(p: Prodotto) { this.dialogRef.close(p); }
}

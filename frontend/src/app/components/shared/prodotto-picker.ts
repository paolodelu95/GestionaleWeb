import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { DataService } from '../../services/data.service';
import { Prodotto, ProdottoVariante } from '../../models';

export interface ProdottoPick {
  prodotto: Prodotto;
  variante?: ProdottoVariante;
}

@Component({
  selector: 'app-prodotto-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
            MatInputModule, MatFormFieldModule],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px">
      @if (selectedProdotto) {
        <button mat-icon-button type="button" (click)="backToList()" style="margin-right:4px">
          <mat-icon>arrow_back</mat-icon>
        </button>
        Varianti — {{ selectedProdotto.nome }}
      } @else {
        Seleziona prodotto
      }
    </h2>
    <mat-dialog-content style="width:580px; min-height:420px">
      @if (!selectedProdotto) {
        <mat-form-field style="width:100%; margin-bottom:8px">
          <mat-label>Cerca per codice, nome o barcode</mat-label>
          <input matInput [(ngModel)]="query" (ngModelChange)="filter()" autofocus
                 placeholder="es. PROD001, maglia, o scansiona barcode">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <div class="picker-list">
          @for (p of filtered; track p.id) {
            <div class="picker-row" (click)="select(p)">
              <span class="picker-code">{{ p.codice || '—' }}</span>
              <span class="picker-nome">
                {{ p.nome }}
                @if (p.haVarianti) {
                  <span style="font-size:10px;background:#cffafe;color:#6d28d9;padding:1px 5px;border-radius:99px;margin-left:4px;font-weight:700">VARIANTI</span>
                }
              </span>
              <span class="picker-cat">{{ p.categoria }}</span>
              @if (p.barcode) { <span class="picker-barcode">{{ p.barcode }}</span> }
              <span class="picker-price">{{ p.prezzo | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
              <span class="picker-iva">{{ p.iva }}%</span>
            </div>
          }
          @if (!filtered.length) {
            <p style="color:#94a3b8; padding:24px 0; text-align:center">Nessun prodotto trovato</p>
          }
        </div>
      } @else {
        <div style="margin-bottom:12px;color:#64748b;font-size:13px">
          Seleziona la variante desiderata. Clicca il prodotto senza variante per aggiungerlo direttamente.
        </div>
        <div class="picker-list">
          <!-- Option: take the product without a specific variant -->
          <div class="picker-row picker-row-no-variant" (click)="selectWithoutVariant()">
            <mat-icon style="color:#94a3b8;font-size:18px">inventory_2</mat-icon>
            <span style="flex:1;font-style:italic;color:#64748b">Nessuna variante specifica</span>
          </div>
          @for (v of variantiList; track v.id) {
            <div class="picker-row" (click)="selectVariante(v)"
                 [style.opacity]="v.quantita === 0 ? '0.45' : '1'">
              <div style="flex:1;display:flex;align-items:center;gap:12px">
                @if (v.taglia) {
                  <span style="background:#f1f5f9;border-radius:6px;padding:3px 10px;font-weight:700;font-size:13px">{{ v.taglia }}</span>
                }
                @if (v.colore) {
                  <span style="background:#cffafe;color:#6d28d9;border-radius:6px;padding:3px 10px;font-weight:700;font-size:13px">{{ v.colore }}</span>
                }
                @if (v.barcode) {
                  <span style="font-size:11px;color:#94a3b8;font-family:monospace">{{ v.barcode }}</span>
                }
              </div>
              <span style="font-size:13px;color:#1e293b;font-weight:600">
                Qtà: {{ v.quantita }}
                @if (v.quantita === 0) { <span style="color:#ef4444;font-size:11px"> (esaurito)</span> }
              </span>
            </div>
          }
          @if (!variantiList.length) {
            <p style="color:#94a3b8;padding:24px;text-align:center">Nessuna variante configurata</p>
          }
        </div>
      }
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
    .picker-row-no-variant { border: 1px dashed #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
    .picker-code { font-family: monospace; font-weight: 700; min-width: 90px; color: #0e6480; font-size: 13px; }
    .picker-nome { flex: 1; font-weight: 500; }
    .picker-cat { color: #64748b; font-size: 12px; min-width: 80px; }
    .picker-barcode { font-family: monospace; font-size: 11px; color: #94a3b8; min-width: 100px; }
    .picker-price { color: #059669; font-weight: 600; min-width: 80px; text-align: right; }
    .picker-iva { color: #94a3b8; font-size: 12px; min-width: 40px; text-align: right; }
  `]
})
export class ProdottoPickerComponent implements OnInit {
  query = '';
  prodotti: Prodotto[] = [];
  filtered: Prodotto[] = [];
  selectedProdotto: Prodotto | null = null;
  variantiList: ProdottoVariante[] = [];

  constructor(
    private ds: DataService,
    public dialogRef: MatDialogRef<ProdottoPickerComponent>,
    // Accetta sia la lista prodotti diretta (uso legacy) sia un oggetto
    // { prodotti?, query? } per aprire il picker GIÀ filtrato sul testo digitato.
    @Inject(MAT_DIALOG_DATA) data: Prodotto[] | { prodotti?: Prodotto[]; query?: string } | null
  ) {
    const arr = Array.isArray(data) ? data : data?.prodotti;
    this.query = (Array.isArray(data) ? '' : (data?.query || '')).trim();
    if (arr?.length) {
      this.prodotti = arr;
      this.filtered = this.query ? this.applyQuery(arr) : [...arr];
    }
  }

  ngOnInit() {
    this.ds.getProdotti().subscribe(p => {
      this.prodotti = p;
      this.filtered = this.query ? this.applyQuery(p) : [...p];
    });
  }

  filter() {
    this.filtered = this.applyQuery(this.prodotti);
  }

  private applyQuery(list: Prodotto[]): Prodotto[] {
    const q = this.query.toLowerCase();
    return list.filter(p =>
      (p.codice ?? '').toLowerCase().includes(q) ||
      p.nome.toLowerCase().includes(q) ||
      (p.categoria ?? '').toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    );
  }

  select(p: Prodotto) {
    if (p.haVarianti) {
      this.selectedProdotto = p;
      this.variantiList = [];
      this.ds.getProdottoVarianti(p.id!).subscribe(v => this.variantiList = v);
    } else {
      this.dialogRef.close({ prodotto: p, variante: undefined } as ProdottoPick);
    }
  }

  selectWithoutVariant() {
    if (this.selectedProdotto) {
      this.dialogRef.close({ prodotto: this.selectedProdotto, variante: undefined } as ProdottoPick);
    }
  }

  selectVariante(v: ProdottoVariante) {
    this.dialogRef.close({ prodotto: this.selectedProdotto!, variante: v } as ProdottoPick);
  }

  backToList() {
    this.selectedProdotto = null;
    this.variantiList = [];
  }
}

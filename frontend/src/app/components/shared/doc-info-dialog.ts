import { Component, Inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DocInfoData {
  tipo: string;
  sottotitolo?: string;
  numero: string;
  data: string;
  stato: string;
  controparteLabel?: string;
  controparte?: string;
  controparteInfo?: string[];
  totale?: number;
  imponibile?: number;
  righe?: Array<{
    tipo?: string;
    descrizione: string;
    quantita: number;
    unitaMisura?: string;
    prezzo: number;
    sconto?: number;
    iva: number;
  }>;
  extraFields?: Array<{ label: string; value: string }>;
  note?: string;
}

interface IvaBreakdownRow {
  aliquota: number;
  imponibile: number;
  iva: number;
}

@Component({
  selector: 'app-doc-info-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, CurrencyPipe, DatePipe],
  template: `
    <!-- ── Header band ──────────────────────────────────────────────────────── -->
    <div class="dih-header">
      <div class="dih-header-left">
        <div class="dih-tipo">{{ data.tipo }}</div>
        @if (data.sottotitolo) {
          <div class="dih-subtitle">{{ data.sottotitolo }}</div>
        }
        <div class="dih-meta">
          <span class="dih-numero">N.&nbsp;{{ data.numero }}</span>
          <span class="dih-sep">·</span>
          <span class="dih-data">{{ data.data | date:'dd/MM/yyyy' }}</span>
        </div>
      </div>
      <div class="dih-header-right">
        <span class="dih-stato" [class]="'stato-' + (data.stato?.toLowerCase() ?? '')">{{ data.stato }}</span>
        <button class="dih-close" mat-dialog-close>
          <mat-icon>close</mat-icon>
        </button>
      </div>
    </div>

    <!-- ── Cards row ────────────────────────────────────────────────────────── -->
    <mat-dialog-content>
      @if (data.controparte || imponibileCalc != null || data.totale != null) {
        <div class="dih-cards">
          @if (data.controparte) {
            <div class="dih-card dih-card-parte">
              <div class="dih-card-lbl">{{ data.controparteLabel ?? 'CONTROPARTE' }}</div>
              <div class="dih-card-nome">{{ data.controparte }}</div>
              @for (l of data.controparteInfo ?? []; track $index) {
                <div class="dih-card-detail">{{ l }}</div>
              }
            </div>
          }
          @if (imponibileCalc != null || data.totale != null) {
            <div class="dih-card dih-card-totale">
              <div class="dih-card-lbl">RIEPILOGO IMPORTI</div>
              <div class="dih-amount-row">
                <span class="dih-amount-lbl">Imponibile</span>
                <span class="dih-amount-val">{{ imponibileCalc | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
              </div>
              <div class="dih-amount-row">
                <span class="dih-amount-lbl">IVA</span>
                <span class="dih-amount-val">{{ ivaCalc | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
              </div>
              <div class="dih-amount-row dih-amount-grand">
                <span class="dih-amount-lbl">Totale</span>
                <span class="dih-amount-val">{{ totaleCalc | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
              </div>
            </div>
          }
        </div>
      }

      <!-- ── Extra fields ──────────────────────────────────────────────────── -->
      @if (data.extraFields?.length) {
        <div class="dih-extras">
          @for (f of data.extraFields; track $index) {
            <div class="dih-extra-pill">
              <span class="dih-extra-lbl">{{ f.label }}</span>
              <span class="dih-extra-val">{{ f.value }}</span>
            </div>
          }
        </div>
      }

      <!-- ── Rows table ────────────────────────────────────────────────────── -->
      @if (data.righe?.length) {
        <div class="dih-section">
          <div class="dih-section-title">
            <mat-icon>list</mat-icon>
            Righe —
            {{ prodottoCount }} {{ prodottoCount === 1 ? 'articolo' : 'articoli' }}
          </div>
          <div class="dih-table-wrap">
          <table class="dih-table">
            <thead>
              <tr>
                <th>Descrizione</th>
                <th class="r">Q.tà</th>
                <th class="r">Prezzo netto</th>
                <th class="c">IVA</th>
                <th class="r">Imponibile</th>
                <th class="r">Ivato</th>
              </tr>
            </thead>
            <tbody>
              @for (r of data.righe; track $index) {
                @if (r.tipo === 'NOTA') {
                  <tr class="dih-row-nota">
                    <td colspan="6">
                      <mat-icon style="font-size:13px;width:13px;height:13px;vertical-align:middle;margin-right:4px;color:#a16207">sticky_note_2</mat-icon>
                      {{ r.descrizione }}
                    </td>
                  </tr>
                } @else {
                  <tr>
                    <td>{{ r.descrizione }}</td>
                    <td class="r">{{ r.quantita }}&nbsp;<span class="um">{{ r.unitaMisura ?? '' }}</span></td>
                    <td class="r">{{ r.prezzo | currency:'EUR':'symbol':'1.2-2':'it' }}
                      @if (r.sconto) { <span class="sconto">-{{ r.sconto }}%</span> }
                    </td>
                    <td class="c"><span class="iva-chip">{{ r.iva }}%</span></td>
                    <td class="r">{{ rigaNetto(r) | currency:'EUR':'symbol':'1.2-2':'it' }}</td>
                    <td class="r bold">{{ rigaIvato(r) | currency:'EUR':'symbol':'1.2-2':'it' }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
          </div>
        </div>
      }

      <!-- ── Riepilogo IVA per aliquota ─────────────────────────────────────── -->
      @if (ivaBreakdown.length > 1) {
        <div class="dih-section">
          <div class="dih-section-title">
            <mat-icon>percent</mat-icon>
            Riepilogo IVA per aliquota
          </div>
          <div class="dih-iva-grid">
            @for (b of ivaBreakdown; track b.aliquota) {
              <div class="dih-iva-card">
                <div class="dih-iva-aliquota">{{ b.aliquota }}%</div>
                <div class="dih-iva-detail">
                  <span class="dih-iva-lbl">Imponibile</span>
                  <span class="dih-iva-val">{{ b.imponibile | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
                </div>
                <div class="dih-iva-detail">
                  <span class="dih-iva-lbl">IVA</span>
                  <span class="dih-iva-val">{{ b.iva | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── Note ──────────────────────────────────────────────────────────── -->
      @if (data.note) {
        <div class="dih-note">
          <mat-icon>notes</mat-icon>
          <span>{{ data.note }}</span>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Chiudi</button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host { display: block; }

    .dih-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: linear-gradient(135deg, #0e6480 0%, #11769b 100%);
      padding: 20px 20px 16px;
      color: #fff;
      border-radius: 4px 4px 0 0;
    }
    .dih-tipo {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.04em;
      line-height: 1;
      margin-bottom: 4px;
    }
    .dih-subtitle {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 6px;
    }
    .dih-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
    }
    .dih-numero { font-weight: 700; }
    .dih-sep { opacity: 0.5; }
    .dih-data { opacity: 0.85; }

    .dih-header-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
    }
    .dih-stato {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: rgba(255,255,255,0.2);
      color: #fff;
      border: 1.5px solid rgba(255,255,255,0.4);
      &.stato-pagata, &.stato-accettata, &.stato-evasa, &.stato-accettato, &.stato-evaso {
        background: rgba(22,163,74,0.25);
        border-color: rgba(134,239,172,0.6);
        color: #bbf7d0;
      }
      &.stato-annullata, &.stato-annullato, &.stato-rifiutato {
        background: rgba(220,38,38,0.25);
        border-color: rgba(252,165,165,0.6);
        color: #fecaca;
      }
      &.stato-bozza {
        background: rgba(100,116,139,0.3);
        border-color: rgba(203,213,225,0.5);
        color: #e2e8f0;
      }
    }
    .dih-close {
      background: rgba(255,255,255,0.15);
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #fff;
      transition: background 0.15s;
      padding: 0;
      &:hover { background: rgba(255,255,255,0.3); }
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }

    mat-dialog-content {
      padding: 0 0 8px !important;
      max-height: 72vh;
      overflow-y: auto;
    }

    .dih-cards {
      display: flex;
      gap: 12px;
      padding: 16px 20px 0;
      flex-wrap: wrap;
    }
    .dih-card {
      flex: 1;
      min-width: 220px;
      border-radius: 10px;
      padding: 14px 16px;
    }
    .dih-card-parte {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    .dih-card-totale {
      background: linear-gradient(135deg, #e6f1f6 0%, #f0f9ff 100%);
      border: 1px solid #c7d2fe;
    }
    .dih-card-lbl {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #11769b;
      margin-bottom: 10px;
    }
    .dih-card-nome {
      font-size: 15px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 4px;
      line-height: 1.3;
    }
    .dih-card-detail {
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }

    .dih-amount-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 4px 0;
      font-size: 13px;
      color: #475569;
    }
    .dih-amount-row .dih-amount-lbl { font-weight: 500; }
    .dih-amount-row .dih-amount-val { font-variant-numeric: tabular-nums; font-weight: 600; color: #1e293b; }
    .dih-amount-grand {
      margin-top: 4px;
      padding-top: 8px;
      border-top: 1px solid rgba(17,118,155,0.18);
      font-size: 18px;
    }
    .dih-amount-grand .dih-amount-lbl { font-weight: 700; color: #0e2a38; }
    .dih-amount-grand .dih-amount-val { font-weight: 800; color: #0e2a38; }

    .dih-extras {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 20px 0;
    }
    .dih-extra-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f1f5f9;
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 12px;
    }
    .dih-extra-lbl {
      font-weight: 600;
      color: #64748b;
    }
    .dih-extra-val {
      color: #1e293b;
    }

    .dih-section {
      padding: 16px 20px 0;
    }
    .dih-section-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-bottom: 10px;
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }

    .dih-table-wrap {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .dih-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .dih-table thead tr {
      background: #f8fafc;
    }
    .dih-table th {
      padding: 8px 10px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 2px solid #e2e8f0;
      white-space: nowrap;
    }
    .dih-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
      vertical-align: middle;
    }
    .dih-table tr:last-child td { border-bottom: none; }
    .dih-table tr:nth-child(even) td { background: #fafbfc; }
    .dih-table .r { text-align: right; white-space: nowrap; }
    .dih-table .c { text-align: center; white-space: nowrap; }
    .dih-table .bold { font-weight: 700; color: #1a1a2e; }
    .dih-table .um { font-size: 11px; color: #94a3b8; }
    .dih-table .sconto { font-size: 11px; color: #dc2626; margin-left: 4px; }
    .dih-table .iva-chip {
      display: inline-block;
      background: #e6f1f6;
      color: #0e6480;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .dih-row-nota td {
      font-style: italic;
      color: #78716c;
      font-size: 12px;
      background: #fffbeb;
      padding: 5px 10px;
    }

    .dih-iva-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
    }
    .dih-iva-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .dih-iva-aliquota {
      font-size: 18px;
      font-weight: 800;
      color: #0e6480;
      margin-bottom: 8px;
    }
    .dih-iva-detail {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 12px;
      padding: 2px 0;
    }
    .dih-iva-lbl { color: #64748b; font-weight: 500; }
    .dih-iva-val { color: #1e293b; font-weight: 600; font-variant-numeric: tabular-nums; }

    .dih-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 16px 20px 4px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #78716c;
      mat-icon { font-size: 18px; width: 18px; height: 18px; color: #d97706; margin-top: 1px; flex-shrink: 0; }
    }

    mat-dialog-actions {
      padding: 12px 20px !important;
      border-top: 1px solid #e2e8f0;
      margin: 0 !important;
    }
  `]
})
export class DocInfoDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: DocInfoData) {}

  get prodottoCount(): number {
    return (this.data.righe ?? []).filter(r => r.tipo !== 'NOTA').length;
  }

  rigaNetto(r: any): number {
    return (r.quantita ?? 0) * (r.prezzo ?? 0) * (1 - (r.sconto ?? 0) / 100);
  }
  rigaIvato(r: any): number {
    return this.rigaNetto(r) * (1 + (r.iva ?? 0) / 100);
  }

  // Calcola imponibile/iva/totale dalle righe se non sono forniti esplicitamente.
  get imponibileCalc(): number | null {
    if (this.data.imponibile != null) return this.data.imponibile;
    const righe = (this.data.righe ?? []).filter(r => r.tipo !== 'NOTA');
    if (!righe.length) return this.data.totale != null ? this.data.totale : null;
    return righe.reduce((s, r) => s + this.rigaNetto(r), 0);
  }
  get totaleCalc(): number | null {
    if (this.data.totale != null) return this.data.totale;
    const righe = (this.data.righe ?? []).filter(r => r.tipo !== 'NOTA');
    if (!righe.length) return null;
    return righe.reduce((s, r) => s + this.rigaIvato(r), 0);
  }
  get ivaCalc(): number {
    const t = this.totaleCalc ?? 0;
    const i = this.imponibileCalc ?? 0;
    return Math.max(0, t - i);
  }

  get ivaBreakdown(): IvaBreakdownRow[] {
    const map = new Map<number, IvaBreakdownRow>();
    for (const r of (this.data.righe ?? [])) {
      if (r.tipo === 'NOTA') continue;
      const aliquota = r.iva ?? 0;
      const netto = this.rigaNetto(r);
      const iva = netto * aliquota / 100;
      const existing = map.get(aliquota);
      if (existing) {
        existing.imponibile += netto;
        existing.iva += iva;
      } else {
        map.set(aliquota, { aliquota, imponibile: netto, iva });
      }
    }
    return [...map.values()].sort((a, b) => a.aliquota - b.aliquota);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { retry, timer, throwError } from 'rxjs';
import { DataService } from '../../services/data.service';
import { ExcelService } from '../../services/excel.service';

@Component({
  selector: 'app-compliance',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTabsModule, MatSelectModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Compliance</h1>
      </div>

      <mat-tab-group animationDuration="0">

        <!-- ── LIPE / Liquidazione IVA trimestrale ─────────────────────────── -->
        <mat-tab label="Liquidazione IVA">
          <div class="card" style="margin-top:16px">
            <div class="filter-bar">
              <mat-form-field appearance="outline" style="max-width:140px">
                <mat-label>Anno</mat-label>
                <input matInput type="number" [(ngModel)]="anno" min="2020" max="2099">
              </mat-form-field>
              <mat-form-field appearance="outline" style="max-width:160px">
                <mat-label>Trimestre</mat-label>
                <mat-select [(ngModel)]="trimestre">
                  <mat-option [value]="1">1° (Gen-Mar)</mat-option>
                  <mat-option [value]="2">2° (Apr-Giu)</mat-option>
                  <mat-option [value]="3">3° (Lug-Set)</mat-option>
                  <mat-option [value]="4">4° (Ott-Dic)</mat-option>
                </mat-select>
              </mat-form-field>
              <button mat-flat-button (click)="loadIva()">
                <mat-icon>calculate</mat-icon> Calcola
              </button>
              <button mat-stroked-button (click)="downloadLipe()" [disabled]="!iva">
                <mat-icon>download</mat-icon> Esporta LIPE (XML)
              </button>
            </div>

            @if (iva) {
              <div class="kpi-grid kpi-3col" style="margin-top:16px">
                <div class="kpi-card">
                  <div class="kpi-label">IVA debito (vendite)</div>
                  <div class="kpi-value euro-neg">{{ iva.ivaDebito | currency:'EUR':'symbol':'1.2-2':'it' }}</div>
                </div>
                <div class="kpi-card">
                  <div class="kpi-label">IVA credito (acquisti)</div>
                  <div class="kpi-value euro">{{ iva.ivaCredito | currency:'EUR':'symbol':'1.2-2':'it' }}</div>
                </div>
                <div class="kpi-card">
                  <div class="kpi-label">{{ iva.debito ? 'IVA da versare' : 'A credito' }}</div>
                  <div class="kpi-value" [style.color]="iva.debito ? '#dc2626' : '#16a34a'">
                    {{ (iva.debito ? iva.saldo : -iva.saldo) | currency:'EUR':'symbol':'1.2-2':'it' }}
                  </div>
                </div>
              </div>

              <h3 style="margin-top:24px">Dettaglio per aliquota</h3>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div>
                  <b>Vendite (IVA a debito)</b>
                  <table class="iva-table">
                    <thead><tr><th>Aliquota</th><th>Imponibile</th><th>IVA</th></tr></thead>
                    <tbody>
                      @for (r of iva.venditePerAliquota; track r.aliquota) {
                        <tr><td>{{ r.aliquota }}%</td><td class="euro">{{ r.imponibile | currency:'EUR':'symbol':'1.2-2':'it' }}</td><td class="euro">{{ r.iva | currency:'EUR':'symbol':'1.2-2':'it' }}</td></tr>
                      }
                      @if (!iva.venditePerAliquota.length) { <tr><td colspan="3" style="color:#94a3b8">Nessuna vendita</td></tr> }
                    </tbody>
                  </table>
                </div>
                <div>
                  <b>Acquisti (IVA a credito)</b>
                  <table class="iva-table">
                    <thead><tr><th>Aliquota</th><th>Imponibile</th><th>IVA</th></tr></thead>
                    <tbody>
                      @for (r of iva.acquistiPerAliquota; track r.aliquota) {
                        <tr><td>{{ r.aliquota }}%</td><td class="euro">{{ r.imponibile | currency:'EUR':'symbol':'1.2-2':'it' }}</td><td class="euro">{{ r.iva | currency:'EUR':'symbol':'1.2-2':'it' }}</td></tr>
                      }
                      @if (!iva.acquistiPerAliquota.length) { <tr><td colspan="3" style="color:#94a3b8">Nessun acquisto</td></tr> }
                    </tbody>
                  </table>
                </div>
              </div>

              <p style="margin-top:16px;font-size:12px;color:#94a3b8">
                Periodo: dal {{ iva.periodo.from | date:'dd/MM/yyyy' }} al {{ iva.periodo.to | date:'dd/MM/yyyy' }}.
                Da riportare in LIPE / liquidazione periodica.
              </p>
            }
          </div>
        </mat-tab>

        <!-- ── Export contabile ──────────────────────────────────────────────── -->
        <mat-tab label="Export contabile">
          <div class="card" style="margin-top:16px">
            <div class="filter-bar">
              <mat-form-field appearance="outline">
                <mat-label>Dal</mat-label>
                <input matInput type="date" [(ngModel)]="dataDa">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Al</mat-label>
                <input matInput type="date" [(ngModel)]="dataA">
              </mat-form-field>
              <button mat-flat-button (click)="downloadExport()">
                <mat-icon>download</mat-icon> Scarica Excel
              </button>
            </div>
            <p style="margin-top:8px;font-size:13px;color:#64748b">
              Genera un file Excel con due fogli (Vendite, Acquisti) contenente: data,
              numero, controparte, P.IVA/CF, imponibile, IVA, totale. Formato standard
              per il commercialista.
            </p>
          </div>
        </mat-tab>

        <!-- ── Registri IVA (vendite / acquisti) ──────────────────────────────── -->
        <mat-tab label="Registri IVA">
          <div class="card" style="margin-top:16px">
            <div class="filter-bar">
              <mat-form-field appearance="outline"><mat-label>Dal</mat-label>
                <input matInput type="date" [(ngModel)]="dataDa"></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Al</mat-label>
                <input matInput type="date" [(ngModel)]="dataA"></mat-form-field>
              <button mat-flat-button color="primary" (click)="registroIva('vendite')">
                <mat-icon>picture_as_pdf</mat-icon> Registro vendite
              </button>
              <button mat-stroked-button (click)="registroIva('acquisti')">
                <mat-icon>picture_as_pdf</mat-icon> Registro acquisti
              </button>
            </div>
            <p style="margin-top:8px;font-size:13px;color:#64748b">
              Genera in PDF il registro IVA del periodo (vendite o acquisti), in ordine cronologico:
              data, numero, controparte, P.IVA/CF, imponibile, IVA e totale.
            </p>
          </div>
        </mat-tab>

        <!-- ── Esterometro (operazioni transfrontaliere) ─────────────────────── -->
        <mat-tab label="Esterometro">
          <div class="card" style="margin-top:16px">
            <div class="filter-bar">
              <mat-form-field appearance="outline">
                <mat-label>Dal</mat-label>
                <input matInput type="date" [(ngModel)]="dataDa">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Al</mat-label>
                <input matInput type="date" [(ngModel)]="dataA">
              </mat-form-field>
              <button mat-flat-button (click)="downloadEsterometro()">
                <mat-icon>download</mat-icon> Scarica CSV
              </button>
            </div>
            <p style="margin-top:8px;font-size:13px;color:#64748b">
              Genera un CSV con tutte le fatture attive (vendite a clienti esteri) e
              passive (acquisti da fornitori esteri) nel periodo. Per essere incluso
              nell'estero, il cliente o il fornitore deve avere il flag <b>"Soggetto
              estero"</b> attivo nella sua scheda anagrafica. Da gennaio 2022
              l'esterometro è confluito nello SDI tramite autofatture TD17/18/19 —
              questo CSV serve da bozza per il commercialista o per controllo.
            </p>
          </div>
        </mat-tab>

      </mat-tab-group>
    </div>
  `,
  styles: [`
    .iva-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    .iva-table th { background: var(--bg-surface-2); padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary); border-bottom: 1px solid var(--border-subtle); }
    .iva-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-subtle); }
    .iva-table td.euro { text-align: right; font-variant-numeric: tabular-nums; }
    @media (max-width: 600px) {
      div[style*="grid-template-columns:1fr 1fr"],
      div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
      .iva-table { font-size: 12px; }
      .iva-table th, .iva-table td { padding: 6px 8px; }
    }
  `]
})
export class ComplianceComponent implements OnInit {
  anno = new Date().getFullYear();
  trimestre = Math.floor(new Date().getMonth() / 3) + 1;
  iva: any = null;

  dataDa: string = `${new Date().getFullYear()}-01-01`;
  dataA: string = new Date().toISOString().slice(0, 10);

  constructor(private ds: DataService, private snack: MatSnackBar, private excel: ExcelService) {}

  ngOnInit() { this.loadIva(); }

  loadIva() {
    // Ritenta in caso di rate-limit transitorio (429) prima di disturbare l'utente.
    this.ds.getIvaTrimestre(this.anno, this.trimestre).pipe(
      retry({ count: 2, delay: (err, n) => err?.status === 429 ? timer(800 * n) : throwError(() => err) }),
    ).subscribe({
      next: r => this.iva = r,
      error: (e) => {
        // 429 dopo i retry o errori reali: messaggio non bloccante (la pagina resta usabile).
        if (e?.status !== 429) {
          this.snack.open('Liquidazione non disponibile al momento', '', { duration: 2500 });
        }
      }
    });
  }

  downloadLipe() {
    this.ds.downloadLipeXml(this.anno, { trimestre: this.trimestre });
  }

  downloadEsterometro() {
    this.ds.downloadEsterometroCsv(this.dataDa, this.dataA);
  }

  registroIva(tipo: 'vendite' | 'acquisti') {
    this.ds.getExportContabile(this.dataDa, this.dataA).subscribe({
      next: r => {
        const rows = (tipo === 'vendite' ? r.vendite : r.acquisti) || [];
        if (!rows.length) { this.snack.open('Nessun documento nel periodo', 'OK', { duration: 3000, panelClass: 'snack-error' }); return; }
        const cols = [
          { header: 'Data', field: 'data' as const },
          { header: 'Numero', field: 'numero' as const },
          { header: tipo === 'vendite' ? 'Cliente' : 'Fornitore', field: 'controparte' as const },
          { header: 'P.IVA', field: 'piva' as const },
          { header: 'CF', field: 'cf' as const },
          { header: 'Imponibile', field: 'imponibile' as const },
          { header: 'IVA', field: 'iva' as const },
          { header: 'Totale', field: 'totale' as const },
        ];
        this.excel.exportPdf(rows, cols, `registro-iva-${tipo}-${this.dataDa}_${this.dataA}`, `Registro IVA ${tipo} — dal ${this.dataDa} al ${this.dataA}`);
      },
      error: () => this.snack.open('Errore generazione registro', 'OK', { duration: 3000, panelClass: 'snack-error' })
    });
  }

  downloadExport() {
    this.ds.getExportContabile(this.dataDa, this.dataA).subscribe({
      next: r => {
        const cols = [
          { header: 'Tipo', field: 'tipo' as const },
          { header: 'Data', field: 'data' as const },
          { header: 'Numero', field: 'numero' as const },
          { header: 'Controparte', field: 'controparte' as const },
          { header: 'P.IVA', field: 'piva' as const },
          { header: 'CF', field: 'cf' as const },
          { header: 'Imponibile', field: 'imponibile' as const },
          { header: 'IVA', field: 'iva' as const },
          { header: 'Totale', field: 'totale' as const },
          { header: 'Stato', field: 'stato' as const },
        ];
        const all = [...(r.vendite || []), ...(r.acquisti || [])];
        if (!all.length) {
          this.snack.open('Nessun documento nel periodo selezionato', 'OK', { duration: 3000, panelClass: 'snack-error' });
          return;
        }
        this.excel.export(all, cols, `export-contabile-${this.dataDa}_${this.dataA}`);
        this.snack.open(`${r.vendite.length} vendite + ${r.acquisti.length} acquisti esportati`, '', { duration: 3000, panelClass: 'snack-ok' });
      },
      error: () => this.snack.open('Errore export', 'OK', { duration: 3000, panelClass: 'snack-error' })
    });
  }
}

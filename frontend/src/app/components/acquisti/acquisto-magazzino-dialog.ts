import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../services/api.service';

interface AnalisiRiga {
  rigaId: number;
  descrizione: string;
  quantita: number;
  prezzoAcquisto: number;
  codiceFornitore: string;
  stato: 'matched' | 'unmatched' | 'noCode';
  prodottoId?: number;
  prodottoNome?: string;
  nuovoProdotto?: any;
  // Per UI
  inclusa?: boolean;
  creaNuovo?: boolean;
}

interface Analisi {
  acquistoId: number;
  numero: string;
  totale: number;
  matched: number;
  unmatched: number;
  noCode: number;
  righe: AnalisiRiga[];
}

@Component({
  selector: 'app-acquisto-magazzino-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatIconModule,
    MatButtonModule, MatCheckboxModule, MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:10px">
      <mat-icon style="color:#11769b">move_to_inbox</mat-icon>
      Caricare i prodotti a magazzino?
    </h2>

    <mat-dialog-content style="min-width:560px;max-width:800px">
      @if (loading) {
        <p>Analisi righe in corso…</p>
      } @else if (analisi) {
        <p class="lead">
          L'acquisto <b>{{ analisi.numero }}</b> ha <b>{{ analisi.totale }}</b> righe.
          Vuoi generare automaticamente un Arrivo Merce e caricare le quantità a magazzino?
        </p>

        <div class="summary">
          @if (analisi.matched > 0) {
            <span class="chip chip-ok">
              <mat-icon>check_circle</mat-icon> {{ analisi.matched }} già a catalogo
            </span>
          }
          @if (analisi.unmatched > 0) {
            <span class="chip chip-warn">
              <mat-icon>add_circle_outline</mat-icon> {{ analisi.unmatched }} nuovi prodotti
            </span>
          }
          @if (analisi.noCode > 0) {
            <span class="chip chip-muted">
              <mat-icon>help_outline</mat-icon> {{ analisi.noCode }} senza codice
            </span>
          }
        </div>

        <div class="righe-list">
          @for (r of analisi.righe; track r.rigaId) {
            <div class="riga" [class.riga-skip]="!r.inclusa">
              <mat-checkbox [(ngModel)]="r.inclusa"></mat-checkbox>
              <div class="riga-body">
                <div class="riga-top">
                  <span class="riga-desc">{{ r.descrizione }}</span>
                  <span class="riga-qty">{{ r.quantita }} pz · € {{ r.prezzoAcquisto | number:'1.2-2' }}</span>
                </div>
                <div class="riga-meta">
                  @if (r.stato === 'matched') {
                    <span class="badge badge-ok">
                      <mat-icon>check</mat-icon> Esistente:
                      <b>{{ r.prodottoNome }}</b>
                      @if (r.codiceFornitore) { <span class="cod">cod. {{ r.codiceFornitore }}</span> }
                    </span>
                  } @else if (r.stato === 'unmatched') {
                    <span class="badge badge-warn">
                      <mat-icon>add</mat-icon> Nuovo prodotto:
                      <b>{{ r.nuovoProdotto?.nome }}</b>
                      <span class="cod">cod. {{ r.codiceFornitore }}</span>
                    </span>
                    <mat-checkbox [(ngModel)]="r.creaNuovo" class="tiny">crea a catalogo</mat-checkbox>
                  } @else {
                    <span class="badge badge-muted">
                      <mat-icon>warning_amber</mat-icon> Nessun codice prodotto
                      <span matTooltip="Sarà ignorata nell'arrivo merce">— sarà saltata</span>
                    </span>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <p class="note">
          <mat-icon>info_outline</mat-icon>
          Le righe selezionate genereranno un Arrivo Merce con scarico/carico magazzino e movimento registrato.
          Puoi anche ignorare per ora e generare l'arrivo merce manualmente più tardi.
        </p>
      } @else {
        <p style="color:#b91c1c">Errore nell'analisi: {{ errorMsg || 'impossibile leggere l\\'acquisto.' }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Salta per ora</button>
      <button mat-flat-button color="primary" (click)="genera()"
              [disabled]="!analisi || generating">
        @if (generating) { Generazione in corso… }
        @else { Genera arrivo merce ({{ countSelected }} righe) }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .lead { font-size: 14px; color: #334155; margin: 0 0 16px; line-height: 1.55; }
    .summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 600;
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }
    .chip-ok    { background: rgba(22,163,74,0.12);  color: #15803d; }
    .chip-warn  { background: rgba(217,119,6,0.12);  color: #b45309; }
    .chip-muted { background: rgba(100,116,139,0.12); color: #475569; }
    .righe-list {
      display: flex; flex-direction: column; gap: 8px;
      max-height: 360px; overflow-y: auto;
      border: 1px solid #e6e8ee; border-radius: 8px;
      padding: 4px;
      background: #f8fafc;
    }
    .riga {
      display: flex; gap: 10px;
      padding: 10px 12px;
      background: #ffffff;
      border-radius: 6px;
      border: 1px solid #eef0f4;
      transition: opacity 0.15s;
    }
    .riga-skip { opacity: 0.4; }
    .riga-body { flex: 1; min-width: 0; }
    .riga-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .riga-desc { font-weight: 600; font-size: 13px; color: #0e2a38; overflow: hidden; text-overflow: ellipsis; }
    .riga-qty { font-size: 12px; color: #64748b; white-space: nowrap; }
    .riga-meta {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      font-size: 12px;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px;
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
      .cod { color: #94a3b8; font-family: 'SF Mono', Menlo, monospace; font-size: 11px; }
    }
    .badge-ok    { color: #15803d; }
    .badge-warn  { color: #b45309; }
    .badge-muted { color: #64748b; }
    .tiny ::ng-deep label { font-size: 11px; color: #64748b; }
    .note {
      display: flex; align-items: flex-start; gap: 6px;
      font-size: 12px; color: #64748b;
      margin: 14px 0 0;
      mat-icon { font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }
    }
  `]
})
export class AcquistoMagazzinoDialogComponent implements OnInit {
  loading = true;
  generating = false;
  analisi: Analisi | null = null;
  errorMsg = '';
  private snack = inject(MatSnackBar);

  constructor(
    public dialogRef: MatDialogRef<AcquistoMagazzinoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { acquistoId: number; api: ApiService },
  ) {}

  ngOnInit() {
    this.data.api.get<Analisi>(`acquisti/${this.data.acquistoId}/analisi-magazzino`).subscribe({
      next: a => {
        // Default: tutte le righe matchate o nuove sono incluse; quelle senza codice sono escluse
        a.righe.forEach(r => {
          r.inclusa = r.stato !== 'noCode';
          r.creaNuovo = r.stato === 'unmatched';
        });
        this.analisi = a;
        this.loading = false;
      },
      error: e => {
        this.errorMsg = e.error?.error || e.message;
        this.loading = false;
      },
    });
  }

  get countSelected(): number {
    return this.analisi?.righe.filter(r => r.inclusa).length || 0;
  }

  genera() {
    if (!this.analisi) return;
    this.generating = true;
    const personalizzazioni: Record<number, any> = {};
    for (const r of this.analisi.righe) {
      if (!r.inclusa) {
        // Per "saltare" una riga: niente prodottoId e niente nuovoProdotto
        personalizzazioni[r.rigaId] = { prodottoId: null };
        continue;
      }
      if (r.stato === 'matched') {
        personalizzazioni[r.rigaId] = { prodottoId: r.prodottoId };
      } else if (r.stato === 'unmatched' && r.creaNuovo) {
        personalizzazioni[r.rigaId] = { nuovoProdotto: r.nuovoProdotto };
      } else {
        personalizzazioni[r.rigaId] = { prodottoId: null };
      }
    }
    this.data.api.post(`acquisti/${this.data.acquistoId}/genera-arrivo-merce`, {
      autoCreaProdotti: false,  // gestiamo per-riga
      personalizzazioni,
    }).subscribe({
      next: (r: any) => {
        this.generating = false;
        this.dialogRef.close({ generated: true, ...r });
      },
      error: e => {
        this.generating = false;
        this.snack.open(e.error?.error || 'Non è stato possibile generare l\'arrivo merce.', 'OK',
                        { duration: 6000, panelClass: 'snack-error' });
      },
    });
  }
}

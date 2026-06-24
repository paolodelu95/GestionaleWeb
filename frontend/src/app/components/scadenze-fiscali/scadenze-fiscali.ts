import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DataService } from '../../services/data.service';
import { ConfirmService } from '../shared/confirm-dialog';
import { ScadenzaFiscale } from '../../models';

/**
 * Calendario delle scadenze fiscali italiane (edizione offline). Le scadenze standard
 * (IVA, LIPE, ritenute, imposte, dichiarazioni) sono generate dal backend in base a due
 * impostazioni (periodicità IVA, sostituto d'imposta); qui si consultano per anno, si
 * segnano "fatto", si aggiungono scadenze manuali. Le imminenti/scadute alimentano anche
 * le notifiche di sistema (badge).
 */
@Component({
  selector: 'app-scadenze-fiscali',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatButtonModule, MatCheckboxModule,
    MatSelectModule, MatSlideToggleModule, MatFormFieldModule, MatInputModule,
  ],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Scadenze fiscali</h1>
          <p class="sub">Promemoria di IVA, LIPE, ritenute, imposte e dichiarazioni. Date ordinarie, salvo proroghe ufficiali.</p>
        </div>
        <div class="year">
          <button mat-icon-button (click)="cambiaAnno(-1)" title="Anno precedente"><mat-icon>chevron_left</mat-icon></button>
          <span class="year-val">{{ anno }}</span>
          <button mat-icon-button (click)="cambiaAnno(1)" title="Anno successivo"><mat-icon>chevron_right</mat-icon></button>
        </div>
      </header>

      <div class="card config">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:220px">
          <mat-label>Liquidazione IVA</mat-label>
          <mat-select [(value)]="ivaPeriodicita" (selectionChange)="salvaConfig()">
            <mat-option value="trimestrale">Trimestrale</mat-option>
            <mat-option value="mensile">Mensile</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="sostitutoImposta" (change)="salvaConfig()">
          Sostituto d'imposta (ritenute)
        </mat-slide-toggle>
        <span class="spacer"></span>
        <button mat-stroked-button (click)="toggleNuova()"><mat-icon>add</mat-icon> Aggiungi scadenza</button>
      </div>

      @if (mostraNuova) {
        <div class="card nuova">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Data</mat-label>
            <input matInput type="date" [(ngModel)]="nuova.data">
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:200px">
            <mat-label>Descrizione</mat-label>
            <input matInput [(ngModel)]="nuova.titolo" placeholder="es. Diritto camerale">
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:170px">
            <mat-label>Categoria</mat-label>
            <mat-select [(value)]="nuova.categoria">
              @for (c of categorie; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:130px">
            <mat-label>Importo €</mat-label>
            <input matInput type="number" [(ngModel)]="nuova.importo">
          </mat-form-field>
          <button mat-flat-button color="primary" [disabled]="!nuova.data || !nuova.titolo" (click)="creaNuova()">Salva</button>
        </div>
      }

      @if (scadenze.length === 0) {
        <p class="vuoto">Nessuna scadenza per il {{ anno }}.</p>
      }

      <div class="lista">
        @for (s of scadenze; track s.id) {
          <div class="riga" [class.fatto]="s.stato === 'fatto'"
               [class.scaduta]="stato(s) === 'scaduta'" [class.imminente]="stato(s) === 'imminente'">
            <mat-checkbox [checked]="s.stato === 'fatto'" (change)="segna(s, $event.checked)" title="Segna come fatto"></mat-checkbox>
            <div class="data">
              <span class="g">{{ s.data | date:'dd' }}</span>
              <span class="m">{{ s.data | date:'MMM' }}</span>
            </div>
            <div class="info">
              <div class="titolo">{{ s.titolo }}</div>
              <div class="meta">
                <span class="chip" [attr.data-cat]="s.categoria">{{ s.categoria }}</span>
                @if (s.importo) { <span class="imp">€ {{ s.importo | number:'1.2-2' }}</span> }
                @if (stato(s) === 'scaduta') { <span class="warn">scaduta</span> }
                @else if (stato(s) === 'imminente') { <span class="soon">in arrivo</span> }
              </div>
            </div>
            @if (!s.auto) {
              <button mat-icon-button (click)="elimina(s)" title="Elimina"><mat-icon>delete_outline</mat-icon></button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 880px; margin: 0 auto; padding: 24px 20px 60px; color: var(--text-primary); }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
    h1 { margin:0; font-size:24px; }
    .sub { color:#64748b; font-size:13px; margin:4px 0 0; }
    .year { display:flex; align-items:center; gap:6px; }
    .year-val { font-size:20px; font-weight:700; min-width:62px; text-align:center; }
    .card { background:var(--surface,#fff); border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin-bottom:16px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
    .config { display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
    .config .spacer { flex:1; }
    .nuova { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .vuoto { color:#94a3b8; text-align:center; padding:30px; }
    .lista { display:flex; flex-direction:column; gap:8px; }
    .riga { display:flex; align-items:center; gap:14px; background:var(--surface,#fff); border:1px solid #e2e8f0; border-left:4px solid #cbd5e1; border-radius:10px; padding:10px 14px; }
    .riga.imminente { border-left-color:#d97706; }
    .riga.scaduta { border-left-color:#dc2626; }
    .riga.fatto { opacity:.55; }
    .riga.fatto .titolo { text-decoration:line-through; }
    .data { width:46px; text-align:center; line-height:1; }
    .data .g { display:block; font-size:20px; font-weight:700; }
    .data .m { display:block; font-size:11px; text-transform:uppercase; color:#64748b; }
    .info { flex:1; }
    .titolo { font-weight:600; }
    .meta { display:flex; align-items:center; gap:10px; margin-top:3px; font-size:12.5px; }
    .chip { background:#eef2f7; color:#334155; border-radius:999px; padding:1px 9px; font-size:11.5px; font-weight:600; }
    .chip[data-cat="IVA"] { background:#e0f2fe; color:#075985; }
    .chip[data-cat="LIPE"] { background:#ede9fe; color:#5b21b6; }
    .chip[data-cat="Ritenute"] { background:#fef3c7; color:#92400e; }
    .chip[data-cat="Imposte"] { background:#fee2e2; color:#991b1b; }
    .chip[data-cat="Dichiarazioni"] { background:#dcfce7; color:#166534; }
    .imp { color:#0f172a; font-weight:600; }
    .warn { color:#dc2626; font-weight:600; }
    .soon { color:#d97706; font-weight:600; }
  `],
})
export class ScadenzeFiscaliComponent implements OnInit {
  private ds = inject(DataService);
  private confirm = inject(ConfirmService);
  private snack = inject(MatSnackBar);

  anno = new Date().getFullYear();
  ivaPeriodicita = 'trimestrale';
  sostitutoImposta = false;
  scadenze: ScadenzaFiscale[] = [];
  readonly categorie = ['IVA', 'LIPE', 'Ritenute', 'Imposte', 'Dichiarazioni', 'Altro'];

  mostraNuova = false;
  nuova: Partial<ScadenzaFiscale> = { categoria: 'Altro' };

  ngOnInit() { this.carica(); }

  carica() {
    this.ds.getScadenzeFiscali(this.anno).subscribe({
      next: r => {
        this.scadenze = r.scadenze;
        this.ivaPeriodicita = r.config.ivaPeriodicita;
        this.sostitutoImposta = r.config.sostitutoImposta;
      },
      error: () => this.scadenze = [],
    });
  }

  cambiaAnno(d: number) { this.anno += d; this.carica(); }

  /** Stato visivo della scadenza: 'scaduta' | 'imminente' | 'ok'. */
  stato(s: ScadenzaFiscale): 'scaduta' | 'imminente' | 'ok' {
    if (s.stato === 'fatto') return 'ok';
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const d = new Date(s.data + 'T00:00:00');
    const giorni = Math.round((d.getTime() - oggi.getTime()) / 86400000);
    if (giorni < 0) return 'scaduta';
    if (giorni <= 7) return 'imminente';
    return 'ok';
  }

  segna(s: ScadenzaFiscale, fatto: boolean) {
    const stato = fatto ? 'fatto' : 'pendente';
    s.stato = stato;
    this.ds.updateScadenzaFiscale(s.id!, { stato }).subscribe({ error: () => this.carica() });
  }

  salvaConfig() {
    this.ds.setScadenzeFiscaliConfig({ ivaPeriodicita: this.ivaPeriodicita, sostitutoImposta: this.sostitutoImposta })
      .subscribe({ next: () => this.carica(), error: () => this.snack.open('Errore salvataggio', '', { duration: 2500 }) });
  }

  toggleNuova() { this.mostraNuova = !this.mostraNuova; if (this.mostraNuova) this.nuova = { categoria: 'Altro', data: this.anno + '-01-01' }; }

  creaNuova() {
    this.ds.createScadenzaFiscale(this.nuova).subscribe({
      next: () => { this.mostraNuova = false; this.nuova = { categoria: 'Altro' }; this.carica(); this.snack.open('Scadenza aggiunta', '', { duration: 2000 }); },
      error: e => this.snack.open(e.error?.error || 'Errore', '', { duration: 3000 }),
    });
  }

  async elimina(s: ScadenzaFiscale) {
    if (!await this.confirm.delete(`Eliminare "${s.titolo}"?`)) return;
    this.ds.deleteScadenzaFiscale(s.id!).subscribe({
      next: () => { this.carica(); this.snack.open('Eliminata', '', { duration: 2000 }); },
      error: () => this.snack.open('Errore', '', { duration: 2500 }),
    });
  }
}

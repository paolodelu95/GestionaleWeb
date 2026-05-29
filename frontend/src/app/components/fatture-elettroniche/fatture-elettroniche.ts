import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';

interface FatturaSdi {
  id: number;
  numero: string;
  dataEmissione: string;
  clienteNome: string;
  totale: number;
  stato: string;
  statoSdi: string;
  dataInvioSdi: string;
  idTrasmissioneSdi: string;
}

interface StatoMeta { key: string; label: string; cls: string; icon: string; }

// Stati notifica SDI (FatturaPA). Riproducono le ricevute dell'intermediario.
const STATI: StatoMeta[] = [
  { key: 'NON_INVIATA',        label: 'Non inviata',        cls: 'sdi-grey',  icon: 'drafts' },
  { key: 'INVIATA',            label: 'Inviata',            cls: 'sdi-blue',  icon: 'send' },
  { key: 'CONSEGNATA',         label: 'Consegnata',         cls: 'sdi-green', icon: 'mark_email_read' },
  { key: 'MANCATA_CONSEGNA',   label: 'Mancata consegna',   cls: 'sdi-amber', icon: 'unsubscribe' },
  { key: 'ACCETTATA',          label: 'Accettata',          cls: 'sdi-green', icon: 'verified' },
  { key: 'RIFIUTATA',          label: 'Rifiutata',          cls: 'sdi-red',   icon: 'cancel' },
  { key: 'SCARTATA',           label: 'Scartata',           cls: 'sdi-red',   icon: 'report' },
  { key: 'DECORRENZA_TERMINI', label: 'Decorrenza termini', cls: 'sdi-teal',  icon: 'schedule' },
  { key: 'NON_RECAPITABILE',   label: 'Non recapitabile',   cls: 'sdi-amber', icon: 'error_outline' },
];

@Component({
  selector: 'app-fatture-elettroniche',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatMenuModule, MatTooltipModule, MatSnackBarModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Fatture elettroniche — Stato SDI</h1>
        <button mat-icon-button type="button" (click)="load()" matTooltip="Aggiorna"><mat-icon>refresh</mat-icon></button>
      </div>

      <!-- KPI per stato -->
      <div class="kpi-row">
        @for (s of statiConteggio; track s.key) {
          <button class="kpi-chip" [class.active]="filtroStato === s.key" [ngClass]="s.cls" (click)="toggleStato(s.key)">
            <mat-icon>{{ s.icon }}</mat-icon>
            <span class="kpi-n">{{ s.count }}</span>
            <span class="kpi-l">{{ s.label }}</span>
          </button>
        }
      </div>

      <div class="card">
        <div class="filter-bar">
          <mat-form-field appearance="outline" class="f-search">
            <mat-label>Cerca numero o cliente…</mat-label>
            <input matInput [(ngModel)]="search" (ngModelChange)="applyFilters()">
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" style="max-width:150px">
            <mat-label>Anno</mat-label>
            <mat-select [(ngModel)]="filtroAnno" (selectionChange)="applyFilters()">
              <mat-option [value]="null">Tutti</mat-option>
              @for (a of anni; track a) { <mat-option [value]="a">{{ a }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="max-width:200px">
            <mat-label>Stato SDI</mat-label>
            <mat-select [(ngModel)]="filtroStato" (selectionChange)="applyFilters()">
              <mat-option [value]="null">Tutti gli stati</mat-option>
              @for (s of stati; track s.key) { <mat-option [value]="s.key">{{ s.label }}</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (search || filtroAnno || filtroStato) {
            <button mat-icon-button type="button" matTooltip="Rimuovi filtri" (click)="resetFiltri()"><mat-icon>clear</mat-icon></button>
          }
        </div>

        @if (loading) {
          <p style="color:var(--text-tertiary)">Caricamento…</p>
        } @else if (!filtered.length) {
          <div class="empty"><mat-icon>receipt_long</mat-icon><p>Nessuna fattura corrisponde ai filtri.</p></div>
        } @else {
          <div class="fe-list">
            <div class="fe-row fe-head">
              <span>Numero</span><span>Cliente</span><span class="r">Importo</span>
              <span>Invio SDI</span><span>Stato</span><span></span>
            </div>
            @for (f of filtered; track f.id) {
              <div class="fe-row">
                <div class="fe-num" data-label="Numero">
                  <b>{{ f.numero }}</b><span class="fe-date">{{ f.dataEmissione | date:'dd/MM/yyyy' }}</span>
                </div>
                <div class="fe-cli" data-label="Cliente">{{ f.clienteNome || '—' }}</div>
                <div class="fe-tot r" data-label="Importo">{{ f.totale | currency:'EUR':'symbol':'1.2-2':'it' }}</div>
                <div class="fe-invio" data-label="Invio SDI">
                  @if (f.dataInvioSdi) {
                    {{ f.dataInvioSdi | date:'dd/MM/yyyy' }}
                    @if (f.idTrasmissioneSdi) { <span class="fe-id" [matTooltip]="'ID trasmissione: ' + f.idTrasmissioneSdi">#{{ f.idTrasmissioneSdi }}</span> }
                  } @else { <span class="muted">—</span> }
                </div>
                <div class="fe-stato" data-label="Stato">
                  <span class="sdi-badge" [ngClass]="metaOf(f.statoSdi).cls">
                    <mat-icon>{{ metaOf(f.statoSdi).icon }}</mat-icon>{{ metaOf(f.statoSdi).label }}
                  </span>
                </div>
                <div class="fe-act">
                  <button mat-stroked-button type="button" [matMenuTriggerFor]="stm" matTooltip="Aggiorna stato notifica SDI">
                    <mat-icon>edit_note</mat-icon> Stato
                  </button>
                  <mat-menu #stm="matMenu">
                    @for (s of stati; track s.key) {
                      <button mat-menu-item type="button" (click)="setStato(f, s.key)">
                        <mat-icon [ngClass]="s.cls + '-fg'">{{ s.icon }}</mat-icon> {{ s.label }}
                      </button>
                    }
                  </mat-menu>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <p class="foot-note">
        <mat-icon>info_outline</mat-icon>
        Lo stato viene impostato automaticamente a <b>Inviata</b> al momento dell'invio allo SDI.
        Gli esiti successivi (consegnata, scartata, accettata, rifiutata…) possono essere aggiornati
        manualmente da <b>Stato</b> in base alle ricevute del tuo intermediario, oppure
        automaticamente quando è attivo il polling del provider.
      </p>
    </div>
  `,
  styles: [`
    .kpi-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .kpi-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border-subtle, #e6e8ee); background: var(--bg-surface, #fff); cursor: pointer; font: inherit; transition: all .12s; }
    .kpi-chip:hover { border-color: var(--border, #cbd5e1); }
    .kpi-chip.active { box-shadow: 0 0 0 2px currentColor inset; }
    .kpi-chip mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .kpi-n { font-weight: 800; font-size: 16px; }
    .kpi-l { font-size: 12px; color: var(--text-secondary, #475569); }
    .filter-bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .f-search { flex: 1 1 auto; min-width: 220px; }
    .empty { text-align: center; padding: 32px 16px; color: var(--text-tertiary, #94a3b8); }
    .empty mat-icon { font-size: 40px; width: 40px; height: 40px; opacity: .5; }
    .fe-list { display: flex; flex-direction: column; }
    .fe-row { display: grid; grid-template-columns: 1.4fr 1.6fr 1fr 1.3fr 1.2fr auto; gap: 12px; align-items: center; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle, #eef0f4); }
    .fe-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-tertiary, #94a3b8); padding: 6px 8px; }
    .fe-head .r, .fe-tot.r { text-align: right; }
    .fe-num b { font-size: 14px; } .fe-date { display: block; font-size: 12px; color: var(--text-tertiary, #94a3b8); }
    .fe-cli { font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
    .fe-tot { font-weight: 600; font-variant-numeric: tabular-nums; }
    .fe-invio { font-size: 13px; } .fe-id { display: block; font-size: 11px; color: var(--text-tertiary, #94a3b8); }
    .muted { color: var(--text-tertiary, #94a3b8); }
    .sdi-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
    .sdi-badge mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .fe-act { justify-self: end; }
    .sdi-grey  { background: rgba(100,116,139,.14); color: #475569; } .sdi-grey-fg  { color: #475569; }
    .sdi-blue  { background: rgba(59,130,246,.14);  color: #1d4ed8; } .sdi-blue-fg  { color: #1d4ed8; }
    .sdi-green { background: rgba(22,163,74,.14);   color: #15803d; } .sdi-green-fg { color: #15803d; }
    .sdi-amber { background: rgba(217,119,6,.16);   color: #b45309; } .sdi-amber-fg { color: #b45309; }
    .sdi-red   { background: rgba(220,38,38,.14);   color: #b91c1c; } .sdi-red-fg   { color: #b91c1c; }
    .sdi-teal  { background: rgba(13,148,136,.14);  color: #0f766e; } .sdi-teal-fg  { color: #0f766e; }
    .foot-note { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-tertiary, #64748b); margin-top: 16px; line-height: 1.5; }
    .foot-note mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    @media (max-width: 768px) {
      .fe-head { display: none; }
      .fe-row { grid-template-columns: 1fr; gap: 6px; padding: 12px 14px; border: 1px solid var(--border-subtle, #eef0f4); border-radius: 10px; margin-bottom: 10px; }
      .fe-row > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .fe-row > div::before { content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-tertiary, #94a3b8); }
      .fe-num::before, .fe-act::before { content: none; }
      .fe-tot.r { text-align: right; }
      .fe-act { justify-self: stretch; } .fe-act button { width: 100%; }
      .fe-date { display: inline; margin-left: 8px; }
    }
  `]
})
export class FattureElettronicheComponent implements OnInit {
  readonly stati = STATI;
  loading = true;
  all: FatturaSdi[] = [];
  filtered: FatturaSdi[] = [];

  search = '';
  filtroAnno: number | null = null;
  filtroStato: string | null = null;
  anni: number[] = [];

  constructor(private ds: DataService, private snack: MatSnackBar, private router: Router) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.ds.getFatture().subscribe({
      next: (r: any[]) => {
        this.all = (r || []).map(f => ({
          id: f.id, numero: f.numero, dataEmissione: f.dataEmissione,
          clienteNome: f.clienteNome, totale: f.totale, stato: f.stato,
          statoSdi: f.statoSdi || '', dataInvioSdi: f.dataInvioSdi || '',
          idTrasmissioneSdi: f.idTrasmissioneSdi || '',
        }));
        const years = new Set<number>();
        for (const f of this.all) { const y = +(f.dataEmissione || '').slice(0, 4); if (y) years.add(y); }
        this.anni = [...years].sort((a, b) => b - a);
        this.applyFilters();
        this.loading = false;
      },
      error: () => { this.all = []; this.filtered = []; this.loading = false; },
    });
  }

  metaOf(statoSdi: string): StatoMeta {
    const key = (statoSdi || '').toUpperCase() || 'NON_INVIATA';
    return STATI.find(s => s.key === key) || STATI[0];
  }

  get statiConteggio() {
    return STATI.map(s => ({
      ...s,
      count: this.all.filter(f => this.metaOf(f.statoSdi).key === s.key).length,
    }));
  }

  toggleStato(key: string) {
    this.filtroStato = this.filtroStato === key ? null : key;
    this.applyFilters();
  }

  applyFilters() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.all.filter(f => {
      if (this.filtroStato && this.metaOf(f.statoSdi).key !== this.filtroStato) return false;
      if (this.filtroAnno && +(f.dataEmissione || '').slice(0, 4) !== this.filtroAnno) return false;
      if (q && !(`${f.numero} ${f.clienteNome || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  resetFiltri() { this.search = ''; this.filtroAnno = null; this.filtroStato = null; this.applyFilters(); }

  setStato(f: FatturaSdi, key: string) {
    this.ds.updateStatoSdi(f.id, { statoSdi: key }).subscribe({
      next: () => {
        f.statoSdi = key === 'NON_INVIATA' ? '' : key;
        if (key !== 'NON_INVIATA' && !f.dataInvioSdi) f.dataInvioSdi = new Date().toISOString().slice(0, 10);
        this.applyFilters();
        this.snack.open(`Stato aggiornato: ${this.metaOf(key).label}`, '', { duration: 2500, panelClass: 'snack-ok' });
      },
      error: e => this.snack.open(e.error?.error || 'Errore aggiornamento stato', 'OK', { duration: 3500, panelClass: 'snack-error' }),
    });
  }
}

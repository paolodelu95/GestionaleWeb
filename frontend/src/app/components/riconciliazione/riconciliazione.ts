import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../services/api.service';

interface Transazione {
  data: string;
  importo: number;
  descrizione: string;
  riferimento?: string;
  candidati?: Candidato[];
  matchScelto?: Candidato | null;
  loading?: boolean;
}
interface Candidato {
  tipoEntry: 'FATTURA' | 'ACQUISTO';
  id: number;
  numero: string;
  data: string;
  controparte: string;
  residuo: number;
  score: number;
}

@Component({
  selector: 'app-riconciliazione',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSnackBarModule, MatTableModule, MatTabsModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Riconciliazione bancaria</h1>
      </div>

      <mat-tab-group animationDuration="0">
        <mat-tab label="1. Importa estratto conto">
          <div class="card" style="margin-top:16px">
            <p style="font-size:13px;color:#64748b;margin-top:0">
              Incolla qui sotto il contenuto di un file <b>OFX</b> (Open Financial Exchange) o
              <b>CSV</b> esportato dall'home banking. Il sistema parsifica le transazioni e
              suggerisce automaticamente la fattura o l'acquisto che ognuna salda.
            </p>

            <mat-form-field appearance="outline" style="width:100%">
              <mat-label>Contenuto file</mat-label>
              <textarea matInput rows="8" [(ngModel)]="contenuto"
                        placeholder="Incolla OFX o CSV qui..."></textarea>
            </mat-form-field>

            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <mat-form-field appearance="outline" style="max-width:140px">
                <mat-label>Formato</mat-label>
                <mat-select [(ngModel)]="formato">
                  <mat-option value="ofx">OFX</mat-option>
                  <mat-option value="csv">CSV</mat-option>
                </mat-select>
              </mat-form-field>
              @if (formato === 'csv') {
                <mat-form-field appearance="outline" style="max-width:140px">
                  <mat-label>Separatore</mat-label>
                  <mat-select [(ngModel)]="separatore">
                    <mat-option value=";">; (Punto e virgola)</mat-option>
                    <mat-option value=",">, (Virgola)</mat-option>
                    <mat-option value="\t">Tab</mat-option>
                  </mat-select>
                </mat-form-field>
              }
              <button mat-flat-button (click)="analizza()" [disabled]="!contenuto.trim() || loading">
                <mat-icon>analytics</mat-icon> Analizza
              </button>
              <button mat-stroked-button (click)="reset()" [disabled]="!transazioni.length">
                <mat-icon>clear</mat-icon> Pulisci
              </button>
            </div>

            @if (loading) {
              <div style="text-align:center;margin-top:16px">
                <mat-spinner diameter="32" style="margin:0 auto"></mat-spinner>
              </div>
            }
          </div>
        </mat-tab>

        <mat-tab label="2. Match & conferma">
          <div class="card" style="margin-top:16px">
            @if (transazioni.length === 0) {
              <p style="color:#94a3b8;text-align:center;padding:32px">
                Carica un estratto conto nel tab precedente per vedere le transazioni qui.
              </p>
            } @else {
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-size:13px;color:#64748b">
                  {{ transazioni.length }} transazioni trovate.
                  Confermate: <b>{{ confermateCount() }}</b> / {{ transazioni.length }}
                </div>
                <button mat-flat-button (click)="confermaTutte()" [disabled]="confermateCount() === 0">
                  <mat-icon>check_circle</mat-icon> Registra pagamenti ({{ confermateCount() }})
                </button>
              </div>

              <table class="riconc-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th style="text-align:right">Importo</th>
                    <th>Descrizione</th>
                    <th>Match suggerito</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of transazioni; track $index; let i = $index) {
                    <tr>
                      <td>{{ t.data | date:'dd/MM/yy' }}</td>
                      <td style="text-align:right" [style.color]="t.importo >= 0 ? '#16a34a' : '#dc2626'">
                        <b>{{ t.importo | currency:'EUR':'symbol':'1.2-2':'it' }}</b>
                      </td>
                      <td style="font-size:12px;color:#64748b;max-width:280px">
                        {{ t.descrizione }}
                      </td>
                      <td>
                        @if (t.loading) {
                          <mat-spinner diameter="16"></mat-spinner>
                        } @else if (!t.candidati || t.candidati.length === 0) {
                          <span style="color:#94a3b8;font-size:12px">Nessuna corrispondenza</span>
                        } @else {
                          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:100%">
                            <mat-select [(ngModel)]="t.matchScelto" placeholder="Scegli scadenza...">
                              <mat-option [value]="null">— ignora —</mat-option>
                              @for (c of t.candidati; track c.id + '_' + c.tipoEntry) {
                                <mat-option [value]="c">
                                  {{ c.tipoEntry === 'FATTURA' ? 'F' : 'A' }} {{ c.numero }} ·
                                  {{ c.controparte }} ·
                                  {{ c.residuo | currency:'EUR':'symbol':'1.2-2':'it' }}
                                </mat-option>
                              }
                            </mat-select>
                          </mat-form-field>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page { padding: 24px; }
    .page-header { margin-bottom: 16px; }
    .page-title { font-size: 24px; font-weight: 700; margin: 0; }
    .card { background: var(--bg-surface, #fff); border-radius: 10px; padding: 16px; border: 1px solid var(--border-subtle, #e2e8f0); }
    .riconc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .riconc-table th { background: var(--bg-surface-2, #f8fafc); padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary, #64748b); border-bottom: 1px solid var(--border-subtle, #e2e8f0); }
    .riconc-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-subtle, #e2e8f0); vertical-align: middle; }
  `],
})
export class RiconciliazioneComponent {
  contenuto = '';
  formato: 'ofx' | 'csv' = 'ofx';
  separatore = ';';
  loading = false;
  transazioni: Transazione[] = [];

  constructor(private api: ApiService, private snack: MatSnackBar) {}

  reset() { this.transazioni = []; this.contenuto = ''; }

  confermateCount(): number {
    return this.transazioni.filter(t => !!t.matchScelto).length;
  }

  async analizza() {
    this.loading = true;
    try {
      const url = this.formato === 'ofx'
        ? 'riconciliazione/parse-ofx'
        : `riconciliazione/parse-csv?sep=${encodeURIComponent(this.separatore)}`;
      const r = await new Promise<{ count: number; transazioni: Transazione[] }>((resolve, reject) => {
        // Invio testo grezzo come body (l'endpoint accetta text/*)
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${this.api['base']}/${url}`);
        xhr.setRequestHeader('Content-Type', 'text/plain');
        const token = localStorage.getItem('ordeva_token') || localStorage.getItem('folvera_token') || localStorage.getItem('invoxa_token');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.onload = () => xhr.status < 400 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText));
        xhr.onerror = () => reject(new Error('rete'));
        xhr.send(this.contenuto);
      });
      this.transazioni = r.transazioni;
      this.snack.open(`Trovate ${r.count} transazioni — analizzo i match...`, '', { duration: 2000 });
      await Promise.all(this.transazioni.map(t => this.cercaMatch(t)));
      this.snack.open('Match completati. Vai al tab "2. Match & conferma".', 'OK', { duration: 3500 });
    } catch (e: any) {
      this.snack.open('Errore parsing: ' + (e.message || e), 'OK', { duration: 4000 });
    } finally { this.loading = false; }
  }

  async cercaMatch(t: Transazione) {
    t.loading = true;
    try {
      const r: any = await new Promise((resolve, reject) => {
        this.api.post('riconciliazione/match', {
          data: t.data, importo: t.importo, descrizione: t.descrizione,
        }).subscribe({ next: resolve, error: reject });
      });
      t.candidati = r.candidati || [];
      // Auto-seleziona se score è chiaramente alto (>=10 = importo esatto)
      if (t.candidati && t.candidati.length && t.candidati[0].score >= 10) {
        t.matchScelto = t.candidati[0];
      }
    } catch (_) { t.candidati = []; }
    finally { t.loading = false; }
  }

  confermaTutte() {
    const payload = this.transazioni
      .filter(t => t.matchScelto)
      .map(t => ({
        tipoEntry: t.matchScelto!.tipoEntry,
        id: t.matchScelto!.id,
        data: t.data,
        importo: t.importo,
        note: `Riconc. ${t.descrizione || ''}`.slice(0, 200),
      }));
    if (!payload.length) return;
    this.api.post<{ creati: number; errori: any[] }>('riconciliazione/conferma', { transazioni: payload })
      .subscribe({
        next: r => {
          this.snack.open(`${r.creati} pagamenti registrati${r.errori.length ? ` · ${r.errori.length} errori` : ''}`, 'OK', { duration: 4000 });
          // rimuovi confermate dalla lista
          this.transazioni = this.transazioni.filter(t => !t.matchScelto);
        },
        error: e => this.snack.open('Errore conferma: ' + (e.error?.error || e.message), 'OK', { duration: 4000 }),
      });
  }
}

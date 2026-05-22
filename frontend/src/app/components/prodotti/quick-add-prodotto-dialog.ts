import { Component, Inject, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../services/data.service';
import { Prodotto, CategoriaProdotto, UnitaMisura, AliquotaIva } from '../../models';

@Component({
  selector: 'app-quick-add-prodotto-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatSnackBarModule, MatButtonToggleModule, MatTooltipModule,
  ],
  template: `
    <mat-dialog-content class="quick-add-content">
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);box-shadow:0 4px 12px -2px rgba(16,185,129,0.35)">
          <mat-icon>flash_on</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">Inserimento veloce</span>
          <span class="dialog-hero-sub">Compila i campi essenziali e premi "Salva e nuovo" per aggiungerne un altro. Categoria, IVA e U.M. restano memorizzate.</span>
        </div>
      </div>

      <form class="qa-form" (ngSubmit)="saveAndNew()">
        <div class="form-section is-primary">
          <div class="form-section-header">
            <mat-icon>label</mat-icon>
            <span>Prodotto</span>
            <span class="section-hint">* obbligatorio</span>
          </div>

          <mat-form-field style="width:100%">
            <mat-label>Nome *</mat-label>
            <input #nomeInput matInput [(ngModel)]="p.nome" name="nome" autocomplete="off"
                   (keydown.enter)="$event.preventDefault(); saveAndNew()" required>
          </mat-form-field>

          <div class="form-row">
            <mat-form-field>
              <mat-label>Codice</mat-label>
              <input matInput [(ngModel)]="p.codice" name="codice" autocomplete="off">
            </mat-form-field>
            <mat-form-field>
              <mat-label>Categoria</mat-label>
              <mat-select [(ngModel)]="p.categoria" name="categoria">
                <mat-option value="">— nessuna —</mat-option>
                @for (c of categorie; track c.id) {
                  <mat-option [value]="c.nome">{{ c.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-header">
            <mat-icon>sell</mat-icon>
            <span>Prezzo & quantità</span>
            <span class="section-hint">
              <mat-button-toggle-group [value]="prezzoMode" (change)="onPrezzoModeChange($event.value)"
                                      [hideSingleSelectionIndicator]="true" class="qa-mode-toggle">
                <mat-button-toggle value="netto">Netto</mat-button-toggle>
                <mat-button-toggle value="ivato">Ivato</mat-button-toggle>
              </mat-button-toggle-group>
            </span>
          </div>

          <div class="form-row">
            <mat-form-field>
              <mat-label>Prezzo ({{ prezzoMode }}) €</mat-label>
              <input matInput type="number" step="0.01" min="0" inputmode="decimal"
                     [value]="prezzoDisplay()" (input)="onPrezzoInput($event)">
            </mat-form-field>
            <mat-form-field>
              <mat-label>IVA</mat-label>
              <mat-select [(ngModel)]="p.iva" name="iva">
                @for (a of aliquoteIva; track a.id) {
                  <mat-option [value]="a.valore">{{ a.nome }} – {{ a.valore }}%</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field>
              <mat-label>Quantità iniziale</mat-label>
              <input matInput type="number" min="0" inputmode="numeric"
                     [(ngModel)]="p.quantita" name="quantita">
            </mat-form-field>
            <mat-form-field>
              <mat-label>Unità misura</mat-label>
              <mat-select [(ngModel)]="p.unitaMisura" name="um">
                @for (u of unitaMisura; track u.id) {
                  <mat-option [value]="u.simbolo">{{ u.nome }} ({{ u.simbolo }})</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </div>
      </form>

      @if (creati.length) {
        <div class="recap-section">
          <div class="recap-header">
            <mat-icon>check_circle</mat-icon>
            <span><b>{{ creati.length }}</b> {{ creati.length === 1 ? 'prodotto creato' : 'prodotti creati' }} in questa sessione</span>
          </div>
          <div class="recap-list">
            @for (r of creati.slice().reverse().slice(0, 8); track r.id) {
              <div class="recap-item">
                <span class="recap-name">{{ r.nome }}</span>
                <span class="recap-meta">
                  @if (r.codice) { <span class="recap-codice">{{ r.codice }}</span> }
                  <span class="recap-prezzo">{{ r.prezzo | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
                </span>
              </div>
            }
            @if (creati.length > 8) {
              <div class="recap-more">…e altri {{ creati.length - 8 }}</div>
            }
          </div>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Chiudi</button>
      <button mat-stroked-button type="button" color="primary" (click)="saveAndClose()" [disabled]="!isValid() || saving">
        <mat-icon>done</mat-icon> Salva e chiudi
      </button>
      <button mat-flat-button type="button" color="primary" (click)="saveAndNew()" [disabled]="!isValid() || saving"
              matTooltip="⏎ Invio nel campo Nome">
        <mat-icon>add</mat-icon> Salva e nuovo
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .quick-add-content { min-width: 560px; max-width: 100%; }
    @media (max-width: 767px) {
      .quick-add-content { min-width: 0; }
    }

    .qa-mode-toggle ::ng-deep .mat-button-toggle { font-size: 11px; }
    .qa-mode-toggle ::ng-deep .mat-button-toggle-button { height: 22px; padding: 0 10px; line-height: 22px; }
    .qa-mode-toggle ::ng-deep .mat-button-toggle-label-content { line-height: 22px; padding: 0; font-weight: 600; }

    .recap-section {
      margin-top: 16px;
      padding: 14px 16px;
      background: var(--success-soft);
      border: 1px solid rgba(16, 185, 129, 0.20);
      border-radius: var(--radius-md);
      animation: fade-up 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .recap-header {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--success-on);
      font-size: 13px;
      margin-bottom: 10px;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }
    .recap-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .recap-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      padding: 4px 8px;
      background: rgba(255,255,255,0.5);
      border-radius: var(--radius-sm);
      font-size: 12.5px;
    }
    .recap-name { color: var(--text-primary); font-weight: 500; flex: 1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recap-meta { display: inline-flex; gap: 8px; align-items: baseline; flex-shrink: 0; }
    .recap-codice { color: var(--text-tertiary); font-size: 11px; font-family: monospace; }
    .recap-prezzo { color: var(--success-on); font-weight: 600; font-variant-numeric: tabular-nums; }
    .recap-more { text-align: center; color: var(--text-tertiary); font-size: 11px; padding: 4px;
      font-style: italic; }

    .dark-mode .recap-item { background: rgba(0,0,0,0.20); }

    @keyframes fade-up {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class QuickAddProdottoDialogComponent implements OnInit, AfterViewInit {
  @ViewChild('nomeInput') nomeInputRef?: ElementRef<HTMLInputElement>;

  categorie: CategoriaProdotto[] = [];
  unitaMisura: UnitaMisura[] = [];
  aliquoteIva: AliquotaIva[] = [];

  p: Partial<Prodotto> = this.blank();
  creati: Prodotto[] = [];
  saving = false;
  prezzoMode: 'netto' | 'ivato' = (localStorage.getItem('prodotto-prezzo-mode') as 'netto' | 'ivato') ?? 'netto';

  // Sticky defaults — restano memorizzati tra inserimenti
  private lastCategoria = '';
  private lastIva = 22;
  private lastUm = 'pz';

  constructor(
    private ds: DataService,
    private snack: MatSnackBar,
    public dialogRef: MatDialogRef<QuickAddProdottoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit() {
    this.ds.getCategorieProdotto().subscribe(c => this.categorie = c);
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
  }

  ngAfterViewInit() {
    setTimeout(() => this.nomeInputRef?.nativeElement?.focus(), 100);
  }

  private blank(): Partial<Prodotto> {
    return {
      nome: '', codice: '', categoria: this.lastCategoria,
      prezzo: 0, prezzoAcquisto: undefined, iva: this.lastIva,
      quantita: 0, sogliaMinima: 0,
      unitaMisura: this.lastUm,
      barcode: '', codiceFornitore: '',
      descrizione: '', haVarianti: false,
    };
  }

  isValid(): boolean {
    return !!(this.p.nome && this.p.nome.trim().length);
  }

  prezzoDisplay(): number {
    const net = +(this.p.prezzo ?? 0);
    if (!net) return 0;
    const iva = +(this.p.iva ?? 0);
    if (this.prezzoMode === 'ivato') return +(net * (1 + iva / 100)).toFixed(2);
    return +net.toFixed(2);
  }

  onPrezzoInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    const val = parseFloat(raw);
    if (isNaN(val)) { this.p.prezzo = 0; return; }
    const iva = +(this.p.iva ?? 0);
    const net = this.prezzoMode === 'ivato' ? val / (1 + iva / 100) : val;
    this.p.prezzo = +net.toFixed(4);
  }

  onPrezzoModeChange(mode: 'netto' | 'ivato') {
    this.prezzoMode = mode;
    localStorage.setItem('prodotto-prezzo-mode', mode);
  }

  saveAndNew() {
    if (!this.isValid() || this.saving) return;
    this.saving = true;
    // Memorizza i defaults "sticky"
    this.lastCategoria = this.p.categoria ?? '';
    this.lastIva = +(this.p.iva ?? 22);
    this.lastUm = this.p.unitaMisura ?? 'pz';

    this.ds.createProdotto(this.p as Prodotto).subscribe({
      next: (r: any) => {
        const created: Prodotto = { ...(this.p as Prodotto), id: r.id };
        this.creati.push(created);
        this.saving = false;
        this.snack.open(`"${this.p.nome}" creato`, '', { duration: 1500 });
        this.p = this.blank();
        setTimeout(() => this.nomeInputRef?.nativeElement?.focus(), 50);
      },
      error: () => {
        this.saving = false;
        this.snack.open('Errore creazione prodotto', '', { duration: 3000 });
      },
    });
  }

  saveAndClose() {
    if (!this.isValid() || this.saving) {
      this.dialogRef.close(this.creati.length);
      return;
    }
    this.saving = true;
    this.ds.createProdotto(this.p as Prodotto).subscribe({
      next: (r: any) => {
        this.creati.push({ ...(this.p as Prodotto), id: r.id });
        this.dialogRef.close(this.creati.length);
      },
      error: () => {
        this.saving = false;
        this.snack.open('Errore creazione prodotto', '', { duration: 3000 });
      },
    });
  }

  close() {
    this.dialogRef.close(this.creati.length);
  }
}

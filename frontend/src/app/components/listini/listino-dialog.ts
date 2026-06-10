import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { Listino, ListinoPrezzo, Prodotto } from '../../models';

@Component({
  selector: 'app-listino-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatCheckboxModule, MatAutocompleteModule, MatTableModule, MatTabsModule,
    MatSnackBarModule, MatTooltipModule,
  ],
  template: `
    <mat-dialog-content class="listino-dialog-content">
      <div class="dialog-hero">
        <div class="dialog-hero-icon" style="background:linear-gradient(135deg,#0891b2 0%,#11769b 100%)">
          <mat-icon>price_change</mat-icon>
        </div>
        <div class="dialog-hero-text">
          <span class="dialog-hero-title">{{ data?.id ? data?.nome : 'Nuovo listino' }}</span>
          <span class="dialog-hero-sub">Sconto generico applicato a tutti i prodotti, con possibili override per singolo articolo</span>
        </div>
      </div>

      <mat-tab-group>
        <!-- ── Tab 1: Anagrafica ────────────────────────── -->
        <mat-tab label="Anagrafica">
          <form [formGroup]="form" class="dialog-form" style="padding-top:16px">
            <div class="form-section is-primary">
              <div class="form-section-header">
                <mat-icon>label</mat-icon>
                <span>Identità listino</span>
              </div>
              <mat-form-field style="width:100%">
                <mat-label>Nome *</mat-label>
                <input matInput formControlName="nome" placeholder="es. Listino rivenditori, B2B 2026...">
              </mat-form-field>
              <mat-form-field style="width:100%">
                <mat-label>Descrizione</mat-label>
                <textarea matInput rows="2" formControlName="descrizione" placeholder="Note descrittive opzionali"></textarea>
              </mat-form-field>
            </div>

            <div class="form-section">
              <div class="form-section-header">
                <mat-icon>percent</mat-icon>
                <span>Sconto di default</span>
                <span class="section-hint">Applicato a tutti i prodotti, salvo override</span>
              </div>
              <div class="form-row">
                <mat-form-field style="max-width:200px">
                  <mat-label>Sconto default (%)</mat-label>
                  <input matInput type="number" step="0.01" min="0" max="100" formControlName="scontoDefault">
                  <mat-icon matSuffix>percent</mat-icon>
                </mat-form-field>
                <div style="padding-top:18px">
                  <mat-checkbox formControlName="attivo">Listino attivo</mat-checkbox>
                </div>
              </div>
            </div>
          </form>
        </mat-tab>

        <!-- ── Tab 2: Prezzi per prodotto ───────────────── -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon style="font-size:18px;margin-right:6px;vertical-align:middle">sell</mat-icon>
            Prezzi personalizzati
            @if (prezzi.length) { <span class="tab-badge">{{ prezzi.length }}</span> }
          </ng-template>

          <div style="padding-top:16px">
            @if (!data?.id) {
              <div class="empty-tab">
                <mat-icon>info_outline</mat-icon>
                <p>Salva prima il listino per impostare prezzi personalizzati sui singoli prodotti.</p>
              </div>
            } @else {

              <!-- Aggiungi prodotto -->
              <div class="add-row">
                <mat-form-field style="flex:1">
                  <mat-label>Cerca prodotto da aggiungere</mat-label>
                  <input matInput [matAutocomplete]="autoProd" [formControl]="prodottoCtrl"
                         placeholder="Nome, codice o barcode...">
                  <mat-icon matSuffix>search</mat-icon>
                  <mat-autocomplete #autoProd="matAutocomplete" [displayWith]="displayProd"
                                    (optionSelected)="addProdotto($event.option.value)">
                    @for (p of filteredProdotti; track p.id) {
                      <mat-option [value]="p">
                        <span style="font-weight:600">{{ p.nome }}</span>
                        @if (p.codice) { <span style="color:#94a3b8;margin-left:8px">{{ p.codice }}</span> }
                        <span style="color:#10b981;margin-left:8px">{{ p.prezzo | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
                      </mat-option>
                    }
                  </mat-autocomplete>
                </mat-form-field>
              </div>

              <!-- Tabella prezzi -->
              @if (prezzi.length) {
                <table class="prezzi-table">
                  <thead>
                    <tr>
                      <th>Prodotto</th>
                      <th class="num">Prezzo base</th>
                      <th class="num">Prezzo override</th>
                      <th class="num">Sconto %</th>
                      <th class="num">Prezzo finale</th>
                      <th style="width:36px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of prezzi; track p.id) {
                      <tr>
                        <td>
                          <div style="font-weight:600">{{ p.prodottoNome }}</div>
                          @if (p.prodottoCodice) {
                            <div style="font-size:11px;color:#94a3b8">{{ p.prodottoCodice }}</div>
                          }
                        </td>
                        <td class="num" style="color:#94a3b8">{{ p.prodottoPrezzoBase | currency:'EUR':'symbol':'1.2-2':'it' }}</td>
                        <td>
                          <input class="prz-input num" type="number" step="0.01" min="0"
                                 [value]="p.prezzo ?? ''" placeholder="—"
                                 (blur)="updatePrezzo(p, $event)">
                        </td>
                        <td>
                          <input class="prz-input num" type="number" step="0.1" min="0" max="100"
                                 [value]="p.sconto ?? ''" placeholder="—"
                                 (blur)="updateSconto(p, $event)">
                        </td>
                        <td class="num"><b>{{ prezzoFinale(p) | currency:'EUR':'symbol':'1.2-2':'it' }}</b></td>
                        <td>
                          <button mat-icon-button type="button" color="warn" (click)="removePrezzo(p)" matTooltip="Rimuovi override">
                            <mat-icon style="font-size:18px">delete</mat-icon>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <div class="prz-hint">
                  <mat-icon>info</mat-icon>
                  <span><b>Prezzo override</b>: forza il prezzo finale ignorando lo sconto. <b>Sconto %</b>: applicato sul prezzo base del prodotto (sovrascrive lo sconto di default del listino).</span>
                </div>
              } @else {
                <div class="empty-tab">
                  <mat-icon>shopping_cart</mat-icon>
                  <p>Nessun prodotto con prezzo personalizzato.<br>
                     Senza override si applica lo sconto di default del listino ({{ form.value.scontoDefault || 0 }}%).</p>
                </div>
              }
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Chiudi</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .listino-dialog-content { min-width: 680px; }
    @media (max-width: 767px) {
      .listino-dialog-content { min-width: 0; }
      .add-row { flex-direction: column; gap: 0; }
      .prezzi-table {
        font-size: 12px;
        th, td { padding: 6px 6px !important; }
        th { font-size: 10px !important; }
      }
      .prz-input { width: 70px !important; padding: 4px 6px !important; font-size: 12px !important; }
      .prz-hint { padding: 10px 12px; font-size: 11px;
        mat-icon { font-size: 16px; width: 16px; height: 16px; }
      }
    }
    .empty-tab {
      text-align: center; padding: 40px 16px; color: #94a3b8;
      mat-icon { font-size: 40px; width: 40px; height: 40px; opacity: 0.5; margin-bottom: 8px; }
      p { margin: 0; font-size: 13px; }
    }
    .tab-badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 6px; margin-left: 8px;
      background: var(--primary); color: white; border-radius: 9px;
      font-size: 10px; font-weight: 700;
    }
    .add-row { display: flex; gap: 8px; margin-bottom: 12px; }
    .prezzi-table {
      width: 100%; border-collapse: collapse; font-size: 13px;
      th { background: var(--bg-surface-2); padding: 8px 10px; text-align: left;
           font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;
           border-bottom: 1px solid var(--border); letter-spacing: 0.04em; }
      th.num, td.num { text-align: right; }
      td { padding: 8px 10px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
      tbody tr:hover { background: var(--bg-surface-2); }
    }
    .prz-input {
      border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px;
      font-size: 13px; width: 90px; box-sizing: border-box; background: var(--bg-surface);
      color: var(--text-primary); font-variant-numeric: tabular-nums;
    }
    .prz-input.num { text-align: right; }
    .prz-input:focus { outline: none; border-color: var(--primary); box-shadow: var(--shadow-focus); }
    .prz-hint {
      display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px;
      background: var(--info-soft); border: 1px solid rgba(14,165,233,0.20);
      border-radius: 8px; margin-top: 12px; font-size: 12px; color: var(--info-on);
      mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    }
  `],
})
export class ListinoDialogComponent implements OnInit {
  form: FormGroup;
  prezzi: ListinoPrezzo[] = [];
  prodotti: Prodotto[] = [];
  filteredProdotti: Prodotto[] = [];
  prodottoCtrl = new FormControl<Prodotto | string | null>('');

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private snack: MatSnackBar,
    public dialogRef: MatDialogRef<ListinoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Listino | null,
  ) {
    this.form = this.fb.group({
      nome: [data?.nome ?? '', Validators.required],
      descrizione: [data?.descrizione ?? ''],
      scontoDefault: [data?.scontoDefault ?? 0, [Validators.min(0), Validators.max(100)]],
      attivo: [data?.attivo ?? true],
    });
  }

  ngOnInit() {
    this.ds.getProdotti().subscribe(p => {
      this.prodotti = p;
      this.filteredProdotti = p.slice(0, 50);
    });

    if (this.data?.id) this.loadPrezzi();

    this.prodottoCtrl.valueChanges.pipe(
      debounceTime(150), distinctUntilChanged(),
      map(v => typeof v === 'string' ? v.toLowerCase() : ''),
    ).subscribe(q => {
      const usedIds = new Set(this.prezzi.map(x => x.prodottoId));
      this.filteredProdotti = this.prodotti
        .filter(p => !usedIds.has(p.id!))
        .filter(p => !q || p.nome.toLowerCase().includes(q) ||
                     (p.codice || '').toLowerCase().includes(q) ||
                     (p.barcode || '').toLowerCase().includes(q))
        .slice(0, 50);
    });
  }

  displayProd = (p: Prodotto | string | null) =>
    typeof p === 'object' && p ? p.nome : (p as string) ?? '';

  loadPrezzi() {
    if (!this.data?.id) return;
    this.ds.getListinoPrezzi(this.data.id).subscribe(p => this.prezzi = p);
  }

  addProdotto(p: Prodotto) {
    if (!this.data?.id || !p?.id) return;
    this.ds.upsertListinoPrezzo(this.data.id, { prodottoId: p.id, prezzo: null, sconto: null }).subscribe({
      next: () => {
        this.loadPrezzi();
        this.prodottoCtrl.setValue('');
      },
      error: () => this.snack.open('Errore aggiunta prodotto', '', { duration: 3000 }),
    });
  }

  updatePrezzo(p: ListinoPrezzo, e: Event) {
    const v = (e.target as HTMLInputElement).value;
    const prezzo = v === '' ? null : +v;
    this.ds.upsertListinoPrezzo(this.data!.id!, { prodottoId: p.prodottoId, prezzo, sconto: p.sconto ?? null })
      .subscribe(() => this.loadPrezzi());
  }

  updateSconto(p: ListinoPrezzo, e: Event) {
    const v = (e.target as HTMLInputElement).value;
    const sconto = v === '' ? null : +v;
    this.ds.upsertListinoPrezzo(this.data!.id!, { prodottoId: p.prodottoId, prezzo: p.prezzo ?? null, sconto })
      .subscribe(() => this.loadPrezzi());
  }

  removePrezzo(p: ListinoPrezzo) {
    if (!p.id) return;
    this.ds.deleteListinoPrezzo(this.data!.id!, p.id).subscribe(() => this.loadPrezzi());
  }

  prezzoFinale(p: ListinoPrezzo): number {
    if (p.prezzo != null) return p.prezzo;
    const base = p.prodottoPrezzoBase || 0;
    const sconto = p.sconto != null ? p.sconto : (this.form.value.scontoDefault || 0);
    return +(base * (1 - sconto / 100)).toFixed(2);
  }

  save() {
    if (!this.form.valid) return;
    const payload: Listino = { ...this.data, ...this.form.value };
    const op = this.data?.id
      ? this.ds.updateListino({ ...payload, id: this.data.id })
      : this.ds.createListino(payload);
    op.subscribe({
      next: (r: any) => this.dialogRef.close(r?.id ?? this.data?.id),
      error: (e) => this.snack.open(e.error?.error || 'Errore salvataggio', '', { duration: 4000 }),
    });
  }
}

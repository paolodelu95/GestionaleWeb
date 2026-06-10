import { inject, Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { forkJoin, of } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state';
import { ConfirmService } from '../shared/confirm-dialog';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { Listino, ListinoColonna, ListinoPrezzo, Prodotto } from '../../models';
import { QuickListinoDialogComponent } from './quick-listino-dialog';

// ── Nuovo listino (anagrafica minima, poi si apre l'editor) ──────────────────
@Component({
  selector: 'app-nuovo-listino-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
            MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Nuovo listino</h2>
    <mat-dialog-content style="min-width:420px">
      <div class="dialog-form" style="padding-top:8px">
        <mat-form-field style="width:100%">
          <mat-label>Nome *</mat-label>
          <input matInput [(ngModel)]="nome" autofocus placeholder="es. Rivenditori 2026, B2B..."
                 (keyup.enter)="crea()">
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Descrizione</mat-label>
          <textarea matInput rows="2" [(ngModel)]="descrizione"
                    placeholder="Comparirà in testa al listino stampato"></textarea>
        </mat-form-field>
        <mat-form-field style="max-width:200px">
          <mat-label>Sconto default (%)</mat-label>
          <input matInput type="number" step="0.5" min="0" max="100" [(ngModel)]="scontoDefault">
          <mat-icon matSuffix>percent</mat-icon>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" (click)="crea()" [disabled]="!nome.trim()">
        <mat-icon>arrow_forward</mat-icon> Crea e apri editor
      </button>
    </mat-dialog-actions>`,
})
export class NuovoListinoDialogComponent {
  nome = '';
  descrizione = '';
  scontoDefault: number | null = null;
  constructor(public dialogRef: MatDialogRef<NuovoListinoDialogComponent>) {}
  crea() {
    if (!this.nome.trim()) return;
    this.dialogRef.close({
      nome: this.nome.trim(), descrizione: this.descrizione,
      scontoDefault: this.scontoDefault || 0, attivo: true,
    } as Listino);
  }
}

// ── Gestione colonne personalizzate ──────────────────────────────────────────
@Component({
  selector: 'app-colonne-listino-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
            MatInputModule, MatButtonModule, MatIconModule, MatTooltipModule, DragDropModule],
  template: `
    <h2 mat-dialog-title>Colonne personalizzate</h2>
    <mat-dialog-content style="min-width:480px">
      <p style="margin:0 0 14px;font-size:13px;color:var(--text-tertiary)">
        Aggiungi colonne descrittive al listino (es. dimensioni, peso, quantità per pallet).
        Compariranno nella tabella e nella stampa PDF, e potrai compilarle riga per riga.
      </p>

      <div cdkDropList (cdkDropListDropped)="riordina($event)">
        @for (c of colonne; track c.key) {
          <div class="col-row" cdkDrag>
            <mat-icon cdkDragHandle class="col-drag" matTooltip="Trascina per riordinare">drag_indicator</mat-icon>
            <input class="col-input" [(ngModel)]="c.label" placeholder="Nome colonna">
            <button mat-icon-button type="button" (click)="rimuovi(c)" matTooltip="Rimuovi colonna">
              <mat-icon style="color:#dc2626;font-size:18px">delete</mat-icon>
            </button>
          </div>
        }
      </div>
      @if (!colonne.length) {
        <p style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:8px 0">
          Nessuna colonna personalizzata.
        </p>
      }

      <div class="col-add">
        <input class="col-input" [(ngModel)]="nuova" placeholder="Nuova colonna…"
               (keyup.enter)="aggiungi()">
        <button mat-stroked-button color="primary" type="button" (click)="aggiungi()" [disabled]="!nuova.trim()">
          <mat-icon>add</mat-icon> Aggiungi
        </button>
      </div>

      <div class="col-suggerimenti">
        <span style="font-size:12px;color:var(--text-tertiary)">Suggerimenti:</span>
        @for (s of suggerimenti; track s) {
          @if (!esiste(s)) {
            <button type="button" class="col-chip" (click)="aggiungiNome(s)">+ {{ s }}</button>
          }
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" (click)="salva()">Salva colonne</button>
    </mat-dialog-actions>`,
  styles: [`
    .col-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    .col-drag { color: var(--text-tertiary); cursor: grab; font-size: 20px; }
    .col-input {
      flex: 1; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;
      font-size: 13px; background: var(--bg-surface); color: var(--text-primary);
    }
    .col-input:focus { outline: none; border-color: var(--primary); box-shadow: var(--shadow-focus); }
    .col-add { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
    .col-suggerimenti { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
    .col-chip {
      border: 1px dashed var(--border); background: transparent; border-radius: 99px;
      padding: 3px 10px; font-size: 12px; color: var(--text-secondary); cursor: pointer;
    }
    .col-chip:hover { border-color: var(--primary); color: var(--primary); }
  `],
})
export class ColonneListinoDialogComponent {
  colonne: ListinoColonna[] = [];
  nuova = '';
  readonly suggerimenti = ['Dimensioni', 'Peso', 'Q.tà per pallet', 'Q.tà per cartone', 'Confezione', 'Colore', 'Materiale', 'Note'];

  constructor(
    public dialogRef: MatDialogRef<ColonneListinoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: ListinoColonna[] | null,
  ) {
    this.colonne = (data || []).map(c => ({ ...c }));
  }

  esiste(label: string): boolean {
    return this.colonne.some(c => c.label.toLowerCase() === label.toLowerCase());
  }

  private slug(label: string): string {
    const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'col';
    let key = base, i = 2;
    while (this.colonne.some(c => c.key === key)) key = `${base}_${i++}`;
    return key;
  }

  aggiungi() { this.aggiungiNome(this.nuova); this.nuova = ''; }

  aggiungiNome(label: string) {
    const l = label.trim();
    if (!l || this.esiste(l) || this.colonne.length >= 12) return;
    this.colonne.push({ key: this.slug(l), label: l });
  }

  rimuovi(c: ListinoColonna) { this.colonne = this.colonne.filter(x => x !== c); }

  riordina(e: CdkDragDrop<ListinoColonna[]>) {
    moveItemInArray(this.colonne, e.previousIndex, e.currentIndex);
  }

  salva() {
    this.dialogRef.close(this.colonne.filter(c => c.label.trim()));
  }
}

// ── Multi-picker prodotti (flag rapidi + filtro per categoria) ───────────────
@Component({
  selector: 'app-selezione-prodotti-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatButtonModule, MatIconModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>Aggiungi prodotti al listino</h2>
    <mat-dialog-content class="sp-content">
      <div class="sp-filters">
        <mat-form-field style="flex:2" subscriptSizing="dynamic">
          <mat-label>Cerca per nome, codice o categoria</mat-label>
          <input matInput [(ngModel)]="query" (ngModelChange)="filtra()" autofocus>
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <mat-form-field style="flex:1;min-width:170px" subscriptSizing="dynamic">
          <mat-label>Categoria</mat-label>
          <mat-select [(ngModel)]="categoria" (selectionChange)="filtra()">
            <mat-option [value]="''">Tutte le categorie</mat-option>
            @for (c of categorie; track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <div class="sp-toolbar">
        <mat-checkbox [checked]="tuttiFiltratiSelezionati()"
                      [indeterminate]="alcuniFiltratiSelezionati()"
                      (change)="toggleTutti($event.checked)">
          Seleziona tutti i {{ filtrati.length }} prodotti filtrati
        </mat-checkbox>
        <span class="totals-spacer" style="flex:1"></span>
        <span class="sp-count" [class.has-sel]="selezione.size">{{ selezione.size }} selezionati</span>
      </div>

      <div class="sp-list">
        @for (p of filtrati; track p.id) {
          <div class="sp-row" (click)="toggle(p)">
            <mat-checkbox [checked]="selezione.has(p.id!)" (click)="$event.preventDefault()"></mat-checkbox>
            <span class="sp-code">{{ p.codice || '—' }}</span>
            <span class="sp-nome">{{ p.nome }}</span>
            <span class="sp-cat">{{ p.categoria }}</span>
            <span class="sp-price">{{ p.prezzo | currency:'EUR':'symbol':'1.2-2':'it' }}</span>
          </div>
        }
        @if (!filtrati.length) {
          <p class="sp-empty">Nessun prodotto trovato{{ esistenti.size ? ' (quelli già nel listino sono esclusi)' : '' }}.</p>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" [disabled]="!selezione.size" (click)="conferma()">
        <mat-icon>playlist_add</mat-icon> Aggiungi {{ selezione.size || '' }}
      </button>
    </mat-dialog-actions>`,
  styles: [`
    .sp-content { width: 720px; max-width: 100%; }
    .sp-filters { display: flex; gap: 12px; flex-wrap: wrap; padding-top: 6px; }
    .sp-toolbar { display: flex; align-items: center; margin: 8px 0 6px; }
    .sp-count { font-size: 13px; color: var(--text-tertiary); }
    .sp-count.has-sel { color: var(--primary); font-weight: 700; }
    .sp-list { border: 1px solid var(--border); border-radius: var(--radius-md); max-height: 46vh; overflow-y: auto; }
    .sp-row {
      display: flex; align-items: center; gap: 10px; padding: 6px 10px; cursor: pointer;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sp-row:hover { background: var(--bg-surface-2); }
    .sp-code { font-family: monospace; font-size: 12px; color: #0e6480; min-width: 84px; }
    .sp-nome { flex: 1; font-weight: 500; font-size: 13px; }
    .sp-cat { color: var(--text-tertiary); font-size: 12px; min-width: 90px; }
    .sp-price { color: #059669; font-weight: 600; font-size: 13px; min-width: 80px; text-align: right;
                font-variant-numeric: tabular-nums; }
    .sp-empty { text-align: center; color: var(--text-tertiary); padding: 22px; font-size: 13px; margin: 0; }
  `],
})
export class SelezioneProdottiDialogComponent implements OnInit {
  prodotti: Prodotto[] = [];
  filtrati: Prodotto[] = [];
  categorie: string[] = [];
  esistenti = new Set<number>();
  selezione = new Set<number>();
  query = '';
  categoria = '';

  constructor(
    private ds: DataService,
    public dialogRef: MatDialogRef<SelezioneProdottiDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: { esistenti?: number[] } | null,
  ) {
    this.esistenti = new Set(data?.esistenti || []);
  }

  ngOnInit() {
    this.ds.getProdotti().subscribe(p => {
      this.prodotti = p.filter(x => !this.esistenti.has(x.id!));
      this.categorie = [...new Set(this.prodotti.map(x => x.categoria).filter(Boolean))].sort();
      this.filtra();
    });
  }

  filtra() {
    const tokens = this.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    this.filtrati = this.prodotti
      .filter(p => !this.categoria || p.categoria === this.categoria)
      .filter(p => {
        if (!tokens.length) return true;
        const hay = `${p.codice ?? ''} ${p.nome ?? ''} ${p.categoria ?? ''}`.toLowerCase();
        return tokens.every(t => hay.includes(t));
      });
  }

  toggle(p: Prodotto) {
    if (this.selezione.has(p.id!)) this.selezione.delete(p.id!);
    else this.selezione.add(p.id!);
  }

  tuttiFiltratiSelezionati(): boolean {
    return this.filtrati.length > 0 && this.filtrati.every(p => this.selezione.has(p.id!));
  }
  alcuniFiltratiSelezionati(): boolean {
    return !this.tuttiFiltratiSelezionati() && this.filtrati.some(p => this.selezione.has(p.id!));
  }
  toggleTutti(checked: boolean) {
    for (const p of this.filtrati) {
      if (checked) this.selezione.add(p.id!);
      else this.selezione.delete(p.id!);
    }
  }

  conferma() { this.dialogRef.close([...this.selezione]); }
}

// ── Pagina Listini (Vendite → Listini): elenco + editor ─────────────────────
@Component({
  selector: 'app-listini',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatMenuModule,
            MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatTooltipModule,
            MatDialogModule, MatSnackBarModule, DragDropModule, EmptyStateComponent],
  templateUrl: './listini.html',
  styleUrl: './listini.scss',
})
export class ListiniComponent implements OnInit {
  private confirm = inject(ConfirmService);

  // ── elenco ──
  listini: Listino[] = [];

  // ── editor ──
  sel: Listino | null = null;
  prezzi: ListinoPrezzo[] = [];
  filtro = '';
  scontoBulk: number | null = null;
  prodotti: Prodotto[] = [];
  private anagraficaSnapshot = '';

  constructor(
    private ds: DataService,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private printSvc: PrintService,
  ) {}

  ngOnInit() { this.loadListini(); }

  loadListini() { this.ds.getListini().subscribe(l => this.listini = l); }

  // ── Elenco: creazione / apertura / eliminazione ────────────────────────────

  nuovoListino() {
    this.dialog.open(NuovoListinoDialogComponent, { width: '480px', maxWidth: '96vw' })
      .afterClosed().subscribe((l: Listino | undefined) => {
        if (!l) return;
        this.ds.createListino(l).subscribe({
          next: (r: any) => { this.loadListini(); if (r?.id) this.apri(r.id); },
          error: (e) => this.snack.open(e.error?.error || 'Errore creazione listino', 'OK', { duration: 4000 }),
        });
      });
  }

  openQuickListino() {
    this.dialog.open(QuickListinoDialogComponent, { width: '860px', maxWidth: '96vw' })
      .afterClosed().subscribe((id) => {
        this.loadListini();
        if (typeof id === 'number') this.apri(id);
      });
  }

  apri(id: number) {
    forkJoin({
      listino: this.ds.getListino(id),
      prezzi: this.ds.getListinoPrezzi(id),
    }).subscribe(({ listino, prezzi }) => {
      this.sel = { ...listino, colonneExtra: listino.colonneExtra || [] };
      this.prezzi = prezzi;
      this.filtro = '';
      this.scontoBulk = null;
      this.anagraficaSnapshot = this.snapshot();
      if (!this.prodotti.length) this.ds.getProdotti().subscribe(p => this.prodotti = p);
    });
  }

  chiudiEditor() {
    this.sel = null;
    this.prezzi = [];
    this.loadListini();
  }

  async deleteListino(l: Listino) {
    if (!await this.confirm.delete(`Eliminare il listino "${l.nome}"?\n\nI clienti assegnati torneranno a usare i prezzi base.`)) return;
    this.ds.deleteListino(l.id!).subscribe({
      next: () => {
        if (this.sel?.id === l.id) { this.sel = null; this.prezzi = []; }
        this.loadListini();
        this.snack.open('Listino eliminato', '', { duration: 2000 });
      },
      error: () => this.snack.open('Errore eliminazione', '', { duration: 3000 }),
    });
  }

  // ── Editor: anagrafica (salvataggio automatico su blur/toggle) ─────────────

  private snapshot(): string {
    const s = this.sel!;
    return JSON.stringify([s.nome, s.descrizione, s.scontoDefault, s.attivo, s.colonneExtra]);
  }

  salvaAnagrafica() {
    if (!this.sel?.id || !this.sel.nome?.trim()) return;
    if (this.snapshot() === this.anagraficaSnapshot) return;
    this.ds.updateListino(this.sel).subscribe({
      next: () => { this.anagraficaSnapshot = this.snapshot(); },
      error: (e) => this.snack.open(e.error?.error || 'Errore salvataggio', 'OK', { duration: 4000 }),
    });
  }

  gestisciColonne() {
    this.dialog.open(ColonneListinoDialogComponent, {
      data: this.sel!.colonneExtra || [], width: '540px', maxWidth: '96vw',
    }).afterClosed().subscribe((cols: ListinoColonna[] | undefined) => {
      if (!cols) return;
      this.sel!.colonneExtra = cols;
      this.salvaAnagrafica();
    });
  }

  // ── Editor: aggiunta prodotti ───────────────────────────────────────────────

  apriPicker() {
    this.dialog.open(SelezioneProdottiDialogComponent, {
      data: { esistenti: this.prezzi.map(p => p.prodottoId) },
      width: '760px', maxWidth: '96vw',
    }).afterClosed().subscribe((ids: number[] | undefined) => {
      if (ids?.length) this.bulkAdd(ids);
    });
  }

  get categorieDisponibili(): { nome: string; count: number }[] {
    const inListino = new Set(this.prezzi.map(p => p.prodottoId));
    const map = new Map<string, number>();
    for (const p of this.prodotti) {
      if (!p.categoria || inListino.has(p.id!)) continue;
      map.set(p.categoria, (map.get(p.categoria) || 0) + 1);
    }
    return [...map.entries()].map(([nome, count]) => ({ nome, count }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  aggiungiCategoria(categoria: string) {
    const inListino = new Set(this.prezzi.map(p => p.prodottoId));
    const ids = this.prodotti
      .filter(p => p.categoria === categoria && !inListino.has(p.id!))
      .map(p => p.id!);
    if (ids.length) this.bulkAdd(ids);
  }

  private bulkAdd(ids: number[]) {
    this.ds.bulkAddListinoPrezzi(this.sel!.id!, ids).subscribe({
      next: (r) => {
        this.reloadPrezzi();
        this.snack.open(`${r.aggiunti} prodotti aggiunti al listino`, '', { duration: 2500 });
      },
      error: () => this.snack.open('Errore aggiunta prodotti', '', { duration: 3000 }),
    });
  }

  private reloadPrezzi() {
    this.ds.getListinoPrezzi(this.sel!.id!).subscribe(p => this.prezzi = p);
  }

  // ── Editor: righe (filtro client, modifica inline, drag, rimozione) ─────────

  get righeVisibili(): ListinoPrezzo[] {
    const tokens = this.filtro.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return this.prezzi;
    return this.prezzi.filter(p => {
      const hay = `${p.prodottoCodice ?? ''} ${p.prodottoNome ?? ''} ${p.prodottoCategoria ?? ''}`.toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }

  private upsertRiga(p: ListinoPrezzo, includeExtra = false) {
    this.ds.upsertListinoPrezzo(this.sel!.id!, {
      prodottoId: p.prodottoId,
      prezzo: p.prezzo ?? null,
      sconto: p.sconto ?? null,
      ...(includeExtra ? { datiExtra: p.datiExtra || {} } : {}),
    }).subscribe({
      error: () => { this.snack.open('Errore salvataggio riga', '', { duration: 3000 }); this.reloadPrezzi(); },
    });
  }

  updatePrezzo(p: ListinoPrezzo, e: Event) {
    const v = (e.target as HTMLInputElement).value;
    p.prezzo = v === '' ? null : +v;
    this.upsertRiga(p);
  }

  updateSconto(p: ListinoPrezzo, e: Event) {
    const v = (e.target as HTMLInputElement).value;
    p.sconto = v === '' ? null : +v;
    this.upsertRiga(p);
  }

  updateExtra(p: ListinoPrezzo, key: string, e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!p.datiExtra) p.datiExtra = {};
    if ((p.datiExtra[key] || '') === v) return;
    p.datiExtra[key] = v;
    this.upsertRiga(p, true);
  }

  removeRiga(p: ListinoPrezzo) {
    if (!p.id) return;
    this.ds.deleteListinoPrezzo(this.sel!.id!, p.id).subscribe(() => {
      this.prezzi = this.prezzi.filter(x => x.id !== p.id);
    });
  }

  async svuotaListino() {
    if (!this.prezzi.length) return;
    if (!await this.confirm.delete(`Rimuovere tutte le ${this.prezzi.length} righe dal listino?`)) return;
    forkJoin(this.prezzi.map(p => this.ds.deleteListinoPrezzo(this.sel!.id!, p.id!)))
      .subscribe(() => { this.prezzi = []; this.snack.open('Listino svuotato', '', { duration: 2000 }); });
  }

  dropRiga(e: CdkDragDrop<ListinoPrezzo[]>) {
    if (this.filtro) return; // con filtro attivo il riordino è disabilitato
    moveItemInArray(this.prezzi, e.previousIndex, e.currentIndex);
    this.ds.riordinaListinoPrezzi(this.sel!.id!, this.prezzi.map(p => p.id!)).subscribe({
      error: () => this.snack.open('Errore salvataggio ordine', '', { duration: 3000 }),
    });
  }

  applicaScontoBulk() {
    const s = this.scontoBulk;
    if (s == null || isNaN(+s) || !this.prezzi.length) return;
    const ops = this.prezzi.map(p => {
      p.sconto = +s; p.prezzo = null;
      return this.ds.upsertListinoPrezzo(this.sel!.id!, { prodottoId: p.prodottoId, prezzo: null, sconto: +s });
    });
    forkJoin(ops.length ? ops : [of(null)]).subscribe({
      next: () => this.snack.open(`Sconto ${s}% applicato a ${ops.length} righe`, '', { duration: 2500 }),
      error: () => { this.snack.open('Errore applicazione sconto', '', { duration: 3000 }); this.reloadPrezzi(); },
    });
  }

  prezzoFinale(p: ListinoPrezzo): number {
    if (p.prezzo != null) return p.prezzo;
    const base = p.prodottoPrezzoBase || 0;
    const sconto = p.sconto != null ? p.sconto : (this.sel?.scontoDefault || 0);
    return +(base * (1 - sconto / 100)).toFixed(2);
  }

  /** Invio su una cella: passa alla stessa colonna della riga successiva (stile foglio di calcolo). */
  focusNext(e: Event, col: string) {
    e.preventDefault();
    const input = e.target as HTMLInputElement;
    const row = +(input.getAttribute('data-row') || 0);
    const next = input.closest('table')
      ?.querySelector<HTMLInputElement>(`input[data-col="${col}"][data-row="${row + 1}"]`);
    if (next) { next.focus(); next.select(); }
  }

  stampa() {
    if (!this.sel) return;
    this.printSvc.printListino(this.sel, this.prezzi);
  }
}

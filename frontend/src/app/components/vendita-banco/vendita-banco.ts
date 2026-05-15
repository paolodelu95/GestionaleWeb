import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { VenditaBanco, Prodotto, ProdottoVariante, RigaDocumento, AliquotaIva, UnitaMisura } from '../../models';

interface RigaVendita extends RigaDocumento {
  varianteId?: number | null;
  varianteTaglia?: string;
  varianteColore?: string;
  haVarianti?: boolean;
}

@Component({
  selector: 'app-vendita-banco',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatTabsModule, MatSnackBarModule, MatAutocompleteModule,
  ],
  templateUrl: './vendita-banco.html',
  styles: [`
    .page { padding: 24px; max-width: 1100px; margin: 0 auto; }
    .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; flex: 1; margin: 0; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08); padding: 20px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .form-field { display: flex; flex-direction: column; gap: 4px; }
    .form-field label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
    .form-field input, .form-field select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px; font-size: 14px; outline: none; transition: border-color .15s; }
    .form-field input:focus, .form-field select:focus { border-color: #4f46e5; }
    .righe-header { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; }
    .righe-title { font-size: 13px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: .5px; }
    .righe-table { width: 100%; border-collapse: collapse; }
    .righe-table th { background: #f8fafc; padding: 8px; font-size: 11px; font-weight: 700; text-align: left; border-bottom: 1px solid #e2e8f0; color: #64748b; text-transform: uppercase; }
    .righe-table td { padding: 4px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .riga-input { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; font-size: 13px; width: 100%; box-sizing: border-box; }
    .riga-input:focus { outline: none; border-color: #4f46e5; }
    .riga-input.num { width: 70px; text-align: right; }
    .totali-box { display: flex; justify-content: flex-end; margin-top: 16px; }
    .totali-inner { min-width: 260px; }
    .totali-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; }
    .totali-finale { display: flex; justify-content: space-between; padding: 10px 14px; background: #4f46e5; color: #fff; border-radius: 8px; font-size: 16px; font-weight: 700; margin-top: 8px; }
    .actions-bar { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
    mat-table { width: 100%; }
    th.mat-header-cell { font-weight: 700; font-size: 12px; color: #64748b; text-transform: uppercase; background: #f8fafc; }
    td.mat-cell { font-size: 13px; }
    .resto-box { border: 1px solid #e0e7ff; border-radius: 12px; background: #f5f3ff; margin-top: 16px; overflow: hidden; }
    .resto-header { background: #ede9fe; padding: 10px 16px; font-size: 13px; font-weight: 700; color: #4f46e5; display: flex; align-items: center; }
    .resto-body { padding: 14px 16px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .resto-banconote { display: flex; gap: 8px; flex-wrap: wrap; }
    .banconota-btn { position: relative; border: 2px solid #c7d2fe; background: #fff; border-radius: 8px; padding: 6px 14px; font-size: 14px; font-weight: 700; color: #4338ca; cursor: pointer; transition: all .15s; }
    .banconota-btn:hover { background: #e0e7ff; border-color: #6366f1; }
    .banconota-btn.banconota-selected { background: #4f46e5; color: #fff; border-color: #4f46e5; }
    .banconota-count { position: absolute; top: -7px; right: -7px; background: #f59e0b; color: #fff; border-radius: 99px; font-size: 10px; font-weight: 800; min-width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; padding: 0 3px; line-height: 1; }
    .resto-clear-btn { border: none; background: none; cursor: pointer; color: #94a3b8; padding: 0 6px; display: flex; align-items: center; transition: color .15s; }
    .resto-clear-btn:hover { color: #dc2626; }
    .resto-clear-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .resto-input-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .resto-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; }
    .resto-input-wrap { display: flex; align-items: center; border: 2px solid #c7d2fe; border-radius: 8px; background: #fff; overflow: hidden; }
    .resto-currency { padding: 0 8px; font-weight: 700; color: #6366f1; font-size: 15px; }
    .resto-input { border: none; outline: none; padding: 8px 10px 8px 0; font-size: 15px; font-weight: 700; width: 100px; color: #1e293b; }
    .resto-risultato { display: flex; align-items: center; gap: 6px; font-size: 15px; padding: 6px 14px; border-radius: 8px; font-weight: 600; }
    .resto-ok { background: #dcfce7; color: #15803d; }
    .resto-err { background: #fee2e2; color: #dc2626; }
    .resto-risultato mat-icon { font-size: 18px; width: 18px; height: 18px; }
  `]
})
export class VenditaBancoComponent implements OnInit, AfterViewInit {

  today = new Date().toISOString().substring(0, 10);
  vendita: VenditaBanco = { numero: '', data: this.today, clienteNome: '', metodoPagamento: 'CONTANTI' };
  righe: RigaVendita[] = [];
  prodottiList: Prodotto[] = [];
  filteredProdotti: (Prodotto[] | undefined)[] = [];
  variantiPerRiga: ProdottoVariante[][] = [];
  aliquoteIva: AliquotaIva[] = [];
  unitaMisura: UnitaMisura[] = [];
  metodi = ['CONTANTI', 'BANCOMAT', 'CARTA DI CREDITO', 'BONIFICO', 'ASSEGNO'];

  get imponibile(): number {
    return this.righe.reduce((s, r) => s + (r.quantita || 0) * (r.prezzo || 0) * (1 - (r.sconto || 0) / 100), 0);
  }
  get ivaTotal(): number {
    return this.righe.reduce((s, r) => {
      const imp = (r.quantita || 0) * (r.prezzo || 0) * (1 - (r.sconto || 0) / 100);
      return s + imp * ((r.iva || 0) / 100);
    }, 0);
  }
  get totale(): number { return this.imponibile + this.ivaTotal; }

  importoPagato: number | null = null;
  selectedBanconote: number[] = [];
  get resto(): number | null {
    if (this.importoPagato == null) return null;
    return Math.round((this.importoPagato - this.totale) * 100) / 100;
  }
  readonly banconote = [5, 10, 20, 50, 100, 200];
  addBanconota(b: number) {
    this.selectedBanconote.push(b);
    this.importoPagato = this.selectedBanconote.reduce((a, x) => a + x, 0);
  }
  countBanconota(b: number): number {
    return this.selectedBanconote.filter(x => x === b).length;
  }
  clearImporto() {
    this.importoPagato = null;
    this.selectedBanconote = [];
  }

  ivaBreakdown(): { aliquota: number; imp: number; iva: number }[] {
    const map = new Map<number, { imp: number; iva: number }>();
    for (const r of this.righe) {
      const imp = (r.quantita || 0) * (r.prezzo || 0) * (1 - (r.sconto || 0) / 100);
      const ex = map.get(r.iva) || { imp: 0, iva: 0 };
      map.set(r.iva, { imp: ex.imp + imp, iva: ex.iva + imp * (r.iva / 100) });
    }
    return [...map.entries()].map(([a, v]) => ({ aliquota: a, ...v })).filter(x => x.imp > 0);
  }

  storico: VenditaBanco[] = [];
  dsStorico = new MatTableDataSource<VenditaBanco>([]);
  colStorico = ['data', 'numero', 'cliente', 'metodo', 'totale', 'azioni'];
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private ds: DataService, private printSvc: PrintService, private snack: MatSnackBar) {}

  ngOnInit() {
    this.ds.getProdotti().subscribe(p => this.prodottiList = p);
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.loadNextNumber();
    this.loadStorico();
  }

  ngAfterViewInit() {
    this.dsStorico.sort = this.sort;
    this.dsStorico.sortingDataAccessor = (item, col) => {
      if (col === 'totale') return item.totale ?? 0;
      if (col === 'data') return item.data;
      return (item as any)[col] ?? '';
    };
  }

  loadNextNumber() {
    this.ds.getNextNumberVenditaBanco().subscribe(r => {
      this.vendita.numero = String(r.numero).padStart(4, '0');
    });
  }

  loadStorico() {
    this.ds.getVenditeBanco().subscribe(v => { this.storico = v; this.dsStorico.data = v; });
  }

  addRiga() {
    const idx = this.righe.length;
    this.righe.push({ descrizione: '', quantita: 1, prezzo: 0, sconto: 0, iva: 22 });
    this.filteredProdotti[idx] = this.prodottiList;
    this.variantiPerRiga[idx] = [];
  }

  removeRiga(i: number) {
    this.righe.splice(i, 1);
    this.filteredProdotti.splice(i, 1);
    this.variantiPerRiga.splice(i, 1);
  }

  onProdottoInput(i: number, value: string) {
    if (!value) { this.filteredProdotti[i] = this.prodottiList; return; }
    const v = value.toLowerCase();
    this.filteredProdotti[i] = this.prodottiList.filter(p =>
      p.nome.toLowerCase().includes(v) ||
      (p.codice || '').toLowerCase().includes(v) ||
      (p.barcode || '').toLowerCase().includes(v)
    );
    // Barcode exact match → auto-select immediately
    const match = this.prodottiList.find(p => p.barcode && p.barcode === value);
    if (match) {
      this.selectProdotto(i, match);
      this.righe[i].descrizione = match.nome;
    }
  }

  onBarcodeKeydown(i: number, event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    const val = this.righe[i].descrizione?.trim();
    if (!val) return;
    // Try product-level barcode first
    const match = this.prodottiList.find(p => p.barcode === val);
    if (match) { this.selectProdotto(i, match); this.righe[i].descrizione = match.nome; return; }
    // Try API (variant barcode)
    this.ds.searchByBarcode(val).subscribe({
      next: res => {
        this.selectProdotto(i, res.prodotto);
        this.righe[i].descrizione = res.prodotto.nome;
        if (res.variante) this.selectVariante(i, res.variante);
      },
      error: () => {}
    });
  }

  selectProdotto(i: number, p: Prodotto) {
    const r = this.righe[i];
    r.descrizione = p.nome;
    r.prezzo = p.prezzo;
    r.iva = p.iva;
    r.prodottoId = p.id;
    r.unitaMisura = p.unitaMisura;
    r.haVarianti = p.haVarianti;
    r.varianteId = null;
    r.varianteTaglia = '';
    r.varianteColore = '';
    this.variantiPerRiga[i] = [];
    if (p.haVarianti && p.id) {
      this.ds.getProdottoVarianti(p.id).subscribe(v => { this.variantiPerRiga[i] = v; });
    }
  }

  selectVariante(i: number, v: ProdottoVariante) {
    this.righe[i].varianteId = v.id;
    this.righe[i].varianteTaglia = v.taglia;
    this.righe[i].varianteColore = v.colore;
  }

  onVarianteChange(i: number) {
    const raw = this.righe[i].varianteId;
    const id = raw != null ? +raw : null;
    const v = this.variantiPerRiga[i]?.find(x => x.id === id);
    if (v) {
      this.righe[i].varianteId = v.id;
      this.righe[i].varianteTaglia = v.taglia;
      this.righe[i].varianteColore = v.colore;
    } else {
      this.righe[i].varianteId = null;
      this.righe[i].varianteTaglia = '';
      this.righe[i].varianteColore = '';
    }
  }

  varianteLabel(v: ProdottoVariante): string {
    const parts = [v.taglia, v.colore].filter(Boolean);
    return parts.length ? `${parts.join(' / ')} (qtà: ${v.quantita})` : `Variante #${v.id}`;
  }

  roundIfPz(r: { unitaMisura?: string; quantita: number }) {
    if (r.unitaMisura === 'pz') r.quantita = Math.round(r.quantita || 0);
  }

  prezzoIvato(r: RigaVendita): number {
    return +((r.prezzo || 0) * (1 + (r.iva || 0) / 100)).toFixed(2);
  }

  setPrezzoFromGross(r: RigaVendita, event: Event) {
    const gross = +(event.target as HTMLInputElement).value;
    r.prezzo = gross > 0 ? +(gross / (1 + (r.iva || 0) / 100)).toFixed(6) : 0;
  }

  rigaImporto(r: RigaVendita): number {
    return (r.quantita || 0) * (r.prezzo || 0) * (1 + (r.iva || 0) / 100) * (1 - (r.sconto || 0) / 100);
  }

  salvaEStampa() {
    if (!this.righe.length) { this.snack.open('Aggiungi almeno un prodotto', '', { duration: 2000 }); return; }
    const payload: VenditaBanco = { ...this.vendita, righe: this.righe };
    this.ds.createVenditaBanco(payload).subscribe({
      next: res => {
        this.snack.open('Vendita registrata', '', { duration: 2000 });
        this.printSvc.printDocumentale(res.id);
        this.loadStorico();
        this.righe = [];
        this.filteredProdotti = [];
        this.variantiPerRiga = [];
        this.importoPagato = null;
        this.selectedBanconote = [];
        this.vendita = { numero: '', data: this.today, clienteNome: '', metodoPagamento: 'CONTANTI' };
        this.loadNextNumber();
      },
      error: e => this.snack.open(e.message, '', { duration: 3000 })
    });
  }

  stampa(v: VenditaBanco) { this.printSvc.printDocumentale(v.id!); }

  elimina(v: VenditaBanco) {
    if (!confirm(`Eliminare la vendita ${v.numero}?`)) return;
    this.ds.deleteVenditaBanco(v.id!).subscribe(() => {
      this.loadStorico();
      this.snack.open('Eliminata', '', { duration: 2000 });
    });
  }

  fd(s: string): string {
    if (!s) return '—';
    const p = s.substring(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
  }
}

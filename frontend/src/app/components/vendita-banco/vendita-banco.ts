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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DataService } from '../../services/data.service';
import { PrintService } from '../../services/print.service';
import { VenditaBanco, Prodotto, ProdottoVariante, RigaDocumento, AliquotaIva, UnitaMisura, Cliente } from '../../models';
import { normalizePiva } from '../../validators/italian-validators';

interface RigaVendita extends RigaDocumento {
  varianteId?: number | null;
  varianteTaglia?: string;
  varianteColore?: string;
  haVarianti?: boolean;
}

interface MetodoPagamento {
  valore: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-vendita-banco',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatTabsModule, MatSnackBarModule, MatAutocompleteModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './vendita-banco.html',
  styles: [`
    .form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .form-field { display: flex; flex-direction: column; gap: 4px; }
    .form-field label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
    .form-field input, .form-field select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px; font-size: 14px; outline: none; transition: border-color .15s; }
    .form-field input:focus, .form-field select:focus { border-color: #4f46e5; }

    /* Metodi pagamento */
    .metodi-grid { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
    .metodo-btn {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; width: 110px; height: 80px; border: 2px solid #e2e8f0;
      border-radius: 12px; background: #fff; cursor: pointer; transition: all .15s;
      font-size: 12px; font-weight: 700; color: #475569; padding: 8px 4px;
    }
    .metodo-btn mat-icon { font-size: 26px; width: 26px; height: 26px; }
    .metodo-btn:hover { border-color: #4f46e5; background: #f5f3ff; color: #4f46e5; }
    .metodo-btn.selected { border-color: #4f46e5; background: #4f46e5; color: #fff; }
    .metodo-btn.selected mat-icon { color: #fff; }

    /* Tabella righe */
    .righe-header { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; }
    .righe-title { font-size: 13px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: .5px; }
    .righe-table { width: 100%; border-collapse: collapse; }
    .righe-table th { background: #f8fafc; padding: 8px; font-size: 11px; font-weight: 700; text-align: left; border-bottom: 1px solid #e2e8f0; color: #64748b; text-transform: uppercase; }
    .righe-table td { padding: 4px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .riga-input { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; font-size: 13px; width: 100%; box-sizing: border-box; }
    .riga-input:focus { outline: none; border-color: #4f46e5; }
    .riga-input.num { width: 70px; text-align: right; }

    /* Totali */
    .totali-box { display: flex; justify-content: flex-end; margin-top: 16px; }
    .totali-inner { min-width: 260px; }
    .totali-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; }
    .totali-finale { display: flex; justify-content: space-between; padding: 10px 14px; background: #4f46e5; color: #fff; border-radius: 8px; font-size: 16px; font-weight: 700; margin-top: 8px; }

    /* Calcolatrice resto */
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

    /* Sezione fattura */
    .fattura-toggle-row { display: flex; align-items: center; gap: 12px; margin: 20px 0 0; padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; user-select: none; }
    .fattura-toggle-row mat-icon { font-size: 22px; width: 22px; height: 22px; color: #4f46e5; }
    .fattura-toggle-label { font-size: 14px; font-weight: 700; color: #1e293b; flex: 1; }
    .fattura-toggle-sub { font-size: 12px; color: #64748b; }
    .fattura-section { border: 1px solid #c7d2fe; border-top: none; border-radius: 0 0 12px 12px; background: #fff; padding: 16px; }
    .piva-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
    .piva-input { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px; font-size: 14px; outline: none; text-transform: uppercase; }
    .piva-input:focus { border-color: #4f46e5; }
    .cliente-trovato { display: flex; align-items: center; gap: 12px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 10px 14px; }
    .cliente-trovato mat-icon { color: #16a34a; }
    .cliente-trovato-nome { font-weight: 700; color: #15803d; flex: 1; }
    .cliente-trovato-piva { font-size: 12px; color: #64748b; }

    /* Note e azioni */
    .note-row { margin-top: 16px; }
    .note-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px; font-size: 14px; outline: none; box-sizing: border-box; resize: vertical; min-height: 60px; font-family: inherit; }
    .note-input:focus { border-color: #4f46e5; }
    .actions-bar { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

    /* Storico */
    mat-table { width: 100%; }
    th.mat-header-cell { font-weight: 700; font-size: 12px; color: #64748b; text-transform: uppercase; background: #f8fafc; }
    td.mat-cell { font-size: 13px; }
  `]
})
export class VenditaBancoComponent implements OnInit, AfterViewInit {

  today = new Date().toISOString().substring(0, 10);
  vendita: VenditaBanco = { numero: '', data: this.today, metodoPagamento: 'CONTANTI' };
  righe: RigaVendita[] = [];
  prodottiList: Prodotto[] = [];
  filteredProdotti: (Prodotto[] | undefined)[] = [];
  variantiPerRiga: ProdottoVariante[][] = [];
  aliquoteIva: AliquotaIva[] = [];
  unitaMisura: UnitaMisura[] = [];
  clientiList: Cliente[] = [];

  readonly metodiPagamento: MetodoPagamento[] = [
    { valore: 'CONTANTI',         label: 'Contanti',         icon: 'payments' },
    { valore: 'BANCOMAT',         label: 'Bancomat',         icon: 'credit_card' },
    { valore: 'CARTA DI CREDITO', label: 'Carta credito',    icon: 'contactless' },
    { valore: 'BONIFICO',         label: 'Bonifico',         icon: 'account_balance' },
    { valore: 'ASSEGNO',          label: 'Assegno',          icon: 'receipt_long' },
  ];

  // ── Fattura ──────────────────────────────────────────────────────────────
  vuoleFattura = false;
  cercaStr = '';
  cercandoPiva = false;
  clienteSelezionato: { id?: number; ragioneSociale: string; pIva?: string } | null = null;
  mostraFormManuale = false;
  nuovoCliente = { ragioneSociale: '', pIva: '', via: '', cap: '', citta: '', provincia: '', stato: 'IT' };

  /** Clears autocomplete display value after selection */
  readonly displayNone = (_: any) => '';

  get filteredClienti(): Cliente[] {
    const q = (this.cercaStr ?? '').trim().toLowerCase();
    if (q.length < 2) return [];
    const norm = normalizePiva(this.cercaStr);
    return this.clientiList.filter(c =>
      c.ragioneSociale.toLowerCase().includes(q) ||
      normalizePiva(c.pIva || '').includes(norm)
    ).slice(0, 8);
  }

  get isPivaInput(): boolean {
    return normalizePiva(this.cercaStr).length === 11;
  }

  selectClienteDaLista(c: Cliente) {
    if (!c) return;
    this.clienteSelezionato = { id: c.id, ragioneSociale: c.ragioneSociale, pIva: c.pIva };
    this.mostraFormManuale = false;
  }

  inserisciManualmente() {
    this.nuovoCliente = { ragioneSociale: this.cercaStr.trim(), pIva: normalizePiva(this.cercaStr), via: '', cap: '', citta: '', provincia: '', stato: 'IT' };
    this.mostraFormManuale = true;
  }

  // ── Totali ────────────────────────────────────────────────────────────────
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

  // ── Calcolatrice resto ────────────────────────────────────────────────────
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
  countBanconota(b: number): number { return this.selectedBanconote.filter(x => x === b).length; }
  clearImporto() { this.importoPagato = null; this.selectedBanconote = []; }

  ivaBreakdown(): { aliquota: number; imp: number; iva: number }[] {
    const map = new Map<number, { imp: number; iva: number }>();
    for (const r of this.righe) {
      const imp = (r.quantita || 0) * (r.prezzo || 0) * (1 - (r.sconto || 0) / 100);
      const ex = map.get(r.iva) || { imp: 0, iva: 0 };
      map.set(r.iva, { imp: ex.imp + imp, iva: ex.iva + imp * (r.iva / 100) });
    }
    return [...map.entries()].map(([a, v]) => ({ aliquota: a, ...v })).filter(x => x.imp > 0);
  }

  // ── Storico ───────────────────────────────────────────────────────────────
  storico: VenditaBanco[] = [];
  dsStorico = new MatTableDataSource<VenditaBanco>([]);
  colStorico = ['data', 'numero', 'cliente', 'metodo', 'totale', 'azioni'];
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private ds: DataService, private printSvc: PrintService, private snack: MatSnackBar) {}

  ngOnInit() {
    this.ds.getProdotti().subscribe(p => this.prodottiList = p);
    this.ds.getAliquoteIva().subscribe(a => this.aliquoteIva = a.filter(x => x.attiva));
    this.ds.getUnitaMisura().subscribe(u => this.unitaMisura = u);
    this.ds.getClienti().subscribe(c => this.clientiList = c);
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

  // ── Metodo pagamento ──────────────────────────────────────────────────────
  setMetodo(m: string) { this.vendita.metodoPagamento = m; this.clearImporto(); }

  // ── Fattura ───────────────────────────────────────────────────────────────
  toggleFattura() {
    this.vuoleFattura = !this.vuoleFattura;
    if (!this.vuoleFattura) this.resetClienteFattura();
  }

  cercaPerPiva() {
    const piva = normalizePiva(this.cercaStr);
    if (!piva) return;
    this.cercandoPiva = true;
    this.clienteSelezionato = null;
    this.mostraFormManuale = false;

    this.ds.checkPivaDuplicate(piva, 'clienti').subscribe({
      next: check => {
        if (check.exists && check.id) {
          const c = this.clientiList.find(x => x.id === check.id);
          this.clienteSelezionato = { id: c?.id, ragioneSociale: c?.ragioneSociale || '', pIva: c?.pIva };
          this.cercandoPiva = false;
        } else {
          this.ds.lookupPiva(piva).subscribe({
            next: data => {
              this.nuovoCliente = {
                ragioneSociale: data.ragioneSociale || '',
                pIva: piva, via: data.via || '', cap: data.cap || '',
                citta: data.citta || '', provincia: data.provincia || '', stato: data.stato || 'IT',
              };
              this.mostraFormManuale = true;
              this.cercandoPiva = false;
            },
            error: () => {
              this.nuovoCliente = { ragioneSociale: '', pIva: piva, via: '', cap: '', citta: '', provincia: '', stato: 'IT' };
              this.mostraFormManuale = true;
              this.cercandoPiva = false;
            },
          });
        }
      },
      error: () => {
        this.nuovoCliente = { ragioneSociale: '', pIva: piva, via: '', cap: '', citta: '', provincia: '', stato: 'IT' };
        this.mostraFormManuale = true;
        this.cercandoPiva = false;
      },
    });
  }

  resetClienteFattura() {
    this.cercaStr = '';
    this.clienteSelezionato = null;
    this.mostraFormManuale = false;
    this.cercandoPiva = false;
    this.nuovoCliente = { ragioneSociale: '', pIva: '', via: '', cap: '', citta: '', provincia: '', stato: 'IT' };
  }

  // ── Righe ─────────────────────────────────────────────────────────────────
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
    const match = this.prodottiList.find(p => p.barcode && p.barcode === value);
    if (match) { this.selectProdotto(i, match); this.righe[i].descrizione = match.nome; }
  }

  onBarcodeKeydown(i: number, event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    const val = this.righe[i].descrizione?.trim();
    if (!val) return;
    const match = this.prodottiList.find(p => p.barcode === val);
    if (match) { this.selectProdotto(i, match); this.righe[i].descrizione = match.nome; return; }
    this.ds.searchByBarcode(val).subscribe({
      next: res => {
        this.selectProdotto(i, res.prodotto);
        this.righe[i].descrizione = res.prodotto.nome;
        if (res.variante) this.selectVariante(i, res.variante);
      },
      error: () => {},
    });
  }

  selectProdotto(i: number, p: Prodotto) {
    const r = this.righe[i];
    r.descrizione = p.nome; r.prezzo = p.prezzo; r.iva = p.iva;
    r.prodottoId = p.id; r.unitaMisura = p.unitaMisura;
    r.haVarianti = p.haVarianti; r.varianteId = null;
    r.varianteTaglia = ''; r.varianteColore = '';
    this.variantiPerRiga[i] = [];
    if (p.haVarianti && p.id) this.ds.getProdottoVarianti(p.id).subscribe(v => { this.variantiPerRiga[i] = v; });
  }

  selectVariante(i: number, v: ProdottoVariante) {
    this.righe[i].varianteId = v.id;
    this.righe[i].varianteTaglia = v.taglia;
    this.righe[i].varianteColore = v.colore;
  }

  onVarianteChange(i: number) {
    const id = this.righe[i].varianteId != null ? +this.righe[i].varianteId! : null;
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
    if (r.unitaMisura === 'pz') r.quantita = Math.max(1, Math.round(r.quantita || 1));
    else r.quantita = Math.max(0.001, r.quantita || 0.001);
  }
  clampSconto(r: any) { r.sconto = Math.min(100, Math.max(0, r.sconto ?? 0)); }

  prezzoIvato(r: RigaVendita): number {
    return +((r.prezzo || 0) * (1 + (r.iva || 0) / 100)).toFixed(2);
  }
  setPrezzoFromGross(r: RigaVendita, event: Event) {
    const gross = Math.max(0, +(event.target as HTMLInputElement).value || 0);
    r.prezzo = gross > 0 ? +(gross / (1 + (r.iva || 0) / 100)).toFixed(6) : 0;
  }
  rigaImporto(r: RigaVendita): number {
    return (r.quantita || 0) * (r.prezzo || 0) * (1 + (r.iva || 0) / 100) * (1 - (r.sconto || 0) / 100);
  }

  // ── Salva ─────────────────────────────────────────────────────────────────
  salvaEStampa() {
    if (!this.righe.length) { this.snack.open('Aggiungi almeno un prodotto', '', { duration: 2000 }); return; }

    if (this.vuoleFattura) {
      if (!this.clienteSelezionato && !this.mostraFormManuale) {
        this.snack.open('Cerca la P.IVA del cliente per generare la fattura', '', { duration: 2500 }); return;
      }
      if (this.mostraFormManuale && !this.nuovoCliente.ragioneSociale.trim()) {
        this.snack.open('Inserisci la ragione sociale del cliente', '', { duration: 2500 }); return;
      }
    }

    if (this.vuoleFattura && !this.clienteSelezionato) {
      this.ds.createCliente(this.nuovoCliente as unknown as Cliente).subscribe({
        next: r => this.procediSalvataggio(r.id),
        error: e => this.snack.open('Errore creazione cliente: ' + e.message, '', { duration: 3000 }),
      });
    } else {
      this.procediSalvataggio(this.clienteSelezionato?.id);
    }
  }

  private procediSalvataggio(clienteId?: number) {
    const nomeCliente = this.clienteSelezionato?.ragioneSociale || this.nuovoCliente.ragioneSociale || '';
    const payload: VenditaBanco = {
      ...this.vendita,
      clienteNome: this.vuoleFattura ? nomeCliente : '',
      righe: this.righe,
    };

    this.ds.createVenditaBanco(payload).subscribe({
      next: res => {
        this.printSvc.printDocumentale(res.id);
        if (this.vuoleFattura && clienteId) {
          this.ds.generaFatturaFromVendita(res.id, clienteId).subscribe({
            next: fat => {
              this.snack.open(`Vendita registrata · Fattura ${fat.numero} generata`, '', { duration: 3500 });
              this.loadStorico();
              this.resetForm();
            },
            error: () => {
              this.snack.open('Vendita salvata, errore nella generazione fattura', '', { duration: 3500 });
              this.loadStorico();
              this.resetForm();
            },
          });
        } else {
          this.snack.open('Vendita registrata', '', { duration: 2000 });
          this.loadStorico();
          this.resetForm();
        }
      },
      error: e => this.snack.open(e.message, '', { duration: 3000 }),
    });
  }

  private resetForm() {
    this.righe = [];
    this.filteredProdotti = [];
    this.variantiPerRiga = [];
    this.importoPagato = null;
    this.selectedBanconote = [];
    this.vuoleFattura = false;
    this.resetClienteFattura();
    this.vendita = { numero: '', data: this.today, metodoPagamento: 'CONTANTI' };
    this.loadNextNumber();
  }

  // ── Storico ───────────────────────────────────────────────────────────────
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

import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import { forkJoin } from 'rxjs';
import { DataService } from '../../services/data.service';
import { Pagamento, Fattura, TipoPagamento, ScadenzarioEntry } from '../../models';

// ── Salda singolo ─────────────────────────────────────────────────────────────
interface SaldaData { entry: ScadenzarioEntry; tipiPagamento: TipoPagamento[]; }

@Component({
  selector: 'app-salda-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Salda {{ data.entry.numero }}</h2>
    <mat-dialog-content style="min-width:400px">
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field style="width:100%">
          <mat-label>Importo *</mat-label>
          <input matInput type="number" step="0.01" formControlName="importo">
          <mat-hint>Rimane: {{ data.entry.rimanente | currency:'EUR':'symbol':'1.2-2':'it' }}</mat-hint>
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Data saldo *</mat-label>
          <input matInput type="date" formControlName="dataPagamento">
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Metodo di pagamento</mat-label>
          <mat-select formControlName="tipoPagamentoId">
            <mat-option [value]="null">— nessuno —</mat-option>
            @for (t of data.tipiPagamento; track t.id) {
              <mat-option [value]="t.id">{{ t.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Conferma saldo</button>
    </mat-dialog-actions>`
})
export class SaldaDialogComponent {
  form: FormGroup;
  constructor(private fb: FormBuilder, public dialogRef: MatDialogRef<SaldaDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: SaldaData) {
    this.form = this.fb.group({
      importo:         [data.entry.rimanente, [Validators.required, Validators.min(0.01)]],
      dataPagamento:   [new Date().toISOString().substring(0, 10), Validators.required],
      tipoPagamentoId: [null],
    });
  }
  save() { if (this.form.valid) this.dialogRef.close(this.form.value); }
}

// ── Salda multiplo ────────────────────────────────────────────────────────────
interface SaldaMultiploData { entries: ScadenzarioEntry[]; tipiPagamento: TipoPagamento[]; }

@Component({
  selector: 'app-salda-multiplo-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Salda {{ data.entries.length }} voci</h2>
    <mat-dialog-content style="min-width:420px">
      <p style="margin:0 0 16px;color:#64748b">
        Totale: <b style="color:#1e293b">{{ totale | currency:'EUR':'symbol':'1.2-2':'it' }}</b>
      </p>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field style="width:100%">
          <mat-label>Data saldo *</mat-label>
          <input matInput type="date" formControlName="dataPagamento">
        </mat-form-field>
        <mat-form-field style="width:100%">
          <mat-label>Metodo di pagamento</mat-label>
          <mat-select formControlName="tipoPagamentoId">
            <mat-option [value]="null">— nessuno —</mat-option>
            @for (t of data.tipiPagamento; track t.id) {
              <mat-option [value]="t.id">{{ t.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Conferma saldo</button>
    </mat-dialog-actions>`
})
export class SaldaMultiploDialogComponent {
  form: FormGroup;
  get totale() { return this.data.entries.reduce((s, e) => s + e.rimanente, 0); }
  constructor(private fb: FormBuilder, public dialogRef: MatDialogRef<SaldaMultiploDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: SaldaMultiploData) {
    this.form = this.fb.group({
      dataPagamento:   [new Date().toISOString().substring(0, 10), Validators.required],
      tipoPagamentoId: [null],
    });
  }
  save() { if (this.form.valid) this.dialogRef.close(this.form.value); }
}

// ── Pagamento manuale dialog ──────────────────────────────────────────────────
@Component({
  selector: 'app-pagamento-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data?.id ? 'Modifica Pagamento' : 'Nuovo Pagamento' }}</h2>
    <mat-dialog-content style="min-width:640px">
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field>
            <mat-label>Data *</mat-label>
            <input matInput type="date" formControlName="dataPagamento">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Importo *</mat-label>
            <input matInput type="number" step="0.01" formControlName="importo">
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field>
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="tipo">
              <mat-option value="ENTRATA">Entrata</mat-option>
              <mat-option value="USCITA">Uscita</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Conto</mat-label>
            <mat-select formControlName="conto">
              <mat-option value="BANCA">Banca</mat-option>
              <mat-option value="CASSA">Cassa</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field>
            <mat-label>Fattura collegata</mat-label>
            <mat-select formControlName="fatturaId">
              <mat-option [value]="null">— nessuna —</mat-option>
              @for (f of fatture; track f.id) {
                <mat-option [value]="f.id">{{ f.numero }} — {{ f.clienteNome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo Pagamento</mat-label>
            <mat-select formControlName="tipoPagamentoId">
              <mat-option [value]="null">— nessuno —</mat-option>
              @for (t of tipiPagamento; track t.id) {
                <mat-option [value]="t.id">{{ t.nome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`
})
export class PagamentoDialogComponent implements OnInit {
  form: FormGroup;
  fatture: Fattura[] = [];
  tipiPagamento: TipoPagamento[] = [];

  constructor(private fb: FormBuilder, private ds: DataService,
              public dialogRef: MatDialogRef<PagamentoDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: Pagamento | null) {
    this.form = this.fb.group({
      dataPagamento:   [data?.dataPagamento ?? new Date().toISOString().substring(0, 10), Validators.required],
      importo:         [data?.importo ?? '', [Validators.required, Validators.min(0.01)]],
      fatturaId:       [data?.fatturaId ?? null],
      tipo:            [data?.tipo ?? 'ENTRATA'],
      conto:           [data?.conto ?? 'BANCA'],
      tipoPagamentoId: [data?.tipoPagamentoId ?? null],
      note:            [data?.note ?? ''],
    });
  }

  ngOnInit() {
    this.ds.getFatture().subscribe(f => this.fatture = f.filter(x => x.stato !== 'ANNULLATA'));
    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter(x => x.attivo));
  }

  save() { if (this.form.valid) this.dialogRef.close({ ...this.data, ...this.form.value }); }
}

// ── Componente principale ─────────────────────────────────────────────────────
@Component({
  selector: 'app-pagamenti',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatSortModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatButtonToggleModule,
            FormsModule, MatCheckboxModule, MatSelectModule, MatFormFieldModule],
  templateUrl: './pagamenti.html',
  styleUrl: './pagamenti.scss'
})
export class PagamentiComponent implements OnInit {
  private allPagamenti: Pagamento[] = [];
  private allScadenzario: ScadenzarioEntry[] = [];
  tipiPagamento: TipoPagamento[] = [];
  filtro = 'TUTTI';
  selection = new SelectionModel<ScadenzarioEntry>(true, []);
  readonly oggi = new Date().toISOString().substring(0, 10);
  readonly mesi = [{v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},{v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}];

  filtroAnno: number | null = null;
  filtroMese: number | null = null;
  filtroControparte: string | null = null;

  pagamentiCols = ['data', 'tipo', 'importo', 'documento', 'controparte', 'tipoPagamentoNome', 'conto', 'azioni'];
  scadenzarioCols = ['select', 'tipo', 'numero', 'dataEmissione', 'dataScadenza', 'controparte', 'rimanente', 'azioni'];

  pagSortCol = 'data'; pagSortDir: 'asc'|'desc' = 'desc';
  scadSortCol = 'dataScadenza'; scadSortDir: 'asc'|'desc' = 'asc';

  onPagSort(s: { active: string; direction: string }) { this.pagSortCol = s.active; this.pagSortDir = (s.direction || 'desc') as 'asc'|'desc'; }
  onScadSort(s: { active: string; direction: string }) { this.scadSortCol = s.active; this.scadSortDir = (s.direction || 'asc') as 'asc'|'desc'; }

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() {
    forkJoin({
      pagamenti: this.ds.getPagamenti(),
      scadenzario: this.ds.getScadenzario(),
      tipi: this.ds.getTipiPagamento(),
    }).subscribe(r => {
      this.allPagamenti = r.pagamenti;
      this.allScadenzario = r.scadenzario;
      this.tipiPagamento = r.tipi.filter(t => t.attivo);
    });
  }

  load() {
    this.selection.clear();
    if (this.filtro === 'DA_SALDARE') {
      this.ds.getScadenzario().subscribe(s => { this.allScadenzario = s; });
    } else {
      const t = this.filtro === 'TUTTI' ? undefined : this.filtro;
      this.ds.getPagamenti(t).subscribe(p => { this.allPagamenti = p; });
    }
  }

  resetFiltri() { this.filtroAnno = null; this.filtroMese = null; this.filtroControparte = null; }

  print() {
    const d = (s: string) => { const p = (s||'').substring(0,10).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'; };
    const e = (n: number|undefined) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n??0);
    let html: string;
    if (this.filtro === 'DA_SALDARE') {
      const rows = this.selection.hasValue() ? this.selection.selected : this.scadenzario;
      const body = rows.map(r=>`<tr><td>${r.tipoEntry}</td><td>${r.numero}</td><td>${d(r.dataEmissione)}</td><td>${d(r.dataScadenza||'')}</td><td>${r.controparte||'—'}</td><td class="r">${e(r.rimanente)}</td></tr>`).join('');
      html = `<!DOCTYPE html><html><head><title>Da Saldare</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right;font-weight:600}</style></head><body><h1>Da Saldare</h1><table><thead><tr><th>Tipo</th><th>Numero</th><th>Data</th><th>Scadenza</th><th>Controparte</th><th class="r">Rimanente</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    } else {
      const rows = this.pagamenti;
      const body = rows.map(p=>`<tr><td>${d(p.dataPagamento)}</td><td>${p.tipo||'—'}</td><td class="r">${e(p.importo)}</td><td>${p.clienteNome||p.fornitoreNome||'—'}</td><td>${p.metodo||'—'}</td></tr>`).join('');
      const title = this.filtro === 'ENTRATE' ? 'Entrate' : this.filtro === 'USCITE' ? 'Uscite' : 'Pagamenti';
      html = `<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.r{text-align:right;font-weight:600}</style></head><body><h1>${title}</h1><table><thead><tr><th>Data</th><th>Tipo</th><th class="r">Importo</th><th>Controparte</th><th>Metodo</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    }
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }

  get anni() {
    const src = this.filtro === 'DA_SALDARE'
      ? this.allScadenzario.map(e => +e.dataEmissione.substring(0, 4))
      : this.allPagamenti.map(p => +p.dataPagamento.substring(0, 4));
    return [...new Set(src)].sort().reverse();
  }

  get controparti() {
    const src = this.filtro === 'DA_SALDARE'
      ? this.allScadenzario.map(e => e.controparte).filter(Boolean)
      : this.allPagamenti.map(p => p.clienteNome || p.fornitoreNome).filter(Boolean);
    return [...new Set(src)].sort() as string[];
  }

  get pagamenti(): Pagamento[] {
    let data = this.allPagamenti;
    if (this.filtroAnno) data = data.filter(p => +p.dataPagamento.substring(0, 4) === this.filtroAnno);
    if (this.filtroMese) data = data.filter(p => +p.dataPagamento.substring(5, 7) === this.filtroMese);
    if (this.filtroControparte) data = data.filter(p => (p.clienteNome || p.fornitoreNome) === this.filtroControparte);
    const dir = this.pagSortDir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      switch (this.pagSortCol) {
        case 'dataPagamento': return (a.dataPagamento || '').localeCompare(b.dataPagamento || '') * dir;
        case 'importo':       return ((a.importo ?? 0) - (b.importo ?? 0)) * dir;
        case 'controparte':   return ((a.clienteNome || a.fornitoreNome || '') as string).localeCompare((b.clienteNome || b.fornitoreNome || '') as string) * dir;
        default:              return ((a as any)[this.pagSortCol] || '').localeCompare((b as any)[this.pagSortCol] || '') * dir;
      }
    });
  }

  get scadenzario(): ScadenzarioEntry[] {
    let data = this.allScadenzario;
    if (this.filtroAnno) data = data.filter(e => +e.dataEmissione.substring(0, 4) === this.filtroAnno);
    if (this.filtroMese) data = data.filter(e => +e.dataEmissione.substring(5, 7) === this.filtroMese);
    if (this.filtroControparte) data = data.filter(e => e.controparte === this.filtroControparte);
    const dir = this.scadSortDir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      switch (this.scadSortCol) {
        case 'rimanente':    return ((a.rimanente ?? 0) - (b.rimanente ?? 0)) * dir;
        case 'controparte':  return (a.controparte || '').localeCompare(b.controparte || '') * dir;
        default:             return ((a as any)[this.scadSortCol] || '').localeCompare((b as any)[this.scadSortCol] || '') * dir;
      }
    });
  }

  get totaleEntrate()     { return this.pagamenti.filter(p => p.tipo === 'ENTRATA').reduce((s, p) => s + p.importo, 0); }
  get totaleUscite()      { return this.pagamenti.filter(p => p.tipo === 'USCITA').reduce((s, p) => s + p.importo, 0); }
  get daSaldareEntrate()  { return this.scadenzario.filter(e => e.tipoEntry === 'FATTURA').reduce((s, e) => s + e.rimanente, 0); }
  get daSaldareUscite()   { return this.scadenzario.filter(e => e.tipoEntry === 'ACQUISTO').reduce((s, e) => s + e.rimanente, 0); }
  get totaleSelezionato() { return this.selection.selected.reduce((s, e) => s + e.rimanente, 0); }

  isScaduta(e: ScadenzarioEntry) { return e.dataScadenza && e.dataScadenza < this.oggi; }

  isAllSelected() { return this.scadenzario.length > 0 && this.selection.selected.length === this.scadenzario.length; }
  masterToggle() {
    if (this.isAllSelected()) this.selection.clear();
    else this.scadenzario.forEach(e => this.selection.select(e));
  }

  open(p?: Pagamento) {
    const ref = this.dialog.open(PagamentoDialogComponent, { data: p ?? null, width: '720px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updatePagamento(result) : this.ds.createPagamento(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  delete(p: Pagamento) {
    const doc = p.fatturaNumero ? `fattura ${p.fatturaNumero}` : p.acquistoNumero ? `acquisto ${p.acquistoNumero}` : 'documento';
    if (!confirm(`Eliminare il pagamento di €${p.importo}?\nIl ${doc} tornerà in "Da saldare".`)) return;
    this.ds.deletePagamento(p.id!).subscribe(() => { this.load(); this.snack.open('Saldo annullato', '', { duration: 2000 }); });
  }

  salda(entry: ScadenzarioEntry) {
    const ref = this.dialog.open(SaldaDialogComponent, {
      data: { entry, tipiPagamento: this.tipiPagamento },
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      this.registraPagamento(entry, result).subscribe({
        next: () => { this.load(); this.snack.open('Saldato', '', { duration: 2000 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  saldaSelezionati() {
    const selected = this.selection.selected;
    if (!selected.length) return;
    const ref = this.dialog.open(SaldaMultiploDialogComponent, {
      data: { entries: selected, tipiPagamento: this.tipiPagamento },
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const requests = selected.map(entry =>
        this.registraPagamento(entry, { ...result, importo: entry.rimanente })
      );
      forkJoin(requests).subscribe({
        next: () => { this.load(); this.snack.open(`${selected.length} voci saldate`, '', { duration: 2500 }); },
        error: e => this.snack.open(e.message, '', { duration: 3000 })
      });
    });
  }

  private registraPagamento(entry: ScadenzarioEntry, result: any) {
    const tipoSel = this.tipiPagamento.find(t => t.id === result.tipoPagamentoId);
    return this.ds.createPagamento({
      dataPagamento:   result.dataPagamento,
      importo:         result.importo,
      tipo:            entry.tipoEntry === 'FATTURA' ? 'ENTRATA' : 'USCITA',
      conto:           tipoSel?.conto ?? entry.conto ?? 'BANCA',
      fatturaId:       entry.tipoEntry === 'FATTURA'  ? entry.id : null,
      acquistoId:      entry.tipoEntry === 'ACQUISTO' ? entry.id : null,
      tipoPagamentoId: result.tipoPagamentoId ?? null,
      metodo:          tipoSel?.nome ?? entry.tipoPagamentoNome ?? 'Bonifico',
      note:            '',
    } as Pagamento);
  }
}

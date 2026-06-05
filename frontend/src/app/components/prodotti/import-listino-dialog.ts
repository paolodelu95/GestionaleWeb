import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';
import { ExcelService } from '../../services/excel.service';
import { ConfirmService } from '../shared/confirm-dialog';
import { ProdottoPickerComponent, ProdottoPick } from '../shared/prodotto-picker';
import { Fornitore, ListinoRigaNonTrovata, ListinoCandidato } from '../../models';

/** Riga in revisione: la riga di listino non abbinata + i candidati + la scelta utente. */
interface RigaMatchVM {
  codice: string;
  descrizione: string;
  prezzo: any;
  candidati: ListinoCandidato[];
  scelto: number | null; // prodottoId scelto, null = salta
}

/**
 * Import listino fornitore (Excel/CSV): aggiorna i prezzi d'acquisto abbinando il
 * codice del file al codice fornitore salvato nei prodotti per quel fornitore.
 * Per i codici NON abbinati, se il file ha una colonna descrizione, propone i
 * prodotti piu probabili (match testuale) da confermare in un secondo step.
 */
@Component({
  selector: 'app-import-listino-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
            MatFormFieldModule, MatInputModule, MatSelectModule, MatRadioModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px">
      @if (fase === 'rivedi') {
        <button mat-icon-button type="button" (click)="tornaEsito()" style="margin-right:2px"><mat-icon>arrow_back</mat-icon></button>
        Rivedi abbinamenti
      } @else {
        Importa listino fornitore
      }
    </h2>

    <mat-dialog-content [style.minWidth.px]="fase === 'rivedi' ? 560 : 460" style="max-width:760px">

      <!-- ── STEP 1: form ──────────────────────────────────────────────── -->
      @if (fase === 'form') {
        <p style="font-size:13px;color:var(--text-tertiary);margin:0 0 14px">
          Carica il listino (Excel o CSV). Abbino il <b>codice del file</b> al <b>codice fornitore</b>
          salvato nella scheda prodotto per il fornitore scelto, e aggiorno il prezzo d'acquisto.
        </p>

        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Fornitore *</mat-label>
          <mat-select [(ngModel)]="fornitoreId">
            @for (f of fornitori; track f.id) { <mat-option [value]="f.id">{{ f.ragioneSociale }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <div style="margin:4px 0 12px">
          <input #fileInput type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                 style="display:none" (change)="onFile($event)">
          <button mat-stroked-button type="button" (click)="fileInput.click()">
            <mat-icon>upload_file</mat-icon> {{ rows.length ? 'Cambia file' : 'Scegli file Excel/CSV' }}
          </button>
          @if (rows.length) { <span style="margin-left:10px;font-size:13px;color:var(--text-secondary)">{{ rows.length }} righe lette</span> }
        </div>

        @if (rows.length) {
          <div class="form-row" style="display:flex;gap:12px">
            <mat-form-field appearance="outline" style="flex:1">
              <mat-label>Colonna Codice</mat-label>
              <mat-select [(ngModel)]="colCodice">
                @for (c of colonne; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" style="flex:1">
              <mat-label>Colonna Prezzo</mat-label>
              <mat-select [(ngModel)]="colPrezzo">
                @for (c of colonne; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
              </mat-select>
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Colonna Descrizione (per suggerire gli abbinamenti)</mat-label>
            <mat-select [(ngModel)]="colDescrizione">
              <mat-option [value]="''">— nessuna —</mat-option>
              @for (c of colonne; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <p style="font-size:12px;color:var(--text-tertiary);margin:-6px 0 8px">
            Serve per proporre il prodotto giusto ai codici non ancora abbinati.
          </p>

          <div style="margin:6px 0 4px;font-size:13px;font-weight:600;color:var(--text-secondary)">I prezzi del listino sono:</div>
          <mat-radio-group [(ngModel)]="ivato" style="display:flex;gap:20px">
            <mat-radio-button [value]="false">IVA esclusa (netto)</mat-radio-button>
            <mat-radio-button [value]="true">IVA inclusa</mat-radio-button>
          </mat-radio-group>
          <p style="font-size:12px;color:var(--text-tertiary);margin:8px 0 0">
            Salvo sempre il prezzo in netto: se è IVA inclusa lo converto con l'aliquota del prodotto.
          </p>
        }
      }

      <!-- ── STEP 2: esito import ──────────────────────────────────────── -->
      @if (fase === 'esito' && esito) {
        <div style="text-align:center;padding:8px 0">
          <mat-icon style="font-size:42px;width:42px;height:42px;color:var(--success-on)">task_alt</mat-icon>
          <div style="font-size:16px;font-weight:700;margin-top:6px">{{ esito.aggiornati }} prezz{{ esito.aggiornati === 1 ? 'o' : 'i' }} aggiornat{{ esito.aggiornati === 1 ? 'o' : 'i' }}</div>

          @if (esito.nonTrovati.length) {
            <div style="margin-top:14px;text-align:left">
              <div style="font-size:13px;font-weight:600;color:var(--warning-on)">{{ esito.nonTrovati.length }} codici non abbinati</div>

              @if (matchabili.length) {
                <p style="font-size:12px;color:var(--text-tertiary);margin:6px 0 10px">
                  Per {{ matchabili.length }} di questi posso suggerire il prodotto a magazzino in base alla descrizione del listino.
                </p>
                <button mat-flat-button color="primary" [disabled]="matching" (click)="caricaMatch()">
                  @if (matching) { <mat-spinner diameter="18" style="display:inline-block;vertical-align:middle;margin-right:6px"></mat-spinner> }
                  Rivedi e abbina ({{ matchabili.length }})
                </button>
              } @else {
                <p style="font-size:12px;color:var(--text-tertiary);margin-top:6px">
                  Nessuna descrizione disponibile nel file: non posso suggerire abbinamenti. Imposta i codici nelle schede prodotto, oppure reimporta indicando la colonna Descrizione.
                </p>
              }

              <div style="font-size:12px;color:var(--text-tertiary);max-height:120px;overflow:auto;margin-top:10px">
                {{ codiciNonTrovati }}
              </div>
            </div>
          }
        </div>
      }

      <!-- ── STEP 3: rivedi abbinamenti ────────────────────────────────── -->
      @if (fase === 'rivedi') {
        <p style="font-size:13px;color:var(--text-tertiary);margin:0 0 10px">
          Ti propongo il prodotto più probabile per ogni codice. Conferma, cambia o salta. Confermando, il codice resta salvato: i prossimi import saranno automatici.
        </p>

        @if (haAlta) {
          <button mat-stroked-button type="button" (click)="accettaAlta()" style="margin-bottom:12px">
            <mat-icon>done_all</mat-icon> Accetta tutti ad alta confidenza
          </button>
        }

        @for (r of righeMatch; track r.codice) {
          <div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:10px">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-family:monospace;font-weight:700;color:var(--primary)">{{ r.codice }}</span>
              <span style="flex:1;font-size:13px;color:var(--text-secondary)">{{ r.descrizione }}</span>
              @if (r.prezzo !== '' && r.prezzo != null) { <span style="font-size:12px;color:var(--text-tertiary)">{{ r.prezzo }}</span> }
            </div>

            <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
              <mat-form-field appearance="outline" style="flex:1" subscriptSizing="dynamic">
                <mat-label>Prodotto a magazzino</mat-label>
                <mat-select [(ngModel)]="r.scelto">
                  <mat-option [value]="null">— salta (non abbinare) —</mat-option>
                  @for (c of r.candidati; track c.prodottoId) {
                    <mat-option [value]="c.prodottoId">{{ c.nome }}{{ c.codice ? ' · ' + c.codice : '' }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-icon-button type="button" title="Cerca a mano" (click)="cercaManuale(r)"><mat-icon>search</mat-icon></button>
            </div>

            @if (candidatoSel(r); as c) {
              <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px">
                <span [style.color]="fasciaColor(c.fascia)" style="font-weight:700;display:inline-flex;align-items:center;gap:3px">
                  <mat-icon style="font-size:14px;width:14px;height:14px">{{ fasciaIcon(c.fascia) }}</mat-icon>{{ fasciaLabel(c.fascia) }}
                </span>
                <span style="color:var(--text-tertiary)">· {{ c.perche }}</span>
                @if (c.quantita != null) { <span style="color:var(--text-tertiary)">· giac. {{ c.quantita }}</span> }
              </div>
            } @else {
              <div style="margin-top:6px;font-size:12px;color:var(--text-tertiary)">
                {{ r.candidati.length ? 'Nessun prodotto selezionato' : 'Nessun suggerimento: cerca a mano' }}
              </div>
            }
          </div>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      @if (fase === 'form') {
        <button mat-button mat-dialog-close>Annulla</button>
        <button mat-flat-button color="primary" [disabled]="!canImport || importing" (click)="importa()">
          @if (importing) { <mat-spinner diameter="18" style="display:inline-block;vertical-align:middle;margin-right:6px"></mat-spinner> }
          Importa prezzi
        </button>
      } @else if (fase === 'esito') {
        <button mat-button mat-dialog-close>Chiudi</button>
      } @else if (fase === 'rivedi') {
        <span style="flex:1;font-size:13px;color:var(--text-secondary);padding-left:6px">{{ nSelezionati }} pront{{ nSelezionati === 1 ? 'o' : 'i' }}</span>
        <button mat-button (click)="tornaEsito()">Indietro</button>
        <button mat-flat-button color="primary" [disabled]="!nSelezionati || abbinando" (click)="associa()">
          @if (abbinando) { <mat-spinner diameter="18" style="display:inline-block;vertical-align:middle;margin-right:6px"></mat-spinner> }
          Associa {{ nSelezionati || '' }}
        </button>
      }
    </mat-dialog-actions>`,
})
export class ImportListinoDialogComponent {
  fornitori: Fornitore[] = [];
  fornitoreId: number | null = null;
  ivato = false;
  rows: Record<string, string>[] = [];
  colonne: string[] = [];
  colCodice = '';
  colPrezzo = '';
  colDescrizione = '';
  importing = false;

  fase: 'form' | 'esito' | 'rivedi' = 'form';
  esito: { aggiornati: number; nonTrovati: ListinoRigaNonTrovata[] } | null = null;

  matching = false;
  abbinando = false;
  righeMatch: RigaMatchVM[] = [];

  constructor(
    public dialogRef: MatDialogRef<ImportListinoDialogComponent>,
    private ds: DataService,
    private excel: ExcelService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
    private confirm: ConfirmService,
  ) {
    this.ds.getFornitori().subscribe(f => this.fornitori = f);
  }

  get fornitoreNome(): string {
    return this.fornitori.find(f => f.id === this.fornitoreId)?.ragioneSociale || 'questo fornitore';
  }
  get canImport(): boolean {
    return !!this.fornitoreId && !!this.colCodice && !!this.colPrezzo && this.rows.length > 0;
  }
  /** Righe non abbinate che hanno una descrizione (quindi proponibili). */
  get matchabili(): ListinoRigaNonTrovata[] {
    return (this.esito?.nonTrovati || []).filter(r => (r.descrizione || '').trim());
  }
  get codiciNonTrovati(): string {
    return (this.esito?.nonTrovati || []).map(r => r.codice).join(', ');
  }
  get nSelezionati(): number {
    return this.righeMatch.filter(r => r.scelto != null).length;
  }
  get haAlta(): boolean {
    return this.righeMatch.some(r => r.candidati[0]?.fascia === 'alta');
  }

  async onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.rows = await this.excel.readFile(file);
      this.colonne = this.rows.length ? Object.keys(this.rows[0]) : [];
      this.colCodice = this.guess(['codice', 'code', 'cod', 'articolo', 'art', 'sku']);
      this.colPrezzo = this.guess(['prezzo', 'price', 'netto', 'costo', 'importo', 'listino']);
      this.colDescrizione = this.guess(['descrizione', 'denominazione', 'desc', 'articolo', 'prodotto', 'nome']);
    } catch {
      this.snack.open('File non leggibile o formato non supportato', '', { duration: 3000 });
    }
  }
  private guess(keys: string[]): string {
    return this.colonne.find(c => keys.some(k => c.toLowerCase().includes(k))) || '';
  }

  importa() {
    if (!this.canImport) return;
    const righe = this.rows
      .map(r => ({
        codice: r[this.colCodice],
        prezzo: r[this.colPrezzo],
        descrizione: this.colDescrizione ? r[this.colDescrizione] : '',
      }))
      .filter(x => String(x.codice ?? '').trim());
    this.importing = true;
    this.ds.importListino(this.fornitoreId!, this.ivato, righe).subscribe({
      next: res => { this.importing = false; this.esito = res; this.fase = 'esito'; },
      error: e => { this.importing = false; this.snack.open(e.error?.error || 'Errore durante l\'import', '', { duration: 3500 }); },
    });
  }

  caricaMatch() {
    if (!this.fornitoreId || this.matching) return;
    this.matching = true;
    this.ds.matchListino(this.fornitoreId, this.matchabili).subscribe({
      next: res => {
        this.matching = false;
        this.righeMatch = res.risultati.map(r => ({
          codice: r.codice,
          descrizione: r.descrizione,
          prezzo: r.prezzo,
          candidati: r.candidati,
          // pre-seleziona solo il candidato ad alta confidenza
          scelto: r.candidati[0]?.fascia === 'alta' ? r.candidati[0].prodottoId : null,
        }));
        this.fase = 'rivedi';
        this.dialogRef.updateSize('760px');
      },
      error: e => { this.matching = false; this.snack.open(e.error?.error || 'Errore nel calcolo dei suggerimenti', '', { duration: 3500 }); },
    });
  }

  candidatoSel(r: RigaMatchVM): ListinoCandidato | null {
    return r.scelto == null ? null : (r.candidati.find(c => c.prodottoId === r.scelto) || null);
  }

  accettaAlta() {
    for (const r of this.righeMatch) {
      if (r.candidati[0]?.fascia === 'alta') r.scelto = r.candidati[0].prodottoId;
    }
  }

  cercaManuale(r: RigaMatchVM) {
    this.dialog.open(ProdottoPickerComponent, { width: '600px', maxWidth: '96vw' })
      .afterClosed().subscribe((pick: ProdottoPick | undefined) => {
        const p = pick?.prodotto;
        if (!p?.id) return;
        if (!r.candidati.some(c => c.prodottoId === p.id)) {
          r.candidati = [{
            prodottoId: p.id, nome: p.nome, codice: p.codice || '', categoria: p.categoria || '',
            prezzoAcquistoAttuale: p.prezzoAcquisto ?? null, quantita: p.quantita ?? null,
            score: 1, fascia: 'alta', perche: 'scelto a mano',
          }, ...r.candidati];
        }
        r.scelto = p.id;
      });
  }

  async associa() {
    const abbinamenti = this.righeMatch
      .filter(r => r.scelto != null)
      .map(r => ({ codice: r.codice, prodottoId: r.scelto!, prezzo: r.prezzo }));
    if (!abbinamenti.length) return;
    const ok = await this.confirm.ask({
      title: 'Conferma abbinamenti',
      message: `Associo ${abbinamenti.length} ${abbinamenti.length === 1 ? 'codice' : 'codici'} fornitore ai prodotti scelti e aggiorno i relativi prezzi d'acquisto. Procedo?`,
      confirmText: 'Associa',
    });
    if (!ok) return;

    this.abbinando = true;
    this.ds.abbinaListino(this.fornitoreId!, this.ivato, abbinamenti).subscribe({
      next: res => {
        this.abbinando = false;
        const tot = res.associati + res.aggiornati;
        let msg = `${tot} ${tot === 1 ? 'codice associato' : 'codici associati'}`;
        if (res.saltati.length) msg += `, ${res.saltati.length} saltat${res.saltati.length === 1 ? 'o' : 'i'}`;
        this.snack.open(msg, '', { duration: 3500 });

        // togli dall'elenco le righe abbinate con successo
        const saltati = new Set(res.saltati.map(s => s.codice));
        const abbinati = new Set(abbinamenti.map(a => a.codice).filter(c => !saltati.has(c)));
        this.righeMatch = this.righeMatch.filter(r => !abbinati.has(r.codice));
        if (this.esito) {
          this.esito.aggiornati += tot;
          this.esito.nonTrovati = this.esito.nonTrovati.filter(r => !abbinati.has(r.codice));
        }
        if (!this.righeMatch.length) this.tornaEsito();
      },
      error: e => { this.abbinando = false; this.snack.open(e.error?.error || 'Errore durante l\'abbinamento', '', { duration: 3500 }); },
    });
  }

  tornaEsito() {
    this.fase = 'esito';
    this.dialogRef.updateSize('600px');
  }

  // ── confidenza (mostrata onesta: fascia qualitativa + motivo, niente % finte) ──
  fasciaColor(f: string): string {
    return f === 'alta' ? 'var(--success-on)' : f === 'media' ? 'var(--warning-on)' : 'var(--text-tertiary)';
  }
  fasciaLabel(f: string): string {
    return f === 'alta' ? 'Alta' : f === 'media' ? 'Media' : 'Bassa';
  }
  fasciaIcon(f: string): string {
    return f === 'alta' ? 'check_circle' : f === 'media' ? 'help' : 'remove_circle_outline';
  }
}

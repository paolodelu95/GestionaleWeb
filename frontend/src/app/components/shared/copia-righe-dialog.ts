import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DataService } from '../../services/data.service';
import { RigaDocumento } from '../../models';
import { docRigaTotale } from '../../utils/doc-calc';
import { Observable } from 'rxjs';

export interface CopiaRigheDialogData {
  clienteId?: number | null;
  clienteNome?: string | null;
  fornitoreId?: number | null;
  fornitoreNome?: string | null;
}

const TIPI_DOC = [
  { tipo: 'fatture',      label: 'Fatture',     entity: 'clienteId'   as const },
  { tipo: 'ddt',          label: 'Doc. di trasporto', entity: 'clienteId'   as const },
  { tipo: 'preventivi',   label: 'Preventivi',   entity: 'clienteId'   as const },
  { tipo: 'ordini',       label: 'Ordini',       entity: 'any'         as const },
  { tipo: 'note-credito', label: 'Note credito', entity: 'clienteId'   as const },
  { tipo: 'acquisti',     label: 'Acquisti',     entity: 'fornitoreId' as const },
] as const;

interface DocItem {
  id: number;
  label: string;
  entityId?: number | null;
  entityNome?: string;
}

@Component({
  selector: 'app-copia-righe-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatInputModule, MatFormFieldModule, MatCheckboxModule, MatProgressSpinnerModule,
  ],
  template: `
    @if (step === 1) {
      <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px;margin:0;padding:20px 24px 0">
        <mat-icon style="color:#0ea5e9">content_copy</mat-icon>
        Copia righe da un altro documento
      </h2>
      <mat-dialog-content style="width:640px;min-height:400px;padding:16px 24px 8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
          @for (t of tipiDoc; track t.tipo) {
            <button type="button" class="tipo-chip"
                    [class.tipo-chip--active]="selectedTipo === t.tipo"
                    (click)="changeTipo(t.tipo)">
              {{ t.label }}
            </button>
          }
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          @if (entityIdForTipo != null) {
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#374151;white-space:nowrap">
              <mat-checkbox [(ngModel)]="soloStessoSoggetto" (change)="filterDocs()"></mat-checkbox>
              Solo {{ soggetto || 'stesso soggetto' }}
            </label>
          }
          <div style="flex:1;min-width:180px">
            <mat-form-field style="width:100%" appearance="outline">
              <mat-label>Cerca documento</mat-label>
              <input matInput [(ngModel)]="cerca" (ngModelChange)="filterDocs()" autocomplete="off">
              <mat-icon matSuffix>search</mat-icon>
            </mat-form-field>
          </div>
        </div>

        @if (loading) {
          <div style="text-align:center;padding:48px 0">
            <mat-spinner diameter="36" style="margin:0 auto"></mat-spinner>
          </div>
        } @else if (!filteredDocs.length) {
          <p style="text-align:center;color:#94a3b8;padding:40px 0;margin:0">
            Nessun documento trovato
          </p>
        } @else {
          <div class="doc-list">
            @for (doc of filteredDocs; track doc.id) {
              <div class="doc-row" (click)="selectDoc(doc)">
                <div style="flex:1;min-width:0">
                  <div class="doc-label">{{ doc.label }}</div>
                  @if (doc.entityNome) {
                    <div class="doc-entity">{{ doc.entityNome }}</div>
                  }
                </div>
                <mat-icon style="color:#cbd5e1;flex-shrink:0">chevron_right</mat-icon>
              </div>
            }
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end" style="padding:8px 24px 16px">
        <button mat-button (click)="dialogRef.close()">Annulla</button>
      </mat-dialog-actions>
    }

    @if (step === 2) {
      <h2 mat-dialog-title style="display:flex;align-items:center;gap:4px;margin:0;padding:20px 24px 0">
        <button mat-icon-button type="button" (click)="tornaSelezione()" style="margin-right:4px">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <span style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {{ selectedDoc?.label }}
          @if (selectedDoc?.entityNome) {
            <span style="font-weight:400;color:#64748b;font-size:13px"> — {{ selectedDoc?.entityNome }}</span>
          }
        </span>
      </h2>
      <mat-dialog-content style="width:640px;min-height:300px;padding:16px 24px 8px">
        @if (loadingRighe) {
          <div style="text-align:center;padding:48px 0">
            <mat-spinner diameter="36" style="margin:0 auto"></mat-spinner>
          </div>
        } @else if (!docRighe.length) {
          <p style="text-align:center;color:#94a3b8;padding:40px 0;margin:0">Nessuna riga disponibile</p>
        } @else {
          <table class="righe-table">
            <thead>
              <tr>
                <th style="width:40px;padding:8px 4px">
                  <mat-checkbox
                    [checked]="tuttiSelezionati"
                    [indeterminate]="!tuttiSelezionati && qualcunoSelezionato"
                    (change)="toggleTutti()">
                  </mat-checkbox>
                </th>
                <th>Codice / Descrizione</th>
                <th style="text-align:right;white-space:nowrap">Qtà</th>
                <th style="text-align:right">Prezzo</th>
                <th style="text-align:right">Totale</th>
              </tr>
            </thead>
            <tbody>
              @for (r of docRighe; track $index) {
                <tr class="riga-row"
                    [class.riga-row--selected]="selectedRighe[$index]"
                    (click)="selectedRighe[$index] = !selectedRighe[$index]">
                  <td style="padding:6px 4px">
                    <mat-checkbox
                      [checked]="selectedRighe[$index]"
                      (change)="selectedRighe[$index] = $event.checked"
                      (click)="$event.stopPropagation()">
                    </mat-checkbox>
                  </td>
                  <td style="padding:6px 4px">
                    @if (r.codiceProdotto) {
                      <div style="font-size:11px;color:#64748b;margin-bottom:1px">{{ r.codiceProdotto }}</div>
                    }
                    {{ r.descrizione }}
                  </td>
                  <td style="text-align:right;padding:6px 4px;white-space:nowrap">
                    {{ r.quantita }} {{ r.unitaMisura }}
                  </td>
                  <td style="text-align:right;padding:6px 4px;white-space:nowrap">
                    {{ r.prezzo | currency:'EUR':'symbol':'1.2-2':'it' }}
                  </td>
                  <td style="text-align:right;padding:6px 4px;white-space:nowrap;font-weight:600">
                    {{ rigaTotale(r) | currency:'EUR':'symbol':'1.2-2':'it' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end" style="padding:8px 24px 16px">
        <span style="flex:1;font-size:13px;color:#64748b">
          {{ countSelezionate }} {{ countSelezionate === 1 ? 'riga selezionata' : 'righe selezionate' }}
        </span>
        <button mat-button (click)="dialogRef.close()">Annulla</button>
        <button mat-flat-button color="primary"
                [disabled]="!qualcunoSelezionato"
                (click)="conferma()">
          <mat-icon>content_copy</mat-icon>
          Copia {{ countSelezionate }} {{ countSelezionate === 1 ? 'riga' : 'righe' }}
        </button>
      </mat-dialog-actions>
    }
  `,
  styles: [`
    .tipo-chip {
      border: 1px solid #e2e8f0;
      border-radius: 99px;
      padding: 4px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      background: #f8fafc;
      color: #374151;
      transition: background .15s, color .15s;
    }
    .tipo-chip:hover { background: #e0f2fe; color: #0369a1; border-color: #bae6fd; }
    .tipo-chip--active { background: #0ea5e9; color: #fff; border-color: #0ea5e9; }

    .doc-list { display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; }
    .doc-row {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; border-radius: 8px; cursor: pointer;
      border: 1px solid #f1f5f9; background: #fafbfc;
      transition: background .12s;
    }
    .doc-row:hover { background: #f0f9ff; border-color: #bae6fd; }
    .doc-label { font-size: 13px; font-weight: 600; color: #1e293b; }
    .doc-entity { font-size: 11px; color: #64748b; margin-top: 1px; }

    .righe-table { width: 100%; border-collapse: collapse; }
    .righe-table th {
      background: #f8fafc; padding: 8px 4px;
      font-size: 11px; font-weight: 700; text-align: left;
      border-bottom: 2px solid #e2e8f0; color: #475569;
      text-transform: uppercase; letter-spacing: .4px;
    }
    .riga-row { cursor: pointer; transition: background .1s; }
    .riga-row:hover { background: #f8fafc; }
    .riga-row--selected { background: #f0f9ff; }
    .riga-row td { border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .riga-row--selected td { border-bottom-color: #e0f2fe; }
  `]
})
export class CopiaRigheDialogComponent implements OnInit {
  step = 1;
  readonly tipiDoc = TIPI_DOC;

  selectedTipo: string = TIPI_DOC[0].tipo;
  soloStessoSoggetto = true;
  cerca = '';

  loading = false;
  documenti: DocItem[] = [];
  filteredDocs: DocItem[] = [];

  selectedDoc: DocItem | null = null;
  loadingRighe = false;
  docRighe: RigaDocumento[] = [];
  selectedRighe: boolean[] = [];

  constructor(
    private ds: DataService,
    public dialogRef: MatDialogRef<CopiaRigheDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CopiaRigheDialogData
  ) {}

  ngOnInit() {
    this.loadDocumenti();
  }

  get soggetto(): string {
    return this.data.clienteNome ?? this.data.fornitoreNome ?? '';
  }

  get entityIdForTipo(): number | null | undefined {
    const def = TIPI_DOC.find(t => t.tipo === this.selectedTipo);
    if (!def) return undefined;
    if (def.entity === 'fornitoreId') return this.data.fornitoreId ?? undefined;
    if (def.entity === 'clienteId') return this.data.clienteId ?? undefined;
    return (this.data.clienteId ?? this.data.fornitoreId) ?? undefined;
  }

  changeTipo(tipo: string) {
    this.selectedTipo = tipo;
    this.cerca = '';
    this.loadDocumenti();
  }

  loadDocumenti() {
    this.loading = true;
    this.documenti = [];
    this.filteredDocs = [];

    let obs$: Observable<any[]>;
    switch (this.selectedTipo) {
      case 'fatture':      obs$ = this.ds.getFatture(); break;
      case 'ddt':          obs$ = this.ds.getDdt(); break;
      case 'ordini':       obs$ = this.ds.getOrdini(); break;
      case 'preventivi':   obs$ = this.ds.getPreventivi(); break;
      case 'note-credito': obs$ = this.ds.getNoteCredito(); break;
      case 'acquisti':     obs$ = this.ds.getAcquisti(); break;
      default: this.loading = false; return;
    }

    obs$.subscribe({
      next: docs => {
        this.documenti = docs.map((d: any) => ({
          id: d.id,
          label: `N. ${d.numero} — ${this.fmtData(d.dataEmissione ?? d.dataOrdine)}`,
          entityId: d.clienteId ?? d.fornitoreId ?? null,
          entityNome: d.clienteNome ?? d.fornitoreNome ?? '',
        }));
        this.filterDocs();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  filterDocs() {
    const entityId = this.entityIdForTipo;
    let list = [...this.documenti];

    if (this.soloStessoSoggetto && entityId != null) {
      list = list.filter(d => d.entityId === entityId);
    }

    if (this.cerca.trim()) {
      const q = this.cerca.toLowerCase();
      list = list.filter(d =>
        d.label.toLowerCase().includes(q) ||
        (d.entityNome ?? '').toLowerCase().includes(q)
      );
    }

    this.filteredDocs = list;
  }

  selectDoc(doc: DocItem) {
    this.selectedDoc = doc;
    this.step = 2;
    this.loadRighe(doc.id);
  }

  tornaSelezione() {
    this.step = 1;
    this.selectedDoc = null;
    this.docRighe = [];
    this.selectedRighe = [];
  }

  loadRighe(id: number) {
    this.loadingRighe = true;
    this.docRighe = [];
    this.selectedRighe = [];

    let obs$: Observable<any>;
    switch (this.selectedTipo) {
      case 'fatture':      obs$ = this.ds.getFatturaById(id); break;
      case 'ddt':          obs$ = this.ds.getDdtById(id); break;
      case 'ordini':       obs$ = this.ds.getOrdineById(id); break;
      case 'preventivi':   obs$ = this.ds.getPreventivoById(id); break;
      case 'note-credito': obs$ = this.ds.getNotaCreditoById(id); break;
      case 'acquisti':     obs$ = this.ds.getAcquistoById(id); break;
      default: this.loadingRighe = false; return;
    }

    obs$.subscribe({
      next: (doc: any) => {
        this.docRighe = (doc.righe ?? []).filter((r: RigaDocumento) => r.tipo !== 'NOTA');
        this.selectedRighe = new Array(this.docRighe.length).fill(true);
        this.loadingRighe = false;
      },
      error: () => { this.loadingRighe = false; }
    });
  }

  get tuttiSelezionati() { return this.selectedRighe.length > 0 && this.selectedRighe.every(v => v); }
  get qualcunoSelezionato() { return this.selectedRighe.some(v => v); }
  get countSelezionate() { return this.selectedRighe.filter(v => v).length; }

  toggleTutti() {
    const val = !this.tuttiSelezionati;
    this.selectedRighe = this.selectedRighe.map(() => val);
  }

  conferma() {
    const righe = this.docRighe
      .filter((_, i) => this.selectedRighe[i])
      .map(r => ({ ...r, id: undefined }));
    this.dialogRef.close(righe);
  }

  rigaTotale(r: RigaDocumento): number {
    return docRigaTotale(r, true);
  }

  fmtData(d: string): string {
    if (!d) return '';
    const p = d.split('T')[0].split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  }
}

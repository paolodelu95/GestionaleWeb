import { inject, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { EmptyStateComponent } from '../shared/empty-state';
import { ConfirmService } from '../shared/confirm-dialog';
import { DataService } from '../../services/data.service';
import { Listino } from '../../models';
import { ListinoDialogComponent } from './listino-dialog';
import { QuickListinoDialogComponent } from './quick-listino-dialog';

// ── Pagina Listini (Vendite → Listini) ───────────────────────────────────────
@Component({
  selector: 'app-listini',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule,
            MatTableModule, MatDialogModule, MatSnackBarModule, EmptyStateComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Listini</h1>
        <div class="header-actions">
          <button mat-stroked-button color="primary" type="button" (click)="openQuickListino()">
            <mat-icon>bolt</mat-icon> Creazione rapida
          </button>
          <button mat-flat-button color="primary" type="button" (click)="openListino()">
            <mat-icon>add</mat-icon> Nuovo listino
          </button>
        </div>
      </div>

      <div class="card" style="max-width:900px">
        <p style="margin:0 0 14px;font-size:13px;color:var(--text-tertiary)">
          Crea listini con sconti personalizzati e applicali ai clienti dalla loro scheda anagrafica.
          All'inserimento di un prodotto in un documento il prezzo viene calcolato automaticamente dal listino del cliente.
        </p>
        <table mat-table [dataSource]="listini" class="mat-mdc-table">
          <ng-container matColumnDef="nome">
            <th mat-header-cell *matHeaderCellDef>Nome</th>
            <td mat-cell *matCellDef="let l">
              <b>{{ l.nome }}</b>
              @if (l.descrizione) {
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">{{ l.descrizione }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="scontoDefault">
            <th mat-header-cell *matHeaderCellDef>Sconto default</th>
            <td mat-cell *matCellDef="let l">
              @if (l.scontoDefault > 0) {
                <span class="stato-chip inviato">-{{ l.scontoDefault }}%</span>
              } @else {
                <span style="color:var(--text-tertiary);font-size:12px">Nessuno</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="prezziCount">
            <th mat-header-cell *matHeaderCellDef>Override prodotti</th>
            <td mat-cell *matCellDef="let l">
              @if (l.prezziCount > 0) {
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:13px">
                  <mat-icon style="font-size:16px;width:16px;height:16px;color:var(--primary)">sell</mat-icon>
                  {{ l.prezziCount }}
                </span>
              } @else {
                <span style="color:var(--text-tertiary);font-size:12px">—</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="attivo">
            <th mat-header-cell *matHeaderCellDef>Stato</th>
            <td mat-cell *matCellDef="let l">
              @if (l.attivo) {
                <span class="stato-chip pagata">Attivo</span>
              } @else {
                <span class="stato-chip bozza">Disattivo</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="azioni">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let l" class="table-actions">
              <button mat-icon-button type="button" [matMenuTriggerFor]="lstMenu" title="Azioni"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #lstMenu="matMenu">
                <button mat-menu-item type="button" (click)="openListino(l)"><mat-icon>edit</mat-icon> Modifica</button>
                <button mat-menu-item type="button" (click)="deleteListino(l)" style="color:#dc2626"><mat-icon style="color:#dc2626">delete</mat-icon> Elimina</button>
              </mat-menu>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="listiniColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: listiniColumns;"></tr>
        </table>
        @if (!listini.length) {
          <app-empty-state compact icon="sell" title="Nessun listino" message="Creane uno per assegnare prezzi personalizzati ai clienti." />
        }
      </div>
    </div>`,
})
export class ListiniComponent implements OnInit {
  private confirm = inject(ConfirmService);

  listini: Listino[] = [];
  listiniColumns = ['nome', 'scontoDefault', 'prezziCount', 'attivo', 'azioni'];

  constructor(
    private ds: DataService,
    private dialog: MatDialog,
    private snack: MatSnackBar,
  ) {}

  ngOnInit() { this.loadListini(); }

  loadListini() { this.ds.getListini().subscribe(l => this.listini = l); }

  openListino(l?: Listino) {
    const ref = this.dialog.open(ListinoDialogComponent, {
      data: l ?? null, width: '760px', maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((result) => {
      if (result != null) this.loadListini();
    });
  }

  openQuickListino() {
    const ref = this.dialog.open(QuickListinoDialogComponent, { width: '860px', maxWidth: '96vw' });
    ref.afterClosed().subscribe((result) => {
      if (result != null) this.loadListini();
    });
  }

  async deleteListino(l: Listino) {
    if (!await this.confirm.delete(`Eliminare il listino "${l.nome}"?\n\nI clienti assegnati torneranno a usare i prezzi base.`)) return;
    this.ds.deleteListino(l.id!).subscribe({
      next: () => { this.loadListini(); this.snack.open('Listino eliminato', '', { duration: 2000 }); },
      error: () => this.snack.open('Errore eliminazione', '', { duration: 3000 }),
    });
  }
}

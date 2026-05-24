import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { ApiService } from '../../services/api.service';
import { DataService } from '../../services/data.service';
import { Cliente } from '../../models';

interface Progetto { id: number; nome: string; descrizione: string; clienteId: number | null; clienteNome: string; stato: string; dataInizio: string; dataFine: string; budget: number; tariffaOraria: number; note: string; oreTotali: number; oreFatturate: number; }
interface Voce { id: number; progettoId: number; progettoNome: string; data: string; ore: number; descrizione: string; utente: string; fatturata: boolean; }

@Component({
  selector: 'app-progetto-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.p.id ? 'Modifica progetto' : 'Nuovo progetto' }}</h2>
    <mat-dialog-content style="min-width:480px">
      <mat-form-field style="width:100%"><mat-label>Nome *</mat-label>
        <input matInput [(ngModel)]="data.p.nome" required>
      </mat-form-field>
      <mat-form-field style="width:100%"><mat-label>Descrizione</mat-label>
        <textarea matInput rows="2" [(ngModel)]="data.p.descrizione"></textarea>
      </mat-form-field>
      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Cliente</mat-label>
          <mat-select [(ngModel)]="data.p.clienteId">
            <mat-option [value]="null">— Nessuno —</mat-option>
            @for (c of data.clienti; track c.id) {
              <mat-option [value]="c.id">{{ c.ragioneSociale }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Stato</mat-label>
          <mat-select [(ngModel)]="data.p.stato">
            <mat-option value="APERTO">Aperto</mat-option>
            <mat-option value="IN_CORSO">In corso</mat-option>
            <mat-option value="SOSPESO">Sospeso</mat-option>
            <mat-option value="CHIUSO">Chiuso</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Inizio</mat-label>
          <input matInput type="date" [(ngModel)]="data.p.dataInizio">
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Fine</mat-label>
          <input matInput type="date" [(ngModel)]="data.p.dataFine">
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Tariffa €/ora</mat-label>
          <input matInput type="number" [(ngModel)]="data.p.tariffaOraria">
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Budget €</mat-label>
          <input matInput type="number" [(ngModel)]="data.p.budget">
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button [disabled]="!data.p.nome" (click)="ref.close(data.p)"><mat-icon>save</mat-icon> Salva</button>
    </mat-dialog-actions>`,
})
export class ProgettoDialogComponent {
  constructor(public ref: MatDialogRef<ProgettoDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { p: Partial<Progetto>; clienti: Cliente[] }) {}
}

@Component({
  selector: 'app-voce-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.v.id ? 'Modifica voce' : 'Nuova voce timesheet' }}</h2>
    <mat-dialog-content style="min-width:440px">
      <mat-form-field style="width:100%"><mat-label>Progetto *</mat-label>
        <mat-select [(ngModel)]="data.v.progettoId" required>
          @for (p of data.progetti; track p.id) {
            <mat-option [value]="p.id">{{ p.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Data *</mat-label>
          <input matInput type="date" [(ngModel)]="data.v.data" required>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Ore *</mat-label>
          <input matInput type="number" step="0.25" [(ngModel)]="data.v.ore" required>
        </mat-form-field>
      </div>
      <mat-form-field style="width:100%"><mat-label>Descrizione</mat-label>
        <textarea matInput rows="2" [(ngModel)]="data.v.descrizione"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button [disabled]="!data.v.progettoId || !data.v.data || !data.v.ore" (click)="ref.close(data.v)">
        <mat-icon>save</mat-icon> Salva
      </button>
    </mat-dialog-actions>`,
})
export class VoceDialogComponent {
  constructor(public ref: MatDialogRef<VoceDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { v: Partial<Voce>; progetti: Progetto[] }) {}
}

@Component({
  selector: 'app-timesheet',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDialogModule, MatSnackBarModule, MatMenuModule,
  ],
  template: `
    <div class="page">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
        <h1 class="page-title">Timesheet · Progetti</h1>
      </div>

      <mat-tab-group animationDuration="0">
        <mat-tab label="Progetti">
          <div class="card" style="margin-top:16px">
            <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
              <button mat-flat-button (click)="nuovoProgetto()">
                <mat-icon>add</mat-icon> Nuovo progetto
              </button>
            </div>
            <table mat-table [dataSource]="progetti" class="full-width">
              <ng-container matColumnDef="nome">
                <th mat-header-cell *matHeaderCellDef>Nome</th>
                <td mat-cell *matCellDef="let p"><b>{{ p.nome }}</b></td>
              </ng-container>
              <ng-container matColumnDef="cliente">
                <th mat-header-cell *matHeaderCellDef>Cliente</th>
                <td mat-cell *matCellDef="let p">{{ p.clienteNome || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="stato">
                <th mat-header-cell *matHeaderCellDef>Stato</th>
                <td mat-cell *matCellDef="let p">{{ p.stato }}</td>
              </ng-container>
              <ng-container matColumnDef="ore">
                <th mat-header-cell *matHeaderCellDef>Ore</th>
                <td mat-cell *matCellDef="let p">{{ p.oreTotali }} <span style="color:#94a3b8">(fatt. {{ p.oreFatturate }})</span></td>
              </ng-container>
              <ng-container matColumnDef="budget">
                <th mat-header-cell *matHeaderCellDef>Budget</th>
                <td mat-cell *matCellDef="let p">{{ p.budget | currency:'EUR':'symbol':'1.0-0':'it' }}</td>
              </ng-container>
              <ng-container matColumnDef="azioni">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let p">
                  <button mat-icon-button [matMenuTriggerFor]="pMenu" title="Azioni"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #pMenu="matMenu">
                    <button mat-menu-item (click)="modificaProgetto(p)"><mat-icon>edit</mat-icon> Modifica</button>
                    <button mat-menu-item (click)="eliminaProgetto(p)" style="color:#dc2626">
                      <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                    </button>
                  </mat-menu>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['nome', 'cliente', 'stato', 'ore', 'budget', 'azioni']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['nome', 'cliente', 'stato', 'ore', 'budget', 'azioni']"></tr>
            </table>
            @if (progetti.length === 0) {
              <p style="color:#94a3b8;text-align:center;padding:32px">Nessun progetto. Clicca "Nuovo progetto" per iniziare.</p>
            }
          </div>
        </mat-tab>

        <mat-tab label="Voci timesheet">
          <div class="card" style="margin-top:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="max-width:260px">
                <mat-label>Filtra progetto</mat-label>
                <mat-select [(ngModel)]="filtroProgetto" (selectionChange)="loadVoci()">
                  <mat-option [value]="null">Tutti i progetti</mat-option>
                  @for (p of progetti; track p.id) {
                    <mat-option [value]="p.id">{{ p.nome }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-flat-button (click)="nuovaVoce()" [disabled]="!progetti.length">
                <mat-icon>add</mat-icon> Nuova voce
              </button>
            </div>
            <table mat-table [dataSource]="voci" class="full-width">
              <ng-container matColumnDef="data">
                <th mat-header-cell *matHeaderCellDef>Data</th>
                <td mat-cell *matCellDef="let v">{{ v.data | date:'dd/MM/yy' }}</td>
              </ng-container>
              <ng-container matColumnDef="progetto">
                <th mat-header-cell *matHeaderCellDef>Progetto</th>
                <td mat-cell *matCellDef="let v">{{ v.progettoNome }}</td>
              </ng-container>
              <ng-container matColumnDef="ore">
                <th mat-header-cell *matHeaderCellDef>Ore</th>
                <td mat-cell *matCellDef="let v"><b>{{ v.ore }}</b></td>
              </ng-container>
              <ng-container matColumnDef="descrizione">
                <th mat-header-cell *matHeaderCellDef>Descrizione</th>
                <td mat-cell *matCellDef="let v" style="font-size:12px;color:#64748b">{{ v.descrizione }}</td>
              </ng-container>
              <ng-container matColumnDef="utente">
                <th mat-header-cell *matHeaderCellDef>Utente</th>
                <td mat-cell *matCellDef="let v">{{ v.utente || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="azioni">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let v">
                  <button mat-icon-button [matMenuTriggerFor]="vMenu" title="Azioni"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #vMenu="matMenu">
                    <button mat-menu-item (click)="modificaVoce(v)"><mat-icon>edit</mat-icon> Modifica</button>
                    <button mat-menu-item (click)="eliminaVoce(v)" style="color:#dc2626">
                      <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                    </button>
                  </mat-menu>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['data', 'progetto', 'ore', 'descrizione', 'utente', 'azioni']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['data', 'progetto', 'ore', 'descrizione', 'utente', 'azioni']"></tr>
            </table>
            @if (voci.length === 0) {
              <p style="color:#94a3b8;text-align:center;padding:32px">Nessuna voce registrata.</p>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page { padding: 24px; }
    .page-title { font-size: 24px; font-weight: 700; margin: 0; }
    .card { background: var(--bg-surface, #fff); border-radius: 10px; padding: 16px; border: 1px solid var(--border-subtle, #e2e8f0); }
    .full-width { width: 100%; }
  `],
})
export class TimesheetComponent implements OnInit {
  progetti: Progetto[] = [];
  voci: Voce[] = [];
  clienti: Cliente[] = [];
  filtroProgetto: number | null = null;

  constructor(private api: ApiService, private ds: DataService,
              private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() {
    this.loadProgetti();
    this.loadVoci();
    this.ds.getClienti().subscribe(c => this.clienti = c);
  }

  loadProgetti() {
    this.api.get<Progetto[]>('timesheet/progetti').subscribe(r => this.progetti = r);
  }
  loadVoci() {
    const url = this.filtroProgetto ? `timesheet/voci?progettoId=${this.filtroProgetto}` : 'timesheet/voci';
    this.api.get<Voce[]>(url).subscribe(r => this.voci = r);
  }

  nuovoProgetto() {
    const p: Partial<Progetto> = { nome: '', stato: 'APERTO', tariffaOraria: 0, budget: 0 };
    this.dialog.open(ProgettoDialogComponent, { data: { p, clienti: this.clienti } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.post('timesheet/progetti', saved).subscribe(() => { this.loadProgetti(); this.snack.open('Progetto creato', 'OK', { duration: 2000 }); });
      });
  }
  modificaProgetto(p: Progetto) {
    this.dialog.open(ProgettoDialogComponent, { data: { p: { ...p }, clienti: this.clienti } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.put(`timesheet/progetti/${p.id}`, saved).subscribe(() => { this.loadProgetti(); this.snack.open('Aggiornato', 'OK', { duration: 2000 }); });
      });
  }
  eliminaProgetto(p: Progetto) {
    if (!confirm(`Eliminare il progetto "${p.nome}"? Verranno cancellate anche le voci timesheet.`)) return;
    this.api.delete(`timesheet/progetti/${p.id}`).subscribe(() => { this.loadProgetti(); this.loadVoci(); });
  }

  nuovaVoce() {
    const v: Partial<Voce> = { progettoId: this.progetti[0]?.id, data: new Date().toISOString().slice(0, 10), ore: 1 };
    this.dialog.open(VoceDialogComponent, { data: { v, progetti: this.progetti } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.post('timesheet/voci', saved).subscribe(() => { this.loadVoci(); this.loadProgetti(); this.snack.open('Voce creata', 'OK', { duration: 2000 }); });
      });
  }
  modificaVoce(v: Voce) {
    this.dialog.open(VoceDialogComponent, { data: { v: { ...v }, progetti: this.progetti } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.put(`timesheet/voci/${v.id}`, saved).subscribe(() => { this.loadVoci(); this.loadProgetti(); });
      });
  }
  eliminaVoce(v: Voce) {
    if (!confirm('Eliminare questa voce?')) return;
    this.api.delete(`timesheet/voci/${v.id}`).subscribe(() => { this.loadVoci(); this.loadProgetti(); });
  }
}

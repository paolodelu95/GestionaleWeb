import { inject, Component, OnInit, Inject } from '@angular/core';
import { ConfirmService } from '../shared/confirm-dialog';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ApiService } from '../../services/api.service';
import { DataService } from '../../services/data.service';
import { Cliente } from '../../models';

interface Stage { id: number; nome: string; ordine: number; colore: string; vinto: boolean; perso: boolean; }
interface Opportunita {
  id: number; titolo: string; clienteId: number | null; clienteNome: string;
  contatto: string; email: string; telefono: string;
  stageId: number | null; stageName: string; stageColor: string;
  valore: number; probabilita: number; dataPrevista: string; assegnatario: string;
  note: string; ordine: number;
}

@Component({
  selector: 'app-crm-opp-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
            MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.opp.id ? 'Modifica opportunità' : 'Nuova opportunità' }}</h2>
    <mat-dialog-content style="min-width:480px;max-width:560px">
      <div class="dialog-form">
        <mat-form-field style="width:100%"><mat-label>Titolo *</mat-label>
          <input matInput [(ngModel)]="data.opp.titolo" required>
        </mat-form-field>
        <div style="display:flex;gap:8px">
          <mat-form-field style="flex:1"><mat-label>Cliente</mat-label>
            <mat-select [(ngModel)]="data.opp.clienteId">
              <mat-option [value]="null">— Nessuno —</mat-option>
              @for (c of data.clienti; track c.id) {
                <mat-option [value]="c.id">{{ c.ragioneSociale }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field style="flex:1"><mat-label>Stage</mat-label>
            <mat-select [(ngModel)]="data.opp.stageId">
              @for (s of data.stages; track s.id) {
                <mat-option [value]="s.id">{{ s.nome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div style="display:flex;gap:8px">
          <mat-form-field style="flex:1"><mat-label>Valore (€)</mat-label>
            <input matInput type="number" [(ngModel)]="data.opp.valore">
          </mat-form-field>
          <mat-form-field style="flex:1"><mat-label>Probabilità (%)</mat-label>
            <input matInput type="number" min="0" max="100" [(ngModel)]="data.opp.probabilita">
          </mat-form-field>
          <mat-form-field style="flex:1"><mat-label>Data prevista</mat-label>
            <input matInput type="date" [(ngModel)]="data.opp.dataPrevista">
          </mat-form-field>
        </div>
        <div style="display:flex;gap:8px">
          <mat-form-field style="flex:1"><mat-label>Contatto</mat-label>
            <input matInput [(ngModel)]="data.opp.contatto">
          </mat-form-field>
          <mat-form-field style="flex:1"><mat-label>Email</mat-label>
            <input matInput type="email" [(ngModel)]="data.opp.email">
          </mat-form-field>
        </div>
        <div style="display:flex;gap:8px">
          <mat-form-field style="flex:1"><mat-label>Telefono</mat-label>
            <input matInput [(ngModel)]="data.opp.telefono">
          </mat-form-field>
          <mat-form-field style="flex:1"><mat-label>Assegnatario</mat-label>
            <input matInput [(ngModel)]="data.opp.assegnatario">
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%"><mat-label>Note</mat-label>
          <textarea matInput rows="3" [(ngModel)]="data.opp.note"></textarea>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button [disabled]="!data.opp.titolo" (click)="ref.close(data.opp)"><mat-icon>save</mat-icon> Salva</button>
    </mat-dialog-actions>`,
})
export class CrmOppDialogComponent {
  constructor(public ref: MatDialogRef<CrmOppDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { opp: Partial<Opportunita>; stages: Stage[]; clienti: Cliente[] }) {}
}

@Component({
  selector: 'app-crm',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DragDropModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDialogModule, MatSnackBarModule,
    MatTooltipModule, MatMenuModule,
  ],
  template: `
    <div class="page crm-page">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
        <h1 class="page-title">CRM · Pipeline opportunità</h1>
        <button mat-flat-button (click)="nuova()">
          <mat-icon>add</mat-icon> Nuova opportunità
        </button>
      </div>

      <div class="kanban-wrap">
      <div class="kanban-board">
        @for (s of stages; track s.id) {
          <div class="kanban-col">
            <div class="kanban-col-header" [style.border-top-color]="s.colore">
              <span class="kanban-col-title">{{ s.nome }}</span>
              <span class="kanban-col-meta">
                {{ oppsByStage(s.id).length }} · {{ totaleStage(s.id) | currency:'EUR':'symbol':'1.0-0':'it' }}
              </span>
            </div>
            <div class="kanban-col-body"
                 cdkDropList
                 [cdkDropListData]="oppsByStage(s.id)"
                 [cdkDropListConnectedTo]="connectedDropLists()"
                 [id]="'stage-' + s.id"
                 (cdkDropListDropped)="drop($event, s.id)">
              @for (o of oppsByStage(s.id); track o.id) {
                <div class="kanban-card" cdkDrag>
                  <div class="kanban-card-top">
                    <span class="kanban-card-title">{{ o.titolo }}</span>
                    <button mat-icon-button [matMenuTriggerFor]="oppMenu" title="Azioni"
                            (click)="$event.stopPropagation()"><mat-icon>more_vert</mat-icon></button>
                    <mat-menu #oppMenu="matMenu">
                      <button mat-menu-item (click)="modifica(o)"><mat-icon>edit</mat-icon> Modifica</button>
                      <button mat-menu-item (click)="elimina(o)" style="color:#dc2626">
                        <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                      </button>
                    </mat-menu>
                  </div>
                  <div class="kanban-card-meta">
                    @if (o.clienteNome) { <div><mat-icon class="mi">person</mat-icon> {{ o.clienteNome }}</div> }
                    @if (o.contatto) { <div><mat-icon class="mi">badge</mat-icon> {{ o.contatto }}</div> }
                    @if (o.dataPrevista) { <div><mat-icon class="mi">event</mat-icon> {{ o.dataPrevista | date:'dd/MM/yy' }}</div> }
                  </div>
                  <div class="kanban-card-bottom">
                    <span class="kanban-card-valore">{{ o.valore | currency:'EUR':'symbol':'1.0-0':'it' }}</span>
                    <span class="kanban-card-prob">{{ o.probabilita }}%</span>
                  </div>
                </div>
              }
              @if (oppsByStage(s.id).length === 0) {
                <div class="kanban-empty">Trascina qui un'opportunità</div>
              }
            </div>
          </div>
        }
      </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; }
    .page-header { margin-bottom: 16px; }
    .page-title { font-size: 24px; font-weight: 700; margin: 0; }
    /* Wrapper con fade gradient sul lato destro per far capire che si può scrollare */
    .kanban-wrap { position: relative; }
    .kanban-wrap::after {
      content: '';
      position: absolute; top: 0; right: 0; bottom: 16px; width: 36px;
      background: linear-gradient(to right, transparent, var(--bg-page, #f6f7fb) 70%);
      pointer-events: none;
    }
    .kanban-board { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 16px; padding-right: 24px; align-items: flex-start;
      scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;
    }
    .kanban-board::-webkit-scrollbar { height: 10px; }
    .kanban-board::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 5px; }
    .kanban-board::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .kanban-col { flex: 0 0 260px; min-height: 200px; background: var(--bg-surface-2, #f1f5f9); border-radius: 10px; padding: 8px; }
    .kanban-col-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px 10px; border-top: 3px solid #11769b; margin-bottom: 8px; }
    .kanban-col-title { font-weight: 700; font-size: 13px; text-transform: uppercase; color: var(--text-primary, #0f172a); }
    .kanban-col-meta { font-size: 11px; color: var(--text-tertiary, #64748b); }
    .kanban-col-body { display: flex; flex-direction: column; gap: 8px; min-height: 60px; }
    .kanban-card { background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #e2e8f0); border-radius: 8px; padding: 10px; cursor: grab; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .kanban-card:active { cursor: grabbing; }
    .kanban-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
    .kanban-card-title { font-weight: 600; font-size: 14px; line-height: 1.3; color: var(--text-primary, #0f172a); }
    .kanban-card-meta { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; font-size: 12px; color: var(--text-secondary, #475569); }
    .kanban-card-meta div { display: flex; align-items: center; gap: 4px; }
    .kanban-card-meta .mi { font-size: 14px; width: 14px; height: 14px; color: var(--text-tertiary, #64748b); }
    .kanban-card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--border-subtle, #f1f5f9); }
    .kanban-card-valore { font-weight: 700; font-size: 14px; color: #16a34a; }
    .kanban-card-prob { font-size: 11px; color: var(--text-tertiary, #64748b); background: var(--bg-surface-2, #f1f5f9); padding: 2px 6px; border-radius: 10px; }
    .kanban-empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-tertiary, #94a3b8); border: 1px dashed var(--border-subtle, #cbd5e1); border-radius: 6px; }
    .cdk-drag-preview { box-shadow: 0 4px 14px rgba(0,0,0,0.15); }
    .cdk-drag-placeholder { opacity: 0.35; }
    .cdk-drop-list-dragging .kanban-card:not(.cdk-drag-placeholder) { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
  `],
})
export class CrmComponent implements OnInit {
  private confirm = inject(ConfirmService);
  stages: Stage[] = [];
  opps: Opportunita[] = [];
  clienti: Cliente[] = [];

  constructor(private api: ApiService, private ds: DataService,
              private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() {
    this.api.get<Stage[]>('crm/stages').subscribe(s => this.stages = s);
    this.api.get<Opportunita[]>('crm/opportunita').subscribe(o => this.opps = o);
    this.ds.getClienti().subscribe(c => this.clienti = c);
  }

  oppsByStage(stageId: number): Opportunita[] {
    return this.opps.filter(o => o.stageId === stageId).sort((a, b) => a.ordine - b.ordine);
  }
  totaleStage(stageId: number): number {
    return this.oppsByStage(stageId).reduce((s, o) => s + (o.valore || 0), 0);
  }
  connectedDropLists(): string[] { return this.stages.map(s => 'stage-' + s.id); }

  drop(ev: CdkDragDrop<Opportunita[]>, newStageId: number) {
    if (ev.previousContainer === ev.container) {
      moveItemInArray(ev.container.data, ev.previousIndex, ev.currentIndex);
    } else {
      transferArrayItem(ev.previousContainer.data, ev.container.data, ev.previousIndex, ev.currentIndex);
    }
    // Aggiorna stageId e ordine di tutte le opp nella nuova colonna
    const newCol = ev.container.data;
    newCol.forEach((o, i) => { o.stageId = newStageId; o.ordine = i; });
    // Salva sul backend solo l'opp spostata + ordine
    const moved = ev.container.data[ev.currentIndex];
    this.api.patch(`crm/opportunita/${moved.id}/stage`, { stageId: newStageId, ordine: ev.currentIndex })
      .subscribe();
  }

  nuova() {
    const opp: Partial<Opportunita> = {
      titolo: '', stageId: this.stages[0]?.id || null,
      valore: 0, probabilita: 50, dataPrevista: '',
    };
    this.dialog.open(CrmOppDialogComponent, { data: { opp, stages: this.stages, clienti: this.clienti } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.post<{ id: number }>('crm/opportunita', saved).subscribe(r => {
          this.api.get<Opportunita[]>('crm/opportunita').subscribe(o => this.opps = o);
          this.snack.open('Opportunità creata', 'OK', { duration: 2000 });
        });
      });
  }

  modifica(o: Opportunita) {
    this.dialog.open(CrmOppDialogComponent, { data: { opp: { ...o }, stages: this.stages, clienti: this.clienti } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.put(`crm/opportunita/${o.id}`, saved).subscribe(() => {
          this.api.get<Opportunita[]>('crm/opportunita').subscribe(opp => this.opps = opp);
          this.snack.open('Opportunità aggiornata', 'OK', { duration: 2000 });
        });
      });
  }

  async elimina(o: Opportunita) {
    if (!await this.confirm.delete(`Eliminare l'opportunità "${o.titolo}"?`)) return;
    this.api.delete(`crm/opportunita/${o.id}`).subscribe(() => {
      this.opps = this.opps.filter(x => x.id !== o.id);
      this.snack.open('Opportunità eliminata', 'OK', { duration: 2000 });
    });
  }
}

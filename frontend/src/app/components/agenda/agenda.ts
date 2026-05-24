import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../services/api.service';
import { DataService } from '../../services/data.service';
import { Cliente, Fornitore } from '../../models';

interface CalEvent {
  id: string;
  source: 'APPUNTAMENTO' | 'SCADENZA_FATTURA' | 'SCADENZA_ACQUISTO' | 'CRM' | 'RICORRENTE' | 'TODO';
  sourceId: number;
  titolo: string;
  inizio: string;       // ISO
  fine?: string | null;
  tuttoGiorno?: boolean;
  luogo?: string;
  controparte?: string;
  descrizione?: string;
  colore: string;
  stato?: string;
  route?: string;
}
interface Appuntamento {
  id?: number;
  titolo: string; descrizione?: string;
  inizio: string; fine?: string | null;
  tuttoGiorno?: boolean; luogo?: string;
  clienteId?: number | null; clienteNome?: string;
  fornitoreId?: number | null; fornitoreNome?: string;
  colore?: string; promemoria?: number | null;
  stato?: 'PIANIFICATO' | 'COMPLETATO' | 'ANNULLATO';
}
interface Todo {
  id?: number;
  titolo: string; descrizione?: string;
  scadenza?: string | null;
  priorita?: 'BASSA' | 'MEDIA' | 'ALTA';
  stato?: 'DA_FARE' | 'IN_CORSO' | 'FATTA';
  categoria?: string;
}

@Component({
  selector: 'app-appuntamento-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.app.id ? 'Modifica appuntamento' : 'Nuovo appuntamento' }}</h2>
    <mat-dialog-content style="min-width:480px;max-width:600px">
      <mat-form-field style="width:100%"><mat-label>Titolo *</mat-label>
        <input matInput [(ngModel)]="data.app.titolo" required>
      </mat-form-field>

      <mat-checkbox [(ngModel)]="data.app.tuttoGiorno" style="margin-bottom:8px">Tutto il giorno</mat-checkbox>

      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Inizio *</mat-label>
          <input matInput [type]="data.app.tuttoGiorno ? 'date' : 'datetime-local'" [(ngModel)]="data.app.inizio" required>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Fine</mat-label>
          <input matInput [type]="data.app.tuttoGiorno ? 'date' : 'datetime-local'" [(ngModel)]="data.app.fine">
        </mat-form-field>
      </div>

      <mat-form-field style="width:100%"><mat-label>Luogo</mat-label>
        <input matInput [(ngModel)]="data.app.luogo" placeholder="es. Ufficio cliente">
      </mat-form-field>

      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Cliente</mat-label>
          <mat-select [(ngModel)]="data.app.clienteId">
            <mat-option [value]="null">—</mat-option>
            @for (c of data.clienti; track c.id) {
              <mat-option [value]="c.id">{{ c.ragioneSociale }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Fornitore</mat-label>
          <mat-select [(ngModel)]="data.app.fornitoreId">
            <mat-option [value]="null">—</mat-option>
            @for (f of data.fornitori; track f.id) {
              <mat-option [value]="f.id">{{ f.ragioneSociale }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <div style="display:flex;gap:8px;align-items:center">
        <mat-form-field style="flex:1"><mat-label>Colore</mat-label>
          <mat-select [(ngModel)]="data.app.colore">
            <mat-option value="#3b82f6"><span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Blu</mat-option>
            <mat-option value="#16a34a"><span style="display:inline-block;width:14px;height:14px;background:#16a34a;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Verde</mat-option>
            <mat-option value="#dc2626"><span style="display:inline-block;width:14px;height:14px;background:#dc2626;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Rosso</mat-option>
            <mat-option value="#f59e0b"><span style="display:inline-block;width:14px;height:14px;background:#f59e0b;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Arancio</mat-option>
            <mat-option value="#8b5cf6"><span style="display:inline-block;width:14px;height:14px;background:#8b5cf6;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Viola</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Promemoria</mat-label>
          <mat-select [(ngModel)]="data.app.promemoria">
            <mat-option [value]="null">Nessuno</mat-option>
            <mat-option [value]="15">15 minuti prima</mat-option>
            <mat-option [value]="30">30 minuti prima</mat-option>
            <mat-option [value]="60">1 ora prima</mat-option>
            <mat-option [value]="1440">1 giorno prima</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <mat-form-field style="width:100%"><mat-label>Note</mat-label>
        <textarea matInput rows="2" [(ngModel)]="data.app.descrizione"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button [disabled]="!data.app.titolo || !data.app.inizio" (click)="ref.close(data.app)">
        <mat-icon>save</mat-icon> Salva
      </button>
    </mat-dialog-actions>`,
})
export class AppuntamentoDialogComponent {
  constructor(public ref: MatDialogRef<AppuntamentoDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { app: Appuntamento; clienti: Cliente[]; fornitori: Fornitore[] }) {}
}

@Component({
  selector: 'app-sync-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon style="vertical-align:middle;color:#6366f1">sync</mat-icon>
      Sincronizza con calendario esterno
    </h2>
    <mat-dialog-content style="min-width:520px;max-width:600px">
      <p style="font-size:13px;color:#475569;line-height:1.5">
        Aggiungi questo calendario al tuo account Google / Outlook / Apple e si aggiornerà
        automaticamente. Niente da configurare lato server: il link è personale e basta.
      </p>

      <div style="background:#f1f5f9;border-radius:8px;padding:12px;margin:12px 0">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">
          URL feed (HTTPS)
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:100%">
          <input matInput [value]="data.httpsUrl" readonly #urlInput (focus)="urlInput.select()">
        </mat-form-field>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button mat-stroked-button (click)="copia(data.httpsUrl)">
            <mat-icon>content_copy</mat-icon> Copia URL
          </button>
          <a mat-flat-button color="primary" [href]="data.webcalUrl">
            <mat-icon>event_available</mat-icon> Apri con app calendario
          </a>
        </div>
      </div>

      <div style="margin-top:18px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">
          Istruzioni per provider
        </div>

        <details style="margin-bottom:8px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px">
          <summary style="cursor:pointer;font-weight:600;font-size:13px">
            <mat-icon style="vertical-align:middle;color:#4285f4;font-size:18px;width:18px;height:18px">event</mat-icon>
            Google Calendar
          </summary>
          <ol style="font-size:13px;color:#475569;margin:8px 0 0;padding-left:20px;line-height:1.7">
            <li>Apri <a href="https://calendar.google.com/" target="_blank" rel="noopener">calendar.google.com</a></li>
            <li>Sidebar sinistra → <b>"Altri calendari"</b> → <b>+</b> → <b>"Da URL"</b></li>
            <li>Incolla l'URL HTTPS qui sopra e clicca "Aggiungi calendario"</li>
            <li>Google ricarica gli eventi ogni 4-8 ore</li>
          </ol>
        </details>

        <details style="margin-bottom:8px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px">
          <summary style="cursor:pointer;font-weight:600;font-size:13px">
            <mat-icon style="vertical-align:middle;color:#0078d4;font-size:18px;width:18px;height:18px">event</mat-icon>
            Outlook / Microsoft 365
          </summary>
          <ol style="font-size:13px;color:#475569;margin:8px 0 0;padding-left:20px;line-height:1.7">
            <li>Outlook web → Calendario → <b>"Aggiungi calendario"</b> → <b>"Sottoscrivi dal web"</b></li>
            <li>Incolla l'URL HTTPS, dai un nome (es. "Invoxa") e salva</li>
          </ol>
        </details>

        <details style="margin-bottom:8px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px">
          <summary style="cursor:pointer;font-weight:600;font-size:13px">
            <mat-icon style="vertical-align:middle;color:#000;font-size:18px;width:18px;height:18px">event</mat-icon>
            Apple Calendar (Mac / iPhone)
          </summary>
          <ol style="font-size:13px;color:#475569;margin:8px 0 0;padding-left:20px;line-height:1.7">
            <li>Mac: <b>Calendario → File → Nuovo iscrizione calendario...</b> → incolla l'URL HTTPS</li>
            <li>iPhone: <b>Impostazioni → Calendario → Account → Aggiungi account → Altro → Aggiungi calendario sottoscritto</b></li>
            <li>O più semplice: clicca <b>"Apri con app calendario"</b> qui sopra (usa il link webcal://)</li>
          </ol>
        </details>
      </div>

      <p style="font-size:11px;color:#94a3b8;margin-top:16px;padding:8px;background:#fef3c7;border-radius:6px">
        <mat-icon style="vertical-align:middle;font-size:14px;width:14px;height:14px;color:#92400e">info</mat-icon>
        L'URL contiene un token firmato univoco per il tuo magazzino. Se sospetti che sia stato condiviso,
        cambia AUTH_SECRET nelle env del server: tutti i feed vengono invalidati e ne genererai di nuovi.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Chiudi</button>
    </mat-dialog-actions>`,
})
export class SyncDialogComponent {
  constructor(public ref: MatDialogRef<SyncDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { httpsUrl: string; webcalUrl: string }) {}
  copia(text: string) {
    try { navigator.clipboard?.writeText(text); } catch (_) {}
  }
}

@Component({
  selector: 'app-todo-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.t.id ? 'Modifica todo' : 'Nuova todo' }}</h2>
    <mat-dialog-content style="min-width:420px">
      <mat-form-field style="width:100%"><mat-label>Titolo *</mat-label>
        <input matInput [(ngModel)]="data.t.titolo" required>
      </mat-form-field>
      <mat-form-field style="width:100%"><mat-label>Descrizione</mat-label>
        <textarea matInput rows="2" [(ngModel)]="data.t.descrizione"></textarea>
      </mat-form-field>
      <div style="display:flex;gap:8px">
        <mat-form-field style="flex:1"><mat-label>Scadenza</mat-label>
          <input matInput type="datetime-local" [(ngModel)]="data.t.scadenza">
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Priorità</mat-label>
          <mat-select [(ngModel)]="data.t.priorita">
            <mat-option value="BASSA">Bassa</mat-option>
            <mat-option value="MEDIA">Media</mat-option>
            <mat-option value="ALTA">Alta</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex:1"><mat-label>Categoria</mat-label>
          <input matInput [(ngModel)]="data.t.categoria" placeholder="es. Personale">
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button [disabled]="!data.t.titolo" (click)="ref.close(data.t)">
        <mat-icon>save</mat-icon> Salva
      </button>
    </mat-dialog-actions>`,
})
export class TodoDialogComponent {
  constructor(public ref: MatDialogRef<TodoDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { t: Todo }) {}
}

@Component({
  selector: 'app-agenda',
  standalone: true,
  providers: [DatePipe],
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule,
    MatDialogModule, MatSnackBarModule, MatMenuModule, MatTooltipModule,
  ],
  template: `
    <div class="page agenda-page">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <h1 class="page-title">Agenda</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button mat-flat-button (click)="nuovoAppuntamento()"><mat-icon>add</mat-icon> Nuovo appuntamento</button>
          <button mat-stroked-button (click)="apriSync()">
            <mat-icon>sync</mat-icon> Sincronizza calendario
          </button>
          <button mat-stroked-button (click)="downloadIcs()">
            <mat-icon>download</mat-icon> Esporta .ics
          </button>
        </div>
      </div>

      <mat-tab-group animationDuration="0" [(selectedIndex)]="tabIndex">
        <!-- ── Vista calendario mensile ───────────────────────────────────── -->
        <mat-tab label="Calendario">
          <div class="card" style="margin-top:16px">
            <div class="cal-toolbar">
              <button mat-icon-button (click)="meseShift(-1)"><mat-icon>chevron_left</mat-icon></button>
              <button mat-stroked-button (click)="oggi()">Oggi</button>
              <button mat-icon-button (click)="meseShift(1)"><mat-icon>chevron_right</mat-icon></button>
              <div class="cal-title">{{ titoloMese() }}</div>
              <div class="cal-legend">
                <span><span class="dot" style="background:#3b82f6"></span> Appuntamenti</span>
                <span><span class="dot" style="background:#16a34a"></span> Incassi</span>
                <span><span class="dot" style="background:#dc2626"></span> Pagamenti</span>
                <span><span class="dot" style="background:#8b5cf6"></span> CRM</span>
                <span><span class="dot" style="background:#f59e0b"></span> Ricorrenti</span>
              </div>
            </div>
            <div class="cal-grid-head">
              @for (d of giorniSettimana; track d) { <div>{{ d }}</div> }
            </div>
            <div class="cal-grid">
              @for (cell of celle; track $index) {
                <div class="cal-cell"
                     [class.out]="cell.fuoriMese"
                     [class.oggi]="cell.iso === oggiIso"
                     (click)="onCellClick(cell)">
                  <div class="cal-num">{{ cell.giorno }}</div>
                  <div class="cal-eventi">
                    @for (e of eventiDelGiorno(cell.iso).slice(0, 3); track e.id) {
                      <div class="cal-event"
                           [style.background]="e.colore"
                           [title]="e.titolo + (e.controparte ? ' · ' + e.controparte : '')"
                           (click)="$event.stopPropagation(); apriEvento(e)">
                        {{ formatHora(e) }}{{ e.titolo }}
                      </div>
                    }
                    @if (eventiDelGiorno(cell.iso).length > 3) {
                      <div class="cal-more">+{{ eventiDelGiorno(cell.iso).length - 3 }} altri</div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </mat-tab>

        <!-- ── Lista appuntamenti ─────────────────────────────────────────── -->
        <mat-tab label="Lista appuntamenti">
          <div class="card" style="margin-top:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center">
              <div style="color:#64748b;font-size:13px">{{ appuntamenti.length }} appuntamenti</div>
              <button mat-flat-button (click)="nuovoAppuntamento()"><mat-icon>add</mat-icon> Nuovo</button>
            </div>
            <table class="lista">
              <thead><tr><th>Quando</th><th>Titolo</th><th>Luogo</th><th>Controparte</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                @for (a of appuntamenti; track a.id) {
                  <tr>
                    <td>
                      <div [style.color]="a.colore" style="font-weight:600">{{ a.inizio | date:'EEE dd MMM HH:mm' }}</div>
                    </td>
                    <td>
                      <b>{{ a.titolo }}</b>
                      @if (a.descrizione) { <div style="font-size:11px;color:#94a3b8">{{ a.descrizione }}</div> }
                    </td>
                    <td>{{ a.luogo || '—' }}</td>
                    <td>{{ a.clienteNome || a.fornitoreNome || '—' }}</td>
                    <td>{{ a.stato }}</td>
                    <td>
                      <button mat-icon-button [matMenuTriggerFor]="aMenu"><mat-icon>more_vert</mat-icon></button>
                      <mat-menu #aMenu="matMenu">
                        <button mat-menu-item (click)="modificaAppuntamento(a)"><mat-icon>edit</mat-icon> Modifica</button>
                        <button mat-menu-item (click)="cambiaStatoApp(a, 'COMPLETATO')" [disabled]="a.stato==='COMPLETATO'">
                          <mat-icon style="color:#16a34a">check_circle</mat-icon> Segna completato
                        </button>
                        <button mat-menu-item (click)="cambiaStatoApp(a, 'ANNULLATO')" [disabled]="a.stato==='ANNULLATO'">
                          <mat-icon style="color:#f59e0b">cancel</mat-icon> Annulla
                        </button>
                        <button mat-menu-item (click)="eliminaAppuntamento(a)" style="color:#dc2626">
                          <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                        </button>
                      </mat-menu>
                    </td>
                  </tr>
                }
                @if (appuntamenti.length === 0) {
                  <tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">Nessun appuntamento in questo periodo.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </mat-tab>

        <!-- ── Todo list ──────────────────────────────────────────────────── -->
        <mat-tab label="Todo">
          <div class="card" style="margin-top:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center">
              <div style="color:#64748b;font-size:13px">
                {{ todoPending() }} da fare · {{ todoInCorso() }} in corso · {{ todoFatte() }} completate
              </div>
              <button mat-flat-button (click)="nuovaTodo()"><mat-icon>add</mat-icon> Nuova todo</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              @for (t of todoOrdinate(); track t.id) {
                <div class="todo-row" [class.done]="t.stato==='FATTA'" [class.alta]="t.priorita==='ALTA'">
                  <mat-checkbox [checked]="t.stato==='FATTA'" (change)="toggleTodo(t, $event.checked)"></mat-checkbox>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600">{{ t.titolo }}
                      <span class="pri" [class.pri-alta]="t.priorita==='ALTA'" [class.pri-media]="t.priorita==='MEDIA'">{{ t.priorita }}</span>
                      @if (t.categoria) { <span class="cat">{{ t.categoria }}</span> }
                    </div>
                    @if (t.descrizione) { <div style="font-size:12px;color:#64748b">{{ t.descrizione }}</div> }
                    @if (t.scadenza) {
                      <div style="font-size:11px;color:#94a3b8;margin-top:2px">
                        <mat-icon style="font-size:12px;width:12px;height:12px;vertical-align:middle">schedule</mat-icon>
                        Scadenza: {{ t.scadenza | date:'EEE dd MMM HH:mm' }}
                      </div>
                    }
                  </div>
                  <button mat-icon-button [matMenuTriggerFor]="tMenu"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #tMenu="matMenu">
                    <button mat-menu-item (click)="modificaTodo(t)"><mat-icon>edit</mat-icon> Modifica</button>
                    <button mat-menu-item (click)="eliminaTodo(t)" style="color:#dc2626">
                      <mat-icon style="color:#dc2626">delete</mat-icon> Elimina
                    </button>
                  </mat-menu>
                </div>
              }
              @if (todoList.length === 0) {
                <p style="color:#94a3b8;text-align:center;padding:24px">Nessuna todo. Cliccca "Nuova todo" per aggiungerla.</p>
              }
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .page-title { font-size: 24px; font-weight: 700; margin: 0; }
    .card { background: var(--bg-surface, #fff); border-radius: 10px; padding: 16px; border: 1px solid var(--border-subtle, #e2e8f0); }

    .cal-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .cal-title { font-size: 18px; font-weight: 700; flex: 1; text-transform: capitalize; }
    .cal-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: var(--text-tertiary, #64748b); }
    .cal-legend span { display: inline-flex; align-items: center; gap: 4px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

    .cal-grid-head, .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border-subtle, #e2e8f0); border: 1px solid var(--border-subtle, #e2e8f0); }
    .cal-grid-head > div { background: var(--bg-surface-2, #f8fafc); padding: 6px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary, #64748b); text-align: center; }
    .cal-grid { margin-top: 0; }
    .cal-cell { background: var(--bg-surface, #fff); min-height: 100px; padding: 4px 6px; cursor: pointer; transition: background 0.1s; position: relative; }
    .cal-cell:hover { background: var(--bg-surface-2, #f8fafc); }
    .cal-cell.out { background: #fafbfc; color: var(--text-tertiary, #94a3b8); }
    .cal-cell.oggi { background: #fef3c7; }
    .cal-cell.oggi .cal-num { background: #f59e0b; color: #fff; }
    .cal-num { font-size: 12px; font-weight: 600; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
    .cal-eventi { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
    .cal-event { font-size: 10px; color: #fff; padding: 1px 5px; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
    .cal-event:hover { opacity: 0.85; }
    .cal-more { font-size: 10px; color: var(--text-tertiary, #64748b); padding-left: 4px; }

    .lista { width: 100%; border-collapse: collapse; font-size: 13px; }
    .lista th { background: var(--bg-surface-2, #f8fafc); padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary, #64748b); }
    .lista td { padding: 8px 10px; border-bottom: 1px solid var(--border-subtle, #f1f5f9); vertical-align: middle; }

    .todo-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 12px; border: 1px solid var(--border-subtle, #e2e8f0); border-radius: 8px; background: var(--bg-surface, #fff); }
    .todo-row.done { opacity: 0.5; text-decoration: line-through; }
    .todo-row.alta { border-left: 3px solid #dc2626; }
    .pri { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 6px; background: #e2e8f0; color: #475569; }
    .pri.pri-alta { background: #fee2e2; color: #991b1b; }
    .pri.pri-media { background: #fef3c7; color: #92400e; }
    .cat { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 10px; background: #dbeafe; color: #1e40af; margin-left: 4px; }

    @media (max-width: 700px) {
      .cal-cell { min-height: 70px; }
      .cal-event { font-size: 9px; }
    }
  `],
})
export class AgendaComponent implements OnInit {
  tabIndex = 0;
  giorniSettimana = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  // Stato vista calendario
  mese = new Date().getMonth();
  anno = new Date().getFullYear();
  oggiIso = new Date().toISOString().slice(0, 10);
  celle: { giorno: number; iso: string; fuoriMese: boolean }[] = [];
  eventi: CalEvent[] = [];

  // Liste
  appuntamenti: any[] = [];
  todoList: Todo[] = [];

  clienti: Cliente[] = [];
  fornitori: Fornitore[] = [];

  constructor(private api: ApiService, private ds: DataService,
              private dialog: MatDialog, private snack: MatSnackBar, private date: DatePipe) {}

  ngOnInit() {
    this.ds.getClienti().subscribe(c => this.clienti = c);
    this.ds.getFornitori().subscribe(f => this.fornitori = f);
    this.calcolaCelle();
    this.caricaCalendario();
    this.caricaAppuntamenti();
    this.caricaTodo();
  }

  // ── Calendario ──────────────────────────────────────────────────────────
  meseShift(d: number) {
    this.mese += d;
    if (this.mese < 0) { this.mese = 11; this.anno--; }
    if (this.mese > 11) { this.mese = 0; this.anno++; }
    this.calcolaCelle();
    this.caricaCalendario();
    this.caricaAppuntamenti();
  }
  oggi() {
    this.mese = new Date().getMonth(); this.anno = new Date().getFullYear();
    this.calcolaCelle(); this.caricaCalendario(); this.caricaAppuntamenti();
  }
  titoloMese(): string {
    return this.date.transform(new Date(this.anno, this.mese, 1), 'LLLL yyyy', undefined, 'it') || '';
  }

  calcolaCelle() {
    this.celle = [];
    const first = new Date(this.anno, this.mese, 1);
    const dayOfWeek = (first.getDay() + 6) % 7; // 0=Lun
    const start = new Date(this.anno, this.mese, 1 - dayOfWeek);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      this.celle.push({ giorno: d.getDate(), iso, fuoriMese: d.getMonth() !== this.mese });
    }
  }

  caricaCalendario() {
    const da = `${this.anno}-${String(this.mese + 1).padStart(2,'0')}-01T00:00:00`;
    const lastDay = new Date(this.anno, this.mese + 1, 0).getDate();
    const a  = `${this.anno}-${String(this.mese + 1).padStart(2,'0')}-${lastDay}T23:59:59`;
    // Estendi anche ai giorni "fuori mese" mostrati nelle celle
    const start = this.celle[0]?.iso + 'T00:00:00' || da;
    const end   = this.celle[this.celle.length-1]?.iso + 'T23:59:59' || a;
    this.api.get<CalEvent[]>(`agenda/calendario?dataDa=${start}&dataA=${end}`).subscribe(e => this.eventi = e);
  }

  eventiDelGiorno(iso: string): CalEvent[] {
    return this.eventi.filter(e => e.inizio.slice(0, 10) === iso);
  }

  formatHora(e: CalEvent): string {
    if (e.tuttoGiorno || !e.inizio.includes('T')) return '';
    return this.date.transform(e.inizio, 'HH:mm') + ' ';
  }

  apriEvento(e: CalEvent) {
    if (e.source === 'APPUNTAMENTO') {
      const app = this.appuntamenti.find(a => a.id === e.sourceId);
      if (app) this.modificaAppuntamento(app);
    } else if (e.route) {
      window.location.href = e.route;
    }
  }

  onCellClick(cell: { iso: string }) {
    const inizio = `${cell.iso}T09:00`;
    const fine = `${cell.iso}T10:00`;
    this.nuovoAppuntamento({ titolo: '', inizio, fine, colore: '#3b82f6', stato: 'PIANIFICATO' });
  }

  // ── Appuntamenti CRUD ───────────────────────────────────────────────────
  caricaAppuntamenti() {
    const da = `${this.anno}-${String(this.mese + 1).padStart(2,'0')}-01T00:00:00`;
    const lastDay = new Date(this.anno, this.mese + 1, 0).getDate();
    const a  = `${this.anno}-${String(this.mese + 1).padStart(2,'0')}-${lastDay}T23:59:59`;
    this.api.get<any[]>(`agenda/appuntamenti?dataDa=${da}&dataA=${a}`).subscribe(r => this.appuntamenti = r);
  }

  nuovoAppuntamento(preset?: Partial<Appuntamento>) {
    const app: Appuntamento = preset?.inizio
      ? { titolo: '', inizio: preset.inizio, fine: preset.fine, colore: '#3b82f6', stato: 'PIANIFICATO' }
      : { titolo: '', inizio: new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16), colore: '#3b82f6', stato: 'PIANIFICATO' };
    this.dialog.open(AppuntamentoDialogComponent, { data: { app, clienti: this.clienti, fornitori: this.fornitori } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.post('agenda/appuntamenti', saved).subscribe(() => {
          this.caricaAppuntamenti(); this.caricaCalendario();
          this.snack.open('Appuntamento creato', '', { duration: 2000 });
        });
      });
  }

  modificaAppuntamento(a: any) {
    const fix = (s: string) => s ? s.replace(' ', 'T').slice(0, a.tuttoGiorno ? 10 : 16) : s;
    const app: Appuntamento = { ...a, inizio: fix(a.inizio), fine: fix(a.fine) };
    this.dialog.open(AppuntamentoDialogComponent, { data: { app, clienti: this.clienti, fornitori: this.fornitori } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.put(`agenda/appuntamenti/${a.id}`, saved).subscribe(() => {
          this.caricaAppuntamenti(); this.caricaCalendario();
        });
      });
  }

  cambiaStatoApp(a: any, stato: string) {
    this.api.put(`agenda/appuntamenti/${a.id}`, { stato }).subscribe(() => {
      this.caricaAppuntamenti(); this.caricaCalendario();
    });
  }

  eliminaAppuntamento(a: any) {
    if (!confirm(`Eliminare "${a.titolo}"?`)) return;
    this.api.delete(`agenda/appuntamenti/${a.id}`).subscribe(() => {
      this.caricaAppuntamenti(); this.caricaCalendario();
    });
  }

  // ── Todo ────────────────────────────────────────────────────────────────
  caricaTodo() {
    this.api.get<Todo[]>('agenda/todo').subscribe(r => this.todoList = r);
  }
  todoOrdinate(): Todo[] {
    return [...this.todoList].sort((a, b) => {
      if (a.stato === 'FATTA' && b.stato !== 'FATTA') return 1;
      if (b.stato === 'FATTA' && a.stato !== 'FATTA') return -1;
      if (a.priorita !== b.priorita) {
        const w = { ALTA: 0, MEDIA: 1, BASSA: 2 } as any;
        return w[a.priorita!] - w[b.priorita!];
      }
      return (a.scadenza || '').localeCompare(b.scadenza || '');
    });
  }
  todoPending(): number { return this.todoList.filter(t => t.stato === 'DA_FARE').length; }
  todoInCorso(): number { return this.todoList.filter(t => t.stato === 'IN_CORSO').length; }
  todoFatte(): number   { return this.todoList.filter(t => t.stato === 'FATTA').length; }

  toggleTodo(t: Todo, fatta: boolean) {
    this.api.put(`agenda/todo/${t.id}`, { stato: fatta ? 'FATTA' : 'DA_FARE' }).subscribe(() => this.caricaTodo());
  }
  nuovaTodo() {
    const t: Todo = { titolo: '', priorita: 'MEDIA', stato: 'DA_FARE' };
    this.dialog.open(TodoDialogComponent, { data: { t } }).afterClosed().subscribe(saved => {
      if (!saved) return;
      this.api.post('agenda/todo', saved).subscribe(() => { this.caricaTodo(); this.caricaCalendario(); });
    });
  }
  modificaTodo(t: Todo) {
    this.dialog.open(TodoDialogComponent, { data: { t: { ...t } } }).afterClosed().subscribe(saved => {
      if (!saved) return;
      this.api.put(`agenda/todo/${t.id}`, saved).subscribe(() => { this.caricaTodo(); this.caricaCalendario(); });
    });
  }
  eliminaTodo(t: Todo) {
    if (!confirm(`Eliminare "${t.titolo}"?`)) return;
    this.api.delete(`agenda/todo/${t.id}`).subscribe(() => { this.caricaTodo(); this.caricaCalendario(); });
  }

  // ── Sync calendario esterno (Google / Outlook / Apple) ─────────────────
  apriSync() {
    this.ds.getAgendaFeedUrl().subscribe({
      next: r => this.dialog.open(SyncDialogComponent, { data: r }),
      error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), 'OK', { duration: 4000 }),
    });
  }

  // ── ICS download ────────────────────────────────────────────────────────
  downloadIcs() {
    this.api.getBlob('agenda/export.ics').subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'invoxa-agenda.ics';
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      },
      error: e => this.snack.open('Errore export ICS: ' + (e.error?.error || e.message), 'OK', { duration: 4000 }),
    });
  }
}

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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { AuthService } from '../../services/auth.service';
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
  userId?: number;
  condiviso?: boolean;
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
  userId?: number;
  autoreUsername?: string;
  autoreNome?: string;
  condiviso?: boolean;
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
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatIconModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>{{ data.app.id ? 'Modifica appuntamento' : 'Nuovo appuntamento' }}</h2>
    <mat-dialog-content style="min-width:520px;max-width:640px">
      <mat-form-field appearance="outline" style="width:100%"><mat-label>Titolo *</mat-label>
        <input matInput [(ngModel)]="data.app.titolo" required>
      </mat-form-field>

      <mat-checkbox [(ngModel)]="tuttoGiorno" (change)="onTuttoGiornoChange()" style="margin-bottom:12px">Tutto il giorno</mat-checkbox>

      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;margin-bottom:8px">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Data inizio *</mat-label>
          <input matInput [matDatepicker]="dpStart" [(ngModel)]="dataInizio" required>
          <mat-datepicker-toggle matIconSuffix [for]="dpStart"></mat-datepicker-toggle>
          <mat-datepicker #dpStart></mat-datepicker>
        </mat-form-field>
        @if (!tuttoGiorno) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:90px">
            <mat-label>Ore</mat-label>
            <mat-select [(ngModel)]="oraInizio">
              @for (h of ore; track h) { <mat-option [value]="h">{{ h }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:90px">
            <mat-label>Min</mat-label>
            <mat-select [(ngModel)]="minutiInizio">
              @for (m of minuti; track m) { <mat-option [value]="m">{{ m }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
      </div>

      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;margin-bottom:12px">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Data fine</mat-label>
          <input matInput [matDatepicker]="dpEnd" [(ngModel)]="dataFine">
          <mat-datepicker-toggle matIconSuffix [for]="dpEnd"></mat-datepicker-toggle>
          <mat-datepicker #dpEnd></mat-datepicker>
        </mat-form-field>
        @if (!tuttoGiorno) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:90px">
            <mat-label>Ore</mat-label>
            <mat-select [(ngModel)]="oraFine">
              @for (h of ore; track h) { <mat-option [value]="h">{{ h }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:90px">
            <mat-label>Min</mat-label>
            <mat-select [(ngModel)]="minutiFine">
              @for (m of minuti; track m) { <mat-option [value]="m">{{ m }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
      </div>

      <mat-form-field appearance="outline" style="width:100%"><mat-label>Luogo</mat-label>
        <input matInput [(ngModel)]="data.app.luogo" placeholder="es. Ufficio cliente">
      </mat-form-field>

      <div style="display:flex;gap:8px">
        <mat-form-field appearance="outline" style="flex:1"><mat-label>Cliente</mat-label>
          <mat-select [(ngModel)]="data.app.clienteId">
            <mat-option [value]="null">—</mat-option>
            @for (c of data.clienti; track c.id) {
              <mat-option [value]="c.id">{{ c.ragioneSociale }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="flex:1"><mat-label>Fornitore</mat-label>
          <mat-select [(ngModel)]="data.app.fornitoreId">
            <mat-option [value]="null">—</mat-option>
            @for (f of data.fornitori; track f.id) {
              <mat-option [value]="f.id">{{ f.ragioneSociale }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <div style="display:flex;gap:8px;align-items:center">
        <mat-form-field appearance="outline" style="flex:1"><mat-label>Colore</mat-label>
          <mat-select [(ngModel)]="data.app.colore">
            <mat-option value="#3b82f6"><span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Blu</mat-option>
            <mat-option value="#16a34a"><span style="display:inline-block;width:14px;height:14px;background:#16a34a;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Verde</mat-option>
            <mat-option value="#dc2626"><span style="display:inline-block;width:14px;height:14px;background:#dc2626;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Rosso</mat-option>
            <mat-option value="#f59e0b"><span style="display:inline-block;width:14px;height:14px;background:#f59e0b;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Arancio</mat-option>
            <mat-option value="#0891b2"><span style="display:inline-block;width:14px;height:14px;background:#0891b2;border-radius:3px;vertical-align:middle;margin-right:6px"></span> Viola</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="flex:1"><mat-label>Promemoria</mat-label>
          <mat-select [(ngModel)]="data.app.promemoria">
            <mat-option [value]="null">Nessuno</mat-option>
            <mat-option [value]="15">15 minuti prima</mat-option>
            <mat-option [value]="30">30 minuti prima</mat-option>
            <mat-option [value]="60">1 ora prima</mat-option>
            <mat-option [value]="1440">1 giorno prima</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline" style="width:100%"><mat-label>Note</mat-label>
        <textarea matInput rows="2" [(ngModel)]="data.app.descrizione"></textarea>
      </mat-form-field>

      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px;margin-top:8px">
        <mat-checkbox [(ngModel)]="data.app.condiviso">
          <span style="font-weight:600">Condividi con il mio gruppo</span>
        </mat-checkbox>
        <div style="font-size:11px;color:#64748b;margin-top:4px;margin-left:32px">
          Se attivo, l'appuntamento sarà visibile a tutti gli utenti che condividono
          un gruppo con te. Altrimenti lo vedi solo tu (e gli amministratori).
        </div>
      </div>

      @if (data.app.id && data.app.autoreUsername) {
        <p style="font-size:11px;color:#94a3b8;margin-top:8px;text-align:right">
          Creato da: <b>{{ data.app.autoreNome || data.app.autoreUsername }}</b>
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button color="primary" [disabled]="!data.app.titolo || !dataInizio" (click)="salva()">
        <mat-icon>save</mat-icon> Salva
      </button>
    </mat-dialog-actions>`,
})
export class AppuntamentoDialogComponent {
  tuttoGiorno = false;
  dataInizio: Date | null = null;
  oraInizio = '09';
  minutiInizio = '00';
  dataFine: Date | null = null;
  oraFine = '10';
  minutiFine = '00';
  readonly ore = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  readonly minuti = ['00', '15', '30', '45'];

  constructor(public ref: MatDialogRef<AppuntamentoDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: { app: Appuntamento; clienti: Cliente[]; fornitori: Fornitore[] }) {
    this.tuttoGiorno = !!data.app.tuttoGiorno;
    if (data.app.inizio) {
      const d = this.parseIso(data.app.inizio);
      this.dataInizio = d.data;
      this.oraInizio = d.ore;
      this.minutiInizio = d.minuti;
    } else {
      this.dataInizio = new Date();
      this.oraInizio = '09'; this.minutiInizio = '00';
    }
    if (data.app.fine) {
      const d = this.parseIso(data.app.fine);
      this.dataFine = d.data;
      this.oraFine = d.ore;
      this.minutiFine = d.minuti;
    } else if (this.dataInizio) {
      this.dataFine = new Date(this.dataInizio);
      const nextHour = (parseInt(this.oraInizio) + 1) % 24;
      this.oraFine = String(nextHour).padStart(2, '0');
      this.minutiFine = this.minutiInizio;
    }
  }

  /** Estrae { data: Date, ore: 'HH', minuti: 'MM' } da una stringa ISO o datetime-local. */
  private parseIso(s: string): { data: Date; ore: string; minuti: string } {
    // Supporta "2026-05-26T15:30" o "2026-05-26 15:30:00" o "2026-05-26"
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return { data: new Date(s), ore: '09', minuti: '00' };
    const data = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    const ore = m[4] || '09';
    const min = m[5] || '00';
    // Snap minuti al multiplo di 15 più vicino
    const minN = parseInt(min);
    const snapped = String(Math.round(minN / 15) * 15 % 60).padStart(2, '0');
    return { data, ore, minuti: snapped === '60' ? '00' : snapped };
  }

  onTuttoGiornoChange() {
    if (this.tuttoGiorno && this.dataInizio && !this.dataFine) {
      this.dataFine = new Date(this.dataInizio);
    }
  }

  /** Ricompone la stringa locale "YYYY-MM-DDTHH:MM" (senza timezone). */
  private toIsoLocal(d: Date, h: string, m: string): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${h}:${m}:00`;
  }
  private toIsoDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  salva() {
    if (!this.dataInizio || !this.data.app.titolo) return;
    const result: Appuntamento = { ...this.data.app, tuttoGiorno: this.tuttoGiorno };
    if (this.tuttoGiorno) {
      result.inizio = this.toIsoDate(this.dataInizio);
      result.fine   = this.dataFine ? this.toIsoDate(this.dataFine) : null;
    } else {
      result.inizio = this.toIsoLocal(this.dataInizio, this.oraInizio, this.minutiInizio);
      result.fine   = this.dataFine ? this.toIsoLocal(this.dataFine, this.oraFine, this.minutiFine) : null;
    }
    this.ref.close(result);
  }
}

@Component({
  selector: 'app-sync-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon style="vertical-align:middle;color:#11769b">sync</mat-icon>
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
            <li>Incolla l'URL HTTPS, dai un nome (es. "Ordeva") e salva</li>
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
      <div class="page-header agenda-header">
        <div class="agenda-header-left">
          <h1 class="page-title">Agenda</h1>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="vista-select">
            <mat-label>Vista</mat-label>
            <mat-select [(ngModel)]="vista" (selectionChange)="onVistaChange()">
              <mat-option value="mia">
                <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle">person</mat-icon>
                La mia agenda
              </mat-option>
              @if (haGruppi) {
                <mat-option value="gruppo">
                  <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle">group</mat-icon>
                  Il mio gruppo
                </mat-option>
              }
              <mat-option value="auto">
                <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle">visibility</mat-icon>
                Visibili (default)
              </mat-option>
              @if (isAdmin) {
                <mat-option value="tutte">
                  <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle">supervisor_account</mat-icon>
                  Tutti gli utenti
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="agenda-header-actions">
          <button mat-flat-button color="primary" class="btn-nuovo" (click)="nuovoAppuntamento()">
            <mat-icon>add</mat-icon> <span class="btn-text">Nuovo appuntamento</span>
          </button>
          <button mat-icon-button class="hide-desktop" [matMenuTriggerFor]="menuExtra" title="Altre azioni">
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #menuExtra="matMenu">
            <button mat-menu-item type="button" (click)="apriSync()"><mat-icon>sync</mat-icon> Sincronizza calendario</button>
            <button mat-menu-item type="button" (click)="downloadIcs()"><mat-icon>download</mat-icon> Esporta .ics</button>
          </mat-menu>
          <button mat-stroked-button class="hide-mobile" (click)="apriSync()">
            <mat-icon>sync</mat-icon> Sincronizza
          </button>
          <button mat-stroked-button class="hide-mobile" (click)="downloadIcs()">
            <mat-icon>download</mat-icon> .ics
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
                <span><span class="dot" style="background:#0891b2"></span> CRM</span>
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
                           [title]="eventTooltip(e)"
                           (click)="$event.stopPropagation(); apriEvento(e)">
                        @if (e.condiviso && e.source === 'APPUNTAMENTO') { 👥 }
                        @if (e.source === 'APPUNTAMENTO' && e.userId && e.userId !== userId) { 👤 }
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
            <table class="lista hide-mobile">
              <thead><tr><th>Quando</th><th>Titolo</th><th>Autore</th><th>Luogo</th><th>Controparte</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                @for (a of appuntamenti; track a.id) {
                  <tr>
                    <td>
                      <div [style.color]="a.colore" style="font-weight:600">{{ a.inizio | date:'EEE dd MMM HH:mm' }}</div>
                    </td>
                    <td>
                      <b>{{ a.titolo }}</b>
                      @if (a.condiviso) { <span style="font-size:10px;background:#cde3ec;color:#0b5066;padding:1px 6px;border-radius:8px;margin-left:6px">condiviso</span> }
                      @if (a.descrizione) { <div style="font-size:11px;color:#94a3b8">{{ a.descrizione }}</div> }
                    </td>
                    <td>
                      @if (a.userId === userId) {
                        <span style="color:#0f172a">io</span>
                      } @else {
                        <span style="color:#64748b">{{ a.autoreNome || a.autoreUsername || '—' }}</span>
                      }
                    </td>
                    <td>{{ a.luogo || '—' }}</td>
                    <td>{{ a.clienteNome || a.fornitoreNome || '—' }}</td>
                    <td>{{ a.stato }}</td>
                    <td>
                      @if (canModifica(a)) {
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
                      } @else {
                        <mat-icon style="color:#94a3b8;font-size:18px;width:18px;height:18px" title="Solo letture: appuntamento di un altro utente">visibility</mat-icon>
                      }
                    </td>
                  </tr>
                }
                @if (appuntamenti.length === 0) {
                  <tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">Nessun appuntamento in questo periodo.</td></tr>
                }
              </tbody>
            </table>
            <!-- Card list mobile -->
            <div class="agenda-list-mobile show-only-mobile">
              @for (a of appuntamenti; track a.id) {
                <div class="app-card" [style.border-left-color]="a.colore">
                  <div class="app-card-time">
                    <div class="app-card-day">{{ a.inizio | date:'EEE' }}</div>
                    <div class="app-card-date">{{ a.inizio | date:'dd MMM' }}</div>
                    @if (!a.tuttoGiorno && a.inizio.includes('T')) {
                      <div class="app-card-hour">{{ a.inizio | date:'HH:mm' }}</div>
                    }
                  </div>
                  <div class="app-card-body">
                    <div class="app-card-title">
                      {{ a.titolo }}
                      @if (a.condiviso) { <span class="badge-cond">👥</span> }
                    </div>
                    @if (a.luogo) { <div class="app-card-meta"><mat-icon class="mi">location_on</mat-icon> {{ a.luogo }}</div> }
                    @if (a.clienteNome || a.fornitoreNome) {
                      <div class="app-card-meta"><mat-icon class="mi">person</mat-icon> {{ a.clienteNome || a.fornitoreNome }}</div>
                    }
                    @if (a.userId !== userId) {
                      <div class="app-card-meta"><mat-icon class="mi">badge</mat-icon> {{ a.autoreNome || a.autoreUsername }}</div>
                    }
                  </div>
                  @if (canModifica(a)) {
                    <button mat-icon-button [matMenuTriggerFor]="mMenu" class="app-card-action"><mat-icon>more_vert</mat-icon></button>
                    <mat-menu #mMenu="matMenu">
                      <button mat-menu-item type="button" (click)="modificaAppuntamento(a)"><mat-icon>edit</mat-icon> Modifica</button>
                      <button mat-menu-item type="button" (click)="cambiaStatoApp(a, 'COMPLETATO')" [disabled]="a.stato==='COMPLETATO'"><mat-icon style="color:#16a34a">check_circle</mat-icon> Completato</button>
                      <button mat-menu-item type="button" (click)="cambiaStatoApp(a, 'ANNULLATO')" [disabled]="a.stato==='ANNULLATO'"><mat-icon style="color:#f59e0b">cancel</mat-icon> Annulla</button>
                      <button mat-menu-item type="button" (click)="eliminaAppuntamento(a)" style="color:#dc2626"><mat-icon style="color:#dc2626">delete</mat-icon> Elimina</button>
                    </mat-menu>
                  }
                </div>
              }
              @if (appuntamenti.length === 0) {
                <p style="text-align:center;color:#94a3b8;padding:24px">Nessun appuntamento in questo periodo.</p>
              }
            </div>
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

    .agenda-header {
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 12px;
    }
    .agenda-header-left {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap; flex: 1 1 auto;
    }
    .vista-select { min-width: 180px; }
    .agenda-header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .hide-desktop { display: none; }

    @media (max-width: 600px) {
      .agenda-header { gap: 8px; }
      .agenda-header-left { width: 100%; gap: 8px; }
      .vista-select { flex: 1 1 100%; min-width: 0; }
      .agenda-header-actions { width: 100%; justify-content: space-between; }
      .btn-nuovo { flex: 1; }
      .btn-nuovo .btn-text { display: inline; }
      .hide-desktop { display: inline-flex; }
      .hide-mobile { display: none !important; }
    }

    /* Card list agenda — mobile */
    .agenda-list-mobile { display: flex; flex-direction: column; gap: 10px; }
    .show-only-mobile { display: none; }
    @media (max-width: 600px) { .show-only-mobile { display: flex; flex-direction: column; } }

    .app-card {
      display: grid;
      grid-template-columns: 78px 1fr auto;
      gap: 10px; align-items: center;
      padding: 10px 12px;
      background: var(--bg-surface, #fff);
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-left: 3px solid #3b82f6;
      border-radius: 8px;
    }
    .app-card-time {
      display: flex; flex-direction: column; align-items: flex-start;
      border-right: 1px solid var(--border-subtle, #f1f5f9);
      padding-right: 8px;
    }
    .app-card-day { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #94a3b8; }
    .app-card-date { font-size: 14px; font-weight: 700; color: #0f172a; }
    .app-card-hour { font-size: 13px; font-weight: 600; color: #475569; margin-top: 2px; }
    .app-card-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .app-card-title {
      font-weight: 600; font-size: 14px; color: #0f172a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .badge-cond { font-size: 12px; margin-left: 4px; }
    .app-card-meta {
      display: flex; align-items: center; gap: 4px;
      font-size: 12px; color: #64748b;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .app-card-meta .mi { font-size: 12px; width: 12px; height: 12px; color: #94a3b8; flex-shrink: 0; }
    .app-card-action { flex-shrink: 0; }

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
      .cal-toolbar { gap: 6px; }
      .cal-title { font-size: 15px; flex: 1 1 100%; order: -1; text-align: center; }
      .cal-legend { display: none; }   // legenda nascosta su mobile, occupa troppo
      .cal-grid-head > div { padding: 4px 2px; font-size: 9px; }
      .cal-cell { min-height: 56px; padding: 2px 3px; }
      .cal-num { font-size: 10px; width: 18px; height: 18px; }
      .cal-event { font-size: 9px; padding: 1px 3px; line-height: 1.2; }
      .cal-more { font-size: 9px; padding-left: 2px; }
    }

    @media (max-width: 480px) {
      // Su schermi molto stretti: solo un pallino colorato per cella + lista nel modal
      .cal-cell { min-height: 44px; }
      .cal-eventi { flex-direction: row; flex-wrap: wrap; gap: 2px; justify-content: center; }
      .cal-event {
        width: 6px !important; height: 6px !important; padding: 0 !important;
        border-radius: 50%; overflow: hidden; text-indent: -9999px;
      }
      .cal-more { display: none; }
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

  // Vista multi-utente
  isAdmin = false;
  haGruppi = false;
  vista: 'mia' | 'gruppo' | 'auto' | 'tutte' = 'auto';
  userId = 0;

  constructor(private api: ApiService, private ds: DataService, private auth: AuthService,
              private dialog: MatDialog, private snack: MatSnackBar, private date: DatePipe) {}

  ngOnInit() {
    const u = this.auth.getUser();
    this.isAdmin = !!u && (u.ruolo === 'SUPERADMIN' || u.ruolo === 'ADMIN');
    this.userId = u?.id || 0;
    this.vista = this.isAdmin ? 'tutte' : 'auto';

    // Su mobile parti dalla tab "Lista appuntamenti" (calendario mensile è
    // claustrofobico su schermi stretti).
    if (typeof window !== 'undefined' && window.innerWidth <= 600) {
      this.tabIndex = 1;
    }

    this.ds.getClienti().subscribe(c => this.clienti = c);
    this.ds.getFornitori().subscribe(f => this.fornitori = f);
    this.ds.getMyGruppi().subscribe(g => this.haGruppi = (g?.length || 0) > 0);

    this.calcolaCelle();
    this.caricaCalendario();
    this.caricaAppuntamenti();
    this.caricaTodo();
  }

  onVistaChange() {
    this.caricaCalendario();
    this.caricaAppuntamenti();
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
    const fallbackDa = `${this.anno}-${String(this.mese + 1).padStart(2,'0')}-01T00:00:00`;
    const lastDay = new Date(this.anno, this.mese + 1, 0).getDate();
    const fallbackA  = `${this.anno}-${String(this.mese + 1).padStart(2,'0')}-${lastDay}T23:59:59`;
    // Estende il range ai giorni "fuori mese" mostrati nelle celle (6 settimane visibili)
    const start = this.celle[0]?.iso ? `${this.celle[0].iso}T00:00:00` : fallbackDa;
    const end   = this.celle.length ? `${this.celle[this.celle.length - 1].iso}T23:59:59` : fallbackA;
    this.api.get<CalEvent[]>(`agenda/calendario?dataDa=${start}&dataA=${end}&vista=${this.vista}`).subscribe(e => this.eventi = e);
  }

  eventiDelGiorno(iso: string): CalEvent[] {
    return this.eventi.filter(e => e.inizio.slice(0, 10) === iso);
  }

  /** True se l'utente corrente può modificare/eliminare l'appuntamento. */
  canModifica(a: any): boolean {
    return this.isAdmin || !a.userId || a.userId === this.userId;
  }

  eventTooltip(e: CalEvent): string {
    const parts = [e.titolo];
    if (e.controparte) parts.push(`· ${e.controparte}`);
    if (e.userId && e.userId !== this.userId) {
      const app = this.appuntamenti.find(a => a.id === e.sourceId);
      if (app?.autoreNome || app?.autoreUsername) parts.push(`(${app.autoreNome || app.autoreUsername})`);
    }
    if (e.condiviso) parts.push('· condiviso');
    return parts.join(' ');
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
    this.api.get<any[]>(`agenda/appuntamenti?dataDa=${da}&dataA=${a}&vista=${this.vista}`).subscribe(r => this.appuntamenti = r);
  }

  nuovoAppuntamento(preset?: Partial<Appuntamento>) {
    const app: Appuntamento = {
      titolo: '',
      inizio: preset?.inizio || '',
      fine: preset?.fine || null,
      colore: '#3b82f6',
      stato: 'PIANIFICATO',
      ...preset,
    } as Appuntamento;
    this.dialog.open(AppuntamentoDialogComponent, { data: { app, clienti: this.clienti, fornitori: this.fornitori } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.post<{ id: number }>('agenda/appuntamenti', saved).subscribe({
          next: r => {
            // Naviga al mese dell'appuntamento creato se è in un altro mese
            this.navigaAlMeseDi(saved.inizio);
            this.refreshAll();
            this.snack.open('Appuntamento creato', '', { duration: 2000 });
          },
          error: e => this.snack.open('Errore: ' + (e.error?.error || e.message), 'OK', { duration: 4000 }),
        });
      });
  }

  modificaAppuntamento(a: any) {
    const app: Appuntamento = { ...a };
    this.dialog.open(AppuntamentoDialogComponent, { data: { app, clienti: this.clienti, fornitori: this.fornitori } })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.api.put(`agenda/appuntamenti/${a.id}`, saved).subscribe(() => {
          this.navigaAlMeseDi(saved.inizio);
          this.refreshAll();
        });
      });
  }

  cambiaStatoApp(a: any, stato: string) {
    this.api.put(`agenda/appuntamenti/${a.id}`, { stato }).subscribe(() => this.refreshAll());
  }

  eliminaAppuntamento(a: any) {
    if (!confirm(`Eliminare "${a.titolo}"?`)) return;
    this.api.delete(`agenda/appuntamenti/${a.id}`).subscribe(() => this.refreshAll());
  }

  /** Cambia mese visualizzato se la data passata è in un mese diverso da quello corrente. */
  private navigaAlMeseDi(isoDate: string | null | undefined) {
    if (!isoDate) return;
    const m = String(isoDate).match(/^(\d{4})-(\d{2})/);
    if (!m) return;
    const anno = parseInt(m[1]);
    const mese = parseInt(m[2]) - 1;
    if (anno !== this.anno || mese !== this.mese) {
      this.anno = anno; this.mese = mese;
      this.calcolaCelle();
    }
  }

  /** Ricarica tutti i dati visualizzati nell'agenda. */
  private refreshAll() {
    this.caricaAppuntamenti();
    this.caricaCalendario();
    this.caricaTodo();
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
      this.api.post('agenda/todo', saved).subscribe(() => this.refreshAll());
    });
  }
  modificaTodo(t: Todo) {
    this.dialog.open(TodoDialogComponent, { data: { t: { ...t } } }).afterClosed().subscribe(saved => {
      if (!saved) return;
      this.api.put(`agenda/todo/${t.id}`, saved).subscribe(() => this.refreshAll());
    });
  }
  eliminaTodo(t: Todo) {
    if (!confirm(`Eliminare "${t.titolo}"?`)) return;
    this.api.delete(`agenda/todo/${t.id}`).subscribe(() => this.refreshAll());
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
        a.href = url; a.download = 'ordeva-agenda.ics';
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      },
      error: e => this.snack.open('Errore export ICS: ' + (e.error?.error || e.message), 'OK', { duration: 4000 }),
    });
  }
}

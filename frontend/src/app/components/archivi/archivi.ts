import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../services/data.service';
import { DesktopService } from '../../services/desktop.service';
import { ConfirmService } from '../shared/confirm-dialog';

interface Arc { slug: string; nome: string; cifrato: boolean; }

/**
 * Gestione archivi (edizione offline): elenco e operazioni su database multipli.
 * Ogni archivio è un gestionale a sé (dati e password propri). Le operazioni
 * delegano alle API /api/archivi; "cambia archivio" riavvia l'app sul nuovo.
 */
@Component({
  selector: 'app-archivi',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatMenuModule,
            MatFormFieldModule, MatInputModule, MatTooltipModule, MatProgressSpinnerModule],
  template: `
    <div class="page">
      <div class="page-header"><h1 class="page-title">Archivi</h1></div>

      <p style="color:var(--text-secondary);font-size:14px;margin:0 0 16px;max-width:680px">
        Ogni archivio è un gestionale indipendente, con i suoi dati e la sua password.
        Puoi tenerne più di uno (es. due attività, o persone diverse) e cambiarli all'avvio.
        Proteggere un archivio con una password lo cifra: il suo file di backup è leggibile
        solo con quella password.
      </p>

      @if (loading) {
        <div style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:0 auto"></mat-spinner></div>
      } @else {
        <div class="card">
          @for (a of archivi; track a.slug) {
            <div class="arc-row" [class.is-cur]="a.slug === corrente">
              <mat-icon class="arc-ic">{{ a.cifrato ? 'lock' : 'inventory_2' }}</mat-icon>

              @if (edit && edit.slug === a.slug) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1">
                  <mat-label>{{ edit.mode === 'duplica' ? 'Nome della copia' : 'Nuovo nome' }}</mat-label>
                  <input matInput [(ngModel)]="edit.value" (keyup.enter)="confermaEdit()" autofocus>
                </mat-form-field>
                <button mat-flat-button color="primary" [disabled]="busy || !edit.value.trim()" (click)="confermaEdit()">Conferma</button>
                <button mat-button [disabled]="busy" (click)="edit = null">Annulla</button>
              } @else {
                <div class="arc-info">
                  <span class="arc-nome">{{ a.nome }}</span>
                  <span class="arc-tags">
                    @if (a.slug === corrente) { <span class="tag tag-cur">in uso</span> }
                    @if (a.cifrato) { <span class="tag">protetto</span> }
                  </span>
                </div>

                @if (a.slug !== corrente) {
                  <button mat-stroked-button [disabled]="busy" (click)="cambia(a)">
                    <mat-icon>login</mat-icon> Apri
                  </button>
                }
                <button mat-icon-button [matMenuTriggerFor]="m" [disabled]="busy" title="Azioni"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #m="matMenu">
                  <button mat-menu-item (click)="startEdit(a, 'rinomina')"><mat-icon>edit</mat-icon> Rinomina</button>
                  <button mat-menu-item (click)="startEdit(a, 'duplica')"><mat-icon>content_copy</mat-icon> Duplica</button>
                  <button mat-menu-item (click)="esporta(a)"><mat-icon>download</mat-icon> Esporta…</button>
                  @if (a.slug === corrente) {
                    @if (a.cifrato) {
                      <button mat-menu-item (click)="rimuoviPassword(a)"><mat-icon>lock_open</mat-icon> Rimuovi password</button>
                    } @else {
                      <button mat-menu-item (click)="pwOpen = a.slug; pwValue = ''"><mat-icon>lock</mat-icon> Imposta password</button>
                    }
                  }
                  @if (a.slug !== corrente) {
                    <button mat-menu-item (click)="elimina(a)" style="color:#dc2626"><mat-icon style="color:#dc2626">delete</mat-icon> Elimina</button>
                  }
                </mat-menu>
              }
            </div>

            @if (pwOpen === a.slug) {
              <div class="arc-pw">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1">
                  <mat-label>Nuova password per "{{ a.nome }}"</mat-label>
                  <input matInput type="password" [(ngModel)]="pwValue" (keyup.enter)="setPassword()" autocomplete="new-password">
                </mat-form-field>
                <button mat-flat-button color="primary" [disabled]="busy || !pwValue.trim()" (click)="setPassword()">Proteggi</button>
                <button mat-button [disabled]="busy" (click)="pwOpen = null">Annulla</button>
              </div>
            }
          }

          <!-- Nuovo / Importa -->
          <div class="arc-new">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1">
              <mat-label>Nome nuovo archivio</mat-label>
              <input matInput [(ngModel)]="nuovoNome" (keyup.enter)="crea()" placeholder="es. La mia seconda attività">
            </mat-form-field>
            <button mat-flat-button color="primary" [disabled]="busy || !nuovoNome.trim()" (click)="crea()">
              <mat-icon>add</mat-icon> Crea
            </button>
            <button mat-stroked-button [disabled]="busy" (click)="importa()">
              <mat-icon>upload</mat-icon> Importa da file…
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .card { display:flex; flex-direction:column; }
    .arc-row { display:flex; align-items:center; gap:12px; padding:12px 4px; border-bottom:1px solid var(--border-subtle); }
    .arc-row.is-cur { background:var(--primary-soft); border-radius:10px; padding-left:10px; padding-right:10px; }
    .arc-ic { color:var(--text-tertiary); flex-shrink:0; }
    .arc-info { flex:1; min-width:0; display:flex; align-items:center; gap:10px; }
    .arc-nome { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .arc-tags { display:flex; gap:6px; flex-shrink:0; }
    .tag { font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--bg-subtle); color:var(--text-secondary); }
    .tag-cur { background:var(--primary); color:#fff; }
    .arc-pw, .arc-new { display:flex; align-items:center; gap:10px; padding:10px 4px; }
    .arc-new { border-top:1px solid var(--border); margin-top:6px; padding-top:14px; flex-wrap:wrap; }
  `],
})
export class ArchiviComponent implements OnInit {
  private ds = inject(DataService);
  private desktop = inject(DesktopService);
  private confirm = inject(ConfirmService);
  private snack = inject(MatSnackBar);

  archivi: Arc[] = [];
  corrente: string | null = null;
  loading = true;
  busy = false;
  nuovoNome = '';
  edit: { slug: string; mode: 'rinomina' | 'duplica'; value: string } | null = null;
  pwOpen: string | null = null;
  pwValue = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.ds.getArchivi().subscribe({
      next: r => { this.archivi = r.archivi || []; this.corrente = r.corrente; this.loading = false; },
      error: () => { this.loading = false; this.snack.open('Impossibile leggere gli archivi', '', { duration: 3000 }); },
    });
  }

  private done(msg: string) { this.busy = false; this.edit = null; this.pwOpen = null; this.snack.open(msg, '', { duration: 2500 }); this.load(); }
  private fail(e: any) { this.busy = false; this.snack.open(e?.error?.error || 'Operazione non riuscita', '', { duration: 3500, panelClass: 'snack-error' }); }

  crea() {
    const nome = this.nuovoNome.trim();
    if (!nome || this.busy) return;
    this.busy = true;
    this.ds.creaArchivio(nome).subscribe({ next: () => { this.nuovoNome = ''; this.done('Archivio creato'); }, error: e => this.fail(e) });
  }

  startEdit(a: Arc, mode: 'rinomina' | 'duplica') {
    this.edit = { slug: a.slug, mode, value: mode === 'duplica' ? `${a.nome} (copia)` : a.nome };
  }
  confermaEdit() {
    if (!this.edit || this.busy) return;
    const { slug, mode, value } = this.edit;
    const nome = value.trim();
    if (!nome) return;
    this.busy = true;
    const op = mode === 'duplica' ? this.ds.duplicaArchivio(slug, nome) : this.ds.rinominaArchivio(slug, nome);
    op.subscribe({ next: () => this.done(mode === 'duplica' ? 'Archivio duplicato' : 'Rinominato'), error: e => this.fail(e) });
  }

  async cambia(a: Arc) {
    if (this.busy) return;
    const ok = await this.confirm.ask({
      title: 'Cambia archivio',
      message: `Aprire l'archivio "${a.nome}"? Ordeva si riavvierà.`,
      confirmText: 'Apri e riavvia',
    });
    if (!ok) return;
    this.busy = true;
    this.ds.cambiaArchivio(a.slug).subscribe({
      next: () => { this.desktop.relaunch(); },
      error: e => this.fail(e),
    });
  }

  async elimina(a: Arc) {
    if (!await this.confirm.delete(`Eliminare l'archivio "${a.nome}"? Tutti i suoi dati verranno rimossi definitivamente.`)) return;
    this.busy = true;
    this.ds.eliminaArchivio(a.slug).subscribe({ next: () => this.done('Archivio eliminato'), error: e => this.fail(e) });
  }

  async esporta(a: Arc) {
    const dest = await this.desktop.pickSaveDb(`${a.slug}${a.cifrato ? '.db.enc' : '.db'}`);
    if (!dest) return;
    this.busy = true;
    this.ds.esportaArchivio(a.slug, dest).subscribe({ next: () => this.done('Archivio esportato'), error: e => this.fail(e) });
  }

  async importa() {
    const file = await this.desktop.pickBackupFile();
    if (!file) return;
    const base = (file.split(/[\\/]/).pop() || 'Archivio importato').replace(/\.(db|enc)$/i, '').replace(/\.db$/i, '');
    this.busy = true;
    this.ds.importaArchivio(file, base || 'Archivio importato').subscribe({ next: () => this.done('Archivio importato'), error: e => this.fail(e) });
  }

  setPassword() {
    const pw = this.pwValue.trim();
    if (!pw || this.busy) return;
    this.busy = true;
    this.ds.setPasswordArchivio(pw).subscribe({ next: () => { this.pwValue = ''; this.done('Archivio protetto: la password verrà richiesta all\'avvio'); }, error: e => this.fail(e) });
  }

  async rimuoviPassword(a: Arc) {
    if (!await this.confirm.ask({ title: 'Rimuovi password', message: `Togliere la protezione da "${a.nome}"? I dati non saranno più cifrati.`, confirmText: 'Rimuovi' })) return;
    this.busy = true;
    this.ds.rimuoviPasswordArchivio().subscribe({ next: () => this.done('Password rimossa'), error: e => this.fail(e) });
  }
}

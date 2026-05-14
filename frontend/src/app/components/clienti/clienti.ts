import { Component, OnInit, AfterViewInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { CityService, CityResult } from '../../services/city.service';
import { Cliente, TipoPagamento } from '../../models';
import { pIvaValidator, codiceFiscaleValidator } from '../../validators/italian-validators';

// ── Dialog ────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-cliente-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatAutocompleteModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifica cliente' : 'Nuovo cliente' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field style="width:100%"><mat-label>Ragione Sociale *</mat-label>
          <input matInput formControlName="ragioneSociale"></mat-form-field>
        <div class="form-row">
          <mat-form-field><mat-label>Email</mat-label>
            <input matInput formControlName="email"></mat-form-field>
          <mat-form-field><mat-label>Telefono</mat-label>
            <input matInput formControlName="telefono"></mat-form-field>
        </div>
        <mat-form-field style="width:100%"><mat-label>Via</mat-label>
          <input matInput formControlName="via"></mat-form-field>
        <div class="form-row">
          <mat-form-field style="max-width:120px"><mat-label>CAP</mat-label>
            <input matInput formControlName="cap" maxlength="5"></mat-form-field>
          <mat-form-field>
            <mat-label>Città</mat-label>
            <input matInput formControlName="citta" [matAutocomplete]="auto">
            <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onCitySelected($event.option.value)">
              @for (c of filteredCities; track c.name) {
                <mat-option [value]="c.name">{{ c.name }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field style="max-width:80px"><mat-label>Prov.</mat-label>
            <input matInput formControlName="provincia" maxlength="2" style="text-transform:uppercase">
            <mat-hint>sigla</mat-hint></mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field><mat-label>Stato</mat-label>
            <input matInput formControlName="stato"></mat-form-field>
          <mat-form-field><mat-label>Codice Fiscale</mat-label>
            <input matInput formControlName="codiceFiscale" style="text-transform:uppercase">
            @if (form.get('codiceFiscale')?.hasError('codiceFiscale')) {
              <mat-error>Codice fiscale non valido (16 caratteri o 11 cifre)</mat-error>
            }
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%"><mat-label>P. IVA</mat-label>
          <input matInput formControlName="pIva">
          @if (form.get('pIva')?.hasError('pIva')) {
            <mat-error>P. IVA non valida (deve essere di 11 cifre)</mat-error>
          }
        </mat-form-field>
        <div class="form-row">
          <mat-form-field><mat-label>Codice SDI</mat-label>
            <input matInput formControlName="sdi" style="text-transform:uppercase" maxlength="7" placeholder="es. ABC1234">
          </mat-form-field>
          <mat-form-field style="flex:2"><mat-label>PEC</mat-label>
            <input matInput formControlName="pec" placeholder="indirizzo@pec.it">
          </mat-form-field>
        </div>
        <mat-form-field style="width:100%">
          <mat-label>Metodo di pagamento preferito</mat-label>
          <mat-select formControlName="tipoPagamentoId">
            <mat-option [value]="null">— nessuno —</mat-option>
            @for (t of tipiPagamento; track t.id) {
              <mat-option [value]="t.id">{{ t.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`
})
export class ClienteDialogComponent implements OnInit {
  form: FormGroup;
  filteredCities: CityResult[] = [];
  tipiPagamento: TipoPagamento[] = [];
  private cityMap = new Map<string, CityResult>();

  constructor(
    private fb: FormBuilder,
    private ds: DataService,
    private cityService: CityService,
    public dialogRef: MatDialogRef<ClienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Cliente | null
  ) {
    this.form = this.fb.group({
      ragioneSociale: [data?.ragioneSociale ?? '', Validators.required],
      email:          [data?.email ?? ''],
      telefono:       [data?.telefono ?? ''],
      via:            [data?.via ?? ''],
      cap:            [data?.cap ?? ''],
      citta:          [data?.citta ?? ''],
      provincia:      [data?.provincia ?? ''],
      stato:          [data?.stato ?? 'Italia'],
      codiceFiscale:  [data?.codiceFiscale ?? '', codiceFiscaleValidator],
      pIva:           [data?.pIva ?? '', pIvaValidator],
      sdi:            [data?.sdi ?? ''],
      pec:            [data?.pec ?? ''],
      tipoPagamentoId:[data?.tipoPagamentoId ?? null],
    });
  }

  ngOnInit() {
    this.ds.getTipiPagamento().subscribe(t => this.tipiPagamento = t.filter(x => x.attivo));

    this.form.get('citta')!.valueChanges.pipe(
      debounceTime(300), distinctUntilChanged(),
      switchMap(v => this.cityService.searchCities(v ?? ''))
    ).subscribe(results => {
      this.filteredCities = results;
      results.forEach(r => this.cityMap.set(r.name, r));
    });

    this.form.get('cap')!.valueChanges.pipe(
      debounceTime(400), distinctUntilChanged(),
      filter(cap => cap?.length === 5),
      switchMap(cap => this.cityService.lookupByCap(cap))
    ).subscribe(result => {
      if (result) {
        this.form.patchValue({ citta: result.name, provincia: result.provincia, stato: 'Italia' }, { emitEvent: false });
        this.cityMap.set(result.name, result);
      }
    });
  }

  onCitySelected(name: string) {
    const r = this.cityMap.get(name);
    if (r) this.form.patchValue({ cap: r.cap, provincia: r.provincia, stato: 'Italia' }, { emitEvent: false });
  }

  save() { if (this.form.valid) this.dialogRef.close({ ...this.data, ...this.form.value }); }
}

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-clienti',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatFormFieldModule, MatInputModule, MatSortModule],
  templateUrl: './clienti.html',
  styleUrl: './clienti.scss'
})
export class ClientiComponent implements OnInit, AfterViewInit {
  print() {
    const rows = this.dataSource.data;
    const body = rows.map(c=>`<tr><td>${c.ragioneSociale}</td><td>${c.email||'—'}</td><td>${c.telefono||'—'}</td><td>${this.indirizzo(c)||'—'}</td><td>${c.codiceFiscale||'—'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Clienti</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}</style></head><body><h1>Clienti</h1><table><thead><tr><th>Ragione Sociale</th><th>Email</th><th>Telefono</th><th>Indirizzo</th><th>Cod. Fiscale</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('','_blank'); if(w){w.document.write(html);w.document.close();w.print();}
  }
  clienti: Cliente[] = [];
  dataSource = new MatTableDataSource<Cliente>([]);
  displayedColumns = ['id', 'ragioneSociale', 'email', 'telefono', 'indirizzo', 'codiceFiscale', 'azioni'];

  @ViewChild(MatSort) sort!: MatSort;

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (item, col) => {
      switch (col) {
        case 'id': return item.id ?? 0;
        case 'indirizzo': return this.indirizzo(item);
        default: return (item as any)[col] ?? '';
      }
    };
    this.dataSource.filterPredicate = (item, filter) => {
      const s = filter.toLowerCase();
      return (item.ragioneSociale ?? '').toLowerCase().includes(s)
          || (item.email ?? '').toLowerCase().includes(s)
          || (item.telefono ?? '').toLowerCase().includes(s)
          || (item.codiceFiscale ?? '').toLowerCase().includes(s)
          || (item.pIva ?? '').toLowerCase().includes(s)
          || this.indirizzo(item).toLowerCase().includes(s);
    };
  }

  load() { this.ds.getClienti().subscribe(c => { this.clienti = c; this.dataSource.data = c; }); }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  indirizzo(c: Cliente): string {
    return [c.via, c.cap, c.citta, c.provincia, c.stato].filter(Boolean).join(', ');
  }

  open(c?: Cliente) {
    const ref = this.dialog.open(ClienteDialogComponent, { data: c ?? null, width: '780px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateCliente(result) : this.ds.createCliente(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  delete(c: Cliente) {
    if (!confirm(`Eliminare ${c.ragioneSociale}?`)) return;
    this.ds.deleteCliente(c.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

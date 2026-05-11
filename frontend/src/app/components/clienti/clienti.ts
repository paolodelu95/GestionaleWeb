import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { Cliente } from '../../models';
import { filterCities, cityInfo, cityByCap } from '../../models/cities';

// ── Dialog ────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-cliente-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatAutocompleteModule],
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
            <mat-autocomplete #auto="matAutocomplete">
              @for (c of filteredCities; track c) {
                <mat-option [value]="c">{{ c }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field style="max-width:100px"><mat-label>Provincia</mat-label>
            <input matInput formControlName="provincia"></mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field><mat-label>Stato</mat-label>
            <input matInput formControlName="stato"></mat-form-field>
          <mat-form-field><mat-label>Codice Fiscale</mat-label>
            <input matInput formControlName="codiceFiscale"></mat-form-field>
        </div>
        <mat-form-field style="width:100%"><mat-label>P. IVA</mat-label>
          <input matInput formControlName="pIva"></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`
})
export class ClienteDialogComponent implements OnInit {
  form: FormGroup;
  filteredCities: string[] = [];
  private updating = false;

  constructor(
    private fb: FormBuilder,
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
      codiceFiscale:  [data?.codiceFiscale ?? ''],
      pIva:           [data?.pIva ?? ''],
    });
  }

  ngOnInit() {
    this.filteredCities = filterCities('');

    // Autocomplete città
    this.form.get('citta')!.valueChanges.pipe(debounceTime(100), distinctUntilChanged())
      .subscribe(v => {
        if (this.updating) return;
        this.filteredCities = filterCities(v ?? '');
        const info = cityInfo(v);
        if (info) {
          this.updating = true;
          this.form.patchValue({ cap: info.cap, provincia: info.provincia, stato: 'Italia' }, { emitEvent: false });
          this.updating = false;
        }
      });

    // CAP → città
    this.form.get('cap')!.valueChanges.pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(cap => {
        if (this.updating || cap?.length !== 5) return;
        const city = cityByCap(cap);
        if (city) {
          this.updating = true;
          const info = cityInfo(city)!;
          this.form.patchValue({ citta: city, provincia: info.provincia, stato: 'Italia' }, { emitEvent: false });
          this.filteredCities = filterCities(city);
          this.updating = false;
        }
      });
  }

  save() { if (this.form.valid) this.dialogRef.close({ ...this.data, ...this.form.value }); }
}

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-clienti',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule],
  templateUrl: './clienti.html',
  styleUrl: './clienti.scss'
})
export class ClientiComponent implements OnInit {
  clienti: Cliente[] = [];
  displayedColumns = ['id','ragioneSociale','email','telefono','indirizzo','codiceFiscale','azioni'];

  constructor(private ds: DataService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit() { this.load(); }
  load() { this.ds.getClienti().subscribe(c => { this.clienti = c; }); }

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

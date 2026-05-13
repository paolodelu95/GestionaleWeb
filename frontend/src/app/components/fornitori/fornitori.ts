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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { Fornitore } from '../../models';
import { filterCities, cityInfo, cityByCap } from '../../models/cities';

@Component({
  selector: 'app-fornitore-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule,
            MatFormFieldModule, MatInputModule, MatButtonModule, MatAutocompleteModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifica fornitore' : 'Nuovo fornitore' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field style="width:100%"><mat-label>Ragione Sociale *</mat-label>
          <input matInput formControlName="ragioneSociale"></mat-form-field>
        <div class="form-row">
          <mat-form-field><mat-label>Email</mat-label><input matInput formControlName="email"></mat-form-field>
          <mat-form-field><mat-label>Telefono</mat-label><input matInput formControlName="telefono"></mat-form-field>
        </div>
        <mat-form-field style="width:100%"><mat-label>Via</mat-label><input matInput formControlName="via"></mat-form-field>
        <div class="form-row">
          <mat-form-field style="max-width:120px"><mat-label>CAP</mat-label>
            <input matInput formControlName="cap" maxlength="5"></mat-form-field>
          <mat-form-field>
            <mat-label>Città</mat-label>
            <input matInput formControlName="citta" [matAutocomplete]="auto">
            <mat-autocomplete #auto="matAutocomplete">
              @for (c of filteredCities; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field style="max-width:100px"><mat-label>Provincia</mat-label>
            <input matInput formControlName="provincia"></mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field><mat-label>Stato</mat-label><input matInput formControlName="stato"></mat-form-field>
          <mat-form-field><mat-label>P. IVA</mat-label><input matInput formControlName="pIva"></mat-form-field>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Salva</button>
    </mat-dialog-actions>`
})
export class FornitoreDialogComponent implements OnInit {
  form: FormGroup;
  filteredCities: string[] = [];
  private updating = false;

  constructor(private fb: FormBuilder,
              public dialogRef: MatDialogRef<FornitoreDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: Fornitore | null) {
    this.form = this.fb.group({
      ragioneSociale: [data?.ragioneSociale ?? '', Validators.required],
      email: [data?.email ?? ''], telefono: [data?.telefono ?? ''],
      via: [data?.via ?? ''], cap: [data?.cap ?? ''],
      citta: [data?.citta ?? ''], provincia: [data?.provincia ?? ''],
      stato: [data?.stato ?? 'Italia'], pIva: [data?.pIva ?? ''],
    });
  }

  ngOnInit() {
    this.filteredCities = filterCities('');
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

@Component({
  selector: 'app-fornitori',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule,
            MatDialogModule, MatSnackBarModule, MatFormFieldModule, MatInputModule, MatSortModule],
  templateUrl: './fornitori.html',
  styleUrl: './fornitori.scss'
})
export class FornitoriComponent implements OnInit, AfterViewInit {
  fornitori: Fornitore[] = [];
  dataSource = new MatTableDataSource<Fornitore>([]);
  displayedColumns = ['id', 'ragioneSociale', 'email', 'telefono', 'indirizzo', 'pIva', 'azioni'];

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
          || (item.pIva ?? '').toLowerCase().includes(s)
          || this.indirizzo(item).toLowerCase().includes(s);
    };
  }

  load() { this.ds.getFornitori().subscribe(f => { this.fornitori = f; this.dataSource.data = f; }); }

  applyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim();
  }

  indirizzo(f: Fornitore) {
    return [f.via, f.cap, f.citta, f.provincia, f.stato].filter(Boolean).join(', ');
  }

  open(f?: Fornitore) {
    const ref = this.dialog.open(FornitoreDialogComponent, { data: f ?? null, width: '780px' });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      const op = result.id ? this.ds.updateFornitore(result) : this.ds.createFornitore(result);
      op.subscribe({ next: () => { this.load(); this.snack.open('Salvato', '', { duration: 2000 }); },
                     error: e => this.snack.open(e.message, '', { duration: 3000 }) });
    });
  }

  delete(f: Fornitore) {
    if (!confirm(`Eliminare ${f.ragioneSociale}?`)) return;
    this.ds.deleteFornitore(f.id!).subscribe(() => { this.load(); this.snack.open('Eliminato', '', { duration: 2000 }); });
  }
}

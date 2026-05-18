import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function pIvaValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').replace(/\s/g, '');
  if (!v) return null;
  return /^\d{11}$/.test(v) ? null : { pIva: true };
}

export function codiceFiscaleValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').replace(/\s/g, '').toUpperCase();
  if (!v) return null;
  if (/^\d{11}$/.test(v)) return null;
  if (/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(v)) return null;
  return { codiceFiscale: true };
}

export function telefonoValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').trim();
  if (!v) return null;
  return /^[0-9\s\+\-\(\)\/\.]{4,20}$/.test(v) ? null : { telefono: true };
}

export function capValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').trim();
  if (!v) return null;
  return /^\d{5}$/.test(v) ? null : { cap: true };
}

export function ibanValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').replace(/\s/g, '').toUpperCase();
  if (!v) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(v)) return { iban: true };
  if (v.startsWith('IT') && v.length !== 27) return { iban: true };
  return null;
}

export function quantitaPositivaValidator(control: AbstractControl): ValidationErrors | null {
  const v = Number(control.value);
  if (control.value === null || control.value === '') return null;
  return v > 0 ? null : { quantitaPositiva: true };
}

export function prezzoNonNegativoValidator(control: AbstractControl): ValidationErrors | null {
  const v = Number(control.value);
  if (control.value === null || control.value === '') return null;
  return v >= 0 ? null : { prezzoNonNegativo: true };
}

export function scontoValidator(control: AbstractControl): ValidationErrors | null {
  const v = Number(control.value);
  if (control.value === null || control.value === '') return null;
  if (v < 0) return { scontoNegativo: true };
  if (v > 100) return { scontoMassimo: true };
  return null;
}

export function percentualeValidator(control: AbstractControl): ValidationErrors | null {
  const v = Number(control.value);
  if (control.value === null || control.value === '') return null;
  if (v < 0 || v > 100) return { percentuale: true };
  return null;
}

export function giornoMeseValidator(control: AbstractControl): ValidationErrors | null {
  const v = Number(control.value);
  if (control.value === null || control.value === '') return null;
  return v >= 1 && v <= 28 ? null : { giornoMese: true };
}

export function minValueValidator(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = Number(control.value);
    if (control.value === null || control.value === '') return null;
    return v >= min ? null : { minValue: { min, actual: v } };
  };
}

export function maxValueValidator(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = Number(control.value);
    if (control.value === null || control.value === '') return null;
    return v <= max ? null : { maxValue: { max, actual: v } };
  };
}

/** Clamp a number value in-place and return the clamped value */
export function clampValue(value: number | null | undefined, min: number, max = Infinity): number {
  if (value === null || value === undefined || isNaN(Number(value))) return min;
  return Math.min(Math.max(Number(value), min), max);
}

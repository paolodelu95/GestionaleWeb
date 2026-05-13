import { AbstractControl, ValidationErrors } from '@angular/forms';

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

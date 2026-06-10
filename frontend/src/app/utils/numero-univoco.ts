import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Validatore per il campo "numero documento": segnala l'errore `numeroDuplicato`
 * se il numero digitato è già usato da un altro documento dello stesso tipo.
 *
 * Riceve una funzione che restituisce l'insieme (lowercase) dei numeri già esistenti
 * — esclusi quello del documento in modifica — così l'elenco resta aggiornato.
 *
 * Uso nel FormGroup del dialog:
 *   numero: [valore, [Validators.required, numeroUnivocoValidator(() => this.numeriEsistenti)]]
 * e nel template:
 *   @if (form.get('numero')?.hasError('numeroDuplicato')) { <mat-error>Numero già esistente</mat-error> }
 */
export function numeroUnivocoValidator(getEsistenti: () => Set<string>) {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().trim().toLowerCase();
    if (!v) return null;
    return getEsistenti().has(v) ? { numeroDuplicato: true } : null;
  };
}

/** Costruisce il Set (lowercase) dei numeri esistenti escludendo il documento corrente. */
export function setNumeriEsistenti(numeri: (string | null | undefined)[] | undefined): Set<string> {
  return new Set((numeri ?? [])
    .map(n => (n ?? '').toString().trim().toLowerCase())
    .filter(Boolean));
}

import { QueryList, ElementRef } from '@angular/core';

/**
 * Dopo aver aggiunto una riga a un documento, porta in vista l'ultima riga della
 * tabella righe (il suo campo "codice") e vi mette il focus, pronto per digitare.
 * Se la nuova riga era sotto la parte visibile, il contenitore scorre da solo.
 *
 * Usa il doppio requestAnimationFrame per attendere che Angular abbia renderizzato
 * la nuova riga e aggiornato la QueryList #rigaCodice.
 */
export function scrollFocusLastRiga(codiceInputs?: QueryList<ElementRef<HTMLInputElement>>): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const last = codiceInputs?.last?.nativeElement;
    if (!last) return;
    last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // preventScroll: lo scorrimento "smooth" lo fa già scrollIntoView, evitiamo il salto del focus
    last.focus({ preventScroll: true });
  }));
}

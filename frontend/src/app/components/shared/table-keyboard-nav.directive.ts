import { Directive, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Navigazione da tastiera per le tabelle Material delle liste (uso desktop).
 * Si applica al <table mat-table> con l'attributo `appKbdRows`.
 *
 *  - ↓ / ↑        sposta il focus alla riga successiva / precedente
 *  - Home / End   prima / ultima riga
 *  - Invio        apre la riga attiva → riusa il (dblclick) già presente sulla
 *                 riga (nessun cablaggio per-componente necessario)
 *
 * Le righe usano tabindex=-1 (focus solo via mouse/programmatico, niente Tab su
 * ogni riga); la tabella è tabindex=0 così con Tab ci si arriva una volta sola.
 * Un MutationObserver riapplica i tabindex quando le righe cambiano
 * (filtri / ordinamento / paginazione).
 */
@Directive({
  selector: '[appKbdRows]',
  standalone: true,
})
export class TableKeyboardNavDirective implements OnInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: MutationObserver;

  ngOnInit(): void {
    const el = this.host.nativeElement;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    this.refresh();
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(el, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private rows(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll('tr.mat-mdc-row')) as HTMLElement[];
  }

  private refresh(): void {
    for (const r of this.rows()) {
      if (r.getAttribute('tabindex') !== '-1') r.setAttribute('tabindex', '-1');
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    // Non interferire con la digitazione dentro campi/filtri della tabella.
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(e.key)) return;

    const rows = this.rows();
    if (!rows.length) return;

    const activeRow = (document.activeElement as HTMLElement)?.closest('tr.mat-mdc-row') as HTMLElement | null;
    let idx = activeRow ? rows.indexOf(activeRow) : -1;

    switch (e.key) {
      case 'ArrowDown': idx = idx < 0 ? 0 : Math.min(idx + 1, rows.length - 1); break;
      case 'ArrowUp':   idx = idx <= 0 ? 0 : idx - 1; break;
      case 'Home':      idx = 0; break;
      case 'End':       idx = rows.length - 1; break;
      case 'Enter':
        if (idx >= 0) {
          e.preventDefault();
          rows[idx].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        }
        return;
    }
    e.preventDefault();
    rows[idx]?.focus();
  }
}

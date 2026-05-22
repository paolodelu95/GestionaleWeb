import { MatPaginatorIntl } from '@angular/material/paginator';

/** MatPaginatorIntl localizzato in italiano. */
export function italianPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Elementi per pagina';
  intl.nextPageLabel = 'Pagina successiva';
  intl.previousPageLabel = 'Pagina precedente';
  intl.firstPageLabel = 'Prima pagina';
  intl.lastPageLabel = 'Ultima pagina';
  intl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) return `0 di ${length}`;
    const start = page * pageSize;
    const end = Math.min(start + pageSize, length);
    return `${start + 1}–${end} di ${length}`;
  };
  return intl;
}

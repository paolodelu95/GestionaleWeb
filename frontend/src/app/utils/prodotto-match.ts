import { Prodotto } from '../models';

export interface ProdottoMatch {
  /** match esatto su codice / barcode / codice fornitore (case-insensitive), se presente */
  exact: Prodotto | null;
  /** match parziali (la query è contenuta in codice/barcode/codice fornitore/nome) */
  matches: Prodotto[];
}

function norm(s: string | number | undefined | null): string {
  return (s ?? '').toString().trim().toLowerCase();
}

/**
 * Risolve una query digitata (un codice intero o parziale) in prodotti, per
 * l'inserimento rapido da tastiera nelle righe documento.
 *  - `exact`: prima corrispondenza esatta su codice / barcode / codice fornitore
 *  - `matches`: tutte le corrispondenze parziali (contiene), utili a filtrare il selettore
 */
export function findProdottoByCodice(prodotti: Prodotto[], query: string): ProdottoMatch {
  const q = norm(query);
  if (!q) return { exact: null, matches: [] };

  const exact = prodotti.find(p =>
    norm(p.codice) === q || norm(p.barcode) === q || norm(p.codiceFornitore) === q
  ) ?? null;

  const matches = prodotti.filter(p =>
    norm(p.codice).includes(q) ||
    norm(p.barcode).includes(q) ||
    norm(p.codiceFornitore).includes(q) ||
    norm(p.nome).includes(q)
  );

  return { exact, matches };
}

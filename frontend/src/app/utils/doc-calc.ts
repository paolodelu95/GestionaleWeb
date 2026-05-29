import { RigaDocumento } from '../models';

/**
 * Totale di una riga documento: qta × prezzo × (1 − sconto%) × (1 + IVA%).
 * Se `showNetto` è true l'IVA viene esclusa (si mostra l'imponibile).
 *
 * Logica condivisa da fatture, DDT, ordini, preventivi, note di credito e
 * acquisti: prima era duplicata identica in ognuno di questi componenti.
 */
export function docRigaTotale(riga: RigaDocumento, showNetto: boolean): number {
  const netto = riga.quantita * riga.prezzo * (1 - (riga.sconto ?? 0) / 100);
  return showNetto ? netto : netto * (1 + riga.iva / 100);
}

/**
 * Converte il valore digitato nel campo prezzo in prezzo unitario NETTO.
 * In modalità "lordo" (showNetto = false) scorpora l'IVA. Mai negativo.
 */
export function prezzoNettoDaInput(value: number, iva: number, showNetto: boolean): number {
  return Math.max(0, showNetto ? value : +(value / (1 + iva / 100)).toFixed(6));
}

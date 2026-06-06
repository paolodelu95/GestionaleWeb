/**
 * Helper sulle unità di misura.
 *
 * Alcune unità sono "frazionabili" (peso, volume, lunghezza, superficie, tempo):
 * ha senso inserire decimali (es. 1,5 kg). Altre — i pezzi e simili — sono
 * discrete: lo step deve essere 1, niente 0,01.
 */
const FRAZIONABILI = new Set([
  'kg', 'g', 'hg', 'q', 't',                 // peso
  'l', 'lt', 'ml', 'cl', 'dl',               // volume (liquidi)
  'm', 'mt', 'cm', 'mm', 'km',               // lunghezza
  'm²', 'mq', 'm2', 'm³', 'mc', 'm3',        // superficie / volume
  'h', 'ore', 'min',                         // tempo
]);

/** True se l'unità ammette valori decimali (kg, lt, mt, h, …). 'pz'/vuoto/sconosciuto → false. */
export function unitaFrazionabile(simbolo?: string | null): boolean {
  if (!simbolo) return false;
  return FRAZIONABILI.has(simbolo.trim().toLowerCase());
}

/** Step da usare negli input numerici: 0.01 per le unità frazionabili, 1 per i pezzi. */
export function stepPerUnita(simbolo?: string | null): number {
  return unitaFrazionabile(simbolo) ? 0.01 : 1;
}

/** Arrotonda una quantità in modo coerente con l'unità (intero per i pezzi). */
export function arrotondaPerUnita(valore: number, simbolo?: string | null): number {
  if (unitaFrazionabile(simbolo)) return Math.round(valore * 100) / 100;
  return Math.round(valore);
}

// Tracciamento "lette/non lette" delle fatture passive ricevute dallo SDI.
// Il backend non ha un flag di lettura: usiamo un set per-browser in localStorage.
// Semantica: una fattura passiva è "letta" quando l'utente visita la pagina SDI
// passive (che la marca come vista). Le nuove fatture arrivate dopo l'ultima
// visita risultano "non lette" e vengono contate nella pillola della dashboard.

const KEY = 'sdi-passive-seen';

export function getSdiSeenIds(): Set<number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(Number)) : new Set();
  } catch {
    return new Set();
  }
}

/** Marca come "viste" le fatture passive indicate (sostituisce il set salvato). */
export function markSdiSeen(ids: number[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(ids.map(Number))]));
  } catch {
    /* localStorage non disponibile: ignora */
  }
}

/** Conta quante fra le ricevute fornite non risultano ancora viste. */
export function countSdiNonLette(ricevuteIds: number[]): number {
  const seen = getSdiSeenIds();
  return ricevuteIds.filter(id => !seen.has(Number(id))).length;
}

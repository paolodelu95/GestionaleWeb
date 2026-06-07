// Legge un valore passato via Router state (router.navigate(..., { state })) e lo
// rimuove subito dalla history, così un refresh o una nuova navigazione non lo
// riapplica. Usato dalla barra comandi per pre-compilare bozze di documenti/anagrafiche.
export function consumePrefill<T = any>(key: string): T | null {
  const st = (typeof history !== 'undefined' ? history.state : null) as any;
  if (st && st[key] != null) {
    const val = st[key] as T;
    try { history.replaceState({ ...st, [key]: undefined }, ''); } catch {}
    return val;
  }
  return null;
}

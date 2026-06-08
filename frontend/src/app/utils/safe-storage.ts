// Accesso a localStorage tollerante ai guasti. In alcuni contesti (Safari in
// modalità privata, cookie/storage di terze parti bloccati, iframe sandboxed)
// localStorage lancia SecurityError: un accesso non protetto durante il
// bootstrap farebbe crashare l'app con una schermata bianca. Qui incapsuliamo
// ogni accesso in try/catch con un fallback in memoria.

const mem = new Map<string, string>();

export function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); }
  catch { return mem.has(key) ? mem.get(key)! : null; }
}

export function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); }
  catch { mem.set(key, value); }
}

export function lsRemove(key: string): void {
  try { localStorage.removeItem(key); }
  catch { mem.delete(key); }
}

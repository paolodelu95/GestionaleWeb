// Matching fuzzy testuale tra le righe di un listino fornitore e i prodotti a
// magazzino. Nessuna dipendenza esterna.
//
// Il codice fornitore e una stringa arbitraria del fornitore, NON correlata alla
// codifica interna: quindi il match si basa sul TESTO descrittivo della riga di
// listino confrontato con il campo `nome` del prodotto (dove di fatto stanno
// misure e caratteristiche, es. "Carta A4 80g", "Monitor 24\" Full HD").
//
// Segnali, in ordine di forza:
//   1) misure numeriche con unita (a4, 80g, 24in, 140cm) — le piu discriminanti;
//   2) sovrapposizione dei token testuali (Dice + overlap, con tolleranza refusi);
//   3) categoria (boost debole).

const STOPWORDS = new Set([
  'di', 'da', 'de', 'del', 'della', 'dei', 'degli', 'delle', 'con', 'per', 'il',
  'lo', 'la', 'le', 'gli', 'un', 'uno', 'una', 'e', 'ed', 'a', 'al', 'allo',
  'alla', 'in', 'su', 'o', 'od', 'the', 'of', 'and', 'cf', 'conf', 'confezione',
  'art', 'articolo', 'cod', 'codice', 'pz', 'pezzi', 'pezzo',
]);

// Forme di unita di misura -> canonica.
const UNIT_CANON = {
  pollici: 'in', pollice: 'in', inch: 'in', in: 'in',
  gr: 'g', grammi: 'g', grammo: 'g', g: 'g',
  kg: 'kg', kilogrammi: 'kg', chilogrammi: 'kg', kilogrammo: 'kg',
  mg: 'mg',
  cm: 'cm', centimetri: 'cm', centimetro: 'cm',
  mm: 'mm', millimetri: 'mm', millimetro: 'mm',
  mt: 'm', metri: 'm', metro: 'm',
  ml: 'ml', millilitri: 'ml',
  cl: 'cl',
  lt: 'l', litri: 'l', litro: 'l',
  w: 'w', watt: 'w',
  v: 'v', volt: 'v',
  gb: 'gb', tb: 'tb', mb: 'mb',
};

// Soglie di confidenza (esposte per riuso nella route).
const SOGLIE = { min: 0.40, media: 0.50, alta: 0.68 };

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Normalizza una stringa libera in token: separa misure numeriche e parole.
// Ritorna { words: string[], meas: Set<string> }.
function tokenize(raw) {
  let s = stripAccents(String(raw || '').toLowerCase());
  // virgolette/apici = pollici (24" -> 24 pollici)
  s = s.replace(/(\d)\s*(?:''|"|”|″)/g, '$1 pollici ');
  // decimali: 1,5 -> 1.5 (cosi resta un solo numero)
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  // numero attaccato a lettere: 80gr -> 80 gr (NON tocca a4: lettera->numero resta)
  s = s.replace(/(\d)([a-z])/g, '$1 $2');
  // tutto cio che non e alfanumerico/punto/spazio -> spazio
  s = s.replace(/[^a-z0-9. ]+/g, ' ');

  const raws = s.split(/\s+/).filter(Boolean);
  const words = [];
  const meas = new Set();  // misure complete: 80g, 24in, 140cm, a4 (segnale forte)
  const nums = new Set();  // soli numeri presenti (anche dentro le misure): segnale medio
  const isNum = (t) => /^\d+(?:\.\d+)?$/.test(t);

  for (let i = 0; i < raws.length; i++) {
    const t = raws[i];
    if (t === '.' || t === '') continue;
    // numero seguito da unita -> misura canonica (80 g -> 80g, 24 pollici -> 24in)
    if (isNum(t) && i + 1 < raws.length && UNIT_CANON[raws[i + 1]]) {
      const num = t.replace(/\.0+$/, '');
      meas.add(num + UNIT_CANON[raws[i + 1]]);
      nums.add(num);
      i++; // consuma l'unita
      continue;
    }
    // formato carta a4/a3/a5...
    if (/^a\d$/.test(t)) { meas.add(t); continue; }
    if (STOPWORDS.has(t)) continue;
    // scarta lettere singole / rumore (ma tiene i numeri "nudi", es. 500)
    if (t.length < 2 && !isNum(t)) continue;
    if (isNum(t)) nums.add(t.replace(/\.0+$/, ''));
    words.push(t);
  }
  return { words, meas, nums };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// Due token "uguali" se identici o, per token >=4 char, a distanza 1 (plurali/refusi).
function tokenMatch(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && Math.abs(a.length - b.length) <= 1) {
    return levenshtein(a, b) <= 1;
  }
  return false;
}

// Numero di token di A che trovano un partner (anche fuzzy) in B, greedy.
function matchedCount(A, B) {
  if (!A.length || !B.length) return 0;
  const used = new Array(B.length).fill(false);
  let m = 0;
  for (const a of A) {
    for (let j = 0; j < B.length; j++) {
      if (!used[j] && tokenMatch(a, B[j])) { used[j] = true; m++; break; }
    }
  }
  return m;
}

// Dice su set di stringhe (match esatto), per le misure.
function diceSet(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

// Token testuali condivisi (per il campo "perche").
function sharedWords(A, B) {
  const out = [];
  const used = new Array(B.length).fill(false);
  for (const a of A) {
    for (let j = 0; j < B.length; j++) {
      if (!used[j] && tokenMatch(a, B[j])) { used[j] = true; out.push(a); break; }
    }
  }
  return out;
}

function fascia(score) {
  if (score >= SOGLIE.alta) return 'alta';
  if (score >= SOGLIE.media) return 'media';
  return 'bassa';
}

// Pre-tokenizza un prodotto (nome + descrizione come testo, categoria a parte).
function prepProdotto(p) {
  const txt = tokenize(`${p.nome || ''} ${p.descrizione || ''}`);
  const cat = tokenize(p.categoria || '');
  return {
    id: p.id,
    nome: p.nome || '',
    codice: p.codice || '',
    categoria: p.categoria || '',
    prezzoAcquisto: p.prezzoAcquisto != null ? p.prezzoAcquisto : (p.prezzo_acquisto != null ? p.prezzo_acquisto : null),
    quantita: p.quantita != null ? p.quantita : null,
    words: txt.words,
    meas: txt.meas,
    nums: txt.nums,
    catWords: cat.words,
  };
}

// Punteggio 0..1 tra una riga di listino (gia tokenizzata) e un prodotto preparato.
function score(rigaTok, prod) {
  const La = rigaTok.words, Lp = prod.words;
  const m = matchedCount(La, Lp);
  const dice = (La.length + Lp.length) ? (2 * m) / (La.length + Lp.length) : 0;
  const overlap = Math.min(La.length, Lp.length) ? m / Math.min(La.length, Lp.length) : 0;
  const wordScore = 0.5 * dice + 0.5 * overlap;

  const hasMeas = rigaTok.meas.size > 0 || prod.meas.size > 0 || rigaTok.nums.size > 0 || prod.nums.size > 0;
  // misura completa (num+unita) = forte; solo numero coincidente = medio (fino a 0.6)
  const strongDice = diceSet(rigaTok.meas, prod.meas);
  const numDice = diceSet(rigaTok.nums, prod.nums);
  const measScore = hasMeas ? Math.max(strongDice, 0.6 * numDice) : 0;

  // categoria: una parola della categoria compare nel testo del listino?
  const catScore = prod.catWords.some((c) => La.some((a) => tokenMatch(a, c))) ? 1 : 0;

  const wWord = hasMeas ? 0.50 : 0.85;
  const wMeas = hasMeas ? 0.35 : 0.0;
  const wCat = 0.15;
  return wWord * wordScore + wMeas * measScore + wCat * catScore;
}

function perche(rigaTok, prod) {
  const w = sharedWords(rigaTok.words, prod.words);
  const ms = [...rigaTok.meas].filter((x) => prod.meas.has(x));
  const parts = [...w, ...ms];
  return parts.length ? parts.slice(0, 6).join(', ') : '—';
}

/**
 * Calcola i candidati per ogni riga di listino non abbinata.
 * @param {Array<{codice:string, descrizione?:string, marca?:string, prezzo?:any}>} righe
 * @param {Array} prodotti  righe DB prodotti (id, nome, categoria, codice, descrizione, prezzo, prezzo_acquisto, quantita)
 * @param {{limit?:number, minScore?:number}} [opts]
 * @returns {Array<{codice,descrizione,prezzo,candidati:Array}>}
 */
function scoreCandidati(righe, prodotti, opts = {}) {
  const limit = opts.limit || 5;
  const minScore = opts.minScore != null ? opts.minScore : SOGLIE.min;
  const prepped = prodotti.map(prepProdotto);

  return (righe || []).map((r) => {
    const testo = `${r.descrizione || ''} ${r.marca || ''}`.trim();
    const out = { codice: String(r.codice || ''), descrizione: String(r.descrizione || ''), prezzo: r.prezzo ?? '', candidati: [] };
    if (!testo) return out;
    const rigaTok = tokenize(testo);
    if (!rigaTok.words.length && !rigaTok.meas.size) return out;

    const scored = [];
    for (const p of prepped) {
      const s = score(rigaTok, p);
      if (s >= minScore) {
        scored.push({
          prodottoId: p.id,
          nome: p.nome,
          codice: p.codice,
          categoria: p.categoria,
          prezzoAcquistoAttuale: p.prezzoAcquisto,
          quantita: p.quantita,
          score: +s.toFixed(3),
          fascia: fascia(s),
          perche: perche(rigaTok, p),
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    out.candidati = scored.slice(0, limit);
    return out;
  });
}

module.exports = { scoreCandidati, tokenize, score, prepProdotto, SOGLIE };

// Barra comandi "intelligente" — parser deterministico (nessuna AI esterna, zero
// costi). Interpreta una frase in italiano e restituisce o una RISPOSTA (lettura
// dai dati del tenant) o una BOZZA di documento/anagrafica da confermare lato
// client. Se non riconosce nulla → { tipo:'nessuno' } e la palette usa la ricerca
// normale. Non scrive MAI nulla: le bozze vengono salvate solo dopo conferma utente.
const express = require('express');
const router = express.Router();
const db = require('../database');

const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, sett: 9, ott: 10, nov: 11, dic: 12,
};
const NOMI_MESE = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const norm = s => (s || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
const eur = n => '€ ' + (Math.round((n || 0) * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad2 = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();

// Estrae un periodo da una frase. Gestisce mese+anno, anno intero e periodi
// relativi (oggi, ieri, questa settimana, mese/anno scorso). Default: anno corrente.
function parsePeriodo(q) {
  const now = new Date();
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  if (/\boggi\b/.test(q)) { const d = ymd(now); return { da: d, a: d, label: 'oggi' }; }
  if (/\bieri\b/.test(q)) { const y = new Date(now); y.setDate(now.getDate() - 1); const d = ymd(y); return { da: d, a: d, label: 'ieri' }; }
  if (/\b(questa settimana|settimana)\b/.test(q)) {
    const dow = (now.getDay() + 6) % 7; // 0 = lunedì
    const mon = new Date(now); mon.setDate(now.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { da: ymd(mon), a: ymd(sun), label: 'questa settimana' };
  }

  let anno = now.getFullYear();
  const ya = q.match(/\b(20\d{2})\b/);
  if (ya) anno = parseInt(ya[1]);
  else if (/\b(anno scorso|scorso anno|l['’]anno scorso)\b/.test(q)) anno -= 1;

  let mese = null;
  for (const [k, v] of Object.entries(MESI)) {
    if (new RegExp(`\\b${k}\\b`).test(q)) { mese = v; break; }
  }
  if (/\b(mese scorso|scorso mese)\b/.test(q) && !mese) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    anno = d.getFullYear(); mese = d.getMonth() + 1;
  }
  if (/\b(questo mese|mese corrente)\b/.test(q) && !mese) mese = now.getMonth() + 1;

  if (mese) {
    return { da: `${anno}-${pad2(mese)}-01`, a: `${anno}-${pad2(mese)}-${pad2(lastDay(anno, mese))}`, label: `${NOMI_MESE[mese]} ${anno}` };
  }
  return { da: `${anno}-01-01`, a: `${anno}-12-31`, label: `${anno}` };
}

// ── Letture ──────────────────────────────────────────────────────────────────
function fatturato(q) {
  const { da, a, label } = parsePeriodo(q);
  const r = db.prepare(`
    SELECT COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) AS imponibile,
           COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) AS totale
    FROM fatture f JOIN fatture_righe fr ON fr.fattura_id=f.id
    WHERE f.stato!='ANNULLATA' AND f.data_emissione BETWEEN ? AND ?
  `).get(da, a);
  return {
    tipo: 'risposta', icona: 'payments',
    titolo: `Fatturato ${label}: ${eur(r.totale)}`,
    dettaglio: `Imponibile ${eur(r.imponibile)} · clicca per i report`,
    route: '/report',
  };
}

function insoluti(q) {
  // Eventuale filtro per cliente: "...di Rossi" / "...da Rossi".
  let clienteId = null, clienteNome = '';
  const m = q.match(/\b(?:di|da|del|dello|della|cliente)\s+([a-zàèéìòù][\w àèéìòù'’.&-]*?)\s*$/i);
  if (m) {
    const c = db.prepare('SELECT id, ragione_sociale FROM clienti WHERE LOWER(ragione_sociale) LIKE ? ORDER BY length(ragione_sociale) LIMIT 1').get('%' + norm(m[1]) + '%');
    if (c) { clienteId = c.id; clienteNome = c.ragione_sociale; }
  }
  const where = clienteId ? 'AND f.cliente_id=?' : '';
  const params = clienteId ? [clienteId] : [];
  const rows = db.prepare(`
    SELECT COALESCE((SELECT SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100))
                     FROM fatture_righe fr WHERE fr.fattura_id=f.id),0) AS totale
    FROM fatture f
    WHERE f.stato NOT IN ('PAGATA','ANNULLATA','STORNATA') ${where}
  `).all(...params);
  const tot = rows.reduce((s, r) => s + (r.totale || 0), 0);
  return {
    tipo: 'risposta', icona: 'request_quote',
    titolo: clienteNome ? `Insoluti di ${clienteNome}: ${eur(tot)}` : `Insoluti clienti: ${eur(tot)}`,
    dettaglio: `${rows.length} fattur${rows.length === 1 ? 'a' : 'e'} da incassare · apri scadenzario`,
    route: '/scadenzario',
  };
}

function sottoScorta() {
  const rows = db.prepare("SELECT nome, quantita, unita_misura FROM prodotti WHERE soglia_minima>0 AND quantita<soglia_minima ORDER BY quantita ASC, nome").all();
  const primi = rows.slice(0, 3).map(r => r.nome).join(', ');
  return {
    tipo: 'risposta', icona: 'inventory_2',
    titolo: `Prodotti sotto scorta: ${rows.length}`,
    dettaglio: rows.length ? `${primi}${rows.length > 3 ? '…' : ''} · apri magazzino` : 'Tutto in regola',
    route: '/magazzino',
  };
}

function giacenza(nome) {
  const p = db.prepare('SELECT nome, quantita, unita_misura FROM prodotti WHERE LOWER(nome) LIKE ? ORDER BY length(nome) LIMIT 1').get('%' + norm(nome) + '%');
  if (!p) return { tipo: 'nessuno' };
  return {
    tipo: 'risposta', icona: 'inventory',
    titolo: `${p.nome}: ${p.quantita} ${p.unita_misura || 'pz'} a magazzino`,
    route: '/magazzino',
  };
}

function debitiFornitori() {
  const rows = db.prepare(`
    SELECT COALESCE((SELECT SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100))
                     FROM acquisti_righe ar WHERE ar.acquisto_id=a.id),0) AS totale
    FROM acquisti a
    WHERE a.stato NOT IN ('PAGATO','PAGATA','ANNULLATO','ANNULLATA')
  `).all();
  const tot = rows.reduce((s, r) => s + (r.totale || 0), 0);
  return {
    tipo: 'risposta', icona: 'payments',
    titolo: `Da pagare ai fornitori: ${eur(tot)}`,
    dettaglio: `${rows.length} document${rows.length === 1 ? 'o' : 'i'} da saldare · apri scadenzario`,
    route: '/scadenzario',
  };
}

function scaduti() {
  const r = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(t.totale),0) AS tot FROM (
      SELECT date(f.data_emissione,'+'||COALESCE(tp.giorni_scadenza,30)||' days') AS ds,
             COALESCE((SELECT SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100))
                       FROM fatture_righe fr WHERE fr.fattura_id=f.id),0) AS totale
      FROM fatture f LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id=tp.id
      WHERE f.stato NOT IN ('PAGATA','ANNULLATA','STORNATA')
    ) t WHERE t.ds < date('now')
  `).get();
  return {
    tipo: 'risposta', icona: 'event_busy',
    titolo: `Fatture scadute: ${r.n} (${eur(r.tot)})`,
    dettaglio: r.n ? 'già oltre la scadenza · apri scadenzario' : 'nessuna scaduta, bene così',
    route: '/scadenzario',
  };
}

function conteggio(q) {
  let tabella, label, route, icona;
  if (/\bfornitor/.test(q)) { tabella = 'fornitori'; label = 'fornitori'; route = '/fornitori'; icona = 'local_shipping'; }
  else if (/\bclient/.test(q)) { tabella = 'clienti'; label = 'clienti'; route = '/clienti'; icona = 'group'; }
  else if (/\b(prodott|articol)/.test(q)) { tabella = 'prodotti'; label = 'prodotti'; route = '/prodotti'; icona = 'inventory_2'; }
  else if (/\b(fattur)/.test(q)) { tabella = 'fatture'; label = 'fatture'; route = '/fatture'; icona = 'receipt_long'; }
  else if (/\b(preventiv)/.test(q)) { tabella = 'preventivi'; label = 'preventivi'; route = '/preventivi'; icona = 'description'; }
  else return { tipo: 'nessuno' };
  const r = db.prepare(`SELECT COUNT(*) AS n FROM ${tabella}`).get();
  return { tipo: 'risposta', icona, titolo: `Hai ${r.n} ${label}`, dettaglio: `apri ${label}`, route };
}

// ── Bozze ────────────────────────────────────────────────────────────────────
function matchCliente(nome) {
  if (!nome) return null;
  return db.prepare('SELECT id, ragione_sociale FROM clienti WHERE LOWER(ragione_sociale) LIKE ? ORDER BY length(ragione_sociale) LIMIT 1').get('%' + norm(nome) + '%') || null;
}

function matchProdotto(nome) {
  const n = norm(nome);
  if (!n) return null;
  // Priorità: codice esatto → nome esatto → nome che contiene il testo (più corto).
  // Il codice esatto vince sempre, così "c52" prende il prodotto con codice c52
  // e non un nome qualsiasi che contiene la lettera.
  return db.prepare(`SELECT id, nome, descrizione, prezzo, iva, unita_misura, codice
                     FROM prodotti
                     WHERE LOWER(codice)=? OR LOWER(nome)=? OR LOWER(nome) LIKE ?
                     ORDER BY (LOWER(codice)=?) DESC, (LOWER(nome)=?) DESC, length(nome) ASC
                     LIMIT 1`).get(n, n, '%' + n + '%', n, n) || null;
}

function rigaProdotto(p, qta) {
  return {
    prodottoId: p.id, codiceProdotto: p.codice || '',
    descrizione: p.descrizione || p.nome, quantita: qta,
    prezzo: p.prezzo || 0, iva: p.iva ?? 22, unitaMisura: p.unita_misura || 'pz',
    sconto: 0, tipo: 'PRODOTTO',
  };
}

// Estrae le righe "<quantità> <prodotto>" da un testo (separatori: virgola / "e").
// La fine del nome è una virgola, " e ", o uno SPAZIO seguito da una nuova
// quantità: così i codici con numeri interni (es. "c52", "a12") restano interi.
function parseRighe(testo) {
  const righe = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(?:x\s*)?([a-zàèéìòùç][a-zàèéìòùç0-9 '’\-]*?)(?=\s*[,;]|\s+e\s|\s+\d|\s*$)/gi;
  let m;
  while ((m = re.exec(testo)) !== null) {
    const qta = parseFloat(m[1].replace(',', '.')) || 1;
    const nomeRaw = m[2].trim();
    if (!nomeRaw) continue;
    const p = matchProdotto(nomeRaw);
    righe.push(p ? rigaProdotto(p, qta)
                 : { prodottoId: null, descrizione: nomeRaw, quantita: qta, prezzo: 0, iva: 22, unitaMisura: 'pz', sconto: 0, tipo: 'PRODOTTO' });
  }
  return righe;
}

function bozzaDocumento(target, qIn) {
  // Nome documento per il titolo.
  const nomeDoc = target === 'fattura' ? 'fattura' : target === 'preventivo' ? 'preventivo' : 'DDT';
  // "una/uno/un sedia" → "1 sedia" così la quantità implicita viene letta.
  const q = qIn.replace(/\b(una|uno|un)\b/gi, '1');

  // Cliente: dopo "a/ad/al/per/cliente …". Il nome si ferma davanti al primo token
  // che contiene una cifra (una quantità "10" o un codice prodotto "c52"), così il
  // codice non finisce dentro la ragione sociale.
  let clienteId = null, clienteNome = '';
  const mc = q.match(/\b(?:a|ad|al|alla|allo|ai|agli|per|cliente)\s+([a-zàèéìòù][\w àèéìòù'’.&-]*?)(?=\s+\S*\d|,|$)/i);
  if (mc) {
    const nomeCli = mc[1].replace(/^(?:cliente|il|lo|la|i|gli|le)\s+/i, '').trim();
    const c = matchCliente(nomeCli);
    if (c) { clienteId = c.id; clienteNome = c.ragione_sociale; }
    else if (nomeCli) clienteNome = nomeCli;
  }

  // Righe: dal testo senza la parte cliente e senza le parole "di servizio".
  let resto = q;
  if (mc) resto = q.replace(mc[0], ' ');
  resto = resto.replace(/\b(fattura|fatturare|preventivo|preventivare|ddt|bolla|trasporto|offerta)\b/gi, ' ')
               .replace(/\b(crea|creare|nuov[oa]|fai|fammi|genera|emetti|registra)\b/gi, ' ');
  let righe = parseRighe(resto);
  // Fallback: nessuna quantità esplicita ma resta un codice/nome isolato → quantità 1.
  if (!righe.length) {
    const tok = resto.replace(/[^a-zàèéìòùç0-9 '’\-]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (tok.length >= 2 && !/^(a|ad|al|per|il|lo|la|i|gli|le)$/.test(tok)) {
      const p = matchProdotto(tok);
      if (p) righe = [rigaProdotto(p, 1)];
    }
  }

  const trovato = clienteId != null;
  let dettaglio;
  if (righe.length) dettaglio = `${righe.length} rig${righe.length === 1 ? 'a' : 'he'} precompilat${righe.length === 1 ? 'a' : 'e'}` + (trovato ? '' : clienteNome ? ` · cliente "${clienteNome}" da confermare` : '');
  else dettaglio = trovato ? 'cliente impostato · aggiungi le righe' : 'apri una nuova bozza';

  return {
    tipo: 'bozza', target,
    icona: target === 'fattura' ? 'receipt_long' : target === 'preventivo' ? 'description' : 'local_shipping',
    titolo: `Nuov${target === 'preventivo' || target === 'ddt' ? 'o' : 'a'} ${nomeDoc}${clienteNome ? ' per ' + clienteNome : ''}`,
    dettaglio,
    dati: { clienteId, clienteNome, righe },
  };
}

function bozzaCliente(q) {
  // "crea cliente Mario Rossi [piva 12345678901]"
  let resto = q.replace(/\b(crea|creare|nuov[oa]|aggiungi|registra|inserisci|fai|fammi|genera)\b/gi, ' ')
               .replace(/\b(cliente|anagrafica)\b/gi, ' ');
  let pIva = '';
  const mp = resto.match(/\b(?:p\.?\s*iva|partita iva)\s*:?\s*(\d{8,13})\b/i) || resto.match(/\b(\d{11})\b/);
  if (mp) { pIva = mp[1]; resto = resto.replace(mp[0], ' '); }
  const nome = resto.replace(/\s+/g, ' ').trim();
  if (!nome) return { tipo: 'nessuno' };
  return {
    tipo: 'bozza', target: 'cliente', icona: 'person_add',
    titolo: `Nuovo cliente: ${nome}`,
    dettaglio: pIva ? `P.IVA ${pIva} · conferma e salva` : 'conferma e salva',
    dati: { ragioneSociale: nome, pIva },
  };
}

function bozzaProdotto(q) {
  // "crea prodotto Sedia [prezzo 19.90]"
  let resto = q.replace(/\b(crea|creare|nuov[oa]|aggiungi|registra|inserisci|fai|fammi|genera)\b/gi, ' ')
               .replace(/\b(prodotto|articolo)\b/gi, ' ');
  let prezzo = null;
  const mp = resto.match(/\b(?:prezzo|a)\s*:?\s*€?\s*(\d+(?:[.,]\d+)?)/i);
  if (mp) { prezzo = parseFloat(mp[1].replace(',', '.')); resto = resto.replace(mp[0], ' '); }
  const nome = resto.replace(/\s+/g, ' ').trim();
  if (!nome) return { tipo: 'nessuno' };
  return {
    tipo: 'bozza', target: 'prodotto', icona: 'add_box',
    titolo: `Nuovo prodotto: ${nome}`,
    dettaglio: prezzo != null ? `Prezzo ${eur(prezzo)} · conferma e salva` : 'conferma e salva',
    dati: { nome, prezzo: prezzo ?? 0 },
  };
}

function interpreta(qRaw) {
  const q = norm(qRaw);
  if (q.length < 3) return { tipo: 'nessuno' };

  // LETTURE (lemmi distinti, non confondibili con "crea fattura").
  if (/\b(fatturat|incass|venduto|vendite|ricav|giro d['’ ]?affari|guadagn|entrate)/.test(q)) return fatturato(q);
  if (/\bdebit[oi]\b/.test(q) || (/\bda pagare\b/.test(q) && !/\bclient/.test(q))) return debitiFornitori();
  if (/\bscadut[ei]\b/.test(q)) return scaduti();
  if (/\b(insolut|da incassare|da riscuotere|crediti|chi.*(deve|pagat)|non.*pagat)/.test(q)) return insoluti(q);
  if (/\b(sotto scorta|sotto soglia|scorte|da riordinare|esaurit|in esaurimento)\b/.test(q)) return sottoScorta();
  // Conteggi: "quanti clienti/prodotti/fornitori/fatture ho".
  if (/\bquant[ie]\b/.test(q) && /\b(client|fornitor|prodott|articol|fattur|preventiv)/.test(q) && !/\bfatturat/.test(q)) {
    const c = conteggio(q);
    if (c.tipo !== 'nessuno') return c;
  }
  const mg = q.match(/\b(?:giacenza|quante|quanti|scorta di|disponibilit[aà])\s+(?:di\s+)?([a-zàèéìòù][\w àèéìòù'’-]*?)(?:\s+(?:ho|in magazzino|disponibili|rimast[ei]))?\s*$/i);
  if (mg) return giacenza(mg[1]);

  // BOZZE documento.
  const isFatt = /\bfattur/.test(q);       // "fatturato" già intercettato sopra
  const isPrev = /\bpreventiv|\boffert/.test(q);
  const isDdt  = /\bddt|bolla|trasporto/.test(q);
  if (isFatt || isPrev || isDdt) {
    const target = isPrev ? 'preventivo' : isDdt ? 'ddt' : 'fattura';
    return bozzaDocumento(target, q);
  }

  // BOZZE anagrafica (richiede un verbo di creazione).
  const verbo = /\b(crea|creare|nuov[oa]|aggiungi|registra|inserisci|fai|fammi|genera)\b/.test(q);
  if (verbo && /\b(cliente|anagrafica)\b/.test(q)) return bozzaCliente(q);
  if (verbo && /\b(prodotto|articolo)\b/.test(q)) return bozzaProdotto(q);

  return { tipo: 'nessuno' };
}

// POST /api/comandi  body: { q }
router.post('/', (req, res) => {
  const q = (req.body?.q || '').toString().slice(0, 200);
  try {
    res.json(interpreta(q));
  } catch (e) {
    console.error('[comandi]', e.message);
    res.json({ tipo: 'nessuno' });
  }
});

module.exports = router;

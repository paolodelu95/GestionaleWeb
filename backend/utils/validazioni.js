/**
 * Validazioni di integrità condivise tra le route dei documenti.
 * Centralizzate qui così fatture, note di credito ecc. applicano le stesse regole
 * (evita doppioni e divergenze tra i vari handler).
 */

/**
 * Righe di un documento fiscale: deve esserci almeno una riga e nessun valore
 * negativo. Sono ammessi valori a 0 (righe nota/descrittive, omaggi).
 * @returns {string|null} messaggio d'errore, oppure null se valido.
 */
function validaRigheDocumento(righe) {
  if (!Array.isArray(righe) || righe.length === 0) return 'Il documento deve contenere almeno una riga';
  for (const r of righe) {
    if (Number(r.quantita) < 0) return 'La quantità di una riga non può essere negativa';
    if (Number(r.prezzo) < 0) return 'Il prezzo di una riga non può essere negativo';
  }
  return null;
}

module.exports = { validaRigheDocumento };

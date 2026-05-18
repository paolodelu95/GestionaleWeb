const db = require('../database');

function checkRiordino(prodottoIds) {
  const az = db.prepare('SELECT riordino_automatico FROM azienda WHERE id=1').get();
  if (!az?.riordino_automatico) return;

  for (const pid of prodottoIds) {
    if (!pid) continue;
    const prod = db.prepare('SELECT * FROM prodotti WHERE id=?').get(pid);
    if (!prod || prod.soglia_minima <= 0 || prod.quantita >= prod.soglia_minima) continue;
    if (!prod.fornitore_id_preferito) continue;

    const existing = db.prepare(`
      SELECT o.id FROM ordini o
      JOIN ordini_righe r ON r.ordine_id = o.id
      WHERE o.tipo='FORNITORE' AND o.fornitore_id=? AND r.prodotto_id=? AND o.stato='APERTO'
      LIMIT 1
    `).get(prod.fornitore_id_preferito, pid);
    if (existing) continue;

    const count = db.prepare("SELECT COUNT(*) as n FROM ordini").get();
    const numero = `RO-${count.n + 1}`;
    const data = new Date().toISOString().split('T')[0];
    const qta = prod.riordino_quantita > 0 ? prod.riordino_quantita : (prod.soglia_minima - prod.quantita);

    const result = db.prepare(`
      INSERT INTO ordini (numero, data_ordine, fornitore_id, tipo, stato, note)
      VALUES (?,?,?,?,?,?)
    `).run(
      numero, data, prod.fornitore_id_preferito, 'FORNITORE', 'APERTO',
      `Riordino automatico – scorta ${prod.quantita} < soglia ${prod.soglia_minima}`
    );

    db.prepare(`
      INSERT INTO ordini_righe (ordine_id, prodotto_id, descrizione, quantita, prezzo, iva)
      VALUES (?,?,?,?,?,?)
    `).run(result.lastInsertRowid, pid, prod.nome, qta, prod.prezzo, prod.iva || 22);
  }
}

module.exports = { checkRiordino };

const db = require('../database');

async function inviaSOllecitiAutomatici() {
  const az = db.prepare('SELECT * FROM azienda WHERE id=1').get();
  if (!az?.smtp_host || !az?.smtp_user) return;

  const oggi = new Date().toISOString().split('T')[0];

  const fatture = db.prepare(`
    SELECT f.id, f.numero, f.data_emissione,
           c.ragione_sociale as cliente_nome, c.email as cliente_email,
           COALESCE(tp.giorni_scadenza, 30) as giorni_pagamento,
           COALESCE((
             SELECT SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0))
             FROM fatture_righe WHERE fattura_id = f.id
           ), 0) as totale
    FROM fatture f
    JOIN clienti c ON f.cliente_id = c.id
    LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
    WHERE f.stato = 'EMESSA' AND c.email != ''
  `).all();

  let inviati = 0;
  for (const f of fatture) {
    const scadenza = new Date(f.data_emissione);
    scadenza.setDate(scadenza.getDate() + f.giorni_pagamento);
    if (scadenza.toISOString().split('T')[0] >= oggi) continue;

    // Non inviare più di un sollecito al giorno per la stessa fattura
    const esistente = db.prepare(
      `SELECT id FROM solleciti WHERE documento_tipo='FATTURA' AND documento_id=? AND data_invio >= date(?, '-1 day') LIMIT 1`
    ).get(f.id, oggi);
    if (esistente) continue;

    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: az.smtp_host, port: az.smtp_port || 587,
        secure: !!az.smtp_secure,
        auth: { user: az.smtp_user, pass: az.smtp_pass },
      });

      const giorni_ritardo = Math.floor((new Date(oggi) - scadenza) / 86400000);
      const subject = `Sollecito pagamento – Fattura n. ${f.numero}`;
      const text = [
        `Gentile ${f.cliente_nome},`,
        '',
        `La fattura n. ${f.numero} del ${f.data_emissione} per un importo di € ${(f.totale || 0).toFixed(2)} risulta scaduta da ${giorni_ritardo} giorn${giorni_ritardo === 1 ? 'o' : 'i'}.`,
        '',
        'La preghiamo di provvedere al pagamento al più presto o di contattarci per qualsiasi chiarimento.',
        '',
        `Cordiali saluti,\n${az.ragione_sociale}`,
      ].join('\n');

      await transporter.sendMail({ from: az.smtp_from || az.smtp_user, to: f.cliente_email, subject, text });

      db.prepare(
        `INSERT INTO solleciti (documento_tipo, documento_id, email_destinatario, data_invio, esito)
         VALUES ('FATTURA',?,?,?,'INVIATO')`
      ).run(f.id, f.cliente_email, oggi);
      inviati++;
    } catch (err) {
      console.error(`[Solleciti] Errore fattura ${f.numero}:`, err.message);
    }
  }
  if (inviati > 0) console.log(`[Solleciti] Inviati ${inviati} solleciti automatici`);
}

module.exports = { inviaSOllecitiAutomatici };

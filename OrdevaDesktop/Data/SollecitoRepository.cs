using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso (sola lettura) allo storico solleciti di pagamento.
///
/// La tabella <c>solleciti</c> è un log: il backend la popola dopo l'invio email
/// (routes/email.rs, INSERT in <c>send</c>) e la legge per documento
/// (<c>storico_solleciti</c>). Non esiste alcuna mutazione lato utente, quindi qui
/// niente Insert/Update/Delete — solo query di lettura, come per un Audit.
///
/// La lista arricchisce ogni riga con numero documento e controparte risolti in
/// un'unica query (LEFT JOIN su fatture/clienti e acquisti/fornitori): niente N+1.
/// I JOIN restano LEFT perché un documento potrebbe essere stato eliminato dopo
/// l'invio del sollecito (lo storico va comunque mostrato).
/// </summary>
public sealed class SollecitoRepository
{
    // Alias snake_case → PascalCase + colonne derivate dai JOIN.
    // documento_id è confrontato col tipo: si aggancia a fatture SOLO se FATTURA e
    // ad acquisti SOLO se ACQUISTO, così non si incrociano id omonimi tra tabelle.
    private const string Sql = @"
        SELECT
            s.id                 AS Id,
            s.documento_tipo     AS DocumentoTipo,
            s.documento_id       AS DocumentoId,
            s.email_destinatario AS EmailDestinatario,
            s.data_invio         AS DataInvio,
            s.esito              AS Esito,
            COALESCE(f.numero, a.numero)                 AS DocumentoNumero,
            COALESCE(c.ragione_sociale, forn.ragione_sociale) AS Controparte
        FROM solleciti s
        LEFT JOIN fatture f   ON s.documento_tipo = 'FATTURA'  AND f.id = s.documento_id
        LEFT JOIN clienti c   ON c.id = f.cliente_id
        LEFT JOIN acquisti a  ON s.documento_tipo = 'ACQUISTO' AND a.id = s.documento_id
        LEFT JOIN fornitori forn ON forn.id = a.fornitore_id
        ORDER BY s.data_invio DESC, s.id DESC";

    /// <summary>Tutto lo storico, dal più recente, con documento e controparte risolti.</summary>
    public List<Sollecito> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Sollecito>(Sql).ToList();
    }
}

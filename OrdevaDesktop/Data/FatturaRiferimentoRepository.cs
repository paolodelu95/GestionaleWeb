using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per i riferimenti delle fatture (tabella <c>fatture_riferimenti</c>).
/// Porta save_riferimenti()/get_riferimenti() del backend Rust (routes/fatture.rs):
/// lettura per fattura ordinata per (ordine, id), e replace in blocco (DELETE +
/// reinsert) che rinumera <c>ordine</c> in base alla posizione nella lista.
/// </summary>
public sealed class FatturaRiferimentoRepository
{
    // Alias snake_case → PascalCase. Riusato dalle query di lettura.
    private const string SelectColumns = @"
        id         AS Id,
        fattura_id AS FatturaId,
        tipo       AS Tipo,
        numero     AS Numero,
        data       AS Data,
        cig        AS Cig,
        cup        AS Cup,
        commessa   AS Commessa,
        ordine     AS Ordine";

    /// <summary>Tutti i riferimenti di una fattura, ordinati per (ordine, id).</summary>
    public List<FatturaRiferimento> GetByFattura(long fatturaId)
    {
        using var conn = Db.Open();
        return conn.Query<FatturaRiferimento>(
            $@"SELECT {SelectColumns} FROM fatture_riferimenti
               WHERE fattura_id = @fatturaId ORDER BY ordine, id",
            new { fatturaId }).ToList();
    }

    /// <summary>
    /// Sostituisce TUTTI i riferimenti di una fattura (DELETE + reinsert). Parità con
    /// save_riferimenti(): l'<c>ordine</c> viene riassegnato in base alla posizione
    /// nella lista (0,1,2,...), ignorando quello eventualmente già impostato. Tutto
    /// in un'unica transazione. Lista vuota → la fattura resta senza riferimenti.
    /// </summary>
    public void Replace(long fatturaId, IEnumerable<FatturaRiferimento> riferimenti)
    {
        var list = riferimenti.ToList();
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        conn.Execute("DELETE FROM fatture_riferimenti WHERE fattura_id = @fatturaId",
            new { fatturaId }, tx);

        for (var i = 0; i < list.Count; i++)
        {
            var r = list[i];
            conn.Execute(
                @"INSERT INTO fatture_riferimenti
                    (fattura_id, tipo, numero, data, cig, cup, commessa, ordine)
                  VALUES
                    (@fatturaId, @Tipo, @Numero, @Data, @Cig, @Cup, @Commessa, @ordine)",
                new
                {
                    fatturaId,
                    Tipo = string.IsNullOrEmpty(r.Tipo) ? "ORDINE_ACQUISTO" : r.Tipo,
                    r.Numero,
                    r.Data,
                    r.Cig,
                    r.Cup,
                    r.Commessa,
                    ordine = i,
                }, tx);
        }

        tx.Commit();
    }

    /// <summary>Inserisce un singolo riferimento e restituisce l'id generato.</summary>
    public long Insert(FatturaRiferimento r)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(
            @"INSERT INTO fatture_riferimenti
                (fattura_id, tipo, numero, data, cig, cup, commessa, ordine)
              VALUES
                (@FatturaId, @Tipo, @Numero, @Data, @Cig, @Cup, @Commessa, @Ordine);
              SELECT last_insert_rowid();",
            new
            {
                r.FatturaId,
                Tipo = string.IsNullOrEmpty(r.Tipo) ? "ORDINE_ACQUISTO" : r.Tipo,
                r.Numero,
                r.Data,
                r.Cig,
                r.Cup,
                r.Commessa,
                r.Ordine,
            });
    }

    /// <summary>Elimina un singolo riferimento per id.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM fatture_riferimenti WHERE id = @id", new { id });
    }

    /// <summary>Elimina tutti i riferimenti di una fattura.</summary>
    public void DeleteByFattura(long fatturaId)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM fatture_riferimenti WHERE fattura_id = @fatturaId",
            new { fatturaId });
    }
}

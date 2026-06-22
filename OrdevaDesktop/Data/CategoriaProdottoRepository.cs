using System.Collections.Generic;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per le categorie prodotto. Porta la logica di
/// routes/categorie_prodotto.rs (CRUD su categorie_prodotto) e quella della
/// dialog Angular (opzioni IVA = aliquote attive di categoria "Imponibile").
/// Tutte le connessioni passano da <see cref="Db.Open"/>.
/// </summary>
public sealed class CategoriaProdottoRepository
{
    /// <summary>
    /// Tutte le categorie ordinate per nome (come la route Rust: ORDER BY nome).
    /// La label dell'IVA collegata è risolta con un LEFT JOIN: niente query in loop.
    /// </summary>
    public IReadOnlyList<CategoriaProdotto> GetAll()
    {
        using var conn = Db.Open();
        const string sql = """
            SELECT
                c.id                                                    AS Id,
                c.nome                                                  AS Nome,
                c.aliquota_iva_id                                       AS AliquotaIvaId,
                CASE
                    WHEN a.id IS NULL THEN NULL
                    ELSE printf('%g%% — %s', a.valore, a.nome)
                END                                                     AS AliquotaIvaLabel
            FROM categorie_prodotto c
            LEFT JOIN aliquote_iva a ON a.id = c.aliquota_iva_id
            ORDER BY c.nome COLLATE NOCASE
            """;
        return conn.Query<CategoriaProdotto>(sql).AsList();
    }

    /// <summary>Una singola categoria per id, oppure null.</summary>
    public CategoriaProdotto? GetById(long id)
    {
        using var conn = Db.Open();
        const string sql = """
            SELECT
                c.id                                                    AS Id,
                c.nome                                                  AS Nome,
                c.aliquota_iva_id                                       AS AliquotaIvaId,
                CASE
                    WHEN a.id IS NULL THEN NULL
                    ELSE printf('%g%% — %s', a.valore, a.nome)
                END                                                     AS AliquotaIvaLabel
            FROM categorie_prodotto c
            LEFT JOIN aliquote_iva a ON a.id = c.aliquota_iva_id
            WHERE c.id = @id
            """;
        return conn.QuerySingleOrDefault<CategoriaProdotto>(sql, new { id });
    }

    /// <summary>
    /// Opzioni per la tendina "IVA predefinita": solo aliquote attive e di
    /// categoria "Imponibile" (parità con la dialog Angular). Ordinate per valore.
    /// </summary>
    public IReadOnlyList<AliquotaIva> GetAliquoteImponibili()
    {
        using var conn = Db.Open();
        const string sql = """
            SELECT
                id          AS Id,
                nome        AS Nome,
                valore      AS Valore,
                categoria   AS Categoria,
                attiva      AS Attiva
            FROM aliquote_iva
            WHERE attiva = 1 AND categoria = 'Imponibile'
            ORDER BY valore
            """;
        return conn.Query<AliquotaIva>(sql).AsList();
    }

    /// <summary>Inserisce una categoria e restituisce il nuovo id.</summary>
    public long Insert(CategoriaProdotto c)
    {
        using var conn = Db.Open();
        const string sql = """
            INSERT INTO categorie_prodotto (nome, aliquota_iva_id)
            VALUES (@Nome, @AliquotaIvaId);
            SELECT last_insert_rowid();
            """;
        return conn.ExecuteScalar<long>(sql, new { c.Nome, c.AliquotaIvaId });
    }

    /// <summary>Aggiorna nome e IVA predefinita di una categoria esistente.</summary>
    public void Update(CategoriaProdotto c)
    {
        using var conn = Db.Open();
        const string sql = """
            UPDATE categorie_prodotto
               SET nome = @Nome,
                   aliquota_iva_id = @AliquotaIvaId
             WHERE id = @Id
            """;
        conn.Execute(sql, new { c.Nome, c.AliquotaIvaId, c.Id });
    }

    /// <summary>Elimina una categoria per id.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM categorie_prodotto WHERE id = @id", new { id });
    }

    /// <summary>
    /// Elimina più categorie in un colpo solo (selezione multipla). Usa una sola
    /// query con clausola IN (@ids): Dapper espande la lista. Niente loop.
    /// </summary>
    public void DeleteMany(IEnumerable<long> ids)
    {
        var list = new List<long>(ids);
        if (list.Count == 0) return;
        using var conn = Db.Open();
        conn.Execute("DELETE FROM categorie_prodotto WHERE id IN @ids", new { ids = list });
    }
}

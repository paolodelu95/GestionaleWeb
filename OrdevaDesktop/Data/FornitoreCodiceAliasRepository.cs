using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per gli alias di codice fornitore→prodotto (tabella
/// <c>fornitore_codice_alias</c>). Porta la logica del backend Rust (routes/prodotti.rs
/// e sdi_passive.rs): elenco per prodotto con nome fornitore via JOIN, lookup per
/// (fornitore, codice normalizzato), e upsert sul vincolo UNIQUE (fornitore_id,
/// codice_norm).
///
/// <see cref="Normalize"/> replica la normalizzazione del backend: <c>trim().toLowerCase()</c>.
/// Tutti gli insert ricalcolano codice_norm di qui, ignorando quello eventualmente
/// passato nel modello, così la chiave resta coerente.
/// </summary>
public sealed class FornitoreCodiceAliasRepository
{
    // Alias snake_case → PascalCase. created_at incluso; fornitore_nome via JOIN solo
    // dove serve (vedi GetByProdotto).
    private const string SelectColumns = @"
        id           AS Id,
        fornitore_id AS FornitoreId,
        prodotto_id  AS ProdottoId,
        codice       AS Codice,
        codice_norm  AS CodiceNorm,
        created_at   AS CreatedAt";

    /// <summary>Normalizza un codice fornitore come il backend: trim + lowercase.</summary>
    public static string Normalize(string? codice) =>
        (codice ?? string.Empty).Trim().ToLowerInvariant();

    /// <summary>
    /// Tutti gli alias di un prodotto, con la ragione sociale del fornitore risolta
    /// via LEFT JOIN (niente N+1), ordinati per fornitore e codice. Parità con
    /// l'elenco alias in routes/prodotti.rs.
    /// </summary>
    public List<FornitoreCodiceAlias> GetByProdotto(long prodottoId)
    {
        using var conn = Db.Open();
        return conn.Query<FornitoreCodiceAlias>(
            @"SELECT a.id           AS Id,
                     a.fornitore_id AS FornitoreId,
                     a.prodotto_id  AS ProdottoId,
                     a.codice       AS Codice,
                     a.codice_norm  AS CodiceNorm,
                     a.created_at   AS CreatedAt,
                     f.ragione_sociale AS FornitoreNome
              FROM fornitore_codice_alias a
              LEFT JOIN fornitori f ON f.id = a.fornitore_id
              WHERE a.prodotto_id = @prodottoId
              ORDER BY f.ragione_sociale, a.codice",
            new { prodottoId }).ToList();
    }

    /// <summary>Tutti gli alias di un fornitore.</summary>
    public List<FornitoreCodiceAlias> GetByFornitore(long fornitoreId)
    {
        using var conn = Db.Open();
        return conn.Query<FornitoreCodiceAlias>(
            $@"SELECT {SelectColumns} FROM fornitore_codice_alias
               WHERE fornitore_id = @fornitoreId ORDER BY codice",
            new { fornitoreId }).ToList();
    }

    /// <summary>
    /// Risolve il prodotto interno a partire da (fornitore, codice). Il codice viene
    /// normalizzato prima del lookup. Parità con la SELECT su codice_norm in
    /// sdi_passive.rs/prodotti.rs. Restituisce null se non c'è alcun alias.
    /// </summary>
    public long? FindProdottoId(long fornitoreId, string codice)
    {
        var norm = Normalize(codice);
        if (norm.Length == 0) return null;
        using var conn = Db.Open();
        return conn.ExecuteScalar<long?>(
            "SELECT prodotto_id FROM fornitore_codice_alias WHERE fornitore_id = @fornitoreId AND codice_norm = @norm",
            new { fornitoreId, norm });
    }

    /// <summary>L'alias per (fornitore, codice normalizzato), o null se non esiste.</summary>
    public FornitoreCodiceAlias? Find(long fornitoreId, string codice)
    {
        var norm = Normalize(codice);
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<FornitoreCodiceAlias>(
            $@"SELECT {SelectColumns} FROM fornitore_codice_alias
               WHERE fornitore_id = @fornitoreId AND codice_norm = @norm",
            new { fornitoreId, norm });
    }

    /// <summary>
    /// Crea o aggiorna un alias (UPSERT sul vincolo UNIQUE fornitore_id+codice_norm).
    /// Sul conflitto rimappa il codice e il prodotto, come ON CONFLICT ... DO UPDATE
    /// del backend. codice_norm è ricalcolato qui da <see cref="FornitoreCodiceAlias.Codice"/>.
    /// Restituisce l'id della riga (nuova o aggiornata).
    /// </summary>
    public long Upsert(FornitoreCodiceAlias a)
    {
        var norm = Normalize(a.Codice);
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(
            @"INSERT INTO fornitore_codice_alias (fornitore_id, prodotto_id, codice, codice_norm)
              VALUES (@FornitoreId, @ProdottoId, @Codice, @norm)
              ON CONFLICT(fornitore_id, codice_norm)
                DO UPDATE SET prodotto_id = excluded.prodotto_id, codice = excluded.codice
              RETURNING id;",
            new { a.FornitoreId, a.ProdottoId, a.Codice, norm });
    }

    /// <summary>Elimina un alias per id. Parità con alias_remove() del backend.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM fornitore_codice_alias WHERE id = @id", new { id });
    }
}

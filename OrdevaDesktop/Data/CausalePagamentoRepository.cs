using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per l'anagrafica delle causali di pagamento (tabella
/// causali_pagamento). CRUD con Dapper; le connessioni si aprono SOLO via
/// <see cref="Db.Open"/>. Porta la logica del backend Rust (routes/causali.rs):
/// ordinamento per (ordine, nome); insert con ordine = MAX(ordine)+1; nome
/// obbligatorio e UNIQUE; <c>attivo</c> vero per NULL o qualsiasi valore non-zero.
/// </summary>
public sealed class CausalePagamentoRepository
{
    // Alias snake_case → PascalCase. attivo: COALESCE(...,1) così NULL → 1 (true),
    // poi != 0 → bool. Replica `attivo !== 0` del backend (NULL conta come attivo).
    private const string SelectColumns =
        "id                       AS Id, " +
        "nome                     AS Nome, " +
        "COALESCE(ordine, 0)      AS Ordine, " +
        "COALESCE(attivo, 1) <> 0 AS Attivo";

    /// <summary>Tutte le causali, ordinate per (ordine, nome) come la API web.</summary>
    public List<CausalePagamento> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<CausalePagamento>(
            $"SELECT {SelectColumns} FROM causali_pagamento ORDER BY ordine, nome").ToList();
    }

    /// <summary>Una singola causale, o null se l'id non esiste.</summary>
    public CausalePagamento? GetById(int id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<CausalePagamento>(
            $"SELECT {SelectColumns} FROM causali_pagamento WHERE id = @id", new { id });
    }

    /// <summary>
    /// Inserisce una causale e restituisce l'id generato. L'ordine viene calcolato
    /// come MAX(ordine)+1 (parità con create() del backend). Lancia
    /// <see cref="DuplicateNameException"/> se il nome esiste già (vincolo UNIQUE).
    /// </summary>
    public int Insert(CausalePagamento c)
    {
        c.Nome = (c.Nome ?? string.Empty).Trim();
        using var conn = Db.Open();
        try
        {
            return conn.ExecuteScalar<int>(
                @"INSERT INTO causali_pagamento (nome, ordine, attivo)
                  VALUES (@Nome, (SELECT COALESCE(MAX(ordine),0)+1 FROM causali_pagamento), @Attivo);
                  SELECT last_insert_rowid();",
                new { c.Nome, Attivo = c.Attivo ? 1 : 0 });
        }
        catch (SqliteException ex) when (IsUniqueViolation(ex))
        {
            // Node/Rust: errore UNIQUE → "Causale già esistente".
            throw new DuplicateNameException("Causale già esistente");
        }
    }

    /// <summary>
    /// Aggiorna una causale esistente (richiede Id valorizzato). Il backend Rust
    /// aggiorna solo il nome; qui aggiorniamo anche <c>attivo</c> perché la UI
    /// desktop lo espone. Lancia <see cref="DuplicateNameException"/> sul duplicato.
    /// </summary>
    public void Update(CausalePagamento c)
    {
        c.Nome = (c.Nome ?? string.Empty).Trim();
        using var conn = Db.Open();
        try
        {
            conn.Execute(
                @"UPDATE causali_pagamento SET nome = @Nome, attivo = @Attivo WHERE id = @Id",
                new { c.Id, c.Nome, Attivo = c.Attivo ? 1 : 0 });
        }
        catch (SqliteException ex) when (IsUniqueViolation(ex))
        {
            throw new DuplicateNameException("Causale già esistente");
        }
    }

    /// <summary>Elimina una singola causale.</summary>
    public void Delete(int id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM causali_pagamento WHERE id = @id", new { id });
    }

    /// <summary>
    /// Eliminazione in blocco: un'unica query con clausola IN (niente DELETE in
    /// loop). Restituisce il numero di righe eliminate.
    /// </summary>
    public int DeleteMany(IEnumerable<int> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;
        using var conn = Db.Open();
        return conn.Execute(
            "DELETE FROM causali_pagamento WHERE id IN @ids", new { ids = list });
    }

    // SQLite error 19 = constraint; extended 2067 = UNIQUE.
    private static bool IsUniqueViolation(SqliteException ex) =>
        ex.SqliteErrorCode == 19 || ex.SqliteExtendedErrorCode == 2067;
}

/// <summary>Sollevata quando si tenta di salvare una causale con nome già esistente.</summary>
public sealed class DuplicateNameException : System.Exception
{
    public DuplicateNameException(string message) : base(message) { }
}

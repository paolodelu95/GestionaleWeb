using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per l'anagrafica dei tipi di pagamento (tabella tipi_pagamento).
/// CRUD con Dapper; le connessioni si aprono SOLO via <see cref="Db.Open"/>.
/// Le colonne SQLite sono snake_case e vengono mappate alle proprietà PascalCase
/// con alias espliciti; i flag INTEGER 0/1 sono mappati a bool.
/// </summary>
public sealed class TipoPagamentoRepository
{
    private const string SelectColumns =
        "id              AS Id, " +
        "nome            AS Nome, " +
        "conto           AS Conto, " +
        "giorni_scadenza AS GiorniScadenza, " +
        "fine_mese       AS FineMese, " +
        "immediato       AS Immediato, " +
        "attivo          AS Attivo";

    /// <summary>Tutti i tipi di pagamento, ordinati per id (come la API web).</summary>
    public List<TipoPagamento> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<TipoPagamento>(
            $"SELECT {SelectColumns} FROM tipi_pagamento ORDER BY id").ToList();
    }

    /// <summary>Un singolo tipo di pagamento, o null se l'id non esiste.</summary>
    public TipoPagamento? GetById(int id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<TipoPagamento>(
            $"SELECT {SelectColumns} FROM tipi_pagamento WHERE id = @id", new { id });
    }

    /// <summary>Inserisce e restituisce l'id generato.</summary>
    public int Insert(TipoPagamento t)
    {
        Normalize(t);
        using var conn = Db.Open();
        return conn.ExecuteScalar<int>(
            @"INSERT INTO tipi_pagamento (nome, conto, giorni_scadenza, fine_mese, immediato, attivo)
              VALUES (@Nome, @Conto, @GiorniScadenza, @FineMese, @Immediato, @Attivo);
              SELECT last_insert_rowid();",
            new
            {
                t.Nome,
                t.Conto,
                t.GiorniScadenza,
                FineMese = t.FineMese ? 1 : 0,
                Immediato = t.Immediato ? 1 : 0,
                Attivo = t.Attivo ? 1 : 0,
            });
    }

    /// <summary>Aggiorna un tipo esistente (richiede Id valorizzato).</summary>
    public void Update(TipoPagamento t)
    {
        Normalize(t);
        using var conn = Db.Open();
        conn.Execute(
            @"UPDATE tipi_pagamento
                 SET nome = @Nome, conto = @Conto, giorni_scadenza = @GiorniScadenza,
                     fine_mese = @FineMese, immediato = @Immediato, attivo = @Attivo
               WHERE id = @Id",
            new
            {
                t.Id,
                t.Nome,
                t.Conto,
                t.GiorniScadenza,
                FineMese = t.FineMese ? 1 : 0,
                Immediato = t.Immediato ? 1 : 0,
                Attivo = t.Attivo ? 1 : 0,
            });
    }

    /// <summary>Elimina un singolo tipo di pagamento.</summary>
    public void Delete(int id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM tipi_pagamento WHERE id = @id", new { id });
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
            "DELETE FROM tipi_pagamento WHERE id IN @ids", new { ids = list });
    }

    /// <summary>
    /// Applica le stesse regole del backend/web: un pagamento "immediato" azzera
    /// i giorni di scadenza e disattiva il fine-mese; il conto default è BANCA.
    /// </summary>
    private static void Normalize(TipoPagamento t)
    {
        t.Nome = (t.Nome ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(t.Conto)) t.Conto = "BANCA";
        if (t.Immediato)
        {
            t.GiorniScadenza = 0;
            t.FineMese = false;
        }
        if (t.GiorniScadenza < 0) t.GiorniScadenza = 0;
        if (t.GiorniScadenza == 0) t.FineMese = false;
    }
}

using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per la tabella ponte fattura↔DDT (tabella <c>fatture_ddt</c>, chiave
/// composta fattura_id+ddt_id, niente id autoincrementale). Porta save_ddt_links()/
/// get_ddt_ids() del backend Rust (routes/fatture.rs): lettura degli id DDT di una
/// fattura e replace in blocco dei collegamenti. Gli insert usano INSERT OR IGNORE
/// per essere idempotenti sulla PK (niente duplicati di collegamento).
/// </summary>
public sealed class FatturaDdtRepository
{
    /// <summary>Tutti i collegamenti di una fattura (coppie fattura_id/ddt_id).</summary>
    public List<FatturaDdt> GetByFattura(long fatturaId)
    {
        using var conn = Db.Open();
        return conn.Query<FatturaDdt>(
            @"SELECT fattura_id AS FatturaId, ddt_id AS DdtId
              FROM fatture_ddt WHERE fattura_id = @fatturaId ORDER BY ddt_id",
            new { fatturaId }).ToList();
    }

    /// <summary>
    /// Solo gli id dei DDT collegati a una fattura. Parità con get_ddt_ids(): è la
    /// forma più usata dal codice chiamante (caricamento righe da DDT).
    /// </summary>
    public List<long> GetDdtIds(long fatturaId)
    {
        using var conn = Db.Open();
        return conn.Query<long>(
            "SELECT ddt_id FROM fatture_ddt WHERE fattura_id = @fatturaId ORDER BY ddt_id",
            new { fatturaId }).ToList();
    }

    /// <summary>Gli id delle fatture che hanno fatturato un certo DDT (di norma 0 o 1).</summary>
    public List<long> GetFatturaIds(long ddtId)
    {
        using var conn = Db.Open();
        return conn.Query<long>(
            "SELECT fattura_id FROM fatture_ddt WHERE ddt_id = @ddtId ORDER BY fattura_id",
            new { ddtId }).ToList();
    }

    /// <summary>
    /// Sostituisce TUTTI i DDT collegati a una fattura (DELETE + reinsert), in
    /// un'unica transazione. Parità con save_ddt_links(): INSERT OR IGNORE per
    /// tollerare id duplicati nella lista. Lista vuota → scollega tutto.
    /// </summary>
    public void ReplaceLinks(long fatturaId, IEnumerable<long> ddtIds)
    {
        var list = ddtIds.Distinct().ToList();
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        conn.Execute("DELETE FROM fatture_ddt WHERE fattura_id = @fatturaId",
            new { fatturaId }, tx);

        foreach (var ddtId in list)
            conn.Execute(
                "INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id) VALUES (@fatturaId, @ddtId)",
                new { fatturaId, ddtId }, tx);

        tx.Commit();
    }

    /// <summary>Aggiunge un singolo collegamento (idempotente: INSERT OR IGNORE sulla PK).</summary>
    public void Add(long fatturaId, long ddtId)
    {
        using var conn = Db.Open();
        conn.Execute(
            "INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id) VALUES (@fatturaId, @ddtId)",
            new { fatturaId, ddtId });
    }

    /// <summary>Rimuove un singolo collegamento fattura↔DDT.</summary>
    public void Remove(long fatturaId, long ddtId)
    {
        using var conn = Db.Open();
        conn.Execute(
            "DELETE FROM fatture_ddt WHERE fattura_id = @fatturaId AND ddt_id = @ddtId",
            new { fatturaId, ddtId });
    }

    /// <summary>Rimuove tutti i collegamenti di una fattura.</summary>
    public void DeleteByFattura(long fatturaId)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM fatture_ddt WHERE fattura_id = @fatturaId",
            new { fatturaId });
    }
}

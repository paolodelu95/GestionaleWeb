using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD per la tabella <c>aliquote_iva</c> con Dapper. Connessione SOLO via
/// <see cref="Db.Open"/>. Le query usano alias snake_case -&gt; PascalCase così
/// Dapper mappa direttamente su <see cref="AliquotaIva"/>.
/// </summary>
public sealed class AliquotaIvaRepository
{
    // Selezione standard delle colonne con alias verso le proprietà C#.
    private const string SelectCols =
        "id AS Id, nome AS Nome, valore AS Valore, codice AS Codice, " +
        "categoria AS Categoria, descrizione AS Descrizione, natura AS Natura, " +
        "note AS Note, predefinito AS Predefinito, attiva AS Attiva";

    // Ordinamento per categoria fiscale standardizzata, poi valore DESC, poi
    // codice — portato 1:1 dal backend Rust (routes/aliquote_iva.rs).
    private const string OrderBy =
        @"ORDER BY
            CASE categoria
              WHEN 'Imponibile' THEN 1
              WHEN 'Acq. reverse charge' THEN 2
              WHEN 'Split payment' THEN 3
              WHEN 'N1: Escluso art. 15' THEN 4
              WHEN 'N2.1' THEN 5 WHEN 'N2.2' THEN 6
              WHEN 'N3.1' THEN 7 WHEN 'N3.2' THEN 8 WHEN 'N3.3' THEN 9 WHEN 'N3.4' THEN 10 WHEN 'N3.5' THEN 11
              WHEN 'N4: Esente' THEN 12
              WHEN 'N5: Regime del margine' THEN 13
              WHEN 'N6' THEN 14 WHEN 'N6.1' THEN 15 WHEN 'N6.3' THEN 16 WHEN 'N6.4' THEN 17
              WHEN 'N6.5' THEN 18 WHEN 'N6.6' THEN 19 WHEN 'N6.7' THEN 20
              ELSE 99
            END, valore DESC, codice";

    /// <summary>Tutte le aliquote, ordinate come nel backend.</summary>
    public List<AliquotaIva> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<AliquotaIva>(
            $"SELECT {SelectCols} FROM aliquote_iva {OrderBy}").ToList();
    }

    /// <summary>Singola aliquota per id, o null se assente.</summary>
    public AliquotaIva? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<AliquotaIva>(
            $"SELECT {SelectCols} FROM aliquote_iva WHERE id = @id",
            new { id });
    }

    /// <summary>Inserisce una nuova aliquota e ne restituisce l'id generato.</summary>
    public long Insert(AliquotaIva a)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        Normalize(a);
        if (a.Predefinito) ClearDefaults(conn, tx);
        var id = conn.ExecuteScalar<long>(
            @"INSERT INTO aliquote_iva
                (nome, valore, codice, categoria, descrizione, natura, note, predefinito, attiva)
              VALUES
                (@Nome, @Valore, @Codice, @Categoria, @Descrizione, @Natura, @Note,
                 @Predefinito, @Attiva);
              SELECT last_insert_rowid();",
            ToParams(a), tx);
        tx.Commit();
        return id;
    }

    /// <summary>Aggiorna l'aliquota indicata. Restituisce true se ha modificato una riga.</summary>
    public bool Update(AliquotaIva a)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        Normalize(a);
        if (a.Predefinito) ClearDefaults(conn, tx, a.Id);
        var rows = conn.Execute(
            @"UPDATE aliquote_iva SET
                nome = @Nome, valore = @Valore, codice = @Codice, categoria = @Categoria,
                descrizione = @Descrizione, natura = @Natura, note = @Note,
                predefinito = @Predefinito, attiva = @Attiva
              WHERE id = @Id",
            ToParams(a), tx);
        tx.Commit();
        return rows > 0;
    }

    /// <summary>Elimina l'aliquota indicata. Restituisce true se ha rimosso una riga.</summary>
    public bool Delete(long id)
    {
        using var conn = Db.Open();
        return conn.Execute("DELETE FROM aliquote_iva WHERE id = @id", new { id }) > 0;
    }

    // ── helper ────────────────────────────────────────────────────────────────

    private static object ToParams(AliquotaIva a) => new
    {
        a.Id,
        a.Nome,
        a.Valore,
        a.Codice,
        a.Categoria,
        a.Descrizione,
        a.Natura,
        a.Note,
        Predefinito = a.Predefinito ? 1 : 0,
        Attiva = a.Attiva ? 1 : 0,
    };

    // Allinea i valori testuali alle DEFAULT "" dello schema (no NULL accidentali),
    // tranne `natura` che nello schema è NULLABLE.
    private static void Normalize(AliquotaIva a)
    {
        a.Nome = (a.Nome ?? string.Empty).Trim();
        a.Codice ??= string.Empty;
        a.Categoria ??= string.Empty;
        a.Descrizione ??= string.Empty;
        a.Note ??= string.Empty;
        if (string.IsNullOrWhiteSpace(a.Natura)) a.Natura = null;
    }

    // Un solo "predefinito" alla volta: prima di impostarne uno, azzera gli altri.
    // BUG nel backend originale: non garantiva l'unicità del flag predefinito,
    // così potevano coesistere più aliquote marcate come default. Qui lo correggo.
    private static void ClearDefaults(
        Microsoft.Data.Sqlite.SqliteConnection conn,
        Microsoft.Data.Sqlite.SqliteTransaction tx,
        long exceptId = 0)
    {
        conn.Execute(
            "UPDATE aliquote_iva SET predefinito = 0 WHERE predefinito = 1 AND id <> @exceptId",
            new { exceptId }, tx);
    }
}

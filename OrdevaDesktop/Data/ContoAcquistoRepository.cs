using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per l'anagrafica dei conti di acquisto (tabella conti_acquisto).
/// CRUD con Dapper; le connessioni si aprono SOLO via <see cref="Db.Open"/>.
/// Le colonne SQLite sono snake_case e vengono mappate alle proprietà PascalCase
/// con alias espliciti; il flag INTEGER 0/1 è mappato a bool.
/// </summary>
public sealed class ContoAcquistoRepository
{
    private const string SelectColumns =
        "id              AS Id, " +
        "nome            AS Nome, " +
        "predefinito_per AS PredefinitoPer, " +
        "attivo          AS Attivo";

    /// <summary>Tutti i conti, ordinati per nome (come la API web/backend).</summary>
    public List<ContoAcquisto> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<ContoAcquisto>(
            $"SELECT {SelectColumns} FROM conti_acquisto ORDER BY nome").ToList();
    }

    /// <summary>Un singolo conto, o null se l'id non esiste.</summary>
    public ContoAcquisto? GetById(int id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<ContoAcquisto>(
            $"SELECT {SelectColumns} FROM conti_acquisto WHERE id = @id", new { id });
    }

    /// <summary>Inserisce e restituisce l'id generato.</summary>
    public int Insert(ContoAcquisto c)
    {
        Normalize(c);
        using var conn = Db.Open();
        return conn.ExecuteScalar<int>(
            @"INSERT INTO conti_acquisto (nome, predefinito_per, attivo)
              VALUES (@Nome, @PredefinitoPer, @Attivo);
              SELECT last_insert_rowid();",
            new
            {
                c.Nome,
                c.PredefinitoPer,
                Attivo = c.Attivo ? 1 : 0,
            });
    }

    /// <summary>Aggiorna un conto esistente (richiede Id valorizzato).</summary>
    public void Update(ContoAcquisto c)
    {
        Normalize(c);
        using var conn = Db.Open();
        conn.Execute(
            @"UPDATE conti_acquisto
                 SET nome = @Nome, predefinito_per = @PredefinitoPer, attivo = @Attivo
               WHERE id = @Id",
            new
            {
                c.Id,
                c.Nome,
                c.PredefinitoPer,
                Attivo = c.Attivo ? 1 : 0,
            });
    }

    /// <summary>Elimina un singolo conto.</summary>
    public void Delete(int id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM conti_acquisto WHERE id = @id", new { id });
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
            "DELETE FROM conti_acquisto WHERE id IN @ids", new { ids = list });
    }

    /// <summary>
    /// Allinea i campi alle regole del backend: il nome è trimmato e il tag
    /// "predefinito_per" non è mai null (stringa vuota di default).
    /// </summary>
    private static void Normalize(ContoAcquisto c)
    {
        c.Nome = (c.Nome ?? string.Empty).Trim();
        c.PredefinitoPer = (c.PredefinitoPer ?? string.Empty).Trim();
    }
}

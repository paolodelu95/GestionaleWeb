using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD delle note rapide (tabella <c>note_rapide</c>) con Dapper. Porta la
/// logica del backend Rust (routes/note_rapide.rs):
/// - lista ordinata per <c>ordine, id</c>;
/// - su INSERT/UPDATE il <c>testo</c> è obbligatorio (trim, non vuoto) e
///   <c>ordine</c> ha default 0.
///
/// Tabella piatta: niente righe figlie da caricare, quindi niente N+1.
/// </summary>
public sealed class NotaRapidaRepository
{
    // Alias snake_case → PascalCase. Riusato da GetAll e GetById.
    private const string Columns = @"
        id     AS Id,
        testo  AS Testo,
        ordine AS Ordine";

    // Ordinamento identico a list() del backend: ORDER BY ordine, id.
    private const string OrderBy = "ORDER BY ordine, id";

    /// <summary>Tutte le note rapide nell'ordine del backend.</summary>
    public List<NotaRapida> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<NotaRapida>($"SELECT {Columns} FROM note_rapide {OrderBy}").ToList();
    }

    /// <summary>Singola nota per id, o null se non esiste.</summary>
    public NotaRapida? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<NotaRapida>(
            $"SELECT {Columns} FROM note_rapide WHERE id=@id", new { id });
    }

    /// <summary>Inserisce una nota rapida e ne restituisce l'id. Default ordine 0.</summary>
    public long Insert(NotaRapida n)
    {
        Normalizza(n);
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO note_rapide (testo, ordine) VALUES (@Testo, @Ordine);
            SELECT last_insert_rowid();", n);
    }

    /// <summary>Aggiorna testo e ordine di una nota rapida.</summary>
    public void Update(NotaRapida n)
    {
        Normalizza(n);
        using var conn = Db.Open();
        conn.Execute(
            "UPDATE note_rapide SET testo=@Testo, ordine=@Ordine WHERE id=@Id", n);
    }

    /// <summary>Elimina una nota rapida.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM note_rapide WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            conn.Execute("DELETE FROM note_rapide WHERE id=@id", new { id }, tx);
        tx.Commit();
        return list.Count;
    }

    // ── helper privati ────────────────────────────────────────────────────────

    /// <summary>Applica i default/validazioni del backend (testo obbligatorio).</summary>
    private static void Normalizza(NotaRapida n)
    {
        n.Testo = n.Testo?.Trim() ?? "";
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD delle attività (tabella <c>todo</c>) con Dapper. Porta la logica del
/// backend Rust (routes/agenda.rs, sezione Todo):
/// - ordinamento: prima le non completate, poi per scadenza (NULL in fondo),
///   poi id DESC;
/// - su INSERT priorita/stato hanno default MEDIA/DA_FARE se vuoti;
/// - su UPDATE <c>completata_at</c> viene impostato all'istante corrente quando
///   la todo passa a FATTA, azzerato quando esce da FATTA, altrimenti invariato.
///
/// Tabella piatta: niente righe figlie da caricare, quindi niente N+1.
/// La <c>user_id</c> in offline mono-utente è gestita dall'integrazione; qui non
/// filtriamo per proprietario (parità con il client desktop locale).
/// </summary>
public sealed class TodoRepository
{
    // Alias snake_case → PascalCase. Riusato da GetAll e GetById.
    private const string TodoColumns = @"
        id            AS Id,
        titolo        AS Titolo,
        descrizione   AS Descrizione,
        scadenza      AS Scadenza,
        priorita      AS Priorita,
        stato         AS Stato,
        categoria     AS Categoria,
        completata_at AS CompletataAt,
        user_id       AS UserId,
        created_at    AS CreatedAt";

    // Ordinamento identico a list_todo() del backend.
    private const string OrderBy = @"
        ORDER BY CASE stato WHEN 'FATTA' THEN 1 ELSE 0 END,
                 CASE WHEN scadenza IS NULL THEN 1 ELSE 0 END,
                 scadenza, id DESC";

    /// <summary>Tutte le todo nell'ordine del backend.</summary>
    public List<Todo> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Todo>($"SELECT {TodoColumns} FROM todo {OrderBy}").ToList();
    }

    /// <summary>Singola todo per id, o null se non esiste.</summary>
    public Todo? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Todo>(
            $"SELECT {TodoColumns} FROM todo WHERE id=@id", new { id });
    }

    /// <summary>Inserisce una todo e ne restituisce l'id. Default MEDIA/DA_FARE come il backend.</summary>
    public long Insert(Todo t)
    {
        Normalizza(t);
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO todo (titolo, descrizione, scadenza, priorita, categoria, stato, user_id)
            VALUES (@Titolo, @Descrizione, @Scadenza, @Priorita, @Categoria, @Stato, @UserId);
            SELECT last_insert_rowid();", t);
    }

    /// <summary>
    /// Aggiorna una todo. Gestisce <c>completata_at</c> sul cambio di stato
    /// (set quando entra in FATTA, reset quando esce) leggendo lo stato corrente.
    /// </summary>
    public void Update(Todo t)
    {
        Normalizza(t);
        using var conn = Db.Open();

        var cur = conn.QuerySingleOrDefault<(string Stato, string? CompletataAt)>(
            "SELECT stato AS Stato, completata_at AS CompletataAt FROM todo WHERE id=@Id",
            new { t.Id });
        // Riga inesistente: niente da aggiornare (cur sarebbe (null, null) → UPDATE a vuoto).
        if (cur.Stato == null) return;

        var completaOra = t.Stato == "FATTA" && cur.Stato != "FATTA";
        var reset = t.Stato != "FATTA" && cur.Stato == "FATTA";
        var completataAt = completaOra ? NowIsoMs()
            : reset ? null
            : cur.CompletataAt;

        // Aggiorno anche il modello in memoria così il VM resta coerente.
        t.CompletataAt = completataAt;

        conn.Execute(@"
            UPDATE todo SET
                titolo=@Titolo, descrizione=@Descrizione, scadenza=@Scadenza,
                priorita=@Priorita, categoria=@Categoria, stato=@Stato,
                completata_at=@CompletataAt
            WHERE id=@Id",
            new { t.Titolo, t.Descrizione, t.Scadenza, t.Priorita, t.Categoria, t.Stato, CompletataAt = completataAt, t.Id });
    }

    /// <summary>
    /// Scorciatoia per cambiare solo lo stato (checkbox "fatta"/spunta) senza
    /// toccare gli altri campi. Applica la stessa logica di completata_at.
    /// </summary>
    public void SetStato(long id, string stato)
    {
        using var conn = Db.Open();
        var cur = conn.QuerySingleOrDefault<string?>("SELECT stato FROM todo WHERE id=@id", new { id });
        if (cur == null) return;

        var completaOra = stato == "FATTA" && cur != "FATTA";
        var reset = stato != "FATTA" && cur == "FATTA";

        if (completaOra)
            conn.Execute("UPDATE todo SET stato=@stato, completata_at=@at WHERE id=@id",
                new { stato, at = NowIsoMs(), id });
        else if (reset)
            conn.Execute("UPDATE todo SET stato=@stato, completata_at=NULL WHERE id=@id",
                new { stato, id });
        else
            conn.Execute("UPDATE todo SET stato=@stato WHERE id=@id", new { stato, id });
    }

    /// <summary>Elimina una todo.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM todo WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            conn.Execute("DELETE FROM todo WHERE id=@id", new { id }, tx);
        tx.Commit();
        return list.Count;
    }

    // ── helper privati ────────────────────────────────────────────────────────

    /// <summary>Applica i default del backend e normalizza i campi vuoti.</summary>
    private static void Normalizza(Todo t)
    {
        t.Titolo = t.Titolo?.Trim() ?? "";
        t.Descrizione ??= "";
        t.Categoria ??= "";
        if (string.IsNullOrWhiteSpace(t.Priorita)) t.Priorita = "MEDIA";
        if (string.IsNullOrWhiteSpace(t.Stato)) t.Stato = "DA_FARE";
        // Scadenza vuota → NULL (in DB la colonna è nullable e così rientra nel ramo "senza scadenza").
        if (string.IsNullOrWhiteSpace(t.Scadenza)) t.Scadenza = null;
    }

    /// <summary>ISO 8601 UTC con millisecondi, come now_iso_ms() del backend.</summary>
    private static string NowIsoMs() =>
        DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
}

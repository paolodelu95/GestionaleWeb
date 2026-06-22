using System.Text.Encodings.Web;
using System.Text.Json;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso alla bacheca "Lavagna" (tabella <c>lavagna</c>) con Dapper. Porta la
/// logica del backend Rust (routes/lavagna.rs):
/// <list type="bullet">
///   <item>la tabella ha una sola riga (<c>id = 1</c>) con un blob JSON in
///         <c>dati</c>; non è un elenco di record ma un singolo documento;</item>
///   <item>GET: se la riga manca o il JSON è corrotto, si torna il default
///         <c>{ "note": [] }</c> (nessun errore);</item>
///   <item>PUT: upsert sull'unica riga (INSERT ... ON CONFLICT DO UPDATE).</item>
/// </list>
/// Nessuna riga figlia su tabelle separate: i post-it (e le loro voci) vivono dentro
/// il blob, quindi un solo SELECT/UPSERT — niente N+1.
/// </summary>
public sealed class LavagnaRepository
{
    // Camelcase nel JSON (i [JsonPropertyName] del modello fissano già i nomi);
    // ignora maiuscole/minuscole in lettura per robustezza su blob scritti da
    // versioni diverse dell'app. L'encoder rilassato scrive l'UTF-8 senza
    // escape \uXXXX, così il blob resta byte-vicino a quello prodotto dal backend
    // Rust (serde_json::to_string) e dalla web app.
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// Carica lo stato completo della bacheca. Mai null: se la riga non esiste o il
    /// JSON non è deserializzabile, restituisce una bacheca vuota (default del backend).
    /// </summary>
    public Lavagna Get()
    {
        using var conn = Db.Open();
        var dati = conn.QuerySingleOrDefault<string?>(
            "SELECT dati FROM lavagna WHERE id = 1");

        if (string.IsNullOrWhiteSpace(dati))
            return new Lavagna();

        try
        {
            return JsonSerializer.Deserialize<Lavagna>(dati, JsonOpts) ?? new Lavagna();
        }
        catch (JsonException)
        {
            // Blob corrotto: stesso fallback del backend (board vuota).
            return new Lavagna();
        }
    }

    /// <summary>
    /// Salva l'intero stato della bacheca (upsert sull'unica riga). Serializza in
    /// camelCase (via gli attributi JsonPropertyName del modello), così il blob
    /// resta compatibile con la web app.
    /// </summary>
    public void Save(Lavagna board)
    {
        var dati = JsonSerializer.Serialize(board ?? new Lavagna(), JsonOpts);
        using var conn = Db.Open();
        conn.Execute(
            "INSERT INTO lavagna (id, dati) VALUES (1, @dati) " +
            "ON CONFLICT(id) DO UPDATE SET dati = @dati",
            new { dati });
    }
}

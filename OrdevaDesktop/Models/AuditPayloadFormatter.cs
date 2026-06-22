using System;
using System.Collections.Generic;
using System.Text.Json;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Riassume il payload JSON di una voce di <see cref="Audit"/> in una stringa
/// leggibile. Porta summarizePayload() del componente Angular <c>storico</c>:
/// estrae <c>numero</c> e <c>stato</c>, e quando ci sono <c>before</c>/<c>after</c>
/// elenca i campi cambiati come "campo: vecchio -> nuovo". Se non riesce a estrarre
/// nulla restituisce il JSON grezzo (compattato). Usa System.Text.Json (BCL).
/// </summary>
internal static class AuditPayloadFormatter
{
    public static string Summarize(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload)) return "";

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(payload);
        }
        catch (JsonException)
        {
            // Payload non-JSON (parità col try_parse del backend che ripiega su {}):
            // mostriamo il testo così com'è.
            return payload.Trim();
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return Compact(root);

            var parts = new List<string>();

            if (root.TryGetProperty("numero", out var numero) && numero.ValueKind != JsonValueKind.Null)
                parts.Add($"n. {Scalar(numero)}");
            if (root.TryGetProperty("stato", out var stato) && stato.ValueKind != JsonValueKind.Null)
                parts.Add($"stato {Scalar(stato)}");

            if (root.TryGetProperty("before", out var before) && before.ValueKind == JsonValueKind.Object &&
                root.TryGetProperty("after", out var after) && after.ValueKind == JsonValueKind.Object)
            {
                var changes = new List<string>();
                foreach (var prop in after.EnumerateObject())
                {
                    var afterRaw = prop.Value.GetRawText();
                    var beforeRaw = before.TryGetProperty(prop.Name, out var bv) ? bv.GetRawText() : "null";
                    if (beforeRaw != afterRaw)
                        changes.Add($"{prop.Name}: {beforeRaw} -> {afterRaw}");
                }
                if (changes.Count > 0)
                    parts.Add(string.Join(", ", changes));
            }

            return parts.Count > 0 ? string.Join(" · ", parts) : Compact(root);
        }
    }

    /// <summary>Valore scalare senza virgolette (per stringhe), altrimenti il raw JSON.</summary>
    private static string Scalar(JsonElement e) =>
        e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.GetRawText();

    private static string Compact(JsonElement e) => e.GetRawText();
}

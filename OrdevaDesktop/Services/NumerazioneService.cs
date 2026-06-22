using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Data;

namespace Ordeva.Desktop.Services;

/// <summary>
/// Numerazione progressiva dei documenti — port fedele di <c>src-tauri/src/numerazione.rs</c>
/// (a sua volta parità con <c>utils/nextNumero.js</c>).
///
/// Logica: <b>gap-filling</b> che rispetta i prefissi e la numerazione annuale,
/// senza usare contatori dedicati. Si guarda la tabella reale dei documenti, si
/// estraggono i numeri già in uso e si restituisce il primo numero <i>libero</i>
/// (eventualmente saltandone i primi <paramref name="offset"/>).
///
/// Due modalità (lette da <c>azienda.numerazione_annuale</c>, default = annuale):
/// <list type="bullet">
///   <item><b>Annuale</b>: formato <c>{prefisso}{anno}/{N:0000}</c> (es. <c>FT2026/0007</c>).
///   In uso si considera solo N estratto dal suffisso <c>{anno}/NNNN</c>: la serie
///   riparte da 1 ogni anno.</item>
///   <item><b>Continua</b>: formato <c>{prefisso}{N}</c> (es. <c>FT7</c>). Si rimuove la
///   prima occorrenza del prefisso e si tiene il resto se è tutto cifre.</item>
/// </list>
///
/// Il prefisso per <c>tipo</c> è letto dal JSON <c>azienda.numero_prefissi</c>
/// (mappa { "fatture": "FT", "ddt": "DDT", ... }), default vuoto.
/// </summary>
public sealed class NumerazioneService
{
    /// <summary>
    /// Prossimo numero libero per il documento <paramref name="tipo"/>, leggendo i
    /// numeri già usati dalla tabella <paramref name="table"/>. Apre e chiude una
    /// connessione propria: usare l'overload con transazione quando si genera il
    /// numero dentro l'INSERT del documento (evita race e dirty reads).
    /// </summary>
    /// <param name="tipo">Chiave del prefisso in <c>numero_prefissi</c> (es. "fatture").</param>
    /// <param name="table">Nome tabella dei documenti (es. "fatture"). Mai input utente.</param>
    /// <param name="offset">Quanti numeri liberi saltare (default 0 = il primo libero).</param>
    public string GetNextNumero(string tipo, string table, long offset = 0)
    {
        using var conn = Db.Open();
        return GetNextNumero(conn, null, tipo, table, offset);
    }

    /// <summary>
    /// Variante transazionale: usa la connessione/transazione fornite dal chiamante
    /// così il numero generato è coerente con le scritture nella stessa unità di lavoro.
    /// </summary>
    public string GetNextNumero(
        SqliteConnection conn,
        SqliteTransaction? tx,
        string tipo,
        string table,
        long offset = 0)
    {
        if (string.IsNullOrEmpty(table))
            throw new ArgumentException("Nome tabella mancante", nameof(table));

        // Impostazioni azienda (singleton id=1). Se mancano: annuale + nessun prefisso.
        var settings = conn.QuerySingleOrDefault<AziendaNumSettings>(
            """
            SELECT COALESCE(numerazione_annuale, 1) AS Annuale,
                   numero_prefissi                  AS PrefissiJson
            FROM azienda WHERE id = 1
            """, transaction: tx);

        var annuale = settings is null || settings.Annuale != 0;
        var prefisso = ExtractPrefisso(settings?.PrefissiJson, tipo);
        var anno = DateTime.Now.Year; // parità con web::anno()/new Date().getFullYear()

        // Numeri già in uso (estratti dalla colonna `numero` della tabella reale).
        // `table` è una costante interna del codice, mai input utente: interpolazione
        // sicura (i parametri non possono nominare identificatori di tabella in SQLite).
        var numeri = conn.Query<string?>(
            $"SELECT numero FROM \"{SanitizeIdentifier(table)}\"", transaction: tx);

        var used = new HashSet<long>();
        var annoSlash = $"{anno}/";
        foreach (var raw in numeri)
        {
            var s = raw ?? string.Empty;
            if (annuale)
            {
                // Estrae N dal suffisso "...{anno}/NNNN" (ultima occorrenza di "{anno}/").
                var pos = s.LastIndexOf(annoSlash, StringComparison.Ordinal);
                if (pos < 0) continue;
                var tail = s[(pos + annoSlash.Length)..];
                if (IsAllAsciiDigits(tail)
                    && long.TryParse(tail, NumberStyles.None, CultureInfo.InvariantCulture, out var n))
                    used.Add(n);
            }
            else
            {
                // Rimuove la PRIMA occorrenza del prefisso (come String.replace in JS), poi ^\d+$.
                string stripped;
                if (prefisso.Length == 0)
                {
                    stripped = s;
                }
                else
                {
                    var pos = s.IndexOf(prefisso, StringComparison.Ordinal);
                    stripped = pos < 0 ? s : s.Remove(pos, prefisso.Length);
                }
                if (IsAllAsciiDigits(stripped)
                    && long.TryParse(stripped, NumberStyles.None, CultureInfo.InvariantCulture, out var n))
                    used.Add(n);
            }
        }

        // Primo numero libero, saltando i primi `offset` liberi.
        var num = 1L;
        var skipped = 0L;
        while (used.Contains(num) || skipped < offset)
        {
            if (!used.Contains(num))
                skipped++;
            num++;
        }

        return annuale
            ? $"{prefisso}{anno}/{num:D4}"
            : $"{prefisso}{num}";
    }

    /// <summary>
    /// Legge dal JSON <c>numero_prefissi</c> il prefisso per <paramref name="tipo"/>.
    /// JSON malformato o chiave assente → stringa vuota (parità col fallback Rust).
    /// </summary>
    private static string ExtractPrefisso(string? prefissiJson, string tipo)
    {
        if (string.IsNullOrWhiteSpace(prefissiJson)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(prefissiJson);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty(tipo, out var v)
                && v.ValueKind == JsonValueKind.String)
                return v.GetString() ?? string.Empty;
        }
        catch (JsonException)
        {
            // JSON non valido: nessun prefisso (come and_then(...).ok() in Rust).
        }
        return string.Empty;
    }

    /// <summary>True solo se la stringa è non vuota e composta da sole cifre ASCII 0-9.</summary>
    private static bool IsAllAsciiDigits(string s)
    {
        if (s.Length == 0) return false;
        foreach (var c in s)
            if (c is < '0' or > '9') return false;
        return true;
    }

    /// <summary>
    /// Difesa in profondità: i nomi tabella sono costanti interne, ma evitiamo
    /// comunque che un identificatore con virgolette possa rompere/iniettare SQL.
    /// </summary>
    private static string SanitizeIdentifier(string table) => table.Replace("\"", "\"\"");

    /// <summary>Proiezione minima delle impostazioni azienda usate per la numerazione.</summary>
    private sealed class AziendaNumSettings
    {
        public long Annuale { get; init; }
        public string? PrefissiJson { get; init; }
    }
}

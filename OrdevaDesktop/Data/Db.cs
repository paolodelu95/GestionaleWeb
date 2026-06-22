using System;
using System.IO;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Services;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso unico al database SQLite. Niente server, niente porta: la app apre
/// direttamente il file ~/Documenti/Ordeva/ordeva.db. Alla prima apertura, se il
/// file non esiste ma ci sono i dati della vecchia app (Tauri), li importa.
/// </summary>
public static class Db
{
    private static bool _ready;
    private static readonly object _gate = new();

    /// <summary>Apre una connessione pronta all'uso (WAL, foreign_keys).</summary>
    public static SqliteConnection Open()
    {
        EnsureReady();
        var conn = new SqliteConnection($"Data Source={AppPaths.DbPath}");
        conn.Open();
        using (var pragma = conn.CreateCommand())
        {
            pragma.CommandText = "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;";
            pragma.ExecuteNonQuery();
        }
        return conn;
    }

    /// <summary>Crea/importa il database una sola volta (thread-safe).</summary>
    private static void EnsureReady()
    {
        if (_ready) return;
        lock (_gate)
        {
            if (_ready) return;

            if (!File.Exists(AppPaths.DbPath))
            {
                var legacy = AppPaths.LegacyTauriDbPath;
                if (legacy != null)
                    ImportLegacy(legacy, AppPaths.DbPath);
                else
                    CreateEmpty(AppPaths.DbPath);
            }
            _ready = true;
        }
    }

    /// <summary>
    /// Importa i dati della vecchia app con VACUUM INTO: produce un singolo file
    /// pulito, fondendo anche eventuali transazioni nel WAL. Non tocca l'originale.
    /// </summary>
    private static void ImportLegacy(string legacy, string dest)
    {
        using var src = new SqliteConnection($"Data Source={legacy};Mode=ReadWrite");
        src.Open();
        using var cmd = src.CreateCommand();
        cmd.CommandText = "VACUUM INTO $dest";
        cmd.Parameters.AddWithValue("$dest", dest);
        cmd.ExecuteNonQuery();
    }

    /// <summary>Installazione pulita: crea il file e applica lo schema incluso.</summary>
    private static void CreateEmpty(string dest)
    {
        using var conn = new SqliteConnection($"Data Source={dest}");
        conn.Open();
        var schema = LoadSchema();
        if (!string.IsNullOrWhiteSpace(schema))
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = schema;
            cmd.ExecuteNonQuery();
        }
    }

    /// <summary>Lo schema delle tabelle, incluso come risorsa accanto all'eseguibile.</summary>
    private static string LoadSchema()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Data", "schema.sql");
        return File.Exists(path) ? File.ReadAllText(path) : string.Empty;
    }
}

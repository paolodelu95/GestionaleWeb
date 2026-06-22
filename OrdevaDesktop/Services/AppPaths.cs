using System;
using System.IO;

namespace Ordeva.Desktop.Services;

/// <summary>
/// Percorsi dei dati dell'applicazione. A differenza della vecchia edizione Tauri
/// (che teneva il database in una cartella di sistema nascosta), qui i dati stanno
/// in una cartella NORMALE e visibile: ~/Documenti/Ordeva. L'utente la apre dal
/// Finder/Explorer, la copia, la mette su un disco esterno: come un programma vero.
/// </summary>
public static class AppPaths
{
    /// <summary>Cartella dati visibile: Documenti/Ordeva (creata se assente).</summary>
    public static string DataDir
    {
        get
        {
            var docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            var dir = Path.Combine(docs, "Ordeva");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    /// <summary>Il database SQLite unico dell'applicazione (un solo file, portabile).</summary>
    public static string DbPath => Path.Combine(DataDir, "ordeva.db");

    /// <summary>
    /// Posizione del database della VECCHIA app (Tauri), per importare i dati esistenti
    /// alla prima apertura. Tenant unico "default".
    /// </summary>
    public static string? LegacyTauriDbPath
    {
        get
        {
            string baseDir;
            if (OperatingSystem.IsMacOS())
                baseDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Library", "Application Support", "it.ordeva.desktop");
            else if (OperatingSystem.IsWindows())
                baseDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "it.ordeva.desktop");
            else // Linux
                baseDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".local", "share", "it.ordeva.desktop");

            var legacy = Path.Combine(baseDir, "data", "tenants", "default.db");
            return File.Exists(legacy) ? legacy : null;
        }
    }
}

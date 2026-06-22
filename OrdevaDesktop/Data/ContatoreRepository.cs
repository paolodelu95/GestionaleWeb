using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per i contatori di numerazione (tabella <c>contatori</c>, chiave
/// composta tipo+anno). La colonna DB si chiama <c>contatore</c> ed è mappata su
/// <see cref="Contatore.Valore"/> per non collidere col nome del tipo.
///
/// L'incremento usa un UPSERT atomico (INSERT ... ON CONFLICT ... DO UPDATE) sulla
/// PK (tipo, anno): la prima volta crea la riga a 1, poi somma. Tutto in un'unica
/// query così è sicuro anche con accessi concorrenti.
/// </summary>
public sealed class ContatoreRepository
{
    // Alias snake_case → PascalCase. La colonna "contatore" diventa Valore.
    private const string SelectColumns =
        "tipo            AS Tipo, " +
        "anno            AS Anno, " +
        "COALESCE(contatore, 0) AS Valore";

    /// <summary>Tutti i contatori, ordinati per (tipo, anno).</summary>
    public List<Contatore> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Contatore>(
            $"SELECT {SelectColumns} FROM contatori ORDER BY tipo, anno").ToList();
    }

    /// <summary>Valore corrente per (tipo, anno), oppure 0 se la riga non esiste ancora.</summary>
    public int GetValore(string tipo, int anno)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<int?>(
            "SELECT contatore FROM contatori WHERE tipo = @tipo AND anno = @anno",
            new { tipo, anno }) ?? 0;
    }

    /// <summary>La riga contatore per (tipo, anno), o null se non esiste.</summary>
    public Contatore? Get(string tipo, int anno)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Contatore>(
            $"SELECT {SelectColumns} FROM contatori WHERE tipo = @tipo AND anno = @anno",
            new { tipo, anno });
    }

    /// <summary>
    /// Incrementa di 1 il contatore per (tipo, anno) e restituisce il nuovo valore.
    /// UPSERT atomico: crea la riga a 1 se mancante, altrimenti somma 1. RETURNING
    /// evita una seconda query di lettura.
    /// </summary>
    public int Increment(string tipo, int anno)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<int>(
            @"INSERT INTO contatori (tipo, anno, contatore) VALUES (@tipo, @anno, 1)
              ON CONFLICT(tipo, anno) DO UPDATE SET contatore = contatore + 1
              RETURNING contatore;",
            new { tipo, anno });
    }

    /// <summary>
    /// Forza il valore del contatore per (tipo, anno) (UPSERT). Usato per riallineare
    /// la numerazione (es. import dati). Crea la riga se non esiste.
    /// </summary>
    public void Set(string tipo, int anno, int valore)
    {
        using var conn = Db.Open();
        conn.Execute(
            @"INSERT INTO contatori (tipo, anno, contatore) VALUES (@tipo, @anno, @valore)
              ON CONFLICT(tipo, anno) DO UPDATE SET contatore = excluded.contatore;",
            new { tipo, anno, valore });
    }
}

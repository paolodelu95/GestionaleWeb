using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD per la tabella unita_misura. Porta la logica di routes/unita_misura.rs:
/// lista ordinata per nome; in insert/update il simbolo, se vuoto, ricade sul nome.
/// Tutte le connessioni passano da Db.Open().
/// </summary>
public sealed class UnitaMisuraRepository
{
    /// <summary>Tutte le unità di misura, ordinate per nome (come il backend).</summary>
    public IReadOnlyList<UnitaMisura> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<UnitaMisura>(
            @"SELECT id                     AS Id,
                     COALESCE(nome, '')     AS Nome,
                     COALESCE(simbolo, '')  AS Simbolo
              FROM unita_misura
              ORDER BY nome").ToList();
    }

    /// <summary>Singola unità di misura per id, oppure null se assente.</summary>
    public UnitaMisura? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<UnitaMisura>(
            @"SELECT id                     AS Id,
                     COALESCE(nome, '')     AS Nome,
                     COALESCE(simbolo, '')  AS Simbolo
              FROM unita_misura
              WHERE id = @id",
            new { id });
    }

    /// <summary>Inserisce e ritorna l'id generato. Imposta l'Id sul modello passato.</summary>
    public long Insert(UnitaMisura um)
    {
        var nome = (um.Nome ?? string.Empty).Trim();
        var simbolo = NormalizeSimbolo(um.Simbolo, nome);

        using var conn = Db.Open();
        var id = conn.ExecuteScalar<long>(
            @"INSERT INTO unita_misura (nome, simbolo)
              VALUES (@nome, @simbolo);
              SELECT last_insert_rowid();",
            new { nome, simbolo });

        um.Id = id;
        um.Nome = nome;
        um.Simbolo = simbolo;
        return id;
    }

    /// <summary>Aggiorna un record esistente. Ritorna le righe modificate.</summary>
    public int Update(UnitaMisura um)
    {
        var nome = (um.Nome ?? string.Empty).Trim();
        var simbolo = NormalizeSimbolo(um.Simbolo, nome);

        using var conn = Db.Open();
        var n = conn.Execute(
            @"UPDATE unita_misura
              SET nome = @nome, simbolo = @simbolo
              WHERE id = @id",
            new { nome, simbolo, id = um.Id });

        um.Nome = nome;
        um.Simbolo = simbolo;
        return n;
    }

    /// <summary>Elimina per id. Ritorna le righe eliminate.</summary>
    public int Delete(long id)
    {
        using var conn = Db.Open();
        return conn.Execute("DELETE FROM unita_misura WHERE id = @id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica query (niente loop). Righe eliminate.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToArray();
        if (list.Length == 0) return 0;

        using var conn = Db.Open();
        return conn.Execute("DELETE FROM unita_misura WHERE id IN @ids", new { ids = list });
    }

    /// <summary>Replica str_or del backend: simbolo vuoto -> usa il nome.</summary>
    private static string NormalizeSimbolo(string? simbolo, string nome)
    {
        var s = (simbolo ?? string.Empty).Trim();
        return s.Length > 0 ? s : nome;
    }
}

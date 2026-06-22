using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD dell'anagrafica fornitori con Dapper. Porta la logica del backend Rust
/// (routes/fornitori.rs + gemello.rs):
/// <list type="bullet">
///   <item>ragione sociale obbligatoria;</item>
///   <item>P.IVA normalizzata + controllo duplicati (con eventuale prefisso "IT");</item>
///   <item>doppio ruolo "anche cliente": dopo ogni insert/update si allinea il record
///         gemello nella tabella <c>clienti</c> (<c>applica_da_fornitore</c>); prima
///         del delete lo si scollega (<c>scollega_fornitore</c>).</item>
/// </list>
/// </summary>
public sealed class FornitoreRepository
{
    // Alias snake_case → PascalCase. Riusato da GetAll e GetById.
    private const string Columns = @"
        id                   AS Id,
        ragione_sociale      AS RagioneSociale,
        email                AS Email,
        telefono             AS Telefono,
        cellulare            AS Cellulare,
        via                  AS Via,
        cap                  AS Cap,
        citta                AS Citta,
        provincia            AS Provincia,
        stato                AS Stato,
        p_iva                AS PIva,
        sdi                  AS Sdi,
        pec                  AS Pec,
        estero               AS Estero,
        anche_cliente        AS AncheCliente,
        cliente_collegato_id AS ClienteCollegatoId";

    // Campi condivisi col gemello cliente (ordine = SHARED del backend).
    private static readonly string[] Shared =
    {
        "ragione_sociale", "email", "telefono", "cellulare", "via", "cap",
        "citta", "provincia", "stato", "p_iva", "sdi", "pec",
    };

    /// <summary>Tutti i fornitori ordinati per ragione sociale.</summary>
    public List<Fornitore> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Fornitore>(
            $"SELECT {Columns} FROM fornitori ORDER BY ragione_sociale").ToList();
    }

    /// <summary>Dettaglio per id (null se non esiste).</summary>
    public Fornitore? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Fornitore>(
            $"SELECT {Columns} FROM fornitori WHERE id = @id", new { id });
    }

    /// <summary>
    /// Inserisce un fornitore e restituisce l'id. Valida la ragione sociale,
    /// normalizza la P.IVA, blocca i duplicati e allinea il gemello cliente.
    /// </summary>
    /// <exception cref="ArgumentException">Ragione sociale vuota.</exception>
    /// <exception cref="DuplicatePivaException">Esiste già un fornitore con quella P.IVA.</exception>
    public long Insert(Fornitore f)
    {
        if (string.IsNullOrWhiteSpace(f.RagioneSociale))
            throw new ArgumentException("La ragione sociale è obbligatoria");

        var piva = NormalizePiva(f.PIva);

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (piva.Length > 0 && FindByPiva(conn, tx, piva, null) is long dup)
            throw new DuplicatePivaException(
                $"Esiste già un fornitore con la P.IVA {piva}", dup);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO fornitori
              (ragione_sociale, email, telefono, cellulare, via, cap, citta,
               provincia, stato, p_iva, sdi, pec, estero, anche_cliente)
            VALUES
              (@RagioneSociale, @Email, @Telefono, @Cellulare, @Via, @Cap, @Citta,
               @Provincia, @Stato, @PIva, @Sdi, @Pec, @Estero, @AncheCliente);
            SELECT last_insert_rowid();", Bind(f, piva), tx);

        ApplicaDaFornitore(conn, tx, id);

        tx.Commit();
        return id;
    }

    /// <summary>Aggiorna un fornitore esistente (stesse regole di <see cref="Insert"/>).</summary>
    public void Update(Fornitore f)
    {
        if (f.Id is not long id)
            throw new ArgumentException("Id mancante per l'aggiornamento");
        if (string.IsNullOrWhiteSpace(f.RagioneSociale))
            throw new ArgumentException("La ragione sociale è obbligatoria");

        var piva = NormalizePiva(f.PIva);

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (piva.Length > 0 && FindByPiva(conn, tx, piva, id) is long dup)
            throw new DuplicatePivaException(
                $"Esiste già un altro fornitore con la P.IVA {piva}", dup);

        conn.Execute(@"
            UPDATE fornitori SET
              ragione_sociale=@RagioneSociale, email=@Email, telefono=@Telefono,
              cellulare=@Cellulare, via=@Via, cap=@Cap, citta=@Citta,
              provincia=@Provincia, stato=@Stato, p_iva=@PIva, sdi=@Sdi, pec=@Pec,
              estero=@Estero, anche_cliente=@AncheCliente
            WHERE id=@Id", Bind(f, piva, id), tx);

        ApplicaDaFornitore(conn, tx, id);

        tx.Commit();
    }

    /// <summary>
    /// Elimina un fornitore, staccando prima l'eventuale gemello cliente
    /// (porta <c>scollega_fornitore</c>).
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        DeleteCore(conn, tx, id);
        tx.Commit();
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            DeleteCore(conn, tx, id);
        tx.Commit();
        return list.Count;
    }

    // ── helper privati ──────────────────────────────────────────────────────────

    private static void DeleteCore(SqliteConnection conn, SqliteTransaction tx, long id)
    {
        // scollega_fornitore: stacca il gemello cliente prima di cancellare.
        conn.Execute(
            "UPDATE clienti SET anche_fornitore=0, fornitore_collegato_id=NULL WHERE fornitore_collegato_id=@id",
            new { id }, tx);
        conn.Execute("DELETE FROM fornitori WHERE id=@id", new { id }, tx);
    }

    /// <summary>
    /// Cerca un fornitore con la stessa P.IVA (anche col prefisso "IT"),
    /// escludendone uno opzionale. Restituisce l'id del duplicato o null.
    /// </summary>
    private static long? FindByPiva(SqliteConnection conn, SqliteTransaction tx, string clean, long? exclude)
    {
        var it = $"IT{clean}";
        return exclude is long ex
            ? conn.QuerySingleOrDefault<long?>(
                "SELECT id FROM fornitori WHERE (p_iva=@clean OR p_iva=@it) AND id!=@ex",
                new { clean, it, ex }, tx)
            : conn.QuerySingleOrDefault<long?>(
                "SELECT id FROM fornitori WHERE p_iva=@clean OR p_iva=@it",
                new { clean, it }, tx);
    }

    /// <summary>
    /// Allinea il gemello CLIENTE dopo create/update di un fornitore
    /// (porta <c>applica_da_fornitore</c> di gemello.rs).
    /// </summary>
    private static void ApplicaDaFornitore(SqliteConnection conn, SqliteTransaction tx, long fornitoreId)
    {
        var sharedSel = string.Join(", ", Shared);
        var f = conn.QuerySingleOrDefault(
            $"SELECT {sharedSel}, anche_cliente AS AncheCliente, cliente_collegato_id AS ClienteCollegatoId " +
            "FROM fornitori WHERE id=@fornitoreId", new { fornitoreId }, tx);
        if (f is null) return;

        var row = (IDictionary<string, object?>)f;
        var vals = Shared.Select(c => (row[c] as string) ?? string.Empty).ToList();
        var anche = Convert.ToInt64(row["AncheCliente"] ?? 0L) != 0;
        long? collegato = row["ClienteCollegatoId"] is null ? null : Convert.ToInt64(row["ClienteCollegatoId"]);

        if (anche)
        {
            var piva = vals[9]; // p_iva è il decimo campo condiviso

            // Cliente già collegato e ancora esistente?
            long? cid = collegato is long cl
                ? conn.QuerySingleOrDefault<long?>(
                    "SELECT id FROM clienti WHERE id=@cl", new { cl }, tx)
                : null;

            // Altrimenti riusa un cliente libero con la stessa P.IVA.
            if (cid is null && ValidPiva(piva))
            {
                cid = conn.QuerySingleOrDefault<long?>(
                    "SELECT id FROM clienti WHERE (p_iva=@piva OR p_iva=@itPiva) " +
                    "AND (fornitore_collegato_id IS NULL OR fornitore_collegato_id=@fornitoreId) LIMIT 1",
                    new { piva, itPiva = $"IT{piva}", fornitoreId }, tx);
            }

            var setClause = string.Join(", ", Shared.Select(c => $"{c}=@{c}"));
            var p = SharedParams(vals);

            long clienteId;
            if (cid is long existing)
            {
                p.Add("fornitoreId", fornitoreId);
                p.Add("id", existing);
                conn.Execute(
                    $"UPDATE clienti SET {setClause}, anche_fornitore=1, fornitore_collegato_id=@fornitoreId WHERE id=@id",
                    p, tx);
                clienteId = existing;
            }
            else
            {
                var cols = string.Join(", ", Shared);
                var ph = string.Join(", ", Shared.Select(c => $"@{c}"));
                p.Add("fornitoreId", fornitoreId);
                clienteId = conn.ExecuteScalar<long>(
                    $"INSERT INTO clienti ({cols}, anche_fornitore, fornitore_collegato_id) " +
                    $"VALUES ({ph}, 1, @fornitoreId); SELECT last_insert_rowid();",
                    p, tx);
            }

            conn.Execute(
                "UPDATE fornitori SET cliente_collegato_id=@clienteId WHERE id=@fornitoreId",
                new { clienteId, fornitoreId }, tx);
        }
        else if (collegato is long cid2)
        {
            conn.Execute(
                "UPDATE clienti SET anche_fornitore=0, fornitore_collegato_id=NULL WHERE id=@cid2",
                new { cid2 }, tx);
            conn.Execute(
                "UPDATE fornitori SET cliente_collegato_id=NULL WHERE id=@fornitoreId",
                new { fornitoreId }, tx);
        }
    }

    /// <summary>Costruisce i parametri @ragione_sociale.. per i 12 campi condivisi.</summary>
    private static DynamicParameters SharedParams(List<string> vals)
    {
        var p = new DynamicParameters();
        for (var i = 0; i < Shared.Length; i++)
            p.Add(Shared[i], vals[i]);
        return p;
    }

    /// <summary>P.IVA valida = 11 cifre numeriche (per il match del gemello).</summary>
    private static bool ValidPiva(string p) => p.Length == 11 && p.All(char.IsAsciiDigit);

    /// <summary>normalizePiva: rimuove spazi, uppercase, scarta il prefisso "IT".</summary>
    public static string NormalizePiva(string? piva)
    {
        if (string.IsNullOrEmpty(piva)) return string.Empty;
        var v = new string(piva.Where(c => !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();
        return v.StartsWith("IT", StringComparison.Ordinal) ? v[2..] : v;
    }

    /// <summary>Parametri per INSERT/UPDATE. La P.IVA passata è già normalizzata.</summary>
    private static object Bind(Fornitore f, string piva, long? id = null) => new
    {
        Id = id ?? f.Id,
        f.RagioneSociale,
        f.Email,
        f.Telefono,
        f.Cellulare,
        f.Via,
        f.Cap,
        f.Citta,
        f.Stato,
        f.Provincia,
        PIva = piva,
        f.Sdi,
        f.Pec,
        Estero = f.Estero ? 1 : 0,
        AncheCliente = f.AncheCliente ? 1 : 0,
    };
}

/// <summary>
/// Sollevata quando si tenta di salvare un fornitore con una P.IVA già presente.
/// <see cref="DuplicateId"/> è l'id del fornitore in conflitto.
/// </summary>
public sealed class DuplicatePivaException : Exception
{
    public long DuplicateId { get; }
    public DuplicatePivaException(string message, long duplicateId) : base(message)
        => DuplicateId = duplicateId;
}

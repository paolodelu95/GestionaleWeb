using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD degli ordini con Dapper. Porta la logica del backend Rust
/// (routes/ordini.rs): unicità del numero, totali calcolati come
/// SUM(quantita*prezzo*(1-sconto/100)*(1+iva/100)), update che ricostruisce le
/// righe, conversione ordine→DDT (che NON movimenta il magazzino, come Node).
///
/// Ottimizzazione rispetto al backend: la lista calcola i totali con UNA GROUP BY
/// invece di due subquery per riga (il backend faceva 2 query per ogni ordine in
/// to_dto — un N+1). Il dettaglio carica le righe in una sola query.
/// </summary>
public sealed class OrdineRepository
{
    // Alias snake_case → PascalCase per la testata. Riusato da GetAll/GetById.
    // I totali arrivano dalla GROUP BY agganciata sotto (t.imponibile / t.totale).
    private const string OrdineSelect = @"
        SELECT o.id            AS Id,
               o.numero        AS Numero,
               o.data_ordine   AS DataOrdine,
               o.cliente_id    AS ClienteId,
               c.ragione_sociale AS ClienteNome,
               o.fornitore_id  AS FornitoreId,
               f.ragione_sociale AS FornitoreNome,
               o.acquisto_id   AS AcquistoId,
               a.numero        AS AcquistoNumero,
               o.tipo          AS Tipo,
               o.stato         AS Stato,
               o.note          AS Note,
               COALESCE(t.imponibile, 0) AS Imponibile,
               COALESCE(t.totale, 0)     AS Totale
        FROM ordini o
        LEFT JOIN clienti    c ON o.cliente_id = c.id
        LEFT JOIN fornitori  f ON o.fornitore_id = f.id
        LEFT JOIN acquisti   a ON o.acquisto_id = a.id
        LEFT JOIN (
            SELECT ordine_id,
                   SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0))                       AS imponibile,
                   SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + iva/100.0))      AS totale
            FROM ordini_righe
            GROUP BY ordine_id
        ) t ON t.ordine_id = o.id";

    private const string RigaSelect = @"
        SELECT r.id              AS Id,
               r.ordine_id       AS OrdineId,
               r.prodotto_id     AS ProdottoId,
               p.nome            AS ProdottoNome,
               r.codice_prodotto AS CodiceProdotto,
               r.codice_fornitore AS CodiceFornitore,
               r.descrizione     AS Descrizione,
               r.quantita        AS Quantita,
               r.unita_misura    AS UnitaMisura,
               r.prezzo          AS Prezzo,
               r.sconto          AS Sconto,
               r.iva             AS Iva,
               r.variante_id     AS VarianteId,
               r.variante_taglia AS VarianteTaglia,
               r.variante_colore AS VarianteColore,
               r.tipo            AS Tipo
        FROM ordini_righe r
        LEFT JOIN prodotti p ON r.prodotto_id = p.id";

    /// <summary>
    /// Tutti gli ordini, opzionalmente filtrati per tipo ("CLIENTE"/"FORNITORE"),
    /// ordinati per data discendente (come il backend). Le righe NON sono caricate
    /// in lista (servono solo nel dettaglio).
    /// </summary>
    public List<Ordine> GetAll(string? tipo = null)
    {
        using var conn = Db.Open();
        var where = string.IsNullOrWhiteSpace(tipo) ? "" : " WHERE o.tipo = @tipo";
        return conn.Query<Ordine>(
            $"{OrdineSelect}{where} ORDER BY o.data_ordine DESC",
            new { tipo }).ToList();
    }

    /// <summary>Dettaglio completo: testata + righe (con nome prodotto), in due query.</summary>
    public Ordine? GetById(long id)
    {
        using var conn = Db.Open();
        var o = conn.QuerySingleOrDefault<Ordine>(
            $"{OrdineSelect} WHERE o.id = @id", new { id });
        if (o == null) return null;

        o.Righe = conn.Query<OrdineRiga>(
            $"{RigaSelect} WHERE r.ordine_id = @id ORDER BY r.id", new { id }).ToList();
        return o;
    }

    /// <summary>
    /// Inserisce un ordine e le sue righe in transazione. Verifica l'unicità del
    /// numero (409 nel backend). Restituisce l'id creato.
    /// </summary>
    public long Insert(Ordine o)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (NumeroEsiste(conn, tx, o.Numero, null))
            throw new InvalidOperationException($"Il numero {o.Numero} è già utilizzato da un altro documento");

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO ordini (numero, data_ordine, cliente_id, fornitore_id, tipo, stato, note, acquisto_id)
            VALUES (@Numero, @DataOrdine, @ClienteId, @FornitoreId, @Tipo, @Stato, @Note, @AcquistoId);
            SELECT last_insert_rowid();",
            new
            {
                o.Numero,
                o.DataOrdine,
                ClienteId = NullIfZero(o.ClienteId),
                FornitoreId = NullIfZero(o.FornitoreId),
                Tipo = string.IsNullOrEmpty(o.Tipo) ? "CLIENTE" : o.Tipo,
                Stato = string.IsNullOrEmpty(o.Stato) ? "APERTO" : o.Stato,
                o.Note,
                AcquistoId = NullIfZero(o.AcquistoId),
            }, tx);

        SaveRighe(conn, tx, id, o.Righe);
        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna la testata e ricostruisce le righe (DELETE + INSERT, come il
    /// backend). Verifica l'unicità del numero escludendo l'ordine stesso.
    /// </summary>
    public void Update(Ordine o)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (NumeroEsiste(conn, tx, o.Numero, o.Id))
            throw new InvalidOperationException($"Il numero {o.Numero} è già utilizzato da un altro documento");

        conn.Execute(@"
            UPDATE ordini SET
              numero=@Numero, data_ordine=@DataOrdine, cliente_id=@ClienteId,
              fornitore_id=@FornitoreId, tipo=@Tipo, stato=@Stato, note=@Note
            WHERE id=@Id",
            new
            {
                o.Id,
                o.Numero,
                o.DataOrdine,
                ClienteId = NullIfZero(o.ClienteId),
                FornitoreId = NullIfZero(o.FornitoreId),
                o.Tipo,
                o.Stato,
                o.Note,
            }, tx);

        conn.Execute("DELETE FROM ordini_righe WHERE ordine_id=@Id", new { o.Id }, tx);
        SaveRighe(conn, tx, o.Id, o.Righe);
        tx.Commit();
    }

    /// <summary>Cambia solo lo stato di un ordine (patch_stato del backend).</summary>
    public void SetStato(long id, string stato)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE ordini SET stato=@stato WHERE id=@id", new { id, stato });
    }

    /// <summary>Cambia lo stato di più ordini in un'unica transazione (azione in blocco).</summary>
    public int SetStatoMany(IEnumerable<long> ids, string stato)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        // Singola UPDATE ... IN (...) invece di un giro per id.
        var n = conn.Execute(
            "UPDATE ordini SET stato=@stato WHERE id IN @ids",
            new { stato, ids = list }, tx);
        tx.Commit();
        return n;
    }

    /// <summary>Numero di ordini ancora aperti (count_aperti del backend).</summary>
    public int CountAperti()
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<int>("SELECT COUNT(*) FROM ordini WHERE stato='APERTO'");
    }

    /// <summary>Elimina un ordine; le righe vanno via in CASCADE.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM ordini WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        var n = conn.Execute("DELETE FROM ordini WHERE id IN @ids", new { ids = list }, tx);
        tx.Commit();
        return n;
    }

    /// <summary>
    /// Converte un ordine CLIENTE in DDT (stato EMESSO) e porta l'ordine a EVASO.
    /// NON movimenta il magazzino (parità con Node/Rust). Numerazione DDT
    /// progressiva per anno corrente, come get_next_numero(ddt). Restituisce
    /// l'id e il numero del DDT creato.
    /// </summary>
    public (long Id, string Numero) ToDdt(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var ord = conn.QuerySingleOrDefault<(string? Tipo, long? ClienteId, string? Numero)>(
            "SELECT tipo AS Tipo, cliente_id AS ClienteId, numero AS Numero FROM ordini WHERE id=@id",
            new { id }, tx);

        if (ord.Tipo == null && ord.ClienteId == null && ord.Numero == null)
            throw new InvalidOperationException("Ordine non trovato");
        if (ord.Tipo != "CLIENTE")
            throw new InvalidOperationException("Solo gli ordini cliente possono essere convertiti in documento di trasporto");

        var righe = conn.Query<OrdineRiga>(
            $"{RigaSelect} WHERE r.ordine_id = @id ORDER BY r.id", new { id }, tx).ToList();

        var numero = NextNumeroDdt(conn, tx);
        var data = DateTime.Now.ToString("yyyy-MM-dd");

        var ddtId = conn.ExecuteScalar<long>(@"
            INSERT INTO ddt (numero, data_emissione, cliente_id, causale, stato)
            VALUES (@numero, @data, @clienteId, @causale, 'EMESSO');
            SELECT last_insert_rowid();",
            new { numero, data, clienteId = ord.ClienteId, causale = $"Da ordine n. {ord.Numero}" }, tx);

        foreach (var r in righe)
        {
            conn.Execute(@"
                INSERT INTO ddt_righe
                  (ddt_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva,
                   unita_misura, variante_id, variante_taglia, variante_colore)
                VALUES
                  (@ddtId, @ProdottoId, @Descrizione, @Quantita, @Prezzo, @Sconto, @Iva,
                   @UnitaMisura, @VarianteId, @VarianteTaglia, @VarianteColore)",
                new
                {
                    ddtId,
                    ProdottoId = NullIfZero(r.ProdottoId),
                    r.Descrizione,
                    r.Quantita,
                    r.Prezzo,
                    r.Sconto,
                    r.Iva,
                    r.UnitaMisura,
                    VarianteId = NullIfZero(r.VarianteId),
                    r.VarianteTaglia,
                    r.VarianteColore,
                }, tx);
        }

        conn.Execute("UPDATE ordini SET stato='EVASO' WHERE id=@id", new { id }, tx);
        tx.Commit();
        return (ddtId, numero);
    }

    // ── helper privati ────────────────────────────────────────────────────────

    private static bool NumeroEsiste(SqliteConnection conn, SqliteTransaction tx, string numero, long? exceptId)
    {
        var sql = exceptId is null
            ? "SELECT EXISTS(SELECT 1 FROM ordini WHERE numero=@numero)"
            : "SELECT EXISTS(SELECT 1 FROM ordini WHERE numero=@numero AND id!=@id)";
        return conn.ExecuteScalar<long>(sql, new { numero, id = exceptId }, tx) != 0;
    }

    private static void SaveRighe(SqliteConnection conn, SqliteTransaction tx, long ordineId, List<OrdineRiga> righe)
    {
        var list = righe.Where(r => r != null).ToList();
        if (list.Count == 0) return;

        foreach (var r in list)
        {
            conn.Execute(@"
                INSERT INTO ordini_righe
                  (ordine_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo,
                   sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore,
                   tipo, codice_fornitore)
                VALUES
                  (@ordineId, @ProdottoId, @CodiceProdotto, @Descrizione, @Quantita, @Prezzo,
                   @Sconto, @Iva, @UnitaMisura, @VarianteId, @VarianteTaglia, @VarianteColore,
                   @Tipo, @CodiceFornitore)",
                new
                {
                    ordineId,
                    ProdottoId = NullIfZero(r.ProdottoId),
                    r.CodiceProdotto,
                    r.Descrizione,
                    r.Quantita,
                    r.Prezzo,
                    r.Sconto,
                    r.Iva,
                    r.UnitaMisura,
                    VarianteId = NullIfZero(r.VarianteId),
                    r.VarianteTaglia,
                    r.VarianteColore,
                    Tipo = string.IsNullOrEmpty(r.Tipo) ? "PRODOTTO" : r.Tipo,
                    r.CodiceFornitore,
                }, tx);
        }
    }

    /// <summary>
    /// Prossimo numero DDT per l'anno corrente. Usa la stessa convenzione
    /// semplificata adottata da <see cref="DdtRepository.ProssimoNumero"/> nel resto
    /// del port (max numerico + 1, numero "nudo"): così i DDT creati dalla
    /// conversione ordine→DDT proseguono la stessa serie di quelli creati a mano,
    /// senza format divergenti.
    /// </summary>
    private static string NextNumeroDdt(SqliteConnection conn, SqliteTransaction tx)
    {
        var max = conn.ExecuteScalar<long?>(
            @"SELECT MAX(CAST(numero AS INTEGER)) FROM ddt
              WHERE numero GLOB '[0-9]*' AND substr(data_emissione,1,4)=@anno",
            new { anno = DateTime.Now.Year.ToString() }, tx) ?? 0;
        return (max + 1).ToString();
    }

    /// <summary>0 (default Dapper per FK non valorizzate) → NULL: non vogliamo FK a id=0.</summary>
    private static long? NullIfZero(long? v) => v is null or 0 ? null : v;
}

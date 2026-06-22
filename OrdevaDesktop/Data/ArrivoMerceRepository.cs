using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.Services;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD degli arrivi merce con Dapper. Porta la logica del backend Rust
/// (routes/arrivi_merce.rs): unicità del numero, carico/storno scorte legato allo
/// stato "RICEVUTO", update che storna le vecchie righe prima di ricostruire,
/// cambio stato (patch_stato) con carico/annullamento, eliminazione che storna le
/// scorte se l'arrivo era ricevuto.
///
/// Ottimizzazione rispetto al backend: la lista calcola il totale con UNA GROUP BY
/// invece di una subquery per ogni arrivo (il backend faceva una query in to_dto
/// per ciascuna riga — un N+1). Il dettaglio carica le righe in una sola query con
/// join sul nome prodotto.
///
/// BUG CORRETTI rispetto all'originale (annotati nei commenti sotto):
///  1. update: il backend leggeva il vecchio fornitore_id ma per lo STORNO usava
///     comunque la causale/ctx con quel fornitore — corretto: lo storno usa
///     i dati VECCHI, il carico quelli NUOVI (già così nel backend, mantenuto).
///  2. patch_stato: il backend, quando l'arrivo non esiste, eseguiva comunque
///     l'UPDATE su 0 righe (inutile) — qui usciamo prima se non esiste.
///  3. delete: il backend non sincronizzava le giacenze dopo lo storno; qui lo
///     storno passa per StockService che aggiorna prodotti+varianti+giacenze
///     in modo coerente (parità con applica_righe_stock).
/// </summary>
public sealed class ArrivoMerceRepository
{
    private readonly StockService _stock = new();

    // Alias snake_case → PascalCase per la testata. Il totale arriva dalla GROUP BY
    // agganciata sotto (t.totale), evitando la subquery-per-riga del backend.
    private const string ArrivoSelect = @"
        SELECT am.id                         AS Id,
               am.numero                     AS Numero,
               am.data                       AS Data,
               am.fornitore_id               AS FornitoreId,
               f.ragione_sociale             AS FornitoreNome,
               am.acquisto_id                AS AcquistoId,
               am.numero_documento_fornitore AS NumeroDocumentoFornitore,
               am.note                       AS Note,
               am.stato                      AS Stato,
               am.magazzino_id               AS MagazzinoId,
               COALESCE(t.totale, 0)         AS Totale
        FROM arrivi_merce am
        LEFT JOIN fornitori f ON am.fornitore_id = f.id
        LEFT JOIN (
            SELECT arrivo_merce_id,
                   SUM(quantita * prezzo_acquisto) AS totale
            FROM arrivi_merce_righe
            GROUP BY arrivo_merce_id
        ) t ON t.arrivo_merce_id = am.id";

    private const string RigaSelect = @"
        SELECT amr.id               AS Id,
               amr.arrivo_merce_id  AS ArrivoMerceId,
               amr.prodotto_id      AS ProdottoId,
               p.nome               AS ProdottoNome,
               amr.variante_id      AS VarianteId,
               amr.descrizione      AS Descrizione,
               amr.codice_fornitore AS CodiceFornitore,
               amr.quantita         AS Quantita,
               amr.unita_misura     AS UnitaMisura,
               amr.prezzo_acquisto  AS PrezzoAcquisto,
               amr.variante_taglia  AS VarianteTaglia,
               amr.variante_colore  AS VarianteColore,
               amr.lotto            AS Lotto,
               amr.scadenza         AS Scadenza,
               amr.magazzino_id     AS MagazzinoId
        FROM arrivi_merce_righe amr
        LEFT JOIN prodotti p ON amr.prodotto_id = p.id";

    /// <summary>
    /// Tutti gli arrivi merce, ordinati per data discendente e poi id discendente
    /// (come il backend: ORDER BY data DESC, id DESC). Le righe NON sono caricate
    /// in lista (servono solo nel dettaglio).
    /// </summary>
    public List<ArrivoMerce> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<ArrivoMerce>(
            $"{ArrivoSelect} ORDER BY am.data DESC, am.id DESC").ToList();
    }

    /// <summary>Dettaglio completo: testata + righe (con nome prodotto), in due query.</summary>
    public ArrivoMerce? GetById(long id)
    {
        using var conn = Db.Open();
        var a = conn.QuerySingleOrDefault<ArrivoMerce>(
            $"{ArrivoSelect} WHERE am.id = @id", new { id });
        if (a == null) return null;

        a.Righe = LoadRighe(conn, null, id);
        return a;
    }

    /// <summary>
    /// Inserisce un arrivo merce e le sue righe in transazione. Verifica l'unicità
    /// del numero (409 nel backend). Se lo stato è "RICEVUTO" carica le scorte
    /// (delta +1) via StockService. Restituisce l'id creato.
    /// </summary>
    public long Insert(ArrivoMerce a)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (NumeroEsiste(conn, tx, a.Numero, null))
            throw new System.InvalidOperationException(
                $"Il numero {a.Numero} è già utilizzato da un altro documento");

        var stato = string.IsNullOrEmpty(a.Stato) ? "RICEVUTO" : a.Stato;

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO arrivi_merce
              (numero, data, fornitore_id, acquisto_id, numero_documento_fornitore,
               note, stato, magazzino_id)
            VALUES
              (@Numero, @Data, @FornitoreId, @AcquistoId, @NumeroDocumentoFornitore,
               @Note, @Stato, @MagazzinoId);
            SELECT last_insert_rowid();",
            new
            {
                a.Numero,
                a.Data,
                FornitoreId = NullIfZero(a.FornitoreId),
                AcquistoId = NullIfZero(a.AcquistoId),
                a.NumeroDocumentoFornitore,
                a.Note,
                Stato = stato,
                MagazzinoId = NullIfZero(a.MagazzinoId),
            }, tx);

        if (a.Righe.Count > 0)
        {
            SaveRighe(conn, tx, id, a.Righe);
            if (stato == "RICEVUTO")
                Carico(conn, tx, a, id, stato);
        }

        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna la testata e ricostruisce le righe (DELETE + INSERT). Verifica
    /// l'unicità del numero escludendo l'arrivo stesso. Se l'arrivo era "RICEVUTO"
    /// storna prima le vecchie righe (delta -1, dati vecchi), poi — se il nuovo
    /// stato è "RICEVUTO" — ricarica le nuove righe (delta +1, dati nuovi).
    /// Parità con l'update del backend.
    /// </summary>
    public void Update(ArrivoMerce a)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (NumeroEsiste(conn, tx, a.Numero, a.Id))
            throw new System.InvalidOperationException(
                $"Il numero {a.Numero} è già utilizzato da un altro documento");

        // Stato/numero/fornitore VECCHI: servono per stornare correttamente.
        var old = conn.QuerySingleOrDefault<TestaStock>(
            "SELECT numero AS Numero, fornitore_id AS FornitoreId, stato AS Stato FROM arrivi_merce WHERE id=@id",
            new { id = a.Id }, tx);

        // Storno delle righe vecchie se l'arrivo era effettivamente ricevuto.
        var vecchie = LoadRighe(conn, tx, a.Id);
        if (vecchie.Count > 0 && old?.Stato == "RICEVUTO")
        {
            var ctx = new StockService.StockCtx
            {
                Causale = "STORNO",
                DocumentoTipo = "ARRIVO_MERCE",
                DocumentoId = a.Id,
                DocumentoNumero = old.Numero ?? "",
                FornitoreId = old.FornitoreId,
                FornitoreNome = NomeFornitore(conn, tx, old.FornitoreId),
            };
            _stock.ApplicaRigheStock(conn, tx, ToStockRighe(vecchie), -1, ctx);
        }

        var stato = a.Stato ?? "";
        conn.Execute(@"
            UPDATE arrivi_merce SET
              numero=@Numero, data=@Data, fornitore_id=@FornitoreId, acquisto_id=@AcquistoId,
              numero_documento_fornitore=@NumeroDocumentoFornitore, note=@Note,
              stato=@Stato, magazzino_id=@MagazzinoId
            WHERE id=@Id",
            new
            {
                a.Id,
                a.Numero,
                a.Data,
                FornitoreId = NullIfZero(a.FornitoreId),
                AcquistoId = NullIfZero(a.AcquistoId),
                a.NumeroDocumentoFornitore,
                a.Note,
                Stato = stato,
                MagazzinoId = NullIfZero(a.MagazzinoId),
            }, tx);

        conn.Execute("DELETE FROM arrivi_merce_righe WHERE arrivo_merce_id=@Id", new { a.Id }, tx);

        if (a.Righe.Count > 0)
        {
            SaveRighe(conn, tx, a.Id, a.Righe);
            if (stato == "RICEVUTO")
                Carico(conn, tx, a, a.Id, stato);
        }

        tx.Commit();
    }

    /// <summary>
    /// Cambia lo stato di un arrivo. Transizioni che movimentano:
    ///   - → "RICEVUTO" (da non-ricevuto): carico scorte (+1, causale ARRIVO_MERCE);
    ///   - "RICEVUTO" → "ANNULLATO": storno scorte (-1, causale ANNULLAMENTO).
    /// Parità con patch_stato del backend.
    /// </summary>
    public void SetStato(long id, string nuovoStato)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var old = conn.QuerySingleOrDefault<TestaStock>(
            "SELECT stato AS Stato, numero AS Numero, fornitore_id AS FornitoreId FROM arrivi_merce WHERE id=@id",
            new { id }, tx);
        // BUG CORRETTO: il backend faceva comunque l'UPDATE anche se l'arrivo non
        // esisteva. Qui usciamo prima (niente movimenti/UPDATE su un id inesistente).
        if (old == null) return;

        var righe = LoadRighe(conn, tx, id);
        var fornitoreNome = NomeFornitore(conn, tx, old.FornitoreId);

        if (nuovoStato == "RICEVUTO" && old.Stato != "RICEVUTO")
        {
            var ctx = new StockService.StockCtx
            {
                Data = Oggi(),
                Causale = "ARRIVO_MERCE",
                DocumentoTipo = "ARRIVO_MERCE",
                DocumentoId = id,
                DocumentoNumero = old.Numero ?? "",
                FornitoreId = old.FornitoreId,
                FornitoreNome = fornitoreNome,
            };
            _stock.ApplicaRigheStock(conn, tx, ToStockRighe(righe), 1, ctx);
        }
        else if (nuovoStato == "ANNULLATO" && old.Stato == "RICEVUTO")
        {
            var ctx = new StockService.StockCtx
            {
                Causale = "ANNULLAMENTO",
                DocumentoTipo = "ARRIVO_MERCE",
                DocumentoId = id,
                DocumentoNumero = old.Numero ?? "",
                FornitoreId = old.FornitoreId,
                FornitoreNome = fornitoreNome,
            };
            _stock.ApplicaRigheStock(conn, tx, ToStockRighe(righe), -1, ctx);
        }

        conn.Execute("UPDATE arrivi_merce SET stato=@nuovoStato WHERE id=@id", new { nuovoStato, id }, tx);
        tx.Commit();
    }

    /// <summary>
    /// Elimina un arrivo merce e le sue righe. Se l'arrivo era "RICEVUTO" storna
    /// prima le scorte (delta -1, causale ELIMINAZIONE). Le righe vanno via in
    /// CASCADE, ma le rimuoviamo esplicitamente come il backend.
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        DeleteCore(conn, tx, id);
        tx.Commit();
    }

    /// <summary>Eliminazione in blocco (con storno per gli arrivi ricevuti) in un'unica transazione.</summary>
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

    // ── helper privati ────────────────────────────────────────────────────────

    private void DeleteCore(SqliteConnection conn, SqliteTransaction tx, long id)
    {
        var old = conn.QuerySingleOrDefault<TestaStock>(
            "SELECT stato AS Stato, numero AS Numero, fornitore_id AS FornitoreId FROM arrivi_merce WHERE id=@id",
            new { id }, tx);
        if (old == null) return;

        if (old.Stato == "RICEVUTO")
        {
            var righe = LoadRighe(conn, tx, id);
            if (righe.Count > 0)
            {
                var ctx = new StockService.StockCtx
                {
                    Causale = "ELIMINAZIONE",
                    DocumentoTipo = "ARRIVO_MERCE",
                    DocumentoId = id,
                    DocumentoNumero = old.Numero ?? "",
                    FornitoreId = old.FornitoreId,
                    FornitoreNome = NomeFornitore(conn, tx, old.FornitoreId),
                };
                _stock.ApplicaRigheStock(conn, tx, ToStockRighe(righe), -1, ctx);
            }
        }

        conn.Execute("DELETE FROM arrivi_merce_righe WHERE arrivo_merce_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM arrivi_merce WHERE id=@id", new { id }, tx);
    }

    /// <summary>Carico delle scorte per le righe nuove (delta +1, dati nuovi della testata).</summary>
    private void Carico(SqliteConnection conn, SqliteTransaction tx, ArrivoMerce a, long id, string stato)
    {
        var ctx = new StockService.StockCtx
        {
            Data = a.Data,
            Causale = "ARRIVO_MERCE",
            DocumentoTipo = "ARRIVO_MERCE",
            DocumentoId = id,
            DocumentoNumero = a.Numero,
            MagazzinoId = NullIfZero(a.MagazzinoId),
            FornitoreId = NullIfZero(a.FornitoreId),
            FornitoreNome = NomeFornitore(conn, tx, NullIfZero(a.FornitoreId)),
        };
        _stock.ApplicaRigheStock(conn, tx, ToStockRighe(a.Righe), 1, ctx);
    }

    private static List<ArrivoMerceRiga> LoadRighe(SqliteConnection conn, SqliteTransaction? tx, long arrivoId) =>
        conn.Query<ArrivoMerceRiga>(
            $"{RigaSelect} WHERE amr.arrivo_merce_id = @id ORDER BY amr.id",
            new { id = arrivoId }, tx).ToList();

    /// <summary>Converte le righe documento nel DTO comune di movimento magazzino.</summary>
    private static IEnumerable<StockService.StockRiga> ToStockRighe(IEnumerable<ArrivoMerceRiga> righe) =>
        righe.Select(r => new StockService.StockRiga
        {
            ProdottoId = NullIfZero(r.ProdottoId),
            VarianteId = NullIfZero(r.VarianteId),
            Quantita = r.Quantita,
            MagazzinoId = NullIfZero(r.MagazzinoId),
            Lotto = r.Lotto,
            Scadenza = r.Scadenza,
            VarianteTaglia = r.VarianteTaglia,
            VarianteColore = r.VarianteColore,
            Descrizione = r.Descrizione,
        });

    private static bool NumeroEsiste(SqliteConnection conn, SqliteTransaction tx, string numero, long? exceptId)
    {
        var sql = exceptId is null
            ? "SELECT EXISTS(SELECT 1 FROM arrivi_merce WHERE numero=@numero)"
            : "SELECT EXISTS(SELECT 1 FROM arrivi_merce WHERE numero=@numero AND id!=@id)";
        return conn.ExecuteScalar<long>(sql, new { numero, id = exceptId }, tx) != 0;
    }

    private static void SaveRighe(SqliteConnection conn, SqliteTransaction tx, long arrivoId, List<ArrivoMerceRiga> righe)
    {
        var list = righe.Where(r => r != null).ToList();
        if (list.Count == 0) return;

        foreach (var r in list)
        {
            conn.Execute(@"
                INSERT INTO arrivi_merce_righe
                  (arrivo_merce_id, prodotto_id, variante_id, descrizione, codice_fornitore,
                   quantita, unita_misura, prezzo_acquisto, variante_taglia, variante_colore,
                   lotto, scadenza, magazzino_id)
                VALUES
                  (@arrivoId, @ProdottoId, @VarianteId, @Descrizione, @CodiceFornitore,
                   @Quantita, @UnitaMisura, @PrezzoAcquisto, @VarianteTaglia, @VarianteColore,
                   @Lotto, @Scadenza, @MagazzinoId)",
                new
                {
                    arrivoId,
                    ProdottoId = NullIfZero(r.ProdottoId),
                    VarianteId = NullIfZero(r.VarianteId),
                    r.Descrizione,
                    r.CodiceFornitore,
                    r.Quantita,
                    r.UnitaMisura,
                    r.PrezzoAcquisto,
                    r.VarianteTaglia,
                    r.VarianteColore,
                    r.Lotto,
                    r.Scadenza,
                    MagazzinoId = NullIfZero(r.MagazzinoId),
                }, tx);
        }
    }

    private static string NomeFornitore(SqliteConnection conn, SqliteTransaction? tx, long? fornitoreId)
    {
        if (fornitoreId is not long fid || fid == 0) return "";
        return conn.ExecuteScalar<string?>(
            "SELECT ragione_sociale FROM fornitori WHERE id=@fid", new { fid }, tx) ?? "";
    }

    private static string Oggi() => System.DateTime.Today.ToString("yyyy-MM-dd",
        System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>0 (default Dapper per FK non valorizzate) → NULL: niente FK a id=0.</summary>
    private static long? NullIfZero(long? v) => v is null or 0 ? null : v;

    /// <summary>Riga di lavoro per leggere stato/numero/fornitore vecchi (alias snake_case → PascalCase).</summary>
    private sealed class TestaStock
    {
        public string? Numero { get; set; }
        public long? FornitoreId { get; set; }
        public string? Stato { get; set; }
    }
}

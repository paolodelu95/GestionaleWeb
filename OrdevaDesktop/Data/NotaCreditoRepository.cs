using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD delle note di credito con Dapper. Porta la logica del backend Rust
/// (routes/note_credito.rs + fiscale.rs): numero univoco, default stato=EMESSA,
/// parametri fiscali (ritenuta/cassa/bollo), ricostruzione completa delle righe
/// in update e totali fiscali calcolati dalle righe (lato modello).
///
/// Ottimizzazioni rispetto al backend:
///  - GetAll calcola imponibile/totale base di TUTTI i documenti con un'unica
///    query aggregata (GROUP BY), invece di due sub-query per riga come faceva
///    to_dto (N+1 risolto). I totali fiscali completi (ritenuta/cassa/bollo) sono
///    sul dettaglio: in lista mostriamo il totale ivato base, come l'elenco web.
///
/// Bug del backend corretti qui:
///  - save_righe() in note_credito.rs NON salva la colonna codice_iva pur
///    esistendo a schema (e pur essendo salvata dai preventivi): qui la
///    persistiamo, così il codice IVA per riga non va perso al salvataggio.
/// </summary>
public sealed class NotaCreditoRepository
{
    // Alias snake_case → PascalCase, riusato dalle query di lista/dettaglio.
    private const string TestataColumns = @"
        n.id                 AS Id,
        n.numero             AS Numero,
        n.data_emissione     AS DataEmissione,
        n.cliente_id         AS ClienteId,
        n.fattura_id         AS FatturaId,
        n.note               AS Note,
        n.stato              AS Stato,
        n.ritenuta_aliquota  AS RitenutaAliquota,
        n.ritenuta_causale   AS RitenutaCausale,
        n.ritenuta_tipo      AS RitenutaTipo,
        n.ritenuta_su_cassa  AS RitenutaSuCassa,
        n.cassa_tipo         AS CassaTipo,
        n.cassa_aliquota     AS CassaAliquota,
        n.cassa_iva          AS CassaIva,
        n.bollo              AS Bollo,
        n.stato_sdi          AS StatoSdi,
        n.data_invio_sdi     AS DataInvioSdi,
        n.id_trasmissione_sdi AS IdTrasmissioneSdi,
        c.ragione_sociale    AS ClienteNome";

    private const string RigaColumns = @"
        r.id              AS Id,
        r.nota_credito_id AS NotaCreditoId,
        r.prodotto_id     AS ProdottoId,
        r.codice_prodotto AS CodiceProdotto,
        r.descrizione     AS Descrizione,
        r.quantita        AS Quantita,
        r.unita_misura    AS UnitaMisura,
        r.prezzo          AS Prezzo,
        r.sconto          AS Sconto,
        r.iva             AS Iva,
        r.variante_id     AS VarianteId,
        r.variante_taglia AS VarianteTaglia,
        r.variante_colore AS VarianteColore,
        r.tipo            AS Tipo,
        r.codice_iva      AS CodiceIva,
        pr.nome           AS ProdottoNome";

    /// <summary>
    /// Tutte le note di credito, più recenti per prime, con nome cliente e con
    /// imponibile/totale precalcolati in SQL (un'unica query aggregata sulle
    /// righe: niente N+1). Le righe non vengono caricate qui.
    ///
    /// Il <c>totale</c> precalcolato è quello FISCALE COMPLETO (imponibile + cassa
    /// previdenziale + IVA righe + IVA cassa + bollo), identico a quello che il
    /// backend espone in lista via to_dto/calcola_totali_fiscali e che la lista
    /// Angular mostra nella colonna "Importo". Non basta imponibile·(1+iva/100):
    /// per le note con cassa o bollo divergerebbe dal web. L'aggregazione delle
    /// righe (imponibile e IVA righe) e i parametri fiscali della testata vengono
    /// combinati in un'unica query, replicando l'ordine di arrotondamento di
    /// calcola_totali_fiscali (imponibile e iva_righe arrotondati a 2 prima della
    /// somma). La ritenuta non concorre al "totale" (sta nel netto a pagare).
    /// </summary>
    public List<NotaCredito> GetAll()
    {
        using var conn = Db.Open();

        var note = conn.Query<NotaCredito>($@"
            SELECT {TestataColumns}
            FROM note_credito n
            LEFT JOIN clienti c ON c.id = n.cliente_id
            ORDER BY n.data_emissione DESC, n.id DESC").ToList();

        if (note.Count == 0) return note;

        // Imponibile e IVA righe (escluse le righe NOTA), arrotondati a 2 decimali
        // come fa calcola_totali_fiscali PRIMA di applicare cassa/bollo.
        var totali = conn.Query<(long NotaCreditoId, decimal Imponibile, decimal IvaRighe)>(@"
            SELECT nota_credito_id AS NotaCreditoId,
                   ROUND(COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0)), 0), 2) AS Imponibile,
                   ROUND(COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * COALESCE(iva,0)/100.0), 0), 2) AS IvaRighe
            FROM note_credito_righe
            WHERE UPPER(COALESCE(tipo,'PRODOTTO')) <> 'NOTA'
            GROUP BY nota_credito_id")
            .ToDictionary(t => t.NotaCreditoId);

        foreach (var n in note)
        {
            var (imponibile, ivaRighe) = totali.TryGetValue(n.Id, out var t)
                ? (t.Imponibile, t.IvaRighe)
                : (0m, 0m);

            // Stesso calcolo di calcola_totali_fiscali, ma a partire dagli aggregati
            // SQL e dai parametri fiscali già letti nella testata.
            var cassaImporto = n.CassaAliquota != 0m ? Round2(imponibile * n.CassaAliquota / 100m) : 0m;
            var ivaCassa = cassaImporto != 0m ? Round2(cassaImporto * n.CassaIva / 100m) : 0m;
            var iva = Round2(ivaRighe + ivaCassa);
            var bollo = n.Bollo ? 2.00m : 0m;

            n.ImponibileListato = imponibile;
            n.TotaleListato = Round2(imponibile + cassaImporto + iva + bollo);
        }

        return note;
    }

    private static decimal Round2(decimal n) => decimal.Round(n, 2, MidpointRounding.AwayFromZero);

    /// <summary>Dettaglio completo: testata + righe (con nome prodotto via JOIN).</summary>
    public NotaCredito? GetById(long id)
    {
        using var conn = Db.Open();

        var n = conn.QuerySingleOrDefault<NotaCredito>($@"
            SELECT {TestataColumns}
            FROM note_credito n
            LEFT JOIN clienti c ON c.id = n.cliente_id
            WHERE n.id = @id", new { id });
        if (n == null) return null;

        n.Righe = conn.Query<NotaCreditoRiga>($@"
            SELECT {RigaColumns}
            FROM note_credito_righe r
            LEFT JOIN prodotti pr ON pr.id = r.prodotto_id
            WHERE r.nota_credito_id = @id
            ORDER BY r.id", new { id }).ToList();

        return n;
    }

    /// <summary>
    /// Inserisce una nota di credito e le sue righe in transazione. Verifica
    /// l'unicità del numero (come il backend) e applica il default stato=EMESSA.
    /// Se collegata a una fattura, la fattura viene marcata STORNATA (parità con
    /// create_tx). NB: lo scarico/rientro di magazzino è gestito altrove e non
    /// fa parte di questo repository di documento.
    /// </summary>
    public long Insert(NotaCredito n)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, n.Numero, null);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO note_credito
              (numero, data_emissione, cliente_id, fattura_id, note, stato,
               ritenuta_aliquota, ritenuta_causale, ritenuta_tipo, ritenuta_su_cassa,
               cassa_tipo, cassa_aliquota, cassa_iva, bollo)
            VALUES
              (@Numero, @DataEmissione, @ClienteId, @FatturaId, @Note, @Stato,
               @RitenutaAliquota, @RitenutaCausale, @RitenutaTipo, @RitenutaSuCassa,
               @CassaTipo, @CassaAliquota, @CassaIva, @Bollo);
            SELECT last_insert_rowid();", BindTestata(n), tx);

        SaveRighe(conn, tx, id, n.Righe);
        StornaFatturaCollegata(conn, tx, n.FatturaId);

        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna la testata e ricostruisce TUTTE le righe (delete + reinsert),
    /// come fa update_tx nel backend. Verifica l'unicità del numero escludendo
    /// il documento stesso e, se cambia la fattura collegata, ricalcola lo stato
    /// della vecchia fattura e storna la nuova.
    /// </summary>
    public void Update(NotaCredito n)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, n.Numero, n.Id);

        var beforeFatturaId = conn.ExecuteScalar<long?>(
            "SELECT fattura_id FROM note_credito WHERE id=@Id", new { n.Id }, tx);

        conn.Execute(@"
            UPDATE note_credito SET
              numero=@Numero, data_emissione=@DataEmissione, cliente_id=@ClienteId,
              fattura_id=@FatturaId, note=@Note, stato=@Stato,
              ritenuta_aliquota=@RitenutaAliquota, ritenuta_causale=@RitenutaCausale,
              ritenuta_tipo=@RitenutaTipo, ritenuta_su_cassa=@RitenutaSuCassa,
              cassa_tipo=@CassaTipo, cassa_aliquota=@CassaAliquota, cassa_iva=@CassaIva,
              bollo=@Bollo
            WHERE id=@Id", BindTestata(n, n.Id), tx);

        conn.Execute("DELETE FROM note_credito_righe WHERE nota_credito_id=@Id", new { n.Id }, tx);
        SaveRighe(conn, tx, n.Id, n.Righe);

        // Fattura scollegata: ne ricalcola lo stato (parità con ricalcola_stato_fattura).
        if (beforeFatturaId is > 0 && beforeFatturaId != (n.FatturaId is > 0 ? n.FatturaId : null))
            RicalcolaStatoFattura(conn, tx, beforeFatturaId.Value);

        StornaFatturaCollegata(conn, tx, n.FatturaId);

        tx.Commit();
    }

    /// <summary>
    /// Elimina una nota di credito (righe via CASCADE) e ricalcola lo stato della
    /// fattura eventualmente collegata, come fa remove() nel backend.
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var fatturaId = conn.ExecuteScalar<long?>(
            "SELECT fattura_id FROM note_credito WHERE id=@id", new { id }, tx);

        conn.Execute("DELETE FROM note_credito WHERE id=@id", new { id }, tx);

        if (fatturaId is > 0)
            RicalcolaStatoFattura(conn, tx, fatturaId.Value);

        tx.Commit();
    }

    /// <summary>Eliminazione in blocco in un'unica transazione (con ricalcolo fatture).</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        // Fatture collegate, da ricalcolare dopo l'eliminazione.
        var fatture = conn.Query<long>(
            "SELECT DISTINCT fattura_id FROM note_credito WHERE id IN @ids AND fattura_id IS NOT NULL",
            new { ids = list }, tx).ToList();

        conn.Execute("DELETE FROM note_credito WHERE id IN @ids", new { ids = list }, tx);

        foreach (var fid in fatture)
            RicalcolaStatoFattura(conn, tx, fid);

        tx.Commit();
        return list.Count;
    }

    /// <summary>Cambia lo stato di una nota di credito (patch_stato del backend).</summary>
    public void SetStato(long id, string stato)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE note_credito SET stato=@stato WHERE id=@id", new { id, stato });
    }

    /// <summary>Cambio stato in blocco per più documenti (multi-selezione).</summary>
    public void SetStatoMany(IEnumerable<long> ids, string stato)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return;
        using var conn = Db.Open();
        conn.Execute("UPDATE note_credito SET stato=@stato WHERE id IN @ids", new { stato, ids = list });
    }

    // ── helper privati ──────────────────────────────────────────────────────

    /// <summary>
    /// Verifica che il numero non sia già usato da un altro documento (parità con
    /// il vincolo del backend e l'indice unico idx_note_credito_numero).
    /// </summary>
    private static void EnsureNumeroLibero(SqliteConnection conn, SqliteTransaction tx, string numero, long? exceptId)
    {
        var dup = conn.ExecuteScalar<long?>(
            "SELECT id FROM note_credito WHERE numero=@numero AND (@id IS NULL OR id<>@id) LIMIT 1",
            new { numero, id = exceptId }, tx);
        if (dup != null)
            throw new InvalidOperationException($"Il numero {numero} è già utilizzato da un altro documento");
    }

    /// <summary>Marca STORNATA la fattura collegata (parità con create_tx/update_tx).</summary>
    private static void StornaFatturaCollegata(SqliteConnection conn, SqliteTransaction tx, long? fatturaId)
    {
        if (fatturaId is > 0)
            conn.Execute("UPDATE fatture SET stato='STORNATA' WHERE id=@id", new { id = fatturaId.Value }, tx);
    }

    /// <summary>
    /// Ricalcola lo stato della fattura quando una nota viene scollegata/eliminata
    /// (parità con ricalcola_stato_fattura): se restano altre note → STORNATA;
    /// altrimenti PAGATA se il pagato copre il totale, altrimenti EMESSA.
    /// </summary>
    private static void RicalcolaStatoFattura(SqliteConnection conn, SqliteTransaction tx, long fatturaId)
    {
        var altre = conn.ExecuteScalar<long>(
            "SELECT COUNT(*) FROM note_credito WHERE fattura_id=@id", new { id = fatturaId }, tx);
        if (altre > 0)
        {
            conn.Execute("UPDATE fatture SET stato='STORNATA' WHERE id=@id", new { id = fatturaId }, tx);
            return;
        }

        var totale = conn.ExecuteScalar<double>(@"
            SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100.0)*(1+COALESCE(iva,0)/100.0)),0)
            FROM fatture_righe WHERE fattura_id=@id", new { id = fatturaId }, tx);
        var pagato = conn.ExecuteScalar<double>(
            "SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE fattura_id=@id", new { id = fatturaId }, tx);

        var stato = pagato >= totale && totale > 0.0 ? "PAGATA" : "EMESSA";
        conn.Execute("UPDATE fatture SET stato=@stato WHERE id=@id", new { stato, id = fatturaId }, tx);
    }

    private static void SaveRighe(SqliteConnection conn, SqliteTransaction tx, long notaCreditoId, IEnumerable<NotaCreditoRiga> righe)
    {
        foreach (var r in righe)
        {
            conn.Execute(@"
                INSERT INTO note_credito_righe
                  (nota_credito_id, prodotto_id, codice_prodotto, descrizione, quantita,
                   prezzo, sconto, iva, unita_misura, variante_id, variante_taglia,
                   variante_colore, tipo, codice_iva)
                VALUES
                  (@notaCreditoId, @ProdottoId, @CodiceProdotto, @Descrizione, @Quantita,
                   @Prezzo, @Sconto, @Iva, @UnitaMisura, @VarianteId, @VarianteTaglia,
                   @VarianteColore, @Tipo, @CodiceIva)",
                new
                {
                    notaCreditoId,
                    // prodotto_id/variante_id: 0 → NULL (come opt_i64 nel backend).
                    ProdottoId = r.ProdottoId is > 0 ? r.ProdottoId : null,
                    r.CodiceProdotto,
                    r.Descrizione,
                    r.Quantita,
                    r.Prezzo,
                    r.Sconto,
                    r.Iva,
                    r.UnitaMisura,
                    VarianteId = r.VarianteId is > 0 ? r.VarianteId : null,
                    r.VarianteTaglia,
                    r.VarianteColore,
                    Tipo = string.IsNullOrEmpty(r.Tipo) ? "PRODOTTO" : r.Tipo,
                    r.CodiceIva, // bug-fix vs backend: il codice IVA per riga ora viene persistito.
                }, tx);
        }
    }

    /// <summary>
    /// Parametri della testata. Applica il default stato=EMESSA e converte i bool
    /// fiscali (ritenuta_su_cassa, bollo) in INTEGER 0/1 per SQLite.
    /// </summary>
    private static object BindTestata(NotaCredito n, long? id = null) => new
    {
        Id = id ?? n.Id,
        n.Numero,
        n.DataEmissione,
        // cliente_id/fattura_id: 0 → NULL (come opt_i64 nel backend).
        ClienteId = n.ClienteId is > 0 ? n.ClienteId : null,
        FatturaId = n.FatturaId is > 0 ? n.FatturaId : null,
        n.Note,
        Stato = string.IsNullOrEmpty(n.Stato) ? "EMESSA" : n.Stato,
        n.RitenutaAliquota,
        n.RitenutaCausale,
        n.RitenutaTipo,
        RitenutaSuCassa = n.RitenutaSuCassa ? 1 : 0,
        n.CassaTipo,
        n.CassaAliquota,
        n.CassaIva,
        Bollo = n.Bollo ? 1 : 0,
    };
}

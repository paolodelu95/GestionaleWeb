using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD delle fatture con Dapper. Porta la logica del backend Rust
/// (routes/fatture.rs): numero univoco, default stato=EMESSA, validazione righe,
/// ricostruzione completa delle righe in update, totali fiscali calcolati come in
/// fiscale.rs (ritenuta/cassa/bollo).
///
/// Ottimizzazioni rispetto al backend:
///  - GetAll calcola imponibile/IVA delle righe di TUTTE le fatture con un'unica
///    query aggregata (GROUP BY), invece delle due sub-query per documento di
///    to_dto (N+1 risolto). I totali fiscali (cassa/ritenuta/bollo/netto) si
///    combinano poi in memoria con i parametri di testata.
///  - GetById carica testata + righe con due sole query.
/// </summary>
public sealed class FatturaRepository
{
    // Alias snake_case → PascalCase, riusato dalle query di lista/dettaglio.
    private const string FatturaColumns = @"
        f.id                  AS Id,
        f.numero              AS Numero,
        f.data_emissione      AS DataEmissione,
        f.cliente_id          AS ClienteId,
        f.ddt_id              AS DdtId,
        f.note                AS Note,
        f.stato               AS Stato,
        f.tipo_pagamento_id   AS TipoPagamentoId,
        f.ritenuta_aliquota   AS RitenutaAliquota,
        f.ritenuta_causale    AS RitenutaCausale,
        f.ritenuta_tipo       AS RitenutaTipo,
        f.ritenuta_su_cassa   AS RitenutaSuCassa,
        f.cassa_tipo          AS CassaTipo,
        f.cassa_aliquota      AS CassaAliquota,
        f.cassa_iva           AS CassaIva,
        f.bollo               AS Bollo,
        f.stato_sdi           AS StatoSdi,
        f.data_invio_sdi      AS DataInvioSdi,
        f.id_trasmissione_sdi AS IdTrasmissioneSdi,
        f.cig                 AS Cig,
        f.cup                 AS Cup,
        c.ragione_sociale     AS ClienteNome";

    private const string RigaColumns = @"
        r.id                AS Id,
        r.fattura_id        AS FatturaId,
        r.prodotto_id       AS ProdottoId,
        r.codice_prodotto   AS CodiceProdotto,
        r.descrizione       AS Descrizione,
        r.quantita          AS Quantita,
        r.unita_misura      AS UnitaMisura,
        r.prezzo            AS Prezzo,
        r.sconto            AS Sconto,
        r.iva               AS Iva,
        r.codice_iva        AS CodiceIva,
        r.variante_id       AS VarianteId,
        r.variante_taglia   AS VarianteTaglia,
        r.variante_colore   AS VarianteColore,
        r.tipo              AS Tipo,
        r.scarica_magazzino AS ScaricaMagazzino,
        pr.nome             AS ProdottoNome";

    /// <summary>
    /// Tutte le fatture, più recenti per prima, con nome cliente e con
    /// imponibile/IVA delle righe precalcolati in SQL (un'unica query aggregata:
    /// niente N+1). Cassa/ritenuta/bollo/netto si combinano poi in memoria
    /// applicando la formula fiscale del backend. Le righe non sono caricate qui.
    /// </summary>
    public List<Fattura> GetAll()
    {
        using var conn = Db.Open();

        var fatture = conn.Query<Fattura>($@"
            SELECT {FatturaColumns}
            FROM fatture f
            LEFT JOIN clienti c ON c.id = f.cliente_id
            ORDER BY f.data_emissione DESC, f.id DESC").ToList();

        if (fatture.Count == 0) return fatture;

        // Imponibile e IVA delle righe di TUTTE le fatture in una sola query.
        // Le righe NOTA hanno tipo='NOTA': le escludiamo dai totali come in C#.
        var aggr = conn.Query<(long FatturaId, decimal Imponibile, decimal IvaRighe)>(@"
            SELECT fattura_id AS FatturaId,
                   COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0)), 0) AS Imponibile,
                   COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * iva/100.0), 0) AS IvaRighe
            FROM fatture_righe
            WHERE UPPER(COALESCE(tipo,'PRODOTTO')) <> 'NOTA'
            GROUP BY fattura_id")
            .ToDictionary(t => t.FatturaId);

        foreach (var f in fatture)
        {
            aggr.TryGetValue(f.Id, out var t); // (0,0) se la fattura non ha righe
            ApplicaTotaliListato(f, t.Imponibile, t.IvaRighe);
        }

        return fatture;
    }

    /// <summary>Dettaglio completo: testata + righe (con nome prodotto via JOIN).</summary>
    public Fattura? GetById(long id)
    {
        using var conn = Db.Open();

        var f = conn.QuerySingleOrDefault<Fattura>($@"
            SELECT {FatturaColumns}
            FROM fatture f
            LEFT JOIN clienti c ON c.id = f.cliente_id
            WHERE f.id = @id", new { id });
        if (f == null) return null;

        f.Righe = conn.Query<FatturaRiga>($@"
            SELECT {RigaColumns}
            FROM fatture_righe r
            LEFT JOIN prodotti pr ON pr.id = r.prodotto_id
            WHERE r.fattura_id = @id
            ORDER BY r.id", new { id }).ToList();

        return f;
    }

    /// <summary>
    /// Inserisce una fattura e le sue righe in transazione. Verifica l'unicità del
    /// numero e che il cliente sia presente, valida le righe e applica il default
    /// stato=EMESSA (parità con create() del backend).
    /// </summary>
    public long Insert(Fattura f)
    {
        ValidaTestata(f);
        ValidaRighe(f.Righe);

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, f.Numero, null);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO fatture
              (numero, data_emissione, cliente_id, ddt_id, note, stato, tipo_pagamento_id,
               ritenuta_aliquota, ritenuta_causale, ritenuta_tipo, ritenuta_su_cassa,
               cassa_tipo, cassa_aliquota, cassa_iva, bollo, cig, cup)
            VALUES
              (@Numero, @DataEmissione, @ClienteId, @DdtId, @Note, @Stato, @TipoPagamentoId,
               @RitenutaAliquota, @RitenutaCausale, @RitenutaTipo, @RitenutaSuCassa,
               @CassaTipo, @CassaAliquota, @CassaIva, @Bollo, @Cig, @Cup);
            SELECT last_insert_rowid();", BindTestata(f), tx);

        SaveRighe(conn, tx, id, f.Righe);

        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna la testata e ricostruisce TUTTE le righe (delete + reinsert),
    /// come fa update() nel backend. Verifica unicità numero e cliente presente.
    /// </summary>
    public void Update(Fattura f)
    {
        ValidaTestata(f);
        ValidaRighe(f.Righe);

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, f.Numero, f.Id);

        conn.Execute(@"
            UPDATE fatture SET
              numero=@Numero, data_emissione=@DataEmissione, cliente_id=@ClienteId,
              ddt_id=@DdtId, note=@Note, stato=@Stato, tipo_pagamento_id=@TipoPagamentoId,
              ritenuta_aliquota=@RitenutaAliquota, ritenuta_causale=@RitenutaCausale,
              ritenuta_tipo=@RitenutaTipo, ritenuta_su_cassa=@RitenutaSuCassa,
              cassa_tipo=@CassaTipo, cassa_aliquota=@CassaAliquota, cassa_iva=@CassaIva,
              bollo=@Bollo, cig=@Cig, cup=@Cup
            WHERE id=@Id", BindTestata(f, f.Id), tx);

        conn.Execute("DELETE FROM fatture_righe WHERE fattura_id=@Id", new { f.Id }, tx);
        SaveRighe(conn, tx, f.Id, f.Righe);

        tx.Commit();
    }

    /// <summary>
    /// Elimina una fattura. Replica le pulizie del backend remove(): scollega i
    /// pagamenti e azzera il riferimento dalle note di credito; le righe e i link
    /// fatture_ddt/fatture_riferimenti vanno via in CASCADE. (Lo scarico scorte
    /// del backend è gestito dal modulo magazzino, non qui.)
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        PulisciDipendenze(conn, tx, new[] { id });
        conn.Execute("DELETE FROM fatture WHERE id=@id", new { id }, tx);
        tx.Commit();
    }

    /// <summary>Eliminazione in blocco in un'unica transazione (multi-selezione).</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        PulisciDipendenze(conn, tx, list);
        conn.Execute("DELETE FROM fatture WHERE id IN @ids", new { ids = list }, tx);
        tx.Commit();
        return list.Count;
    }

    /// <summary>Cambia lo stato di una fattura (patch_stato del backend).</summary>
    public void SetStato(long id, string stato)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE fatture SET stato=@stato WHERE id=@id", new { id, stato });
    }

    /// <summary>Cambio stato in blocco per più fatture (multi-selezione).</summary>
    public void SetStatoMany(IEnumerable<long> ids, string stato)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return;
        using var conn = Db.Open();
        conn.Execute("UPDATE fatture SET stato=@stato WHERE id IN @ids", new { stato, ids = list });
    }

    // ── helper privati ──────────────────────────────────────────────────────

    /// <summary>
    /// Combina i totali aggregati delle righe (imponibile/iva) con i parametri
    /// fiscali di testata per ottenere totale e netto a pagare, con la stessa
    /// formula di calcola_totali_fiscali.
    /// </summary>
    private static void ApplicaTotaliListato(Fattura f, decimal imponibileRaw, decimal ivaRigheRaw)
    {
        var imponibile = Round2(imponibileRaw);
        var ivaRighe = Round2(ivaRigheRaw);

        var cassa = f.CassaAliquota != 0m ? Round2(imponibile * f.CassaAliquota / 100m) : 0m;
        var ivaCassa = cassa != 0m ? Round2(cassa * f.CassaIva / 100m) : 0m;
        var iva = Round2(ivaRighe + ivaCassa);

        var ritBase = imponibile + (f.RitenutaSuCassa ? cassa : 0m);
        var ritenuta = f.RitenutaAliquota != 0m ? Round2(ritBase * f.RitenutaAliquota / 100m) : 0m;

        var bollo = f.Bollo ? 2m : 0m;
        var totale = Round2(imponibile + cassa + iva + bollo);

        f.ImponibileListato = imponibile;
        f.TotaleListato = totale;
        f.NettoListato = Round2(totale - ritenuta);
    }

    private static decimal Round2(decimal n) => Math.Round(n, 2, MidpointRounding.AwayFromZero);

    /// <summary>Cliente obbligatorio (parità con la validazione del backend).</summary>
    private static void ValidaTestata(Fattura f)
    {
        if (f.ClienteId is null or 0)
            throw new InvalidOperationException("Il cliente è obbligatorio");
    }

    /// <summary>
    /// Valida le righe come valida_righe del backend: almeno una riga, quantità e
    /// prezzo non negativi.
    /// </summary>
    private static void ValidaRighe(IReadOnlyCollection<FatturaRiga> righe)
    {
        if (righe.Count == 0)
            throw new InvalidOperationException("Il documento deve contenere almeno una riga");
        foreach (var r in righe)
        {
            if (r.Quantita < 0m)
                throw new InvalidOperationException("La quantità di una riga non può essere negativa");
            if (r.Prezzo < 0m)
                throw new InvalidOperationException("Il prezzo di una riga non può essere negativo");
        }
    }

    /// <summary>
    /// Verifica che il numero non sia già usato da un'altra fattura (parità con il
    /// vincolo di unicità del backend).
    /// </summary>
    private static void EnsureNumeroLibero(SqliteConnection conn, SqliteTransaction tx, string numero, long? exceptId)
    {
        var dup = conn.ExecuteScalar<long?>(
            "SELECT id FROM fatture WHERE numero=@numero AND (@id IS NULL OR id<>@id) LIMIT 1",
            new { numero, id = exceptId }, tx);
        if (dup != null)
            throw new InvalidOperationException($"Il numero {numero} è già utilizzato da un altro documento");
    }

    /// <summary>
    /// Pulizie pre-eliminazione comuni a Delete/DeleteMany: scollega i pagamenti e
    /// azzera il riferimento dalle note di credito (come fa remove() nel backend).
    /// </summary>
    private static void PulisciDipendenze(SqliteConnection conn, SqliteTransaction tx, IReadOnlyCollection<long> ids)
    {
        conn.Execute("DELETE FROM pagamenti WHERE fattura_id IN @ids", new { ids }, tx);
        conn.Execute("UPDATE note_credito SET fattura_id=NULL WHERE fattura_id IN @ids", new { ids }, tx);
    }

    private static void SaveRighe(SqliteConnection conn, SqliteTransaction tx, long fatturaId, IEnumerable<FatturaRiga> righe)
    {
        foreach (var r in righe)
        {
            conn.Execute(@"
                INSERT INTO fatture_righe
                  (fattura_id, prodotto_id, codice_prodotto, descrizione, quantita,
                   prezzo, sconto, iva, codice_iva, unita_misura, variante_id,
                   variante_taglia, variante_colore, tipo, scarica_magazzino)
                VALUES
                  (@fatturaId, @ProdottoId, @CodiceProdotto, @Descrizione, @Quantita,
                   @Prezzo, @Sconto, @Iva, @CodiceIva, @UnitaMisura, @VarianteId,
                   @VarianteTaglia, @VarianteColore, @Tipo, @ScaricaMagazzino)",
                new
                {
                    fatturaId,
                    // prodotto_id/variante_id: 0 → NULL (come opt_i64 nel backend).
                    ProdottoId = r.ProdottoId is > 0 ? r.ProdottoId : null,
                    r.CodiceProdotto,
                    r.Descrizione,
                    r.Quantita,
                    r.Prezzo,
                    r.Sconto,
                    r.Iva,
                    r.CodiceIva,
                    r.UnitaMisura,
                    VarianteId = r.VarianteId is > 0 ? r.VarianteId : null,
                    r.VarianteTaglia,
                    r.VarianteColore,
                    Tipo = string.IsNullOrEmpty(r.Tipo) ? "PRODOTTO" : r.Tipo,
                    ScaricaMagazzino = r.ScaricaMagazzino ? 1 : 0,
                }, tx);
        }
    }

    /// <summary>Parametri della testata. Applica i default stato=EMESSA e i flag bool→0/1.</summary>
    private static object BindTestata(Fattura f, long? id = null) => new
    {
        Id = id ?? f.Id,
        f.Numero,
        f.DataEmissione,
        // cliente_id/ddt_id/tipo_pagamento_id: 0 → NULL (come opt_i64 nel backend).
        ClienteId = f.ClienteId is > 0 ? f.ClienteId : null,
        DdtId = f.DdtId is > 0 ? f.DdtId : null,
        f.Note,
        Stato = string.IsNullOrEmpty(f.Stato) ? "EMESSA" : f.Stato,
        TipoPagamentoId = f.TipoPagamentoId is > 0 ? f.TipoPagamentoId : null,
        f.RitenutaAliquota,
        f.RitenutaCausale,
        f.RitenutaTipo,
        RitenutaSuCassa = f.RitenutaSuCassa ? 1 : 0,
        f.CassaTipo,
        f.CassaAliquota,
        f.CassaIva,
        Bollo = f.Bollo ? 1 : 0,
        f.Cig,
        f.Cup,
    };
}

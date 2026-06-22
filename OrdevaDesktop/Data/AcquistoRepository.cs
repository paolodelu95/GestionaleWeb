using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD delle fatture d'acquisto (ciclo passivo) con Dapper. Porta la logica del
/// backend Rust (routes/acquisti.rs): numero univoco, default stato=RICEVUTA,
/// ricostruzione completa delle righe in update, totali (imponibile + IVA)
/// calcolati come in to_dto.
///
/// Ottimizzazioni rispetto al backend:
///  - GetAll calcola imponibile/totale delle righe di TUTTI gli acquisti con
///    un'unica query aggregata (GROUP BY), invece delle due sub-query per
///    documento di to_dto (N+1 risolto).
///  - GetById carica testata + righe con due sole query.
/// </summary>
public sealed class AcquistoRepository
{
    // Alias snake_case → PascalCase, riusato dalle query di lista/dettaglio.
    private const string AcquistoColumns = @"
        a.id                AS Id,
        a.numero            AS Numero,
        a.data_emissione    AS DataEmissione,
        a.fornitore_id      AS FornitoreId,
        a.tipo_pagamento_id AS TipoPagamentoId,
        a.note              AS Note,
        a.stato             AS Stato,
        a.conto_acquisto_id AS ContoAcquistoId,
        f.ragione_sociale   AS FornitoreNome,
        tp.nome             AS TipoPagamentoNome";

    private const string RigaColumns = @"
        r.id              AS Id,
        r.acquisto_id     AS AcquistoId,
        r.prodotto_id     AS ProdottoId,
        r.codice_prodotto AS CodiceProdotto,
        r.descrizione     AS Descrizione,
        r.quantita        AS Quantita,
        r.unita_misura    AS UnitaMisura,
        r.prezzo          AS Prezzo,
        r.sconto          AS Sconto,
        r.iva             AS Iva,
        r.codice_iva      AS CodiceIva,
        r.variante_id     AS VarianteId,
        r.variante_taglia AS VarianteTaglia,
        r.variante_colore AS VarianteColore,
        r.tipo            AS Tipo,
        pr.nome           AS ProdottoNome";

    /// <summary>
    /// Tutti gli acquisti, più recenti per primi (data DESC), con nome fornitore e
    /// tipo pagamento, e con imponibile/IVA delle righe precalcolati in SQL
    /// (un'unica query aggregata: niente N+1). Le righe non sono caricate qui.
    /// </summary>
    public List<Acquisto> GetAll()
    {
        using var conn = Db.Open();

        var acquisti = conn.Query<Acquisto>($@"
            SELECT {AcquistoColumns}
            FROM acquisti a
            LEFT JOIN fornitori f ON f.id = a.fornitore_id
            LEFT JOIN tipi_pagamento tp ON tp.id = a.tipo_pagamento_id
            ORDER BY a.data_emissione DESC, a.id DESC").ToList();

        if (acquisti.Count == 0) return acquisti;

        // Imponibile e IVA delle righe di TUTTI gli acquisti in una sola query.
        // Le righe NOTA hanno tipo='NOTA': le escludiamo dai totali (parità con C#).
        var aggr = conn.Query<(long AcquistoId, decimal Imponibile, decimal IvaRighe)>(@"
            SELECT acquisto_id AS AcquistoId,
                   COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0)), 0) AS Imponibile,
                   COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * iva/100.0), 0) AS IvaRighe
            FROM acquisti_righe
            WHERE UPPER(COALESCE(tipo,'PRODOTTO')) <> 'NOTA'
            GROUP BY acquisto_id")
            .ToDictionary(t => t.AcquistoId);

        foreach (var a in acquisti)
        {
            aggr.TryGetValue(a.Id, out var t); // (0,0) se l'acquisto non ha righe
            var imponibile = Round2(t.Imponibile);
            a.ImponibileListato = imponibile;
            a.TotaleListato = Round2(imponibile + Round2(t.IvaRighe));
        }

        return acquisti;
    }

    /// <summary>Dettaglio completo: testata + righe (con nome prodotto via JOIN).</summary>
    public Acquisto? GetById(long id)
    {
        using var conn = Db.Open();

        var a = conn.QuerySingleOrDefault<Acquisto>($@"
            SELECT {AcquistoColumns}
            FROM acquisti a
            LEFT JOIN fornitori f ON f.id = a.fornitore_id
            LEFT JOIN tipi_pagamento tp ON tp.id = a.tipo_pagamento_id
            WHERE a.id = @id", new { id });
        if (a == null) return null;

        a.Righe = conn.Query<AcquistoRiga>($@"
            SELECT {RigaColumns}
            FROM acquisti_righe r
            LEFT JOIN prodotti pr ON pr.id = r.prodotto_id
            WHERE r.acquisto_id = @id
            ORDER BY r.id", new { id }).ToList();

        return a;
    }

    /// <summary>
    /// Inserisce un acquisto e le sue righe in transazione. Verifica l'unicità del
    /// numero e applica il default stato=RICEVUTA (parità con create() del backend).
    /// </summary>
    public long Insert(Acquisto a)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, a.Numero, null);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO acquisti
              (numero, data_emissione, fornitore_id, tipo_pagamento_id, note, stato, conto_acquisto_id)
            VALUES
              (@Numero, @DataEmissione, @FornitoreId, @TipoPagamentoId, @Note, @Stato, @ContoAcquistoId);
            SELECT last_insert_rowid();", BindTestata(a), tx);

        SaveRighe(conn, tx, id, a.Righe);

        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna la testata e ricostruisce TUTTE le righe (delete + reinsert),
    /// come fa update() nel backend. Verifica l'unicità del numero.
    /// </summary>
    public void Update(Acquisto a)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, a.Numero, a.Id);

        conn.Execute(@"
            UPDATE acquisti SET
              numero=@Numero, data_emissione=@DataEmissione, fornitore_id=@FornitoreId,
              tipo_pagamento_id=@TipoPagamentoId, note=@Note, stato=@Stato,
              conto_acquisto_id=@ContoAcquistoId
            WHERE id=@Id", BindTestata(a, a.Id), tx);

        conn.Execute("DELETE FROM acquisti_righe WHERE acquisto_id=@Id", new { a.Id }, tx);
        SaveRighe(conn, tx, a.Id, a.Righe);

        tx.Commit();
    }

    /// <summary>
    /// Elimina un acquisto. Replica le pulizie del backend remove(): scollega i
    /// pagamenti e azzera il riferimento dagli arrivi merce; le righe vanno via in
    /// CASCADE.
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        PulisciDipendenze(conn, tx, new[] { id });
        conn.Execute("DELETE FROM acquisti WHERE id=@id", new { id }, tx);
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
        conn.Execute("DELETE FROM acquisti WHERE id IN @ids", new { ids = list }, tx);
        tx.Commit();
        return list.Count;
    }

    /// <summary>Cambia lo stato di un acquisto (patch_stato del backend).</summary>
    public void SetStato(long id, string stato)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE acquisti SET stato=@stato WHERE id=@id", new { id, stato });
    }

    /// <summary>Cambio stato in blocco per più acquisti (multi-selezione).</summary>
    public void SetStatoMany(IEnumerable<long> ids, string stato)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return;
        using var conn = Db.Open();
        conn.Execute("UPDATE acquisti SET stato=@stato WHERE id IN @ids", new { stato, ids = list });
    }

    // ── helper privati ──────────────────────────────────────────────────────

    private static decimal Round2(decimal n) => Math.Round(n, 2, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Verifica che il numero non sia già usato da un altro acquisto (parità con il
    /// controllo di unicità del backend, indice idx_acquisti_numero).
    /// </summary>
    private static void EnsureNumeroLibero(SqliteConnection conn, SqliteTransaction tx, string numero, long? exceptId)
    {
        var dup = conn.ExecuteScalar<long?>(
            "SELECT id FROM acquisti WHERE numero=@numero AND (@id IS NULL OR id<>@id) LIMIT 1",
            new { numero, id = exceptId }, tx);
        if (dup != null)
            throw new InvalidOperationException($"Il numero {numero} è già utilizzato da un altro documento");
    }

    /// <summary>
    /// Pulizie pre-eliminazione comuni a Delete/DeleteMany: scollega i pagamenti e
    /// azzera il riferimento dagli arrivi merce (come fa remove() nel backend).
    /// </summary>
    private static void PulisciDipendenze(SqliteConnection conn, SqliteTransaction tx, IReadOnlyCollection<long> ids)
    {
        conn.Execute("DELETE FROM pagamenti WHERE acquisto_id IN @ids", new { ids }, tx);
        conn.Execute("UPDATE arrivi_merce SET acquisto_id=NULL WHERE acquisto_id IN @ids", new { ids }, tx);
    }

    private static void SaveRighe(SqliteConnection conn, SqliteTransaction tx, long acquistoId, IEnumerable<AcquistoRiga> righe)
    {
        foreach (var r in righe)
        {
            conn.Execute(@"
                INSERT INTO acquisti_righe
                  (acquisto_id, prodotto_id, codice_prodotto, descrizione, quantita,
                   prezzo, sconto, iva, codice_iva, unita_misura, variante_id,
                   variante_taglia, variante_colore, tipo)
                VALUES
                  (@acquistoId, @ProdottoId, @CodiceProdotto, @Descrizione, @Quantita,
                   @Prezzo, @Sconto, @Iva, @CodiceIva, @UnitaMisura, @VarianteId,
                   @VarianteTaglia, @VarianteColore, @Tipo)",
                new
                {
                    acquistoId,
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
                }, tx);
        }
    }

    /// <summary>Parametri della testata. Applica il default stato=RICEVUTA e gli id 0→NULL.</summary>
    private static object BindTestata(Acquisto a, long? id = null) => new
    {
        Id = id ?? a.Id,
        a.Numero,
        a.DataEmissione,
        // fornitore_id/tipo_pagamento_id/conto_acquisto_id: 0 → NULL (come opt_i64 nel backend).
        FornitoreId = a.FornitoreId is > 0 ? a.FornitoreId : null,
        TipoPagamentoId = a.TipoPagamentoId is > 0 ? a.TipoPagamentoId : null,
        a.Note,
        Stato = string.IsNullOrEmpty(a.Stato) ? "RICEVUTA" : a.Stato,
        ContoAcquistoId = a.ContoAcquistoId is > 0 ? a.ContoAcquistoId : null,
    };
}

using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD dei preventivi con Dapper. Porta la logica del backend Rust
/// (routes/preventivi.rs): numero univoco, default validità/stato, ricostruzione
/// completa delle righe in update, totali calcolati dalle righe, cambio stato e
/// conversione in DDT/ordine.
///
/// Ottimizzazioni rispetto al backend:
///  - GetAll calcola imponibile/totale di TUTTI i documenti con un'unica query
///    aggregata (GROUP BY), invece di due sub-query per riga come faceva to_dto
///    (N+1 risolto).
/// </summary>
public sealed class PreventivoRepository
{
    // Alias snake_case → PascalCase, riusato dalle query di lista/dettaglio.
    private const string PreventivoColumns = @"
        p.id              AS Id,
        p.numero          AS Numero,
        p.data_emissione  AS DataEmissione,
        p.cliente_id      AS ClienteId,
        p.validita        AS Validita,
        p.stato           AS Stato,
        p.note            AS Note,
        p.stampa_immagini AS StampaImmagini,
        c.ragione_sociale AS ClienteNome";

    private const string RigaColumns = @"
        r.id              AS Id,
        r.preventivo_id   AS PreventivoId,
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
    /// Tutti i preventivi, più recenti per primi, con nome cliente e con
    /// imponibile/totale precalcolati in SQL (un'unica query aggregata sulle
    /// righe: niente N+1). Le righe non vengono caricate qui.
    /// </summary>
    public List<Preventivo> GetAll()
    {
        using var conn = Db.Open();

        var preventivi = conn.Query<Preventivo>($@"
            SELECT {PreventivoColumns}
            FROM preventivi p
            LEFT JOIN clienti c ON c.id = p.cliente_id
            ORDER BY p.data_emissione DESC, p.id DESC").ToList();

        if (preventivi.Count == 0) return preventivi;

        // Totali di TUTTI i documenti in un colpo solo. Stessa formula di to_dto:
        //   imponibile = Σ q·p·(1-sconto/100), totale = imponibile·(1+iva/100).
        // Le righe NOTA sono escluse, coerentemente con il calcolo sul modello
        // (PreventivoRiga.Imponibile/Totale) e con DdtRepository: così la cifra
        // della lista coincide con quella del dettaglio.
        var totali = conn.Query<(long PreventivoId, decimal Imponibile, decimal Totale)>(@"
            SELECT preventivo_id AS PreventivoId,
                   COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0)), 0) AS Imponibile,
                   COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + iva/100.0)), 0) AS Totale
            FROM preventivi_righe
            WHERE COALESCE(NULLIF(tipo,''),'PRODOTTO') != 'NOTA'
            GROUP BY preventivo_id")
            .ToDictionary(t => t.PreventivoId);

        foreach (var p in preventivi)
            if (totali.TryGetValue(p.Id, out var t))
            {
                p.ImponibileListato = t.Imponibile;
                p.TotaleListato = t.Totale;
            }
            else
            {
                p.ImponibileListato = 0m;
                p.TotaleListato = 0m;
            }

        return preventivi;
    }

    /// <summary>Dettaglio completo: testata + righe (con nome prodotto via JOIN).</summary>
    public Preventivo? GetById(long id)
    {
        using var conn = Db.Open();

        var p = conn.QuerySingleOrDefault<Preventivo>($@"
            SELECT {PreventivoColumns}
            FROM preventivi p
            LEFT JOIN clienti c ON c.id = p.cliente_id
            WHERE p.id = @id", new { id });
        if (p == null) return null;

        p.Righe = conn.Query<PreventivoRiga>($@"
            SELECT {RigaColumns}
            FROM preventivi_righe r
            LEFT JOIN prodotti pr ON pr.id = r.prodotto_id
            WHERE r.preventivo_id = @id
            ORDER BY r.id", new { id }).ToList();

        return p;
    }

    /// <summary>
    /// Inserisce un preventivo e le sue righe in transazione. Verifica l'unicità
    /// del numero (come il backend) e applica i default validità=30/stato=INVIATO.
    /// </summary>
    public long Insert(Preventivo p)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, p.Numero, null);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO preventivi
              (numero, data_emissione, cliente_id, validita, stato, note, stampa_immagini)
            VALUES
              (@Numero, @DataEmissione, @ClienteId, @Validita, @Stato, @Note, @StampaImmagini);
            SELECT last_insert_rowid();", BindTestata(p), tx);

        SaveRighe(conn, tx, id, p.Righe);

        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna la testata e ricostruisce TUTTE le righe (delete + reinsert),
    /// come fa update() nel backend. Verifica l'unicità del numero escludendo
    /// il documento stesso.
    /// </summary>
    public void Update(Preventivo p)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, p.Numero, p.Id);

        conn.Execute(@"
            UPDATE preventivi SET
              numero=@Numero, data_emissione=@DataEmissione, cliente_id=@ClienteId,
              validita=@Validita, stato=@Stato, note=@Note, stampa_immagini=@StampaImmagini
            WHERE id=@Id", BindTestata(p, p.Id), tx);

        conn.Execute("DELETE FROM preventivi_righe WHERE preventivo_id=@Id", new { p.Id }, tx);
        SaveRighe(conn, tx, p.Id, p.Righe);

        tx.Commit();
    }

    /// <summary>Elimina un preventivo. Le righe vanno via in CASCADE.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM preventivi WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        conn.Execute("DELETE FROM preventivi WHERE id IN @ids", new { ids = list }, tx);
        tx.Commit();
        return list.Count;
    }

    /// <summary>Cambia lo stato di un preventivo (patch_stato del backend).</summary>
    public void SetStato(long id, string stato)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE preventivi SET stato=@stato WHERE id=@id", new { id, stato });
    }

    /// <summary>Cambio stato in blocco per più documenti (multi-selezione).</summary>
    public void SetStatoMany(IEnumerable<long> ids, string stato)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return;
        using var conn = Db.Open();
        conn.Execute("UPDATE preventivi SET stato=@stato WHERE id IN @ids", new { stato, ids = list });
    }

    // ── helper privati ──────────────────────────────────────────────────────

    /// <summary>
    /// Verifica che il numero non sia già usato da un altro documento (parità con
    /// il vincolo di unicità del backend e con l'indice idx_preventivi_numero).
    /// </summary>
    private static void EnsureNumeroLibero(SqliteConnection conn, SqliteTransaction tx, string numero, long? exceptId)
    {
        var dup = conn.ExecuteScalar<long?>(
            "SELECT id FROM preventivi WHERE numero=@numero AND (@id IS NULL OR id<>@id) LIMIT 1",
            new { numero, id = exceptId }, tx);
        if (dup != null)
            throw new InvalidOperationException($"Il numero {numero} è già utilizzato da un altro documento");
    }

    private static void SaveRighe(SqliteConnection conn, SqliteTransaction tx, long preventivoId, IEnumerable<PreventivoRiga> righe)
    {
        foreach (var r in righe)
        {
            conn.Execute(@"
                INSERT INTO preventivi_righe
                  (preventivo_id, prodotto_id, codice_prodotto, descrizione, quantita,
                   prezzo, sconto, iva, unita_misura, variante_id, variante_taglia,
                   variante_colore, tipo, codice_iva)
                VALUES
                  (@preventivoId, @ProdottoId, @CodiceProdotto, @Descrizione, @Quantita,
                   @Prezzo, @Sconto, @Iva, @UnitaMisura, @VarianteId, @VarianteTaglia,
                   @VarianteColore, @Tipo, @CodiceIva)",
                new
                {
                    preventivoId,
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
                    r.CodiceIva,
                }, tx);
        }
    }

    /// <summary>Parametri della testata. Applica i default validità=30/stato=INVIATO.</summary>
    private static object BindTestata(Preventivo p, long? id = null) => new
    {
        Id = id ?? p.Id,
        p.Numero,
        p.DataEmissione,
        // cliente_id: 0 → NULL (come opt_i64 nel backend).
        ClienteId = p.ClienteId is > 0 ? p.ClienteId : null,
        Validita = p.Validita != 0 ? p.Validita : 30,
        Stato = string.IsNullOrEmpty(p.Stato) ? "INVIATO" : p.Stato,
        p.Note,
        StampaImmagini = p.StampaImmagini ? 1 : 0,
    };
}

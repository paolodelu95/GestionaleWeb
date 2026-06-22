using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD dei documenti di trasporto con Dapper. Porta la logica del backend Rust
/// (routes/ddt.rs): JOIN su clienti/fornitori e fatture per nome controparte e
/// collegamento fattura, totali derivati dalle righe in SQL, controllo numero
/// univoco, eliminazione che scollega le fatture, conversione DDT→fattura.
/// La lista calcola imponibile/totale in SQL e carica TUTTE le righe in batch
/// (niente query in loop / N+1). Lo scarico magazzino è demandato al backend
/// online: qui non si tocca <c>prodotti.quantita</c>.
/// </summary>
public sealed class DdtRepository
{
    // Alias snake_case → PascalCase per la testata. clienteNome/fornitoreNome e
    // fatturaId/fatturaNumero arrivano dalle JOIN; i totali da subquery sulle righe.
    private const string ListSelect = @"
        SELECT
            d.id                       AS Id,
            d.numero                   AS Numero,
            d.data_emissione           AS DataEmissione,
            COALESCE(NULLIF(d.tipo,''),'CLIENTE') AS Tipo,
            d.cliente_id               AS ClienteId,
            c.ragione_sociale          AS ClienteNome,
            d.fornitore_id             AS FornitoreId,
            fo.ragione_sociale         AS FornitoreNome,
            d.stato                    AS Stato,
            d.note                     AS Note,
            d.causale                  AS CausaleTrasporto,
            d.data_ora_inizio_trasporto AS DataOraInizioTrasporto,
            d.aspetto_beni             AS AspettoBeni,
            COALESCE(NULLIF(d.porto,''),'Franco') AS Porto,
            d.numero_colli             AS NumeroColli,
            d.peso_lordo               AS PesoLordo,
            COALESCE(NULLIF(d.incaricato_trasporto,''),'Mittente') AS IncaricatoTrasporto,
            d.vettore                  AS Vettore,
            d.destinazione_diversa     AS DestinazioneDiversa,
            d.note_trasporto           AS NoteTrasporto,
            d.destinazione_id          AS DestinazioneId,
            f.id                       AS FatturaId,
            f.numero                   AS FatturaNumero,
            (SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0)), 0)
                 FROM ddt_righe WHERE ddt_id = d.id AND COALESCE(NULLIF(tipo,''),'PRODOTTO') != 'NOTA') AS ImponibileListato,
            (SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + iva/100.0)), 0)
                 FROM ddt_righe WHERE ddt_id = d.id AND COALESCE(NULLIF(tipo,''),'PRODOTTO') != 'NOTA') AS TotaleListato
        FROM ddt d
        LEFT JOIN clienti   c  ON d.cliente_id   = c.id
        LEFT JOIN fornitori fo ON d.fornitore_id = fo.id
        LEFT JOIN fatture   f  ON f.ddt_id       = d.id";

    private const string RigheSelect = @"
        SELECT
            dr.id              AS Id,
            dr.ddt_id          AS DdtId,
            dr.prodotto_id     AS ProdottoId,
            p.nome             AS ProdottoNome,
            dr.codice_prodotto AS CodiceProdotto,
            dr.descrizione     AS Descrizione,
            dr.quantita        AS Quantita,
            dr.unita_misura    AS UnitaMisura,
            dr.prezzo          AS Prezzo,
            dr.sconto          AS Sconto,
            dr.iva             AS Iva,
            dr.codice_iva      AS CodiceIva,
            dr.variante_id     AS VarianteId,
            dr.variante_taglia AS VarianteTaglia,
            dr.variante_colore AS VarianteColore,
            COALESCE(NULLIF(dr.tipo,''),'PRODOTTO') AS Tipo,
            dr.scarica_magazzino AS ScaricaMagazzino
        FROM ddt_righe dr
        LEFT JOIN prodotti p ON dr.prodotto_id = p.id";

    /// <summary>Tutti i DDT (più recente prima) con righe caricate in batch.</summary>
    public List<Ddt> GetAll()
    {
        using var conn = Db.Open();
        var docs = conn.Query<Ddt>($"{ListSelect} ORDER BY d.data_emissione DESC, d.id DESC").ToList();
        if (docs.Count == 0) return docs;

        // Carica TUTTE le righe in un colpo solo e raggruppale per ddt_id (no N+1).
        var righe = conn.Query<DdtRiga>(
                $"{RigheSelect} ORDER BY dr.ddt_id, dr.id")
            .GroupBy(r => r.DdtId)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var d in docs)
            if (righe.TryGetValue(d.Id, out var rs))
                d.Righe = rs;

        return docs;
    }

    /// <summary>Dettaglio completo: testata + righe.</summary>
    public Ddt? GetById(long id)
    {
        using var conn = Db.Open();
        var d = conn.QuerySingleOrDefault<Ddt>($"{ListSelect} WHERE d.id = @id", new { id });
        if (d == null) return null;
        d.Righe = conn.Query<DdtRiga>($"{RigheSelect} WHERE dr.ddt_id = @id ORDER BY dr.id", new { id }).ToList();
        return d;
    }

    /// <summary>
    /// Inserisce un DDT (+ righe) e ne restituisce l'id. Replica create() del
    /// backend: tipo FORNITORE azzera cliente_id e viceversa, numero univoco.
    /// </summary>
    public long Insert(Ddt d)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, d.Numero, null);
        Normalizza(d);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO ddt
              (numero, data_emissione, tipo, cliente_id, fornitore_id, causale, note, stato,
               data_ora_inizio_trasporto, aspetto_beni, porto, numero_colli, peso_lordo,
               incaricato_trasporto, vettore, destinazione_diversa, note_trasporto, destinazione_id)
            VALUES
              (@Numero, @DataEmissione, @Tipo, @ClienteId, @FornitoreId, @CausaleTrasporto, @Note, @Stato,
               @DataOraInizioTrasporto, @AspettoBeni, @Porto, @NumeroColli, @PesoLordo,
               @IncaricatoTrasporto, @Vettore, @DestinazioneDiversa, @NoteTrasporto, @DestinazioneId);
            SELECT last_insert_rowid();", Bind(d), tx);

        SalvaRighe(conn, tx, id, d.Righe);
        tx.Commit();
        return id;
    }

    /// <summary>Aggiorna testata e ricostruisce le righe. Replica update().</summary>
    public void Update(Ddt d)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        EnsureNumeroLibero(conn, tx, d.Numero, d.Id);
        Normalizza(d);

        conn.Execute(@"
            UPDATE ddt SET
              numero=@Numero, data_emissione=@DataEmissione, tipo=@Tipo,
              cliente_id=@ClienteId, fornitore_id=@FornitoreId, causale=@CausaleTrasporto,
              note=@Note, stato=@Stato, data_ora_inizio_trasporto=@DataOraInizioTrasporto,
              aspetto_beni=@AspettoBeni, porto=@Porto, numero_colli=@NumeroColli,
              peso_lordo=@PesoLordo, incaricato_trasporto=@IncaricatoTrasporto,
              vettore=@Vettore, destinazione_diversa=@DestinazioneDiversa,
              note_trasporto=@NoteTrasporto, destinazione_id=@DestinazioneId
            WHERE id=@Id", Bind(d, d.Id), tx);

        conn.Execute("DELETE FROM ddt_righe WHERE ddt_id=@Id", new { d.Id }, tx);
        SalvaRighe(conn, tx, d.Id, d.Righe);

        tx.Commit();
    }

    /// <summary>
    /// Elimina un DDT scollegando prima le fatture collegate (parità con remove():
    /// fatture.ddt_id=NULL, pulizia fatture_ddt). Le righe vanno via in CASCADE,
    /// ma le cancello esplicitamente perché lo scarico magazzino qui non è gestito.
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

    /// <summary>
    /// Duplica un DDT: copia testata e righe con un nuovo numero, data odierna e
    /// stato EMESSO. Porta duplicate() del componente Angular. Restituisce il
    /// nuovo id, oppure -1 se la sorgente non esiste.
    /// </summary>
    public long Duplica(long sourceId)
    {
        var src = GetById(sourceId);
        if (src == null) return -1;

        src.Id = 0;
        src.Numero = ProssimoNumero();
        src.DataEmissione = DateTime.Now.ToString("yyyy-MM-dd");
        src.Stato = "EMESSO";
        src.FatturaId = null;
        src.FatturaNumero = null;
        foreach (var r in src.Righe) { r.Id = 0; r.DdtId = 0; }

        return Insert(src);
    }

    /// <summary>Cambia solo lo stato (EMESSO/ANNULLATO). Porta patch_stato().</summary>
    public void SetStato(long id, string stato)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE ddt SET stato=@stato WHERE id=@id", new { id, stato });
    }

    /// <summary>Imposta lo stato su un gruppo di documenti in una transazione.</summary>
    public void SetStatoMany(IEnumerable<long> ids, string stato)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            conn.Execute("UPDATE ddt SET stato=@stato WHERE id=@id", new { id, stato }, tx);
        tx.Commit();
    }

    /// <summary>
    /// Converte il DDT (verso cliente) in una nuova fattura EMESSA, copiando le
    /// righe. Porta to_fattura(): un reso fornitore non è convertibile e un DDT
    /// già fatturato dà errore. Restituisce l'id della fattura creata.
    /// </summary>
    public long ToFattura(long ddtId)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var ddt = conn.QuerySingleOrDefault(
            @"SELECT COALESCE(NULLIF(tipo,''),'CLIENTE') AS Tipo,
                     cliente_id AS ClienteId, numero AS Numero
              FROM ddt WHERE id=@ddtId", new { ddtId }, tx);
        if (ddt == null)
            throw new InvalidOperationException("Documento di trasporto non trovato");
        if ((string)ddt.Tipo == "FORNITORE")
            throw new InvalidOperationException(
                "Un documento di trasporto verso un fornitore (reso) non può essere convertito in fattura");

        var giaFatt = conn.ExecuteScalar<string?>(
            "SELECT numero FROM fatture WHERE ddt_id=@ddtId", new { ddtId }, tx);
        if (!string.IsNullOrEmpty(giaFatt))
            throw new InvalidOperationException($"Documento di trasporto già collegato alla fattura n. {giaFatt}");

        long? clienteId = ddt.ClienteId == null ? null : (long?)Convert.ToInt64(ddt.ClienteId);
        var dnum = (string?)ddt.Numero ?? "";
        var numero = ProssimoNumeroFattura(conn, tx);
        var data = DateTime.Now.ToString("yyyy-MM-dd");

        var fatturaId = conn.ExecuteScalar<long>(@"
            INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato)
            VALUES (@numero, @data, @clienteId, @ddtId, @note, 'EMESSA');
            SELECT last_insert_rowid();",
            new { numero, data, clienteId, ddtId, note = $"Da documento di trasporto n. {dnum}" }, tx);

        conn.Execute("INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id) VALUES (@fatturaId, @ddtId)",
            new { fatturaId, ddtId }, tx);

        conn.Execute(@"
            INSERT INTO fatture_righe
              (fattura_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva,
               unita_misura, variante_id, variante_taglia, variante_colore)
            SELECT @fatturaId, prodotto_id, descrizione, quantita, prezzo, COALESCE(sconto,0), iva,
                   unita_misura, variante_id, variante_taglia, variante_colore
            FROM ddt_righe WHERE ddt_id=@ddtId", new { fatturaId, ddtId }, tx);

        tx.Commit();
        return fatturaId;
    }

    /// <summary>
    /// Calcola il prossimo numero documento per i DDT dell'anno corrente.
    /// Replica in modo semplice get_next_numero("ddt"): max numerico + 1.
    /// </summary>
    public string ProssimoNumero()
    {
        using var conn = Db.Open();
        var max = conn.ExecuteScalar<long?>(
            @"SELECT MAX(CAST(numero AS INTEGER)) FROM ddt
              WHERE numero GLOB '[0-9]*' AND substr(data_emissione,1,4)=@anno",
            new { anno = DateTime.Now.Year.ToString() }) ?? 0;
        return (max + 1).ToString();
    }

    // ── helper privati ─────────────────────────────────────────────────────────

    /// <summary>Verifica che il numero non sia già usato da un altro documento.</summary>
    private static void EnsureNumeroLibero(SqliteConnection conn, SqliteTransaction tx, string numero, long? selfId)
    {
        var exists = conn.ExecuteScalar<long?>(
            "SELECT id FROM ddt WHERE numero=@numero AND (@selfId IS NULL OR id<>@selfId) LIMIT 1",
            new { numero, selfId }, tx);
        if (exists != null)
            throw new InvalidOperationException($"Il numero {numero} è già utilizzato da un altro documento");
    }

    /// <summary>
    /// Allinea i campi alla logica del backend: FORNITORE azzera cliente_id e
    /// viceversa; default su tipo/porto/incaricato/stato.
    /// </summary>
    private static void Normalizza(Ddt d)
    {
        d.Tipo = d.IsFornitore ? "FORNITORE" : "CLIENTE";
        if (d.IsFornitore) d.ClienteId = null; else d.FornitoreId = null;
        if (string.IsNullOrWhiteSpace(d.Stato)) d.Stato = "EMESSO";
        if (string.IsNullOrWhiteSpace(d.Porto)) d.Porto = "Franco";
        if (string.IsNullOrWhiteSpace(d.IncaricatoTrasporto)) d.IncaricatoTrasporto = "Mittente";
    }

    private static void SalvaRighe(SqliteConnection conn, SqliteTransaction tx, long ddtId, IEnumerable<DdtRiga> righe)
    {
        foreach (var r in righe)
        {
            conn.Execute(@"
                INSERT INTO ddt_righe
                  (ddt_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo, sconto,
                   iva, codice_iva, unita_misura, variante_id, variante_taglia, variante_colore,
                   tipo, scarica_magazzino)
                VALUES
                  (@ddtId, @ProdottoId, @CodiceProdotto, @Descrizione, @Quantita, @Prezzo, @Sconto,
                   @Iva, @CodiceIva, @UnitaMisura, @VarianteId, @VarianteTaglia, @VarianteColore,
                   @Tipo, @ScaricaMagazzino)",
                new
                {
                    ddtId,
                    r.ProdottoId,
                    r.CodiceProdotto,
                    r.Descrizione,
                    r.Quantita,
                    r.Prezzo,
                    r.Sconto,
                    r.Iva,
                    r.CodiceIva,
                    r.UnitaMisura,
                    r.VarianteId,
                    r.VarianteTaglia,
                    r.VarianteColore,
                    Tipo = string.IsNullOrWhiteSpace(r.Tipo) ? "PRODOTTO" : r.Tipo,
                    ScaricaMagazzino = r.ScaricaMagazzino ? 1 : 0,
                }, tx);
        }
    }

    private static void DeleteCore(SqliteConnection conn, SqliteTransaction tx, long id)
    {
        conn.Execute("UPDATE fatture SET ddt_id = NULL WHERE ddt_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM fatture_ddt WHERE ddt_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM ddt_righe WHERE ddt_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM ddt WHERE id=@id", new { id }, tx);
    }

    /// <summary>Prossimo numero fattura (max numerico + 1 sull'anno corrente).</summary>
    private static string ProssimoNumeroFattura(SqliteConnection conn, SqliteTransaction tx)
    {
        var max = conn.ExecuteScalar<long?>(
            @"SELECT MAX(CAST(numero AS INTEGER)) FROM fatture
              WHERE numero GLOB '[0-9]*' AND substr(data_emissione,1,4)=@anno",
            new { anno = DateTime.Now.Year.ToString() }, tx) ?? 0;
        return (max + 1).ToString();
    }

    /// <summary>Parametri per INSERT/UPDATE testata.</summary>
    private static object Bind(Ddt d, long? id = null) => new
    {
        Id = id ?? d.Id,
        d.Numero,
        d.DataEmissione,
        d.Tipo,
        d.ClienteId,
        d.FornitoreId,
        d.CausaleTrasporto,
        d.Note,
        d.Stato,
        d.DataOraInizioTrasporto,
        d.AspettoBeni,
        d.Porto,
        d.NumeroColli,
        d.PesoLordo,
        d.IncaricatoTrasporto,
        d.Vettore,
        d.DestinazioneDiversa,
        d.NoteTrasporto,
        d.DestinazioneId,
    };
}

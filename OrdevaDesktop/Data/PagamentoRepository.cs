using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.Services;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD del registro incassi/pagamenti con Dapper. Porta la logica di
/// routes/pagamenti.rs:
///  - lista con tutti i JOIN (fattura/cliente, acquisto/fornitore, tipo pagamento,
///    vendita banco) in un'unica query: niente N+1;
///  - validazione del movimento (data, importo positivo, mutua esclusione
///    fattura/acquisto, residuo non superato oltre tolleranza);
///  - conto ereditato dal tipo di pagamento;
///  - ricalcolo dello stato di fattura/acquisto dopo insert/update/delete;
///  - scadenzario (documenti con residuo da saldare) con la stessa formula.
/// </summary>
public sealed class PagamentoRepository
{
    /// <summary>Tolleranza sul confronto importo/residuo (come TOLERANCE nel backend).</summary>
    private const decimal Tolerance = 0.05m;

    // Alias snake_case → PascalCase, riusato dalla query di lista.
    private const string PagamentoColumns = @"
        p.id                  AS Id,
        p.fattura_id          AS FatturaId,
        p.acquisto_id         AS AcquistoId,
        p.vendita_banco_id    AS VenditaBancoId,
        p.data_pagamento      AS DataPagamento,
        p.importo             AS Importo,
        p.metodo              AS Metodo,
        p.note                AS Note,
        p.tipo                AS Tipo,
        p.conto               AS Conto,
        p.causale             AS Causale,
        p.tipo_pagamento_id   AS TipoPagamentoId,
        f.numero              AS FatturaNumero,
        a.numero              AS AcquistoNumero,
        vb.numero             AS VenditaBancoNumero,
        COALESCE(c.ragione_sociale, vb.cliente_nome) AS ClienteNome,
        forn.ragione_sociale  AS FornitoreNome,
        tp.nome               AS TipoPagamentoNome";

    private const string PagamentoFrom = @"
        FROM pagamenti p
        LEFT JOIN fatture f       ON f.id    = p.fattura_id
        LEFT JOIN clienti c       ON c.id    = f.cliente_id
        LEFT JOIN acquisti a      ON a.id    = p.acquisto_id
        LEFT JOIN fornitori forn  ON forn.id = a.fornitore_id
        LEFT JOIN tipi_pagamento tp ON tp.id = p.tipo_pagamento_id
        LEFT JOIN vendite_banco vb  ON vb.id = p.vendita_banco_id";

    /// <summary>
    /// Tutti i movimenti, dal più recente, con i nomi di controparte e documento
    /// risolti via JOIN (una sola query: niente N+1). Filtrabile per verso.
    /// </summary>
    /// <param name="tipo">"ENTRATA" / "USCITA" / null per tutti.</param>
    public List<Pagamento> GetAll(string? tipo = null)
    {
        var where = tipo switch
        {
            "ENTRATA" => "WHERE p.tipo = 'ENTRATA'",
            "USCITA"  => "WHERE p.tipo = 'USCITA'",
            _         => "",
        };

        using var conn = Db.Open();
        return conn.Query<Pagamento>($@"
            SELECT {PagamentoColumns}
            {PagamentoFrom}
            {where}
            ORDER BY p.data_pagamento DESC, p.id DESC").ToList();
    }

    /// <summary>Singolo movimento (con i JOIN), o null se non esiste.</summary>
    public Pagamento? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Pagamento>($@"
            SELECT {PagamentoColumns}
            {PagamentoFrom}
            WHERE p.id = @id", new { id });
    }

    /// <summary>
    /// Scadenzario: fatture EMESSA e acquisti RICEVUTA con residuo &gt; 0.
    /// Porta scadenzario() del backend; i totali righe (IVA inclusa) e i pagati si
    /// aggregano in SQL per documento (niente N+1), la scadenza si calcola in C#.
    /// </summary>
    public List<ScadenzarioEntry> GetScadenzario()
    {
        using var conn = Db.Open();
        var items = new List<ScadenzarioEntry>();

        var fatture = conn.Query<ScadRow>(@"
            SELECT f.id                 AS Id,
                   f.numero             AS Numero,
                   f.data_emissione     AS DataEmissione,
                   c.ragione_sociale    AS Controparte,
                   tp.giorni_scadenza   AS GiorniScadenza,
                   tp.fine_mese         AS FineMese,
                   tp.conto             AS Conto,
                   tp.nome              AS TipoPagamentoNome,
                   COALESCE(SUM(fr.quantita * fr.prezzo * (1 - COALESCE(fr.sconto,0)/100.0) * (1 + COALESCE(fr.iva,0)/100.0)), 0) AS ImportoTotale,
                   COALESCE((SELECT SUM(p.importo) FROM pagamenti p WHERE p.fattura_id = f.id), 0) AS ImportoPagato
            FROM fatture f
            LEFT JOIN clienti c ON c.id = f.cliente_id
            LEFT JOIN fatture_righe fr ON fr.fattura_id = f.id
            LEFT JOIN tipi_pagamento tp ON tp.id = f.tipo_pagamento_id
            WHERE f.stato = 'EMESSA'
            GROUP BY f.id
            HAVING ImportoTotale > ImportoPagato");
        AddScad(items, fatture, "FATTURA");

        var acquisti = conn.Query<ScadRow>(@"
            SELECT a.id                 AS Id,
                   a.numero             AS Numero,
                   a.data_emissione     AS DataEmissione,
                   f.ragione_sociale    AS Controparte,
                   tp.giorni_scadenza   AS GiorniScadenza,
                   tp.fine_mese         AS FineMese,
                   tp.conto             AS Conto,
                   tp.nome              AS TipoPagamentoNome,
                   COALESCE(SUM(ar.quantita * ar.prezzo * (1 - COALESCE(ar.sconto,0)/100.0) * (1 + COALESCE(ar.iva,0)/100.0)), 0) AS ImportoTotale,
                   COALESCE((SELECT SUM(p.importo) FROM pagamenti p WHERE p.acquisto_id = a.id), 0) AS ImportoPagato
            FROM acquisti a
            LEFT JOIN fornitori f ON f.id = a.fornitore_id
            LEFT JOIN acquisti_righe ar ON ar.acquisto_id = a.id
            LEFT JOIN tipi_pagamento tp ON tp.id = a.tipo_pagamento_id
            WHERE a.stato = 'RICEVUTA'
            GROUP BY a.id
            HAVING ImportoTotale > ImportoPagato");
        AddScad(items, acquisti, "ACQUISTO");

        return items
            .OrderBy(e => e.DataScadenza ?? "", StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Inserisce un movimento. Valida (come validate_pagamento), eredita il conto
    /// dal tipo di pagamento e poi ricalcola lo stato del documento collegato.
    /// </summary>
    public long Insert(Pagamento p)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        Valida(conn, tx, p, null);

        var fid = NormId(p.FatturaId);
        var aid = NormId(p.AcquistoId);
        var vbid = NormId(p.VenditaBancoId);
        var tpid = NormId(p.TipoPagamentoId);
        var conto = ContoDaTipo(conn, tx, tpid, p.Conto);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO pagamenti
              (fattura_id, acquisto_id, vendita_banco_id, data_pagamento, importo,
               metodo, note, tipo, tipo_pagamento_id, conto, causale)
            VALUES
              (@fid, @aid, @vbid, @DataPagamento, @Importo,
               @Metodo, @Note, @Tipo, @tpid, @conto, @Causale);
            SELECT last_insert_rowid();",
            new
            {
                fid, aid, vbid,
                p.DataPagamento,
                p.Importo,
                Metodo = string.IsNullOrEmpty(p.Metodo) ? "Bonifico" : p.Metodo,
                p.Note,
                Tipo = string.IsNullOrEmpty(p.Tipo) ? "ENTRATA" : p.Tipo,
                tpid,
                conto,
                p.Causale,
            }, tx);

        if (fid is long f) AggiornaStatoFattura(conn, tx, f);
        if (aid is long a) AggiornaStatoAcquisto(conn, tx, a);

        tx.Commit();
        return id;
    }

    /// <summary>Aggiorna un movimento e ricalcola lo stato del documento collegato.</summary>
    public void Update(Pagamento p)
    {
        if (p.Id is not > 0)
            throw new InvalidOperationException("Pagamento senza id");

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        Valida(conn, tx, p, p.Id);

        var fid = NormId(p.FatturaId);
        var aid = NormId(p.AcquistoId);
        var vbid = NormId(p.VenditaBancoId);
        var tpid = NormId(p.TipoPagamentoId);
        var conto = ContoDaTipo(conn, tx, tpid, p.Conto);

        conn.Execute(@"
            UPDATE pagamenti SET
              fattura_id=@fid, acquisto_id=@aid, vendita_banco_id=@vbid,
              data_pagamento=@DataPagamento, importo=@Importo, metodo=@Metodo,
              note=@Note, tipo=@Tipo, tipo_pagamento_id=@tpid, conto=@conto, causale=@Causale
            WHERE id=@Id",
            new
            {
                fid, aid, vbid,
                p.DataPagamento,
                p.Importo,
                Metodo = string.IsNullOrEmpty(p.Metodo) ? "Bonifico" : p.Metodo,
                p.Note,
                Tipo = string.IsNullOrEmpty(p.Tipo) ? "ENTRATA" : p.Tipo,
                tpid,
                conto,
                p.Causale,
                p.Id,
            }, tx);

        if (fid is long f) AggiornaStatoFattura(conn, tx, f);
        if (aid is long a) AggiornaStatoAcquisto(conn, tx, a);

        tx.Commit();
    }

    /// <summary>
    /// Elimina un movimento e riporta a EMESSA/RICEVUTA il documento collegato se
    /// resta scoperto (come remove() del backend).
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var link = conn.QuerySingleOrDefault<(long? FatturaId, long? AcquistoId)>(
            "SELECT fattura_id AS FatturaId, acquisto_id AS AcquistoId FROM pagamenti WHERE id=@id",
            new { id }, tx);

        conn.Execute("DELETE FROM pagamenti WHERE id=@id", new { id }, tx);

        if (link.FatturaId is long f && f > 0) AggiornaStatoFattura(conn, tx, f);
        if (link.AcquistoId is long a && a > 0) AggiornaStatoAcquisto(conn, tx, a);

        tx.Commit();
    }

    /// <summary>
    /// Eliminazione in blocco (multi-selezione) in un'unica transazione, con
    /// ricalcolo dello stato di tutti i documenti coinvolti.
    /// </summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var links = conn.Query<(long? FatturaId, long? AcquistoId)>(
            "SELECT fattura_id AS FatturaId, acquisto_id AS AcquistoId FROM pagamenti WHERE id IN @ids",
            new { ids = list }, tx).ToList();

        conn.Execute("DELETE FROM pagamenti WHERE id IN @ids", new { ids = list }, tx);

        foreach (var f in links.Where(l => l.FatturaId is > 0).Select(l => l.FatturaId!.Value).Distinct())
            AggiornaStatoFattura(conn, tx, f);
        foreach (var a in links.Where(l => l.AcquistoId is > 0).Select(l => l.AcquistoId!.Value).Distinct())
            AggiornaStatoAcquisto(conn, tx, a);

        tx.Commit();
        return list.Count;
    }

    /// <summary>
    /// Registra il saldo di una voce di scadenzario (come registraPagamento
    /// dell'Angular): determina verso, fattura/acquisto e conto dalla voce, poi
    /// inserisce il movimento.
    /// </summary>
    public long SaldaScadenza(ScadenzarioEntry entry, decimal importo, string dataPagamento, long? tipoPagamentoId)
    {
        var isFattura = entry.TipoEntry == "FATTURA";
        var p = new Pagamento
        {
            DataPagamento = dataPagamento,
            Importo = importo,
            Tipo = isFattura ? "ENTRATA" : "USCITA",
            Conto = string.IsNullOrEmpty(entry.Conto) ? "BANCA" : entry.Conto,
            FatturaId = isFattura ? entry.Id : null,
            AcquistoId = isFattura ? null : entry.Id,
            TipoPagamentoId = tipoPagamentoId,
            Metodo = string.IsNullOrWhiteSpace(entry.TipoPagamentoNome) ? "Bonifico" : entry.TipoPagamentoNome!,
            Note = "",
        };
        return Insert(p);
    }

    // ── helper privati ─────────────────────────────────────────────────────────

    /// <summary>0/null → null (come opt_i64 del backend: 0 vale "scollegato").</summary>
    private static long? NormId(long? v) => v is > 0 ? v : null;

    private static decimal Round2(decimal n) => Math.Round(n, 2, MidpointRounding.AwayFromZero);

    private static void AddScad(List<ScadenzarioEntry> items, IEnumerable<ScadRow> rows, string tipoEntry)
    {
        foreach (var r in rows)
        {
            var totale = Round2(r.ImportoTotale);
            var pagato = Round2(r.ImportoPagato);
            items.Add(new ScadenzarioEntry
            {
                Id = r.Id,
                TipoEntry = tipoEntry,
                Numero = r.Numero,
                DataEmissione = r.DataEmissione ?? "",
                Controparte = r.Controparte,
                TipoPagamentoNome = r.TipoPagamentoNome,
                Conto = string.IsNullOrEmpty(r.Conto) ? "BANCA" : r.Conto!,
                DataScadenza = DataScadenza.Calcola(r.DataEmissione ?? "", r.GiorniScadenza ?? 0, r.FineMese == 1),
                ImportoTotale = totale,
                ImportoPagato = pagato,
                Rimanente = Round2(totale - pagato),
            });
        }
    }

    /// <summary>
    /// Valida un movimento come validate_pagamento del backend: data presente,
    /// importo positivo, al massimo uno tra fattura e acquisto, residuo non
    /// superato oltre la tolleranza.
    /// </summary>
    private static void Valida(SqliteConnection conn, SqliteTransaction tx, Pagamento p, long? exclude)
    {
        if (string.IsNullOrWhiteSpace(p.DataPagamento))
            throw new InvalidOperationException("La data del pagamento è obbligatoria");

        if (p.Importo <= 0m)
            throw new InvalidOperationException("L'importo deve essere positivo");

        var fid = NormId(p.FatturaId);
        var aid = NormId(p.AcquistoId);
        if (fid is not null && aid is not null)
            throw new InvalidOperationException("Specificare al massimo uno tra fattura e acquisto");

        if (fid is null && aid is null)
            return; // movimento libero: nessun controllo sul residuo

        var (totale, rimanente) = CalcolaRimanente(conn, tx, fid, aid, exclude)
            ?? throw new InvalidOperationException("Fattura/acquisto non trovato");

        if (totale <= 0m)
            throw new InvalidOperationException("Documento senza righe imponibili");

        if (p.Importo > rimanente + Tolerance)
            throw new InvalidOperationException(
                $"L'importo {p.Importo:0.00} € supera il residuo ({rimanente:0.00} €)");
    }

    /// <summary>(totale documento IVA inclusa, residuo escludendo il pagamento corrente).</summary>
    private static (decimal Totale, decimal Rimanente)? CalcolaRimanente(
        SqliteConnection conn, SqliteTransaction tx, long? fatturaId, long? acquistoId, long? exclude)
    {
        if (fatturaId is long fid)
        {
            var totale = conn.ExecuteScalar<decimal>(
                "SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) FROM fatture_righe WHERE fattura_id=@fid",
                new { fid }, tx);
            var pagato = conn.ExecuteScalar<decimal>(
                "SELECT COALESCE(SUM(importo), 0) FROM pagamenti WHERE fattura_id=@fid AND (@ex IS NULL OR id <> @ex)",
                new { fid, ex = exclude }, tx);
            return (totale, totale - pagato);
        }
        if (acquistoId is long aid)
        {
            var totale = conn.ExecuteScalar<decimal>(
                "SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) FROM acquisti_righe WHERE acquisto_id=@aid",
                new { aid }, tx);
            var pagato = conn.ExecuteScalar<decimal>(
                "SELECT COALESCE(SUM(importo), 0) FROM pagamenti WHERE acquisto_id=@aid AND (@ex IS NULL OR id <> @ex)",
                new { aid, ex = exclude }, tx);
            return (totale, totale - pagato);
        }
        return null;
    }

    /// <summary>Eredita il conto dal tipo di pagamento; in mancanza usa il fallback o "BANCA".</summary>
    private static string ContoDaTipo(SqliteConnection conn, SqliteTransaction tx, long? tpid, string? fallback)
    {
        if (tpid is long id)
        {
            var conto = conn.ExecuteScalar<string?>(
                "SELECT conto FROM tipi_pagamento WHERE id=@id", new { id }, tx);
            if (!string.IsNullOrEmpty(conto)) return conto!;
        }
        return string.IsNullOrEmpty(fallback) ? "BANCA" : fallback!;
    }

    /// <summary>
    /// Ricalcola lo stato di una fattura come aggiorna_stato_fattura: STORNATA se ha
    /// note di credito, altrimenti PAGATA se coperta, altrimenti EMESSA.
    /// </summary>
    private static void AggiornaStatoFattura(SqliteConnection conn, SqliteTransaction tx, long fatturaId)
    {
        var nc = conn.ExecuteScalar<long>(
            "SELECT COUNT(*) FROM note_credito WHERE fattura_id=@id", new { id = fatturaId }, tx);
        if (nc > 0)
        {
            conn.Execute("UPDATE fatture SET stato='STORNATA' WHERE id=@id", new { id = fatturaId }, tx);
            return;
        }

        var totale = conn.ExecuteScalar<decimal>(
            "SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) FROM fatture_righe WHERE fattura_id=@id",
            new { id = fatturaId }, tx);
        var pagato = conn.ExecuteScalar<decimal>(
            "SELECT COALESCE(SUM(importo), 0) FROM pagamenti WHERE fattura_id=@id", new { id = fatturaId }, tx);

        var stato = pagato >= totale && totale > 0m ? "PAGATA" : "EMESSA";
        conn.Execute("UPDATE fatture SET stato=@stato WHERE id=@id", new { stato, id = fatturaId }, tx);
    }

    /// <summary>Ricalcola lo stato di un acquisto: PAGATA se coperto, altrimenti RICEVUTA.</summary>
    private static void AggiornaStatoAcquisto(SqliteConnection conn, SqliteTransaction tx, long acquistoId)
    {
        var totale = conn.ExecuteScalar<decimal>(
            "SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) FROM acquisti_righe WHERE acquisto_id=@id",
            new { id = acquistoId }, tx);
        var pagato = conn.ExecuteScalar<decimal>(
            "SELECT COALESCE(SUM(importo), 0) FROM pagamenti WHERE acquisto_id=@id", new { id = acquistoId }, tx);

        var stato = pagato >= totale && totale > 0m ? "PAGATA" : "RICEVUTA";
        conn.Execute("UPDATE acquisti SET stato=@stato WHERE id=@id", new { stato, id = acquistoId }, tx);
    }

    /// <summary>Riga grezza dell'aggregazione scadenzario (prima del calcolo scadenza).</summary>
    private sealed class ScadRow
    {
        public long Id { get; set; }
        public string? Numero { get; set; }
        public string? DataEmissione { get; set; }
        public string? Controparte { get; set; }
        public long? GiorniScadenza { get; set; }
        public long? FineMese { get; set; }
        public string? Conto { get; set; }
        public string? TipoPagamentoNome { get; set; }
        public decimal ImportoTotale { get; set; }
        public decimal ImportoPagato { get; set; }
    }
}

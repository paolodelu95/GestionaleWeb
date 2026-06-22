using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.Services;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD dei template di fatture ricorrenti con Dapper. Porta la logica del backend
/// Rust (routes/fatture_ricorrenti.rs, a sua volta parità con
/// routes/fattureRicorrenti.js):
///  - lista ordinata per prossima emissione con nome cliente via JOIN;
///  - righe memorizzate come array JSON nella colonna <c>righe</c> (serializzate/
///    deserializzate qui, mai mappate da Dapper);
///  - validazione dei campi obbligatori in create;
///  - <see cref="Emetti"/>: genera la fattura reale dal template (transazionale) e
///    avanza <c>prossima_emissione</c> di un periodo, con la stessa aritmetica di
///    next_emissione (semantica UTC di Node).
/// </summary>
public sealed class FatturaRicorrenteRepository
{
    private readonly NumerazioneService _numerazione = new();

    // Serializzazione delle righe coerente con i nomi camelCase del backend.
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        // I [JsonPropertyName] sulle proprietà fissano già i nomi; nessun encoder esotico.
    };

    // Alias snake_case → PascalCase. Riusato da GetAll e GetById.
    private const string Columns = @"
        fr.id                 AS Id,
        fr.cliente_id         AS ClienteId,
        fr.descrizione        AS Descrizione,
        fr.frequenza          AS Frequenza,
        fr.giorno_emissione   AS GiornoEmissione,
        fr.prossima_emissione AS ProssimaEmissione,
        fr.attiva             AS Attiva,
        fr.tipo_pagamento_id  AS TipoPagamentoId,
        fr.note               AS Note,
        fr.created_at         AS CreatedAt,
        fr.righe              AS RigheJson,
        c.ragione_sociale     AS ClienteNome";

    /// <summary>Riga grezza usata da Dapper: include il JSON delle righe da deserializzare.</summary>
    private sealed class Row
    {
        public long Id { get; set; }
        public long? ClienteId { get; set; }
        public string? ClienteNome { get; set; }
        public string? Descrizione { get; set; }
        public string? Frequenza { get; set; }
        public long? GiornoEmissione { get; set; }
        public string? ProssimaEmissione { get; set; }
        public long? Attiva { get; set; }
        public long? TipoPagamentoId { get; set; }
        public string? Note { get; set; }
        public string? CreatedAt { get; set; }
        public string? RigheJson { get; set; }
    }

    /// <summary>Tutti i template ordinati per prossima emissione, con nome cliente e righe caricate.</summary>
    public List<FatturaRicorrente> GetAll()
    {
        using var conn = Db.Open();
        var rows = conn.Query<Row>($@"
            SELECT {Columns}
            FROM fatture_ricorrenti fr
            LEFT JOIN clienti c ON c.id = fr.cliente_id
            ORDER BY fr.prossima_emissione ASC");
        return rows.Select(Map).ToList();
    }

    /// <summary>Dettaglio di un template (testata + righe).</summary>
    public FatturaRicorrente? GetById(long id)
    {
        using var conn = Db.Open();
        var row = conn.QuerySingleOrDefault<Row>($@"
            SELECT {Columns}
            FROM fatture_ricorrenti fr
            LEFT JOIN clienti c ON c.id = fr.cliente_id
            WHERE fr.id = @id", new { id });
        return row == null ? null : Map(row);
    }

    /// <summary>
    /// Inserisce un template e ne restituisce l'id. Valida i campi obbligatori come
    /// create() del backend (cliente, descrizione, frequenza, prossima emissione).
    /// </summary>
    public long Insert(FatturaRicorrente f)
    {
        Valida(f);
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO fatture_ricorrenti
              (cliente_id, descrizione, frequenza, giorno_emissione, prossima_emissione,
               attiva, righe, tipo_pagamento_id, note)
            VALUES
              (@ClienteId, @Descrizione, @Frequenza, @GiornoEmissione, @ProssimaEmissione,
               @Attiva, @Righe, @TipoPagamentoId, @Note);
            SELECT last_insert_rowid();", Bind(f));
    }

    /// <summary>Aggiorna un template (parità con update() del backend).</summary>
    public void Update(FatturaRicorrente f)
    {
        Valida(f);
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE fatture_ricorrenti SET
              cliente_id=@ClienteId, descrizione=@Descrizione, frequenza=@Frequenza,
              giorno_emissione=@GiornoEmissione, prossima_emissione=@ProssimaEmissione,
              attiva=@Attiva, righe=@Righe, tipo_pagamento_id=@TipoPagamentoId, note=@Note
            WHERE id=@Id", Bind(f, f.Id));
    }

    /// <summary>Attiva/disattiva un template senza riscrivere righe/testata (parità con toggleAttiva()).</summary>
    public void SetAttiva(long id, bool attiva)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE fatture_ricorrenti SET attiva=@attiva WHERE id=@id",
            new { id, attiva = attiva ? 1 : 0 });
    }

    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM fatture_ricorrenti WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione (multi-selezione).</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;
        using var conn = Db.Open();
        conn.Execute("DELETE FROM fatture_ricorrenti WHERE id IN @ids", new { ids = list });
        return list.Count;
    }

    /// <summary>Esito dell'emissione di un template: id fattura creata, numero, nuova prossima emissione.</summary>
    public readonly record struct EsitoEmissione(long FatturaId, string Numero, string NuovaProssima);

    /// <summary>
    /// Emette una fattura reale dal template (transazionale) e avanza il periodo.
    /// Porta emetti_template() del backend Rust: numero progressivo dalla
    /// numerazione, testata stato=EMESSA, righe copiate dal JSON, avanzamento di
    /// <c>prossima_emissione</c>. null se il template non esiste.
    /// </summary>
    public EsitoEmissione? Emetti(long id)
    {
        using var conn = Db.Open();
        var tpl = conn.QuerySingleOrDefault<Row>($@"
            SELECT {Columns}
            FROM fatture_ricorrenti fr
            LEFT JOIN clienti c ON c.id = fr.cliente_id
            WHERE fr.id = @id", new { id });
        if (tpl == null) return null;

        var t = Map(tpl);
        // Data di emissione in UTC, come web::oggi() del backend (epoch/86400),
        // così la fattura generata porta la stessa data del path Rust/Node.
        var oggi = DateTime.UtcNow.ToString("yyyy-MM-dd");

        using var tx = conn.BeginTransaction();

        // Numero progressivo coerente con la stessa unità di lavoro (no race).
        var numero = _numerazione.GetNextNumero(conn, tx, "fatture", "fatture");

        var fatturaId = conn.ExecuteScalar<long>(@"
            INSERT INTO fatture (numero, data_emissione, cliente_id, note, stato, tipo_pagamento_id)
            VALUES (@numero, @data, @clienteId, @note, 'EMESSA', @tipoPagamentoId);
            SELECT last_insert_rowid();",
            new
            {
                numero,
                data = oggi,
                clienteId = t.ClienteId,
                note = t.Note,
                tipoPagamentoId = t.TipoPagamentoId is > 0 ? t.TipoPagamentoId : null,
            }, tx);

        foreach (var r in t.Righe)
        {
            conn.Execute(@"
                INSERT INTO fatture_righe
                  (fattura_id, prodotto_id, descrizione, quantita, prezzo, iva, sconto, unita_misura)
                VALUES
                  (@fatturaId, @prodottoId, @descrizione, @quantita, @prezzo, @iva, @sconto, @unitaMisura)",
                new
                {
                    fatturaId,
                    prodottoId = r.ProdottoId is > 0 ? r.ProdottoId : null,
                    descrizione = r.Descrizione,
                    quantita = r.Quantita,
                    prezzo = r.Prezzo,
                    iva = r.Iva,
                    sconto = r.Sconto,
                    unitaMisura = r.UnitaMisura,
                }, tx);
        }

        var nuovaProssima = NextEmissione(t.ProssimaEmissione, t.Frequenza, t.GiornoEmissione);
        conn.Execute("UPDATE fatture_ricorrenti SET prossima_emissione=@p WHERE id=@id",
            new { p = nuovaProssima, id }, tx);

        tx.Commit();
        return new EsitoEmissione(fatturaId, numero, nuovaProssima);
    }

    // ── helper privati ────────────────────────────────────────────────────────

    private static FatturaRicorrente Map(Row r) => new()
    {
        Id = r.Id,
        ClienteId = r.ClienteId,
        ClienteNome = r.ClienteNome ?? "",
        Descrizione = r.Descrizione ?? "",
        Frequenza = string.IsNullOrEmpty(r.Frequenza) ? "MENSILE" : r.Frequenza,
        GiornoEmissione = (int)(r.GiornoEmissione ?? 1),
        ProssimaEmissione = r.ProssimaEmissione ?? "",
        Attiva = r.Attiva == 1,
        TipoPagamentoId = r.TipoPagamentoId,
        Note = r.Note ?? "",
        CreatedAt = r.CreatedAt,
        Righe = DeserializzaRighe(r.RigheJson),
    };

    /// <summary>Deserializza l'array JSON delle righe; JSON assente/malformato → lista vuota (come unwrap_or json!([])).</summary>
    private static List<FatturaRicorrenteRiga> DeserializzaRighe(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<List<FatturaRicorrenteRiga>>(json, JsonOpts) ?? new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    /// <summary>
    /// Campi obbligatori come la validazione di create() nel backend: cliente,
    /// descrizione, frequenza e prossima emissione devono essere valorizzati.
    /// </summary>
    private static void Valida(FatturaRicorrente f)
    {
        if (f.ClienteId is null or 0
            || string.IsNullOrWhiteSpace(f.Descrizione)
            || string.IsNullOrWhiteSpace(f.Frequenza)
            || string.IsNullOrWhiteSpace(f.ProssimaEmissione))
            throw new InvalidOperationException("Campi obbligatori mancanti");
    }

    private static object Bind(FatturaRicorrente f, long? id = null) => new
    {
        Id = id ?? f.Id,
        ClienteId = f.ClienteId is > 0 ? f.ClienteId : null,
        f.Descrizione,
        f.Frequenza,
        // giorno 0 → 1 (parità con filter(|n| *n != 0).unwrap_or(1) del backend).
        GiornoEmissione = f.GiornoEmissione == 0 ? 1 : f.GiornoEmissione,
        f.ProssimaEmissione,
        Attiva = f.Attiva ? 1 : 0,
        Righe = JsonSerializer.Serialize(f.Righe, JsonOpts),
        TipoPagamentoId = f.TipoPagamentoId is > 0 ? f.TipoPagamentoId : null,
        f.Note,
    };

    /// <summary>
    /// Avanza una data ISO di un periodo, replicando next_emissione del backend
    /// (semantica UTC di Node: setUTCMonth mantiene il giorno con overflow nel mese
    /// successivo, poi setUTCDate(giorno) fissa il giorno finale, sempre 1..28).
    /// </summary>
    private static string NextEmissione(string prossima, string frequenza, int giornoRaw)
    {
        var giorno = Math.Clamp(giornoRaw == 0 ? 1 : giornoRaw, 1, 28);
        if (!TryParseYmd(prossima, out var y, out var m, out var d))
        {
            y = 1970; m = 1; d = 1;
        }

        var months = frequenza switch
        {
            "MENSILE" => 1,
            "BIMESTRALE" => 2,
            "TRIMESTRALE" => 3,
            "SEMESTRALE" => 6,
            "ANNUALE" => 12,
            _ => 1,
        };

        // (m-1)+months con normalizzazione anno/mese (div/rem euclidei come nel backend).
        var newIdx = (m - 1) + months;
        var baseYear = y + FloorDiv(newIdx, 12);
        var baseMonth = Mod(newIdx, 12) + 1;

        // setUTCMonth: il giorno originale resta, con overflow nel mese successivo.
        var landed = new DateTime(baseYear, baseMonth, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(d - 1);

        // setUTCDate(giorno): fissa il giorno (≤28, sempre valido nel mese atterrato).
        return $"{landed.Year:D4}-{landed.Month:D2}-{giorno:D2}";
    }

    private static int FloorDiv(int a, int b) => (int)Math.Floor((double)a / b);
    private static int Mod(int a, int b) => ((a % b) + b) % b;

    private static bool TryParseYmd(string s, out int y, out int m, out int d)
    {
        y = m = d = 0;
        if (string.IsNullOrEmpty(s) || s.Length < 10) return false;
        return int.TryParse(s.AsSpan(0, 4), NumberStyles.None, CultureInfo.InvariantCulture, out y)
            && int.TryParse(s.AsSpan(5, 2), NumberStyles.None, CultureInfo.InvariantCulture, out m)
            && int.TryParse(s.AsSpan(8, 2), NumberStyles.None, CultureInfo.InvariantCulture, out d);
    }
}

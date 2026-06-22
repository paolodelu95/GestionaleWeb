using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.Services;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD di progetti/commesse con Dapper. Porta la logica di
/// routes/timesheet.rs: lista con cliente e ore totali/fatturate aggregate,
/// CRUD voci di timesheet, generazione fattura da timesheet. La lista calcola le
/// ore con subquery aggregate (niente N+1).
/// </summary>
public sealed class ProgettoRepository
{
    private readonly NumerazioneService _numerazione = new();

    // Alias snake_case → PascalCase. Riusato da GetAll e GetById.
    // budget/tariffa_oraria sono REAL → decimal; le date restano TEXT.
    private const string ProgettoColumns = @"
        p.id                          AS Id,
        COALESCE(p.nome, '')          AS Nome,
        COALESCE(p.descrizione, '')   AS Descrizione,
        p.cliente_id                  AS ClienteId,
        COALESCE(p.stato, 'APERTO')   AS Stato,
        COALESCE(p.data_inizio, '')   AS DataInizio,
        COALESCE(p.data_fine, '')     AS DataFine,
        COALESCE(p.budget, 0)         AS Budget,
        COALESCE(p.tariffa_oraria, 0) AS TariffaOraria,
        COALESCE(p.note, '')          AS Note,
        COALESCE(p.created_at, '')    AS CreatedAt,
        COALESCE(c.ragione_sociale, '') AS ClienteNome,
        COALESCE((SELECT SUM(ore) FROM timesheet_voci WHERE progetto_id = p.id), 0)              AS OreTotali,
        COALESCE((SELECT SUM(ore) FROM timesheet_voci WHERE progetto_id = p.id AND fatturata=1), 0) AS OreFatturate";

    private const string VoceColumns = @"
        v.id                        AS Id,
        v.progetto_id               AS ProgettoId,
        COALESCE(v.data, '')        AS Data,
        COALESCE(v.ore, 0)          AS Ore,
        COALESCE(v.descrizione, '') AS Descrizione,
        COALESCE(v.utente, '')      AS Utente,
        COALESCE(v.fatturata, 0)    AS Fatturata,
        v.fattura_id                AS FatturaId,
        COALESCE(v.created_at, '')  AS CreatedAt,
        COALESCE(p.nome, '')        AS ProgettoNome";

    // ── Progetti ────────────────────────────────────────────────────────────

    /// <summary>
    /// Tutti i progetti con cliente e ore aggregate. Ordine fedele al backend:
    /// data_inizio desc, poi id desc.
    /// </summary>
    public List<Progetto> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Progetto>(
            $@"SELECT {ProgettoColumns}
               FROM progetti p
               LEFT JOIN clienti c ON c.id = p.cliente_id
               ORDER BY p.data_inizio DESC, p.id DESC").ToList();
    }

    /// <summary>Dettaglio progetto + voci timesheet (caricate in un'unica query).</summary>
    public Progetto? GetById(long id)
    {
        using var conn = Db.Open();
        var p = conn.QuerySingleOrDefault<Progetto>(
            $@"SELECT {ProgettoColumns}
               FROM progetti p
               LEFT JOIN clienti c ON c.id = p.cliente_id
               WHERE p.id = @id", new { id });
        if (p == null) return null;

        p.Voci = GetVoci(conn, id);
        return p;
    }

    /// <summary>Inserisce un progetto e ne restituisce l'id. Default stato=APERTO.</summary>
    public long Insert(Progetto p)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO progetti
              (nome, descrizione, cliente_id, stato, data_inizio, data_fine, budget, tariffa_oraria, note)
            VALUES
              (@Nome, @Descrizione, @ClienteId, @Stato, @DataInizio, @DataFine, @Budget, @TariffaOraria, @Note);
            SELECT last_insert_rowid();", Bind(p));
    }

    /// <summary>Aggiorna un progetto.</summary>
    public void Update(Progetto p)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE progetti SET
              nome=@Nome, descrizione=@Descrizione, cliente_id=@ClienteId, stato=@Stato,
              data_inizio=@DataInizio, data_fine=@DataFine, budget=@Budget,
              tariffa_oraria=@TariffaOraria, note=@Note
            WHERE id=@Id", Bind(p, p.Id));
    }

    /// <summary>
    /// Elimina un progetto. Le voci timesheet vanno via in CASCADE (FK del DB),
    /// come l'avviso del componente Angular ("verranno cancellate anche le voci").
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM progetti WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        conn.Execute("DELETE FROM progetti WHERE id IN @ids", new { ids = list }, tx);
        tx.Commit();
        return list.Count;
    }

    // ── Voci timesheet ────────────────────────────────────────────────────────

    /// <summary>
    /// Voci di timesheet, opzionalmente filtrate per progetto. Ordine fedele al
    /// backend: data desc, poi id desc. progettoId=null/0 = tutte.
    /// </summary>
    public List<TimesheetVoce> GetVoci(long? progettoId = null)
    {
        using var conn = Db.Open();
        return GetVoci(conn, progettoId);
    }

    private List<TimesheetVoce> GetVoci(SqliteConnection conn, long? progettoId)
    {
        var filtro = progettoId is > 0 ? "WHERE v.progetto_id = @progettoId" : "";
        return conn.Query<TimesheetVoce>(
            $@"SELECT {VoceColumns}
               FROM timesheet_voci v
               LEFT JOIN progetti p ON p.id = v.progetto_id
               {filtro}
               ORDER BY v.data DESC, v.id DESC", new { progettoId }).ToList();
    }

    /// <summary>
    /// Inserisce una voce timesheet e ne restituisce l'id. Replica i controlli del
    /// backend: progetto, data e ore obbligatori; utente di default = "locale" se vuoto.
    /// </summary>
    public long InsertVoce(TimesheetVoce v)
    {
        if (v.ProgettoId <= 0 || string.IsNullOrEmpty(v.Data) || v.Ore <= 0m)
            throw new ArgumentException("progettoId, data, ore obbligatori");

        var utente = string.IsNullOrEmpty(v.Utente) ? "locale" : v.Utente;

        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO timesheet_voci (progetto_id, data, ore, descrizione, utente)
            VALUES (@ProgettoId, @Data, @Ore, @Descrizione, @utente);
            SELECT last_insert_rowid();",
            new { v.ProgettoId, v.Data, v.Ore, v.Descrizione, utente });
    }

    /// <summary>
    /// Aggiorna una voce timesheet (data, ore, descrizione, utente). Come il backend,
    /// progetto e stato di fatturazione non si cambiano qui.
    /// </summary>
    public void UpdateVoce(TimesheetVoce v)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE timesheet_voci SET data=@Data, ore=@Ore, descrizione=@Descrizione, utente=@Utente
            WHERE id=@Id",
            new { v.Data, v.Ore, v.Descrizione, v.Utente, v.Id });
    }

    /// <summary>Elimina una voce timesheet.</summary>
    public void DeleteVoce(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM timesheet_voci WHERE id=@id", new { id });
    }

    // ── Fattura da timesheet ──────────────────────────────────────────────────

    /// <summary>
    /// Genera una fattura dalle ore non ancora fatturate del progetto. Porta
    /// genera_fattura() di routes/timesheet.rs: una riga "h × €/h", IVA da
    /// cliente → predefinita azienda → 22, voci marcate fatturata=1. Tutto in
    /// un'unica transazione. Lancia <see cref="InvalidOperationException"/> con i
    /// messaggi del backend in caso di precondizioni non soddisfatte.
    /// </summary>
    public GeneraFatturaEsito GeneraFattura(long progettoId)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var prog = conn.QuerySingleOrDefault<ProgFatturaInfo>(
            "SELECT nome AS Nome, cliente_id AS ClienteId, tariffa_oraria AS Tariffa FROM progetti WHERE id=@progettoId",
            new { progettoId }, tx);

        if (prog is null)
            throw new InvalidOperationException("Progetto non trovato");

        var nome = prog.Nome ?? "";
        if (prog.ClienteId is not long clienteId)
            throw new InvalidOperationException("Progetto senza cliente: impossibile fatturare");

        var tariffa = (decimal)(prog.Tariffa ?? 0.0);
        if (tariffa <= 0m)
            throw new InvalidOperationException("Tariffa oraria non impostata sul progetto");

        var voci = conn.Query<(long Id, double Ore)>(
            "SELECT id AS Id, ore AS Ore FROM timesheet_voci WHERE progetto_id=@progettoId AND fatturata=0 ORDER BY data",
            new { progettoId }, tx).ToList();
        if (voci.Count == 0)
            throw new InvalidOperationException("Nessuna voce da fatturare");

        var oreTotali = (decimal)voci.Sum(v => v.Ore);
        var importo = decimal.Round(oreTotali * tariffa, 2, MidpointRounding.AwayFromZero);
        var oggi = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        // IVA: dal cliente, altrimenti predefinita azienda, altrimenti 22 (parità Rust).
        var ivaCliente = conn.QuerySingleOrDefault<double?>(
            @"SELECT ai.valore FROM clienti c
              LEFT JOIN aliquote_iva ai ON ai.id = c.aliquota_iva_id
              WHERE c.id=@clienteId", new { clienteId }, tx);
        var ivaPred = conn.QuerySingleOrDefault<double?>(
            "SELECT valore FROM aliquote_iva WHERE predefinito=1 LIMIT 1", transaction: tx);
        var ivaDefault = (decimal)(ivaCliente ?? ivaPred ?? 22.0);

        var descrizione =
            $"Prestazioni progetto \"{nome}\" — {FmtNum(oreTotali)} h x {tariffa.ToString("0.00", CultureInfo.InvariantCulture)} €/h";

        var numero = _numerazione.GetNextNumero(conn, tx, "fatture", "fatture");

        var fatturaId = conn.ExecuteScalar<long>(@"
            INSERT INTO fatture (numero, data_emissione, cliente_id, note, stato)
            VALUES (@numero, @oggi, @clienteId, @note, 'EMESSA');
            SELECT last_insert_rowid();",
            new { numero, oggi, clienteId, note = $"Fattura automatica da timesheet: progetto \"{nome}\"" }, tx);

        conn.Execute(@"
            INSERT INTO fatture_righe (fattura_id, descrizione, quantita, prezzo, iva, unita_misura, tipo)
            VALUES (@fatturaId, @descrizione, @oreTotali, @tariffa, @ivaDefault, 'h', 'PRODOTTO')",
            new { fatturaId, descrizione, oreTotali, tariffa, ivaDefault }, tx);

        conn.Execute(
            "UPDATE timesheet_voci SET fatturata=1, fattura_id=@fatturaId WHERE id IN @ids",
            new { fatturaId, ids = voci.Select(v => v.Id).ToList() }, tx);

        tx.Commit();

        return new GeneraFatturaEsito
        {
            FatturaId = fatturaId,
            Numero = numero,
            Voci = voci.Count,
            OreTotali = oreTotali,
            Importo = importo,
        };
    }

    // ── helper privati ────────────────────────────────────────────────────────

    /// <summary>Formatta le ore senza decimali superflui (parità con web::fmt_num).</summary>
    private static string FmtNum(decimal n)
    {
        var r = n == decimal.Truncate(n) ? decimal.Truncate(n) : n;
        return r.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Parametri per INSERT/UPDATE progetto. cliente_id 0 → NULL (come opt_i64 nel
    /// backend); stato vuoto → APERTO (parità col filter(!is_empty) Rust).
    /// </summary>
    private static object Bind(Progetto p, long? id = null) => new
    {
        Id = id ?? p.Id,
        p.Nome,
        p.Descrizione,
        ClienteId = p.ClienteId is > 0 ? p.ClienteId : null,
        Stato = string.IsNullOrEmpty(p.Stato) ? "APERTO" : p.Stato,
        p.DataInizio,
        p.DataFine,
        p.Budget,
        p.TariffaOraria,
        p.Note,
    };

    /// <summary>Proiezione minima del progetto usata per la generazione fattura.</summary>
    private sealed class ProgFatturaInfo
    {
        public string? Nome { get; init; }
        public long? ClienteId { get; init; }
        public double? Tariffa { get; init; }
    }
}

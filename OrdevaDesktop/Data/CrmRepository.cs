using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD della pipeline CRM con Dapper. Porta la logica del backend Rust
/// (routes/crm.rs): stage con colore default #6366f1, opportunità con LEFT JOIN
/// su clienti/crm_stage per nome/colore, attività con tipi vincolati. La delete
/// dello stage scollega le opportunità (stage_id=NULL) prima di rimuoverlo; la
/// delete dell'opportunità porta via le attività in CASCADE. Le liste opportunità
/// caricano le attività in batch (niente N+1).
/// </summary>
public sealed class CrmRepository
{
    // ── Stage ────────────────────────────────────────────────────────────────

    /// <summary>Tutti gli stage ordinati per ordine, id (parità con list_stages).</summary>
    public List<CrmStage> GetStages()
    {
        using var conn = Db.Open();
        return conn.Query<CrmStage>(@"
            SELECT id     AS Id,
                   nome   AS Nome,
                   ordine AS Ordine,
                   colore AS Colore,
                   vinto  AS Vinto,
                   perso  AS Perso
            FROM crm_stage
            ORDER BY ordine, id").ToList();
    }

    public long InsertStage(CrmStage s)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO crm_stage (nome, ordine, colore, vinto, perso)
            VALUES (@Nome, @Ordine, @Colore, @Vinto, @Perso);
            SELECT last_insert_rowid();", BindStage(s));
    }

    public void UpdateStage(CrmStage s)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE crm_stage SET nome=@Nome, ordine=@Ordine, colore=@Colore, vinto=@Vinto, perso=@Perso
            WHERE id=@Id", BindStage(s, s.Id));
    }

    /// <summary>
    /// Elimina uno stage scollegando prima le opportunità (stage_id=NULL): così le
    /// opportunità non vengono perse (parità con delete_stage).
    /// </summary>
    public void DeleteStage(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        conn.Execute("UPDATE crm_opportunita SET stage_id=NULL WHERE stage_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM crm_stage WHERE id=@id", new { id }, tx);
        tx.Commit();
    }

    // colore vuoto → default #6366f1, come il backend.
    private static object BindStage(CrmStage s, long? id = null) => new
    {
        Id = id ?? s.Id,
        s.Nome,
        s.Ordine,
        Colore = string.IsNullOrEmpty(s.Colore) ? "#6366f1" : s.Colore,
        Vinto = s.Vinto ? 1 : 0,
        Perso = s.Perso ? 1 : 0,
    };

    // ── Opportunità ──────────────────────────────────────────────────────────

    // Alias snake_case → PascalCase + LEFT JOIN per nome cliente / nome+colore stage.
    private const string OppSelect = @"
        SELECT o.id            AS Id,
               o.titolo        AS Titolo,
               o.cliente_id    AS ClienteId,
               c.ragione_sociale AS ClienteNome,
               o.contatto      AS Contatto,
               o.email         AS Email,
               o.telefono      AS Telefono,
               o.stage_id      AS StageId,
               s.nome          AS StageNome,
               s.colore        AS StageColore,
               o.valore        AS Valore,
               o.probabilita   AS Probabilita,
               o.data_prevista AS DataPrevista,
               o.assegnatario  AS Assegnatario,
               o.note          AS Note,
               o.ordine        AS Ordine,
               o.created_at    AS CreatedAt,
               o.updated_at    AS UpdatedAt
        FROM crm_opportunita o
        LEFT JOIN clienti c   ON c.id = o.cliente_id
        LEFT JOIN crm_stage s ON s.id = o.stage_id";

    /// <summary>
    /// Tutte le opportunità ordinate per ordine, updated_at DESC (parità con list_opp),
    /// con le attività caricate in batch.
    /// </summary>
    public List<CrmOpportunita> GetOpportunita()
    {
        using var conn = Db.Open();
        var opps = conn.Query<CrmOpportunita>(
            $"{OppSelect} ORDER BY o.ordine, o.updated_at DESC").ToList();

        Normalize(opps);
        if (opps.Count == 0) return opps;

        // Carica TUTTE le attività in un colpo solo e raggruppale per opportunità.
        var attivita = conn.Query<CrmAttivita>($"{AttSelect} ORDER BY data_pianificata DESC, id DESC")
            .GroupBy(a => a.OpportunitaId ?? 0)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var o in opps)
            if (attivita.TryGetValue(o.Id, out var list))
                o.Attivita = list;

        return opps;
    }

    public CrmOpportunita? GetOpportunitaById(long id)
    {
        using var conn = Db.Open();
        var o = conn.QuerySingleOrDefault<CrmOpportunita>(
            $"{OppSelect} WHERE o.id=@id", new { id });
        if (o == null) return null;
        Normalize(o);
        o.Attivita = conn.Query<CrmAttivita>(
            $"{AttSelect} WHERE opportunita_id=@id ORDER BY data_pianificata DESC, id DESC",
            new { id }).ToList();
        return o;
    }

    public long InsertOpportunita(CrmOpportunita o)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO crm_opportunita
              (titolo, cliente_id, contatto, email, telefono, stage_id, valore,
               probabilita, data_prevista, assegnatario, note, ordine)
            VALUES
              (@Titolo, @ClienteId, @Contatto, @Email, @Telefono, @StageId, @Valore,
               @Probabilita, @DataPrevista, @Assegnatario, @Note, @Ordine);
            SELECT last_insert_rowid();", BindOpp(o));
    }

    /// <summary>Aggiorna un'opportunità e tocca updated_at (parità con update_opp).</summary>
    public void UpdateOpportunita(CrmOpportunita o)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE crm_opportunita SET
              titolo=@Titolo, cliente_id=@ClienteId, contatto=@Contatto, email=@Email,
              telefono=@Telefono, stage_id=@StageId, valore=@Valore, probabilita=@Probabilita,
              data_prevista=@DataPrevista, assegnatario=@Assegnatario, note=@Note, ordine=@Ordine,
              updated_at=datetime('now')
            WHERE id=@Id", BindOpp(o, o.Id));
    }

    /// <summary>Sposta un'opportunità su un altro stage aggiornando ordine (parità con move_opp).</summary>
    public void MoveOpportunita(long id, long? stageId, long ordine)
    {
        using var conn = Db.Open();
        conn.Execute(
            "UPDATE crm_opportunita SET stage_id=@stageId, ordine=@ordine, updated_at=datetime('now') WHERE id=@id",
            new { id, stageId, ordine });
    }

    public void DeleteOpportunita(long id)
    {
        using var conn = Db.Open();
        // Le attività vanno via in CASCADE (FK opportunita_id ON DELETE CASCADE).
        conn.Execute("DELETE FROM crm_opportunita WHERE id=@id", new { id });
    }

    public int DeleteManyOpportunita(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            conn.Execute("DELETE FROM crm_opportunita WHERE id=@id", new { id }, tx);
        tx.Commit();
        return list.Count;
    }

    // Colore stage vuoto/NULL → default #6366f1 (parità con opp_dto stage_color).
    private static void Normalize(IEnumerable<CrmOpportunita> opps)
    {
        foreach (var o in opps) Normalize(o);
    }

    private static void Normalize(CrmOpportunita o)
    {
        o.ClienteNome ??= "";
        o.StageNome ??= "";
        if (string.IsNullOrEmpty(o.StageColore)) o.StageColore = "#6366f1";
    }

    private static object BindOpp(CrmOpportunita o, long? id = null) => new
    {
        Id = id ?? o.Id,
        o.Titolo,
        o.ClienteId,
        o.Contatto,
        o.Email,
        o.Telefono,
        o.StageId,
        o.Valore,
        o.Probabilita,
        o.DataPrevista,
        o.Assegnatario,
        o.Note,
        o.Ordine,
    };

    // ── Attività ─────────────────────────────────────────────────────────────

    private const string AttSelect = @"
        SELECT id                 AS Id,
               opportunita_id     AS OpportunitaId,
               tipo               AS Tipo,
               titolo             AS Titolo,
               descrizione        AS Descrizione,
               data_pianificata   AS DataPianificata,
               data_completamento AS DataCompletamento,
               completata         AS Completata,
               created_at         AS CreatedAt
        FROM crm_attivita";

    public List<CrmAttivita> GetAttivita(long opportunitaId)
    {
        using var conn = Db.Open();
        return conn.Query<CrmAttivita>(
            $"{AttSelect} WHERE opportunita_id=@opportunitaId ORDER BY data_pianificata DESC, id DESC",
            new { opportunitaId }).ToList();
    }

    public long InsertAttivita(CrmAttivita a)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO crm_attivita
              (opportunita_id, tipo, titolo, descrizione, data_pianificata, data_completamento, completata)
            VALUES
              (@OpportunitaId, @Tipo, @Titolo, @Descrizione, @DataPianificata, @DataCompletamento, @Completata);
            SELECT last_insert_rowid();",
            new
            {
                a.OpportunitaId, a.Tipo, a.Titolo, a.Descrizione,
                a.DataPianificata, a.DataCompletamento,
                Completata = a.Completata ? 1 : 0,
            });
    }

    public void UpdateAttivita(CrmAttivita a)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE crm_attivita SET
              titolo=@Titolo, descrizione=@Descrizione, data_pianificata=@DataPianificata,
              data_completamento=@DataCompletamento, completata=@Completata
            WHERE id=@Id",
            new
            {
                a.Id, a.Titolo, a.Descrizione, a.DataPianificata, a.DataCompletamento,
                Completata = a.Completata ? 1 : 0,
            });
    }

    public void DeleteAttivita(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM crm_attivita WHERE id=@id", new { id });
    }
}

using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Lettura del registro attività (tabella <c>audit_log</c>) con Dapper. Sola
/// lettura: porta routes/audit.rs (endpoint <c>/recent</c> e <c>/:type/:id</c>).
/// Nessun create/update/delete — il backend è l'unico a scrivere l'audit.
/// </summary>
public sealed class AuditRepository
{
    // Alias snake_case → PascalCase. Riusato da tutte le query.
    private const string AuditColumns = @"
        id          AS Id,
        entity_type AS EntityType,
        entity_id   AS EntityId,
        action      AS Action,
        payload     AS Payload,
        created_at  AS CreatedAt";

    private const int DefaultLimit = 200;

    /// <summary>
    /// Voci più recenti, ordinate per data DESC poi id DESC. Il limite è clampato
    /// a [1, 200] come <c>recent()</c> del backend; default 200 (come la chiamata
    /// del componente Angular <c>audit/recent?limit=200</c>).
    /// </summary>
    public List<Audit> GetRecent(int limit = DefaultLimit)
    {
        var lim = limit < 1 ? 1 : (limit > 200 ? 200 : limit);
        using var conn = Db.Open();
        return conn.Query<Audit>(
            $@"SELECT {AuditColumns}
               FROM audit_log
               ORDER BY created_at DESC, id DESC
               LIMIT @lim", new { lim }).ToList();
    }

    /// <summary>
    /// Voci di una singola entità (max 100), ordinate per data DESC poi id DESC.
    /// Parità con <c>by_entity()</c> del backend.
    /// </summary>
    public List<Audit> GetByEntity(string entityType, long entityId)
    {
        using var conn = Db.Open();
        return conn.Query<Audit>(
            $@"SELECT {AuditColumns}
               FROM audit_log
               WHERE entity_type = @entityType AND entity_id = @entityId
               ORDER BY created_at DESC, id DESC
               LIMIT 100", new { entityType, entityId }).ToList();
    }
}

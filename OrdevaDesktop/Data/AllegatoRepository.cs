using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per gli allegati ai documenti (tabella <c>allegati</c>). Porta la
/// logica del backend Rust (routes/allegati.rs): elenco per (tipo, id) ordinato dal
/// più recente, insert del record con nome univoco già scelto dal chiamante, delete
/// per id. La gestione del file fisico su disco (scrittura/lettura/cancellazione in
/// uploads/) NON è responsabilità del repository: qui si tocca solo la riga DB.
/// </summary>
public sealed class AllegatoRepository
{
    // Alias snake_case → PascalCase. Riusato da GetByEntity.
    private const string SelectColumns = @"
        id             AS Id,
        documento_tipo AS DocumentoTipo,
        documento_id   AS DocumentoId,
        nome_file      AS NomeFile,
        percorso       AS Percorso,
        dimensione     AS Dimensione,
        mime_type      AS MimeType,
        created_at     AS CreatedAt";

    /// <summary>
    /// Allegati di un documento (tipo + id), dal più recente. Parità con <c>list()</c>
    /// del backend: se tipo o id mancano restituisce lista vuota senza interrogare il DB.
    /// </summary>
    public List<Allegato> GetByEntity(string documentoTipo, long documentoId)
    {
        if (string.IsNullOrEmpty(documentoTipo)) return new List<Allegato>();
        using var conn = Db.Open();
        return conn.Query<Allegato>(
            $@"SELECT {SelectColumns} FROM allegati
               WHERE documento_tipo = @documentoTipo AND documento_id = @documentoId
               ORDER BY created_at DESC, id DESC",
            new { documentoTipo, documentoId }).ToList();
    }

    /// <summary>Una singola riga allegato, o null se l'id non esiste.</summary>
    public Allegato? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Allegato>(
            $"SELECT {SelectColumns} FROM allegati WHERE id = @id", new { id });
    }

    /// <summary>
    /// Inserisce il record allegato e restituisce l'id generato. created_at è lasciato
    /// al DEFAULT del DB (datetime('now')). Il file su disco va scritto a parte: qui
    /// <see cref="Allegato.Percorso"/> deve già contenere il nome univoco.
    /// </summary>
    public long Add(Allegato a)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(
            @"INSERT INTO allegati
                (documento_tipo, documento_id, nome_file, percorso, dimensione, mime_type)
              VALUES
                (@DocumentoTipo, @DocumentoId, @NomeFile, @Percorso, @Dimensione, @MimeType);
              SELECT last_insert_rowid();",
            new
            {
                a.DocumentoTipo,
                a.DocumentoId,
                a.NomeFile,
                a.Percorso,
                a.Dimensione,
                a.MimeType,
            });
    }

    /// <summary>Elimina il record allegato per id (il file su disco va rimosso a parte).</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM allegati WHERE id = @id", new { id });
    }
}

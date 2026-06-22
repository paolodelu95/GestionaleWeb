using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per la prima nota cassa/banca (tabella prima_nota).
/// CRUD con Dapper; le connessioni si aprono SOLO via <see cref="Db.Open"/>.
/// Le colonne SQLite sono snake_case e vengono mappate alle proprietà PascalCase
/// con alias espliciti; gli importi REAL sono mappati a decimal e le date restano
/// stringhe ISO. Le regole di validazione/normalizzazione replicano routes/prima_nota.rs.
/// </summary>
public sealed class PrimaNotaRepository
{
    private const string SelectColumns =
        "id               AS Id, " +
        "data             AS Data, " +
        "tipo             AS Tipo, " +
        "causale          AS Causale, " +
        "importo          AS Importo, " +
        "conto            AS Conto, " +
        "riferimento_tipo AS RiferimentoTipo, " +
        "riferimento_id   AS RiferimentoId, " +
        "note             AS Note, " +
        "created_at       AS CreatedAt";

    /// <summary>
    /// Tutte le registrazioni, ordinate per data e id discendenti (come la API:
    /// ORDER BY data DESC, id DESC). Se <paramref name="meseYyyyMm"/> è valorizzato
    /// (formato "yyyy-MM") restituisce solo le righe di quel mese.
    /// </summary>
    public List<PrimaNota> GetAll(string? meseYyyyMm = null)
    {
        using var conn = Db.Open();
        if (IsYyyyMm(meseYyyyMm))
        {
            return conn.Query<PrimaNota>(
                $@"SELECT {SelectColumns} FROM prima_nota
                   WHERE strftime('%Y-%m', data) = @mese
                   ORDER BY data DESC, id DESC",
                new { mese = meseYyyyMm }).ToList();
        }

        return conn.Query<PrimaNota>(
            $"SELECT {SelectColumns} FROM prima_nota ORDER BY data DESC, id DESC").ToList();
    }

    /// <summary>Una singola registrazione, o null se l'id non esiste.</summary>
    public PrimaNota? GetById(int id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<PrimaNota>(
            $"SELECT {SelectColumns} FROM prima_nota WHERE id = @id", new { id });
    }

    /// <summary>Inserisce e restituisce l'id generato.</summary>
    public int Insert(PrimaNota p)
    {
        Normalize(p);
        using var conn = Db.Open();
        return conn.ExecuteScalar<int>(
            @"INSERT INTO prima_nota
                  (data, tipo, causale, importo, conto, riferimento_tipo, riferimento_id, note)
              VALUES
                  (@Data, @Tipo, @Causale, @Importo, @Conto, @RiferimentoTipo, @RiferimentoId, @Note);
              SELECT last_insert_rowid();",
            new
            {
                p.Data,
                p.Tipo,
                p.Causale,
                p.Importo,
                p.Conto,
                p.RiferimentoTipo,
                p.RiferimentoId,
                p.Note,
            });
    }

    /// <summary>Aggiorna una registrazione esistente (richiede Id valorizzato).</summary>
    public void Update(PrimaNota p)
    {
        Normalize(p);
        using var conn = Db.Open();
        conn.Execute(
            @"UPDATE prima_nota
                 SET data = @Data, tipo = @Tipo, causale = @Causale, importo = @Importo,
                     conto = @Conto, riferimento_tipo = @RiferimentoTipo,
                     riferimento_id = @RiferimentoId, note = @Note
               WHERE id = @Id",
            new
            {
                p.Id,
                p.Data,
                p.Tipo,
                p.Causale,
                p.Importo,
                p.Conto,
                p.RiferimentoTipo,
                p.RiferimentoId,
                p.Note,
            });
    }

    /// <summary>Elimina una singola registrazione.</summary>
    public void Delete(int id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM prima_nota WHERE id = @id", new { id });
    }

    /// <summary>
    /// Eliminazione in blocco: un'unica query con clausola IN (niente DELETE in
    /// loop). Restituisce il numero di righe eliminate.
    /// </summary>
    public int DeleteMany(IEnumerable<int> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;
        using var conn = Db.Open();
        return conn.Execute(
            "DELETE FROM prima_nota WHERE id IN @ids", new { ids = list });
    }

    /// <summary>
    /// Applica le stesse regole di routes/prima_nota.rs (valida + conto_db +
    /// str_def + opt_i64): trim dei testi, conto/tipo riportati ai valori ammessi,
    /// riferimento_id azzerato a NULL. NON applica i controlli "bloccanti"
    /// (importo &gt; 0, campi obbligatori): quelli stanno nel ViewModel/UI.
    /// </summary>
    private static void Normalize(PrimaNota p)
    {
        p.Data = (p.Data ?? string.Empty).Trim();
        p.Causale = (p.Causale ?? string.Empty).Trim();
        p.Note = (p.Note ?? string.Empty).Trim();
        p.RiferimentoTipo = (p.RiferimentoTipo ?? string.Empty).Trim();

        // conto_db(): solo CASSA/BANCA, default CASSA.
        if (p.Conto != "CASSA" && p.Conto != "BANCA") p.Conto = "CASSA";
        // tipo: solo ENTRATA/USCITA, default ENTRATA (coerente con il default DTO).
        if (p.Tipo != "ENTRATA" && p.Tipo != "USCITA") p.Tipo = "ENTRATA";

        // opt_i64(): 0 (o assente) -> NULL.
        if (p.RiferimentoId is 0) p.RiferimentoId = null;
    }

    /// <summary>Valida il formato "yyyy-MM" come is_yyyymm() nel backend Rust.</summary>
    private static bool IsYyyyMm(string? s)
    {
        if (string.IsNullOrEmpty(s) || s.Length != 7 || s[4] != '-') return false;
        for (var i = 0; i < 4; i++) if (!char.IsAsciiDigit(s[i])) return false;
        for (var i = 5; i < 7; i++) if (!char.IsAsciiDigit(s[i])) return false;
        return true;
    }
}

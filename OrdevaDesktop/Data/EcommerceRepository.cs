using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD delle configurazioni e-commerce e dei mapping con Dapper. Porta la logica
/// del backend (routes/ecommerce.rs):
/// <list type="bullet">
///   <item>in lettura api_key/api_secret sono mascherati a "***" se presenti
///         (non si espone mai il segreto reale);</item>
///   <item>provider/nome/baseUrl sono obbligatori in creazione;</item>
///   <item>in aggiornamento nome/baseUrl ricadono sui valori correnti se vuoti;
///         api_key/api_secret si aggiornano solo se forniti e diversi da "***".</item>
/// </list>
/// I mapping di ogni config si caricano in batch (niente N+1).
/// </summary>
public sealed class EcommerceRepository
{
    private const string Mask = "***";

    // Alias snake_case → PascalCase. Riusato da GetAll/GetById/GetCurrent.
    private const string ConfigColumns = @"
        id         AS Id,
        provider   AS Provider,
        nome       AS Nome,
        base_url   AS BaseUrl,
        api_key    AS ApiKey,
        api_secret AS ApiSecret,
        attivo     AS Attivo,
        last_sync  AS LastSync,
        created_at AS CreatedAt";

    private const string MappingColumns = @"
        id        AS Id,
        config_id AS ConfigId,
        tipo      AS Tipo,
        remote_id AS RemoteId,
        local_id  AS LocalId,
        last_sync AS LastSync";

    /// <summary>Tutte le configurazioni ordinate per id, con credenziali mascherate.</summary>
    public List<EcommerceConfig> GetAll()
    {
        using var conn = Db.Open();
        var configs = conn.Query<EcommerceConfig>(
            $"SELECT {ConfigColumns} FROM ecommerce_config ORDER BY id").ToList();
        foreach (var c in configs)
            MaskCredentials(c);
        return configs;
    }

    /// <summary>Dettaglio di una config (credenziali mascherate) + i suoi mapping.</summary>
    public EcommerceConfig? GetById(long id)
    {
        using var conn = Db.Open();
        var c = conn.QuerySingleOrDefault<EcommerceConfig>(
            $"SELECT {ConfigColumns} FROM ecommerce_config WHERE id = @id", new { id });
        if (c == null) return null;
        MaskCredentials(c);
        return c;
    }

    /// <summary>
    /// Tutti i mapping raggruppati per config_id, in un'unica query (niente N+1).
    /// Pensato per gli elenchi: la UI mostra il conteggio/i mapping per riga.
    /// </summary>
    public Dictionary<long, List<EcommerceMapping>> GetMappingsByConfig()
    {
        using var conn = Db.Open();
        return conn.Query<EcommerceMapping>(
                $"SELECT {MappingColumns} FROM ecommerce_mapping ORDER BY config_id, tipo, remote_id")
            .GroupBy(m => m.ConfigId)
            .ToDictionary(g => g.Key, g => g.ToList());
    }

    /// <summary>Mapping di una singola config (per il dettaglio/dialog).</summary>
    public List<EcommerceMapping> GetMappings(long configId)
    {
        using var conn = Db.Open();
        return conn.Query<EcommerceMapping>(
            $"SELECT {MappingColumns} FROM ecommerce_mapping WHERE config_id=@configId ORDER BY tipo, remote_id",
            new { configId }).ToList();
    }

    /// <summary>
    /// Inserisce una config e ne restituisce l'id. Valida i campi obbligatori
    /// (provider/nome/baseUrl) come create() del backend. Le credenziali "***"
    /// in ingresso (nessun segreto reale digitato) vengono salvate come vuote.
    /// </summary>
    public long Insert(EcommerceConfig c)
    {
        Validate(c);
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO ecommerce_config (provider, nome, base_url, api_key, api_secret, attivo)
            VALUES (@Provider, @Nome, @BaseUrl, @ApiKey, @ApiSecret, @Attivo);
            SELECT last_insert_rowid();",
            new
            {
                c.Provider,
                c.Nome,
                c.BaseUrl,
                ApiKey = Incoming(c.ApiKey),
                ApiSecret = Incoming(c.ApiSecret),
                Attivo = c.Attivo ? 1 : 0,
            });
    }

    /// <summary>
    /// Aggiorna una config. Replica le regole di update() del backend:
    /// nome/baseUrl vuoti ricadono sui valori correnti; api_key/api_secret si
    /// toccano solo se forniti, non vuoti e diversi dalla maschera "***".
    /// Il provider NON è modificabile (il backend non lo aggiorna).
    /// </summary>
    public void Update(EcommerceConfig c)
    {
        using var conn = Db.Open();
        var cur = conn.QuerySingleOrDefault<EcommerceConfig>(
            "SELECT nome AS Nome, base_url AS BaseUrl, api_key AS ApiKey, api_secret AS ApiSecret FROM ecommerce_config WHERE id=@Id",
            new { c.Id });
        if (cur == null) return; // config non trovata: come 404 del backend

        var nome = string.IsNullOrEmpty(c.Nome) ? cur.Nome : c.Nome;
        var baseUrl = string.IsNullOrEmpty(c.BaseUrl) ? cur.BaseUrl : c.BaseUrl;
        var apiKey = KeepOrReplace(c.ApiKey, cur.ApiKey);
        var apiSecret = KeepOrReplace(c.ApiSecret, cur.ApiSecret);

        conn.Execute(@"
            UPDATE ecommerce_config
            SET nome=@nome, base_url=@baseUrl, api_key=@apiKey, api_secret=@apiSecret, attivo=@attivo
            WHERE id=@Id",
            new { nome, baseUrl, apiKey, apiSecret, attivo = c.Attivo ? 1 : 0, c.Id });
    }

    /// <summary>Elimina una config; i mapping vanno via in CASCADE.</summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM ecommerce_config WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            conn.Execute("DELETE FROM ecommerce_config WHERE id=@id", new { id }, tx);
        tx.Commit();
        return list.Count;
    }

    // ── helper privati ────────────────────────────────────────────────────────

    /// <summary>Maschera le credenziali presenti a "***" (parità con list()).</summary>
    private static void MaskCredentials(EcommerceConfig c)
    {
        c.ApiKey = string.IsNullOrEmpty(c.ApiKey) ? "" : Mask;
        c.ApiSecret = string.IsNullOrEmpty(c.ApiSecret) ? "" : Mask;
    }

    /// <summary>Valore credenziale in INSERT: la maschera "***" diventa stringa vuota.</summary>
    private static string Incoming(string? v)
        => string.IsNullOrEmpty(v) || v == Mask ? "" : v;

    /// <summary>
    /// In UPDATE: mantiene il valore corrente se quello fornito è vuoto o è la
    /// maschera "***"; altrimenti applica il nuovo segreto.
    /// </summary>
    private static string KeepOrReplace(string? fornito, string corrente)
        => !string.IsNullOrEmpty(fornito) && fornito != Mask ? fornito : corrente;

    private static void Validate(EcommerceConfig c)
    {
        if (string.IsNullOrWhiteSpace(c.Provider) ||
            string.IsNullOrWhiteSpace(c.Nome) ||
            string.IsNullOrWhiteSpace(c.BaseUrl))
        {
            throw new System.ArgumentException("provider, nome, baseUrl obbligatori");
        }
        if (!EcommerceProvider.Tutti.Contains(c.Provider))
            throw new System.ArgumentException($"provider non valido: {c.Provider}");
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>Errore "di dominio" del magazzino: messaggi pensati per l'utente
/// (es. "deposito predefinito non eliminabile"), come i bad_request del backend.</summary>
public sealed class MagazzinoException : Exception
{
    public MagazzinoException(string message) : base(message) { }
}

/// <summary>
/// Accesso dati del magazzino con Dapper. Porta la logica del backend Rust
/// (routes/magazzini.rs, routes/movimenti_magazzino.rs, stock.rs):
/// CRUD depositi con vincolo "predefinito unico" e blocco eliminazione,
/// giacenze per deposito con join prodotto/variante, storico movimenti filtrabile,
/// trasferimenti e rettifiche giacenza con upsert (adj_giacenza).
///
/// Tutte le query usano alias snake_case → PascalCase. Le mutazioni che toccano
/// più righe girano in un'unica transazione (niente query in loop sciolte).
/// </summary>
public sealed class MagazzinoRepository
{
    // ── Depositi (CRUD) ───────────────────────────────────────────────────────

    private const string MagazzinoColumns = @"
        id          AS Id,
        codice      AS Codice,
        nome        AS Nome,
        indirizzo   AS Indirizzo,
        predefinito AS Predefinito,
        attivo      AS Attivo";

    /// <summary>Tutti i depositi: predefinito in cima, poi per nome (come il backend).</summary>
    public List<Magazzino> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Magazzino>(
            $"SELECT {MagazzinoColumns} FROM magazzini ORDER BY predefinito DESC, nome").ToList();
    }

    public Magazzino? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Magazzino>(
            $"SELECT {MagazzinoColumns} FROM magazzini WHERE id = @id", new { id });
    }

    /// <summary>
    /// Inserisce un deposito e ne restituisce l'id. Se impostato come predefinito,
    /// azzera il flag su tutti gli altri (un solo predefinito). Nome obbligatorio.
    /// </summary>
    public long Insert(Magazzino m)
    {
        var nome = (m.Nome ?? string.Empty).Trim();
        if (nome.Length == 0)
            throw new MagazzinoException("Nome obbligatorio");

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO magazzini (codice, nome, indirizzo, predefinito, attivo)
            VALUES (@Codice, @Nome, @Indirizzo, @Predefinito, @Attivo);
            SELECT last_insert_rowid();",
            new
            {
                Codice = m.Codice ?? string.Empty,
                Nome = nome,
                Indirizzo = m.Indirizzo ?? string.Empty,
                Predefinito = m.Predefinito ? 1 : 0,
                Attivo = m.Attivo ? 1 : 0,
            }, tx);

        if (m.Predefinito)
            conn.Execute("UPDATE magazzini SET predefinito=0 WHERE id<>@id", new { id }, tx);

        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna codice/nome/indirizzo/attivo del deposito. Se <c>predefinito</c> è
    /// true, lo rende l'unico predefinito (azzera gli altri). Nome obbligatorio.
    /// </summary>
    public void Update(Magazzino m)
    {
        var nome = (m.Nome ?? string.Empty).Trim();
        if (nome.Length == 0)
            throw new MagazzinoException("Nome obbligatorio");

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var n = conn.Execute(@"
            UPDATE magazzini SET codice=@Codice, nome=@Nome, indirizzo=@Indirizzo, attivo=@Attivo
            WHERE id=@Id",
            new
            {
                m.Id,
                Codice = m.Codice ?? string.Empty,
                Nome = nome,
                Indirizzo = m.Indirizzo ?? string.Empty,
                Attivo = m.Attivo ? 1 : 0,
            }, tx);

        if (n == 0)
            throw new MagazzinoException("Deposito non trovato");

        if (m.Predefinito)
        {
            conn.Execute("UPDATE magazzini SET predefinito=0", transaction: tx);
            conn.Execute("UPDATE magazzini SET predefinito=1 WHERE id=@Id", new { m.Id }, tx);
        }

        tx.Commit();
    }

    /// <summary>
    /// Elimina un deposito. Vietato sul predefinito o se contiene giacenze
    /// (parità con il backend: prima trasferiscile/azzerale).
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();

        var m = conn.QuerySingleOrDefault<(long Predefinito, string? Nome)>(
            "SELECT predefinito AS Predefinito, nome AS Nome FROM magazzini WHERE id=@id", new { id });
        if (m.Nome is null && conn.ExecuteScalar<long>("SELECT COUNT(*) FROM magazzini WHERE id=@id", new { id }) == 0)
            throw new MagazzinoException("Deposito non trovato");

        if (m.Predefinito == 1)
            throw new MagazzinoException("Non puoi eliminare il deposito predefinito");

        var giac = conn.ExecuteScalar<double>(
            "SELECT COALESCE(SUM(ABS(quantita)),0) FROM giacenze WHERE magazzino_id=@id", new { id });
        if (giac > 0)
            throw new MagazzinoException("Il deposito contiene giacenze: trasferiscile o azzerale prima.");

        conn.Execute("DELETE FROM magazzini WHERE id=@id", new { id });
    }

    /// <summary>Id del deposito predefinito (o il primo attivo / il primo esistente).
    /// Porta <c>magazzino_default_id</c> di stock.rs.</summary>
    public long? MagazzinoDefaultId(SqliteConnection conn, SqliteTransaction? tx = null)
    {
        long? q(string sql) => conn.ExecuteScalar<long?>(sql, transaction: tx);
        return q("SELECT id FROM magazzini WHERE predefinito=1 LIMIT 1")
            ?? q("SELECT id FROM magazzini WHERE attivo=1 ORDER BY id LIMIT 1")
            ?? q("SELECT id FROM magazzini ORDER BY id LIMIT 1");
    }

    // ── Giacenze ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Giacenze per deposito/prodotto, con nomi risolti via join (prodotto, variante,
    /// deposito). <paramref name="soloDisponibili"/> esclude le righe a quantità 0.
    /// </summary>
    public List<Giacenza> GetGiacenze(long? magazzinoId = null, long? prodottoId = null, bool soloDisponibili = false)
    {
        using var conn = Db.Open();
        var where = new StringBuilder("1=1");
        if (magazzinoId is not null) where.Append(" AND g.magazzino_id=@magazzinoId");
        if (prodottoId is not null) where.Append(" AND g.prodotto_id=@prodottoId");
        if (soloDisponibili) where.Append(" AND g.quantita <> 0");

        return conn.Query<Giacenza>($@"
            SELECT g.id            AS Id,
                   g.prodotto_id   AS ProdottoId,
                   p.nome          AS ProdottoNome,
                   p.codice        AS ProdottoCodice,
                   p.unita_misura  AS UnitaMisura,
                   g.variante_id   AS VarianteId,
                   v.taglia        AS VarianteTaglia,
                   v.colore        AS VarianteColore,
                   g.magazzino_id  AS MagazzinoId,
                   m.nome          AS MagazzinoNome,
                   g.lotto         AS Lotto,
                   g.scadenza      AS Scadenza,
                   g.quantita      AS Quantita
            FROM giacenze g
            JOIN prodotti p ON p.id = g.prodotto_id
            LEFT JOIN prodotto_varianti v ON v.id = g.variante_id
            JOIN magazzini m ON m.id = g.magazzino_id
            WHERE {where}
            ORDER BY p.nome, m.nome, g.scadenza",
            new { magazzinoId, prodottoId }).ToList();
    }

    /// <summary>Giacenze (disponibili) di un singolo prodotto su tutti i depositi.
    /// Usato dal trasferimento per scegliere il deposito di origine.</summary>
    public List<Giacenza> GetGiacenzeProdotto(long prodottoId)
    {
        using var conn = Db.Open();
        return conn.Query<Giacenza>(@"
            SELECT g.id           AS Id,
                   g.prodotto_id  AS ProdottoId,
                   g.magazzino_id AS MagazzinoId,
                   m.nome         AS MagazzinoNome,
                   g.variante_id  AS VarianteId,
                   v.taglia       AS VarianteTaglia,
                   v.colore       AS VarianteColore,
                   g.lotto        AS Lotto,
                   g.scadenza     AS Scadenza,
                   g.quantita     AS Quantita
            FROM giacenze g
            JOIN magazzini m ON m.id = g.magazzino_id
            LEFT JOIN prodotto_varianti v ON v.id = g.variante_id
            WHERE g.prodotto_id=@prodottoId AND g.quantita <> 0
            ORDER BY m.nome, g.scadenza",
            new { prodottoId }).ToList();
    }

    /// <summary>Lotti in scadenza entro <paramref name="giorni"/> giorni (quantità &gt; 0).</summary>
    public List<Giacenza> GetScadenze(int giorni = 30)
    {
        giorni = Math.Clamp(giorni, 0, 3650);
        var limite = DateTime.Today.AddDays(giorni).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        using var conn = Db.Open();
        return conn.Query<Giacenza>(@"
            SELECT g.id           AS Id,
                   g.prodotto_id  AS ProdottoId,
                   p.nome         AS ProdottoNome,
                   p.unita_misura AS UnitaMisura,
                   g.magazzino_id AS MagazzinoId,
                   m.nome         AS MagazzinoNome,
                   g.lotto        AS Lotto,
                   g.scadenza     AS Scadenza,
                   g.quantita     AS Quantita
            FROM giacenze g
            JOIN prodotti p ON p.id = g.prodotto_id
            JOIN magazzini m ON m.id = g.magazzino_id
            WHERE g.scadenza <> '' AND g.scadenza <= @limite AND g.quantita > 0
            ORDER BY g.scadenza ASC",
            new { limite }).ToList();
    }

    // ── Movimenti (storico) ───────────────────────────────────────────────────

    /// <summary>
    /// Storico movimenti con filtri opzionali (prodotto, cliente, tipo, causale,
    /// anno, mese, intervallo date). I nomi sono COALESCE(join, denormalizzato)
    /// come nel backend, così resta visibile anche lo storico di anagrafiche cancellate.
    /// </summary>
    public List<MovimentoMagazzino> GetMovimenti(MovimentiFiltro f)
    {
        using var conn = Db.Open();
        var sql = new StringBuilder(@"
            SELECT m.id               AS Id,
                   m.data             AS Data,
                   m.prodotto_id      AS ProdottoId,
                   m.tipo             AS Tipo,
                   m.quantita         AS Quantita,
                   m.causale          AS Causale,
                   m.documento_tipo   AS DocumentoTipo,
                   m.documento_id     AS DocumentoId,
                   m.documento_numero AS DocumentoNumero,
                   m.cliente_id       AS ClienteId,
                   m.fornitore_id     AS FornitoreId,
                   m.note             AS Note,
                   m.variante_taglia  AS VarianteTaglia,
                   m.variante_colore  AS VarianteColore,
                   COALESCE(p.nome, m.prodotto_nome)             AS ProdottoNome,
                   COALESCE(c.ragione_sociale, m.cliente_nome)   AS ClienteNome,
                   COALESCE(f.ragione_sociale, m.fornitore_nome) AS FornitoreNome
            FROM movimenti_magazzino m
            LEFT JOIN prodotti  p ON m.prodotto_id  = p.id
            LEFT JOIN clienti   c ON m.cliente_id   = c.id
            LEFT JOIN fornitori f ON m.fornitore_id = f.id
            WHERE 1=1");

        var p = new DynamicParameters();
        if (f.ProdottoId is not null) { sql.Append(" AND m.prodotto_id=@ProdottoId"); p.Add("ProdottoId", f.ProdottoId); }
        if (f.ClienteId is not null) { sql.Append(" AND m.cliente_id=@ClienteId"); p.Add("ClienteId", f.ClienteId); }
        if (!string.IsNullOrEmpty(f.Tipo)) { sql.Append(" AND m.tipo=@Tipo"); p.Add("Tipo", f.Tipo); }
        if (!string.IsNullOrEmpty(f.Causale)) { sql.Append(" AND m.causale=@Causale"); p.Add("Causale", f.Causale); }
        if (f.Anno is not null) { sql.Append(" AND strftime('%Y', m.data)=@Anno"); p.Add("Anno", f.Anno.Value.ToString("D4", CultureInfo.InvariantCulture)); }
        if (f.Mese is not null) { sql.Append(" AND strftime('%m', m.data)=@Mese"); p.Add("Mese", f.Mese.Value.ToString("D2", CultureInfo.InvariantCulture)); }
        if (!string.IsNullOrEmpty(f.DataFrom)) { sql.Append(" AND m.data >= @DataFrom"); p.Add("DataFrom", f.DataFrom); }
        if (!string.IsNullOrEmpty(f.DataTo)) { sql.Append(" AND m.data <= @DataTo"); p.Add("DataTo", f.DataTo); }
        sql.Append(" ORDER BY m.data DESC, m.id DESC");

        return conn.Query<MovimentoMagazzino>(sql.ToString(), p).ToList();
    }

    // ── Trasferimento ─────────────────────────────────────────────────────────

    /// <summary>
    /// Trasferisce <paramref name="quantita"/> di un prodotto (per lotto/scadenza) da
    /// un deposito all'altro: scarica l'origine, carica la destinazione e registra un
    /// movimento TRASFERIMENTO. Porta la validazione del backend (depositi distinti,
    /// quantità positiva, giacenza sufficiente). NON tocca il totale prodotto.
    /// </summary>
    public void Trasferimento(long prodottoId, long daMagazzinoId, long aMagazzinoId,
        decimal quantita, long? varianteId = null, string lotto = "", string scadenza = "", string note = "")
    {
        if (prodottoId == 0 || daMagazzinoId == 0 || aMagazzinoId == 0)
            throw new MagazzinoException("Prodotto e depositi obbligatori");
        if (daMagazzinoId == aMagazzinoId)
            throw new MagazzinoException("I depositi di origine e destinazione coincidono");
        if (quantita <= 0)
            throw new MagazzinoException("Quantità non valida");

        var vid = varianteId == 0 ? null : varianteId;
        lotto ??= string.Empty;
        scadenza ??= string.Empty;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var disp = conn.ExecuteScalar<double?>(@"
            SELECT COALESCE(quantita,0) FROM giacenze
            WHERE prodotto_id=@prodottoId AND IFNULL(variante_id,0)=IFNULL(@vid,0)
              AND magazzino_id=@da AND lotto=@lotto AND scadenza=@scadenza",
            new { prodottoId, vid, da = daMagazzinoId, lotto, scadenza }, tx) ?? 0;

        if ((decimal)disp < quantita)
            throw new MagazzinoException(
                $"Giacenza insufficiente nel deposito di origine (disponibili {FmtNum(disp)}).");

        var nome = conn.ExecuteScalar<string?>(
            "SELECT nome FROM prodotti WHERE id=@prodottoId", new { prodottoId }, tx) ?? string.Empty;
        var noteTrim = (note ?? string.Empty);
        if (noteTrim.Length > 500) noteTrim = noteTrim.Substring(0, 500);

        AdjGiacenza(conn, tx, prodottoId, vid, daMagazzinoId, lotto, scadenza, -quantita);
        AdjGiacenza(conn, tx, prodottoId, vid, aMagazzinoId, lotto, scadenza, quantita);

        conn.Execute(@"
            INSERT INTO movimenti_magazzino
              (data, prodotto_id, prodotto_nome, tipo, quantita, causale, note,
               variante_id, magazzino_id, magazzino_dest_id, lotto, scadenza)
            VALUES
              (@data, @prodottoId, @nome, 'TRASFERIMENTO', @quantita, 'TRASFERIMENTO', @note,
               @vid, @da, @a, @lotto, @scadenza)",
            new
            {
                data = Oggi(),
                prodottoId,
                nome,
                quantita,
                note = noteTrim,
                vid,
                da = daMagazzinoId,
                a = aMagazzinoId,
                lotto,
                scadenza,
            }, tx);

        tx.Commit();
    }

    // ── Rettifica giacenza ────────────────────────────────────────────────────

    /// <summary>
    /// Porta a inventario la giacenza di un prodotto (o di una sua variante):
    /// imposta la quantità "master", registra un movimento RETTIFICA col delta e
    /// aggiorna la giacenza del deposito (predefinito se non specificato).
    /// Restituisce il delta applicato (0 se nessuna differenza). Porta
    /// <c>applica_rettifica</c> di prodotti.rs.
    /// </summary>
    public decimal RettificaGiacenza(long prodottoId, decimal nuova, string note = "",
        long? varianteId = null, long? magazzinoId = null)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var esiste = conn.ExecuteScalar<long>(
            "SELECT COUNT(*) FROM prodotti WHERE id=@prodottoId", new { prodottoId }, tx) > 0;
        if (!esiste)
            throw new MagazzinoException("Prodotto non trovato");

        var nome = conn.ExecuteScalar<string?>(
            "SELECT nome FROM prodotti WHERE id=@prodottoId", new { prodottoId }, tx) ?? string.Empty;
        var noteStr = note ?? string.Empty;
        if (noteStr.Length > 500) noteStr = noteStr.Substring(0, 500);
        var data = Oggi();
        var mag = magazzinoId ?? MagazzinoDefaultId(conn, tx);

        if (varianteId is long vid)
        {
            var v = conn.QuerySingleOrDefault<(double Cur, string? Taglia, string? Colore)>(@"
                SELECT COALESCE(quantita,0) AS Cur, taglia AS Taglia, colore AS Colore
                FROM prodotto_varianti WHERE id=@vid AND prodotto_id=@prodottoId",
                new { vid, prodottoId }, tx);
            if (v.Taglia is null && v.Colore is null &&
                conn.ExecuteScalar<long>("SELECT COUNT(*) FROM prodotto_varianti WHERE id=@vid AND prodotto_id=@prodottoId", new { vid, prodottoId }, tx) == 0)
                throw new MagazzinoException("Variante non trovata");

            var deltaV = nuova - (decimal)v.Cur;
            if (deltaV != 0)
            {
                conn.Execute("UPDATE prodotto_varianti SET quantita=@nuova WHERE id=@vid",
                    new { nuova, vid }, tx);
                conn.Execute(@"
                    INSERT INTO movimenti_magazzino
                      (data, prodotto_id, prodotto_nome, tipo, quantita, causale, note,
                       variante_id, variante_taglia, variante_colore, magazzino_id)
                    VALUES
                      (@data, @prodottoId, @nome, @tipo, @qty, 'RETTIFICA', @note,
                       @vid, @taglia, @colore, @mag)",
                    new
                    {
                        data, prodottoId, nome,
                        tipo = deltaV > 0 ? "CARICO" : "SCARICO",
                        qty = Math.Abs(deltaV),
                        note = noteStr, vid,
                        taglia = v.Taglia ?? string.Empty,
                        colore = v.Colore ?? string.Empty,
                        mag,
                    }, tx);
                AdjGiacenza(conn, tx, prodottoId, vid, mag, "", "", deltaV);
                SyncQuantita(conn, tx, prodottoId);
            }
            tx.Commit();
            return deltaV;
        }

        var cur = (decimal)(conn.ExecuteScalar<double?>(
            "SELECT COALESCE(quantita,0) FROM prodotti WHERE id=@prodottoId", new { prodottoId }, tx) ?? 0);
        var delta = nuova - cur;
        if (delta != 0)
        {
            conn.Execute("UPDATE prodotti SET quantita=@nuova WHERE id=@prodottoId",
                new { nuova, prodottoId }, tx);
            conn.Execute(@"
                INSERT INTO movimenti_magazzino
                  (data, prodotto_id, prodotto_nome, tipo, quantita, causale, note, magazzino_id)
                VALUES
                  (@data, @prodottoId, @nome, @tipo, @qty, 'RETTIFICA', @note, @mag)",
                new
                {
                    data, prodottoId, nome,
                    tipo = delta > 0 ? "CARICO" : "SCARICO",
                    qty = Math.Abs(delta),
                    note = noteStr, mag,
                }, tx);
            AdjGiacenza(conn, tx, prodottoId, null, mag, "", "", delta);
        }
        tx.Commit();
        return delta;
    }

    // ── helper privati ────────────────────────────────────────────────────────

    /// <summary>Upsert giacenza per chiave prodotto/variante/deposito/lotto/scadenza.
    /// No-op se manca il deposito o il delta è 0 (porta <c>adj_giacenza</c>).</summary>
    private static void AdjGiacenza(SqliteConnection conn, SqliteTransaction tx,
        long prodottoId, long? varianteId, long? magazzinoId, string lotto, string scadenza, decimal delta)
    {
        if (magazzinoId is null || delta == 0) return;
        var mag = magazzinoId.Value;

        var existing = conn.ExecuteScalar<long?>(@"
            SELECT id FROM giacenze
            WHERE prodotto_id=@prodottoId AND IFNULL(variante_id,0)=IFNULL(@varianteId,0)
              AND magazzino_id=@mag AND lotto=@lotto AND scadenza=@scadenza",
            new { prodottoId, varianteId, mag, lotto, scadenza }, tx);

        if (existing is long id)
            conn.Execute("UPDATE giacenze SET quantita = quantita + @delta WHERE id=@id",
                new { delta, id }, tx);
        else
            conn.Execute(@"
                INSERT INTO giacenze (prodotto_id, variante_id, magazzino_id, lotto, scadenza, quantita)
                VALUES (@prodottoId, @varianteId, @mag, @lotto, @scadenza, @delta)",
                new { prodottoId, varianteId, mag, lotto, scadenza, delta }, tx);
    }

    /// <summary>Allinea prodotti.quantita alla somma delle varianti (dopo rettifica variante).</summary>
    private static void SyncQuantita(SqliteConnection conn, SqliteTransaction tx, long prodottoId)
    {
        conn.Execute(@"
            UPDATE prodotti
            SET quantita = (SELECT COALESCE(SUM(quantita),0) FROM prodotto_varianti WHERE prodotto_id=@prodottoId)
            WHERE id=@prodottoId", new { prodottoId }, tx);
    }

    private static string Oggi() => DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>Numero "all'italiana" senza zeri decimali superflui (parità con fmt_num).</summary>
    private static string FmtNum(double x) =>
        x == Math.Floor(x)
            ? ((long)x).ToString(CultureInfo.InvariantCulture)
            : x.ToString("0.####", CultureInfo.InvariantCulture);
}

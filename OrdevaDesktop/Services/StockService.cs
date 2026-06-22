using System;
using System.Collections.Generic;
using System.Globalization;
using Dapper;
using Microsoft.Data.Sqlite;

namespace Ordeva.Desktop.Services;

/// <summary>
/// Movimentazione magazzino centralizzata. Porta fedelmente <c>stock.rs</c> del
/// backend Rust (a sua volta parità con <c>utils/stock.js</c>):
/// <list type="bullet">
///   <item>deposito predefinito (<see cref="MagazzinoDefaultId"/>);</item>
///   <item>upsert giacenza per chiave prodotto/variante/deposito/lotto/scadenza
///         (<see cref="AdjGiacenza"/>);</item>
///   <item>applicazione di un movimento (+1 carico / -1 scarico) alle righe di un
///         documento, con scrittura su <c>prodotti</c>, <c>prodotto_varianti</c>,
///         <c>giacenze</c> e storico <c>movimenti_magazzino</c>
///         (<see cref="ApplicaRigheStock"/>);</item>
///   <item>riordino automatico fornitori (<see cref="CheckRiordino"/>);</item>
///   <item>riallineamento giacenze ai totali master (<see cref="RiallineaGiacenze"/>).</item>
/// </list>
///
/// <para><b>Transazioni.</b> Tutte le mutazioni multi-riga sono pensate per girare
/// dentro la transazione del documento chiamante (DDT, fattura, nota di credito,
/// arrivo merce, vendita banco...), esattamente come nel backend dove ricevevano
/// la <c>Connection</c>/<c>tx</c> aperta a monte. Per questo i metodi accettano la
/// <see cref="SqliteConnection"/> e la <see cref="SqliteTransaction"/> aperte dal
/// chiamante e NON aprono connessioni proprie. Esistono overload "stand-alone" che
/// aprono e committano da soli, comodi per i casi singoli (es. riallineo prodotto).</para>
///
/// <para>Le colonne SQLite sono snake_case, le proprietà C# PascalCase: le query
/// di lettura usano alias espliciti. I prezzi/quantità REAL sono mappati a
/// <see cref="decimal"/>; i flag INTEGER 0/1 a <see cref="bool"/>.</para>
/// </summary>
public sealed class StockService
{
    // ── Contesto e riga del movimento ─────────────────────────────────────────

    /// <summary>
    /// Contesto del movimento (parità con lo <c>StockCtx</c> di stock.rs / il
    /// <c>ctx</c> di applicaRigheStock in stock.js). Tutti i campi sono opzionali:
    /// i valori nulli/vuoti diventano stringa vuota o NULL nello storico, come nel
    /// backend (campi <c>..Default::default()</c>).
    /// </summary>
    public sealed class StockCtx
    {
        /// <summary>Data del movimento "yyyy-MM-dd". Se null, viene usata la data odierna.</summary>
        public string? Data { get; set; }
        public string Causale { get; set; } = string.Empty;
        public string DocumentoTipo { get; set; } = string.Empty;
        public long? DocumentoId { get; set; }
        public string DocumentoNumero { get; set; } = string.Empty;
        public long? ClienteId { get; set; }
        public string ClienteNome { get; set; } = string.Empty;
        public long? FornitoreId { get; set; }
        public string FornitoreNome { get; set; } = string.Empty;
        public string Note { get; set; } = string.Empty;
        /// <summary>Deposito forzato per tutte le righe (override del default).</summary>
        public long? MagazzinoId { get; set; }
        /// <summary>Lotto di fallback se la riga non lo specifica.</summary>
        public string? Lotto { get; set; }
        /// <summary>Scadenza di fallback se la riga non la specifica.</summary>
        public string? Scadenza { get; set; }
    }

    /// <summary>
    /// Riga di documento da movimentare, normalizzata (parità con i campi letti dal
    /// JSON in applica_righe_stock: <c>prodottoId</c>, <c>scaricaMagazzino</c>,
    /// <c>quantita</c>, <c>magazzinoId</c>, <c>lotto</c>, <c>scadenza</c>,
    /// <c>varianteId</c>, <c>varianteTaglia</c>, <c>varianteColore</c>,
    /// <c>descrizione</c>). I diversi tipi di riga documento (DDT, fattura, ecc.)
    /// si convertono in questo DTO comune.
    /// </summary>
    public sealed class StockRiga
    {
        public long? ProdottoId { get; set; }
        public long? VarianteId { get; set; }
        public decimal Quantita { get; set; }
        /// <summary>Se false la riga NON movimenta il magazzino (parità con scaricaMagazzino===false).</summary>
        public bool ScaricaMagazzino { get; set; } = true;
        public long? MagazzinoId { get; set; }
        public string? Lotto { get; set; }
        public string? Scadenza { get; set; }
        public string? VarianteTaglia { get; set; }
        public string? VarianteColore { get; set; }
        /// <summary>Descrizione di fallback per il nome prodotto sullo storico.</summary>
        public string? Descrizione { get; set; }
    }

    // ── Deposito predefinito ──────────────────────────────────────────────────

    /// <summary>
    /// Id del deposito predefinito, altrimenti il primo attivo, altrimenti il primo
    /// esistente. <c>null</c> se non c'è nessun deposito. Porta
    /// <c>magazzino_default_id</c> di stock.rs.
    /// </summary>
    public long? MagazzinoDefaultId(SqliteConnection conn, SqliteTransaction? tx = null)
    {
        long? Q(string sql) => conn.ExecuteScalar<long?>(sql, transaction: tx);
        return Q("SELECT id FROM magazzini WHERE predefinito=1 LIMIT 1")
            ?? Q("SELECT id FROM magazzini WHERE attivo=1 ORDER BY id LIMIT 1")
            ?? Q("SELECT id FROM magazzini ORDER BY id LIMIT 1");
    }

    // ── Upsert giacenza ───────────────────────────────────────────────────────

    /// <summary>
    /// Upsert della giacenza per chiave prodotto/variante/deposito/lotto/scadenza.
    /// No-op se manca il deposito o il delta è 0 (parità con
    /// <c>if (!magazzinoId || !delta) return</c>). Porta <c>adj_giacenza</c>.
    /// </summary>
    public void AdjGiacenza(SqliteConnection conn, SqliteTransaction? tx,
        long prodottoId, long? varianteId, long? magazzinoId,
        string lotto, string scadenza, decimal delta)
    {
        if (magazzinoId is null || delta == 0m) return;
        var mag = magazzinoId.Value;

        var existing = conn.ExecuteScalar<long?>(@"
            SELECT id FROM giacenze
            WHERE prodotto_id=@prodottoId
              AND IFNULL(variante_id,0)=IFNULL(@varianteId,0)
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

    // ── Applicazione del movimento alle righe documento ───────────────────────

    /// <summary>
    /// Applica un movimento di stock a una lista di righe di documento.
    /// <paramref name="delta"/> = -1 (scarico) | +1 (carico). Salta le righe senza
    /// prodotto, con quantità 0 o con <c>ScaricaMagazzino == false</c>. Per ogni
    /// riga aggiorna il totale prodotto, l'eventuale variante, la giacenza del
    /// deposito e scrive una riga nello storico <c>movimenti_magazzino</c>.
    /// Parità con <c>applica_righe_stock</c> / applicaRigheStock di stock.js.
    /// </summary>
    /// <param name="conn">Connessione del chiamante (già aperta).</param>
    /// <param name="tx">Transazione del chiamante (può essere null per uso isolato).</param>
    public void ApplicaRigheStock(SqliteConnection conn, SqliteTransaction? tx,
        IEnumerable<StockRiga> righe, int delta, StockCtx ctx)
    {
        var oggi = Oggi();
        // Deposito di fallback: forzato dal ctx, altrimenti il predefinito.
        var magDef = ctx.MagazzinoId ?? MagazzinoDefaultId(conn, tx);
        var dataMov = string.IsNullOrEmpty(ctx.Data) ? oggi : ctx.Data!;
        var tipo = delta > 0 ? "CARICO" : "SCARICO";

        foreach (var r in righe)
        {
            // Salta righe libere/senza prodotto.
            if (r.ProdottoId is not long prodottoId || prodottoId == 0) continue;
            // Riga che esplicitamente non scarica il magazzino.
            if (!r.ScaricaMagazzino) continue;
            // Quantità nulla: niente movimento.
            if (r.Quantita == 0m) continue;

            // varianteId valido solo se != 0 (parità con .filter(|&v| v != 0)).
            long? varianteId = r.VarianteId is long v && v != 0 ? v : null;
            var mag = r.MagazzinoId ?? magDef;
            var lotto = StrOr(r.Lotto, ctx.Lotto);
            var scad = StrOr(r.Scadenza, ctx.Scadenza);
            var signed = delta * r.Quantita;

            // Totale prodotto.
            conn.Execute("UPDATE prodotti SET quantita = quantita + @signed WHERE id = @prodottoId",
                new { signed, prodottoId }, tx);

            // Totale variante (se presente).
            if (varianteId is long vid)
                conn.Execute("UPDATE prodotto_varianti SET quantita = quantita + @signed WHERE id = @vid",
                    new { signed, vid }, tx);

            // Giacenza per deposito/lotto/scadenza.
            AdjGiacenza(conn, tx, prodottoId, varianteId, mag, lotto, scad, signed);

            // Nome prodotto: dall'anagrafica se valorizzato, altrimenti la descrizione di riga.
            var nomeProdotto = conn.ExecuteScalar<string?>(
                "SELECT nome FROM prodotti WHERE id=@prodottoId", new { prodottoId }, tx);
            var nome = !string.IsNullOrEmpty(nomeProdotto)
                ? nomeProdotto!
                : (r.Descrizione ?? string.Empty);

            // Storico: la quantità è sempre positiva, il segno è nel "tipo".
            conn.Execute(@"
                INSERT INTO movimenti_magazzino
                  (data, prodotto_id, prodotto_nome, tipo, quantita, causale,
                   documento_tipo, documento_id, documento_numero,
                   cliente_id, cliente_nome, fornitore_id, fornitore_nome, note,
                   variante_id, variante_taglia, variante_colore,
                   magazzino_id, magazzino_dest_id, lotto, scadenza)
                VALUES
                  (@data, @prodottoId, @nome, @tipo, @qty, @causale,
                   @documentoTipo, @documentoId, @documentoNumero,
                   @clienteId, @clienteNome, @fornitoreId, @fornitoreNome, @note,
                   @varianteId, @varianteTaglia, @varianteColore,
                   @mag, NULL, @lotto, @scad)",
                new
                {
                    data = dataMov,
                    prodottoId,
                    nome,
                    tipo,
                    qty = Math.Abs(signed),
                    causale = ctx.Causale ?? string.Empty,
                    documentoTipo = ctx.DocumentoTipo ?? string.Empty,
                    documentoId = ctx.DocumentoId,
                    documentoNumero = ctx.DocumentoNumero ?? string.Empty,
                    clienteId = ctx.ClienteId,
                    clienteNome = ctx.ClienteNome ?? string.Empty,
                    fornitoreId = ctx.FornitoreId,
                    fornitoreNome = ctx.FornitoreNome ?? string.Empty,
                    note = ctx.Note ?? string.Empty,
                    varianteId,
                    varianteTaglia = r.VarianteTaglia ?? string.Empty,
                    varianteColore = r.VarianteColore ?? string.Empty,
                    mag,
                    lotto,
                    scad,
                }, tx);
        }
    }

    /// <summary>
    /// Overload stand-alone: apre la connessione e gira in una transazione propria.
    /// Comodo per movimenti isolati non già dentro una transazione documento.
    /// </summary>
    public void ApplicaRigheStock(IEnumerable<StockRiga> righe, int delta, StockCtx ctx)
    {
        using var conn = Data.Db.Open();
        using var tx = conn.BeginTransaction();
        ApplicaRigheStock(conn, tx, righe, delta, ctx);
        tx.Commit();
    }

    // ── Riordino automatico ───────────────────────────────────────────────────

    /// <summary>
    /// Riordino automatico (parità con utils/riordino.js checkRiordino): se attivo
    /// in azienda, crea un ordine fornitore APERTO per ogni prodotto sceso sotto
    /// soglia che non abbia già un ordine aperto col fornitore preferito.
    /// Porta <c>check_riordino</c> di stock.rs.
    /// </summary>
    public void CheckRiordino(SqliteConnection conn, SqliteTransaction? tx, IEnumerable<long> prodottoIds)
    {
        var attivo = conn.ExecuteScalar<long?>(
            "SELECT COALESCE(riordino_automatico,0) FROM azienda WHERE id=1", transaction: tx) ?? 0;
        if (attivo == 0) return;

        var data = Oggi();
        var visti = new HashSet<long>();

        foreach (var pid in prodottoIds)
        {
            if (pid == 0 || !visti.Add(pid)) continue; // dedup, evita doppi ordini sullo stesso prodotto

            var prod = conn.QuerySingleOrDefault<RiordinoRow>(@"
                SELECT nome                          AS Nome,
                       COALESCE(soglia_minima,0)     AS Soglia,
                       COALESCE(quantita,0)          AS Quantita,
                       fornitore_id_preferito        AS FornPref,
                       COALESCE(riordino_quantita,0) AS RiordinoQ,
                       prezzo                        AS Prezzo,
                       iva                           AS Iva
                FROM prodotti WHERE id=@pid", new { pid }, tx);
            if (prod is null) continue;

            // Niente soglia o scorta ancora sopra soglia: nessun riordino.
            if (prod.Soglia <= 0m || prod.Quantita >= prod.Soglia) continue;
            // Serve un fornitore preferito.
            if (prod.FornPref is not long forn) continue;

            // Esiste già un ordine fornitore APERTO con quel fornitore per questo prodotto?
            var existing = conn.ExecuteScalar<long?>(@"
                SELECT o.id FROM ordini o
                JOIN ordini_righe r ON r.ordine_id = o.id
                WHERE o.tipo='FORNITORE' AND o.fornitore_id=@forn
                  AND r.prodotto_id=@pid AND o.stato='APERTO' LIMIT 1",
                new { forn, pid }, tx);
            if (existing is not null) continue;

            var numero = NextNumeroRiordino(conn, tx);
            var qta = prod.RiordinoQ > 0m ? prod.RiordinoQ : prod.Soglia - prod.Quantita;

            var ordineId = conn.ExecuteScalar<long>(@"
                INSERT INTO ordini (numero, data_ordine, fornitore_id, tipo, stato, note)
                VALUES (@numero, @data, @forn, 'FORNITORE', 'APERTO', @note);
                SELECT last_insert_rowid();",
                new
                {
                    numero,
                    data,
                    forn,
                    note = $"Riordino automatico – scorta {FmtNum(prod.Quantita)} < soglia {FmtNum(prod.Soglia)}",
                }, tx);

            conn.Execute(@"
                INSERT INTO ordini_righe (ordine_id, prodotto_id, descrizione, quantita, prezzo, iva)
                VALUES (@ordineId, @pid, @descrizione, @qta, @prezzo, @iva)",
                new
                {
                    ordineId,
                    pid,
                    descrizione = prod.Nome ?? string.Empty,
                    qta,
                    prezzo = prod.Prezzo,                 // NULL ammesso (REAL nullable)
                    iva = prod.Iva ?? 22m,                // default IVA come nel backend
                }, tx);
        }
    }

    /// <summary>Overload stand-alone con transazione propria.</summary>
    public void CheckRiordino(IEnumerable<long> prodottoIds)
    {
        using var conn = Data.Db.Open();
        using var tx = conn.BeginTransaction();
        CheckRiordino(conn, tx, prodottoIds);
        tx.Commit();
    }

    // ── Riallineo giacenze ────────────────────────────────────────────────────

    /// <summary>
    /// Riallinea le giacenze ai totali "master" riversando la differenza nel
    /// deposito predefinito (mantiene l'invariante somma(giacenze)==totale).
    /// Se il prodotto ha varianti, riallinea ogni variante alla propria somma;
    /// altrimenti riallinea il totale prodotto sulle giacenze senza variante.
    /// Porta <c>riallinea_giacenze</c> di stock.rs.
    /// </summary>
    public void RiallineaGiacenze(SqliteConnection conn, SqliteTransaction? tx, long prodottoId)
    {
        var mag = MagazzinoDefaultId(conn, tx);
        if (mag is null) return;

        var varianti = conn.Query<(long Id, decimal Quantita)>(
            "SELECT id AS Id, COALESCE(quantita,0) AS Quantita FROM prodotto_varianti WHERE prodotto_id=@prodottoId",
            new { prodottoId }, tx).AsList();

        if (varianti.Count > 0)
        {
            foreach (var (vid, vq) in varianti)
            {
                var somma = conn.ExecuteScalar<decimal>(
                    "SELECT COALESCE(SUM(quantita),0) FROM giacenze WHERE prodotto_id=@prodottoId AND variante_id=@vid",
                    new { prodottoId, vid }, tx);
                var diff = vq - somma;
                if (diff != 0m)
                    AdjGiacenza(conn, tx, prodottoId, vid, mag, "", "", diff);
            }
        }
        else
        {
            var tot = conn.ExecuteScalar<decimal?>(
                "SELECT COALESCE(quantita,0) FROM prodotti WHERE id=@prodottoId", new { prodottoId }, tx) ?? 0m;
            var somma = conn.ExecuteScalar<decimal>(
                "SELECT COALESCE(SUM(quantita),0) FROM giacenze WHERE prodotto_id=@prodottoId AND variante_id IS NULL",
                new { prodottoId }, tx);
            var diff = tot - somma;
            if (diff != 0m)
                AdjGiacenza(conn, tx, prodottoId, null, mag, "", "", diff);
        }
    }

    /// <summary>Overload stand-alone con transazione propria.</summary>
    public void RiallineaGiacenze(long prodottoId)
    {
        using var conn = Data.Db.Open();
        using var tx = conn.BeginTransaction();
        RiallineaGiacenze(conn, tx, prodottoId);
        tx.Commit();
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Numero progressivo "RO-n" per il riordino automatico. Nel backend Rust era
    /// <c>RO-(COUNT(*)+1)</c>: con ordini cancellati può collidere. Qui partiamo da
    /// quel numero e incrementiamo finché non è libero, così non sbatte sull'UNIQUE
    /// di <c>ordini.numero</c> (stesso prefisso, comportamento robusto).
    /// </summary>
    private static string NextNumeroRiordino(SqliteConnection conn, SqliteTransaction? tx)
    {
        var count = conn.ExecuteScalar<long>("SELECT COUNT(*) FROM ordini", transaction: tx);
        var n = count + 1;
        while (true)
        {
            var numero = $"RO-{n}";
            var esiste = conn.ExecuteScalar<long?>(
                "SELECT 1 FROM ordini WHERE numero=@numero LIMIT 1", new { numero }, tx);
            if (esiste is null) return numero;
            n++;
        }
    }

    /// <summary>
    /// Conversione "loose" stringa→decimal con virgola decimale all'italiana, per i
    /// pochi casi in cui la quantità arriva come testo (parità con num_loose di
    /// stock.rs). Le righe già tipizzate usano direttamente <c>decimal</c>.
    /// </summary>
    public static decimal NumLoose(string? s)
    {
        if (string.IsNullOrEmpty(s)) return 0m;
        return decimal.TryParse(s.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var d)
            ? d : 0m;
    }

    /// <summary>
    /// Prima stringa non vuota tra valore di riga e fallback di contesto, altrimenti
    /// "" (parità con str_or di stock.rs).
    /// </summary>
    private static string StrOr(string? field, string? ctxVal)
    {
        if (!string.IsNullOrEmpty(field)) return field!;
        if (!string.IsNullOrEmpty(ctxVal)) return ctxVal!;
        return string.Empty;
    }

    private static string Oggi() => DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>Numero "all'italiana" senza zeri decimali superflui (parità con fmt_num).</summary>
    private static string FmtNum(decimal x) =>
        x == Math.Floor(x)
            ? ((long)x).ToString(CultureInfo.InvariantCulture)
            : x.ToString("0.####", CultureInfo.InvariantCulture);

    /// <summary>Riga di lavoro per il riordino (alias snake_case → PascalCase).</summary>
    private sealed class RiordinoRow
    {
        public string? Nome { get; set; }
        public decimal Soglia { get; set; }
        public decimal Quantita { get; set; }
        public long? FornPref { get; set; }
        public decimal RiordinoQ { get; set; }
        public decimal? Prezzo { get; set; }
        public decimal? Iva { get; set; }
    }
}

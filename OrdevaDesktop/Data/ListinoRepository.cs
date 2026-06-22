using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD dei listini prezzi con Dapper. Porta la logica del backend Rust
/// (routes/listini.rs): lista con conteggio prezzi, dettaglio che carica prezzi e
/// sezioni in batch (niente N+1), upsert prezzo con ON CONFLICT, sezioni, aggiunta
/// in blocco, riordino condiviso prezzi/sezioni e <see cref="Resolve"/> del prezzo
/// effettivo per cliente+prodotto (BASE / LISTINO_SCONTO / LISTINO_OVERRIDE).
/// </summary>
public sealed class ListinoRepository
{
    // Alias snake_case → PascalCase per la tabella listini. Riusato ovunque.
    private const string ListinoColumns = @"
        id                 AS Id,
        nome               AS Nome,
        descrizione        AS Descrizione,
        sconto_default     AS ScontoDefault,
        attivo             AS Attivo,
        created_at         AS CreatedAt,
        colonne_extra      AS ColonneExtra,
        colonne_standard   AS ColonneStandard,
        colonne_config     AS ColonneConfig,
        stampa_due_colonne AS StampaDueColonne,
        griglia            AS Griglia,
        tema               AS Tema";

    // Prezzo + dati prodotto (JOIN), alias verso ListinoPrezzo.
    private const string PrezzoColumns = @"
        lp.id            AS Id,
        lp.listino_id    AS ListinoId,
        lp.prodotto_id   AS ProdottoId,
        lp.prezzo        AS Prezzo,
        lp.sconto        AS Sconto,
        lp.ordine        AS Ordine,
        lp.dati_extra    AS DatiExtra,
        lp.stili         AS Stili,
        p.nome           AS ProdottoNome,
        p.codice         AS ProdottoCodice,
        p.prezzo         AS ProdottoPrezzoBase,
        p.iva            AS ProdottoIva,
        p.unita_misura   AS ProdottoUm,
        p.categoria      AS ProdottoCategoria,
        p.descrizione    AS ProdottoDescrizione,
        p.peso           AS ProdottoPeso,
        p.dimensioni     AS ProdottoDimensioni";

    private const string SezioneColumns = @"
        id          AS Id,
        listino_id  AS ListinoId,
        nome        AS Nome,
        ordine      AS Ordine";

    // ── LISTINI ───────────────────────────────────────────────────────────────

    /// <summary>Tutti i listini ordinati per nome, con il conteggio dei prezzi.</summary>
    public List<Listino> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Listino>($@"
            SELECT {ListinoColumns},
                   (SELECT COUNT(*) FROM listini_prezzi lp WHERE lp.listino_id = l.id) AS PrezziCount
            FROM listini l
            ORDER BY l.nome").ToList();
    }

    /// <summary>Dettaglio completo: listino + prezzi (con dati prodotto) + sezioni.</summary>
    public Listino? GetById(long id)
    {
        using var conn = Db.Open();
        var listino = conn.QuerySingleOrDefault<Listino>(
            $"SELECT {ListinoColumns} FROM listini l WHERE l.id = @id", new { id });
        if (listino == null) return null;

        listino.Prezzi = LoadPrezzi(conn, id);
        listino.Sezioni = LoadSezioni(conn, id);
        listino.PrezziCount = listino.Prezzi.Count;
        return listino;
    }

    /// <summary>Inserisce un listino e ne restituisce l'id. Nome obbligatorio (UNIQUE).</summary>
    public long Insert(Listino l)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO listini
              (nome, descrizione, sconto_default, attivo, colonne_extra, colonne_standard,
               colonne_config, stampa_due_colonne, griglia, tema)
            VALUES
              (@Nome, @Descrizione, @ScontoDefault, @Attivo, @ColonneExtra, @ColonneStandard,
               @ColonneConfig, @StampaDueColonne, @Griglia, @Tema);
            SELECT last_insert_rowid();", Bind(l));
    }

    /// <summary>Aggiorna l'anagrafica del listino (nome, sconto, attivo, config grafica).</summary>
    public void Update(Listino l)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE listini SET
              nome=@Nome, descrizione=@Descrizione, sconto_default=@ScontoDefault, attivo=@Attivo,
              colonne_extra=@ColonneExtra, colonne_standard=@ColonneStandard, colonne_config=@ColonneConfig,
              stampa_due_colonne=@StampaDueColonne, griglia=@Griglia, tema=@Tema
            WHERE id=@Id", Bind(l, l.Id));
    }

    /// <summary>
    /// Elimina un listino. Come il backend, prima scollega i clienti assegnati
    /// (listino_id=NULL) così tornano ai prezzi base; prezzi e sezioni vanno via
    /// in CASCADE.
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        DeleteCore(conn, tx, id);
        tx.Commit();
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            DeleteCore(conn, tx, id);
        tx.Commit();
        return list.Count;
    }

    // ── PREZZI ──────────────────────────────────────────────────────────────────

    /// <summary>Prezzi del listino con i dati prodotto, ordinati per ordine poi nome.</summary>
    public List<ListinoPrezzo> GetPrezzi(long listinoId)
    {
        using var conn = Db.Open();
        return LoadPrezzi(conn, listinoId);
    }

    /// <summary>
    /// Upsert di una riga prezzo (ON CONFLICT su listino_id+prodotto_id). Nuova riga →
    /// ordine in coda. Porta prezzo_upsert: prezzo/sconto sempre aggiornati.
    /// </summary>
    public void UpsertPrezzo(long listinoId, ListinoPrezzo p)
    {
        using var conn = Db.Open();
        var ord = NextOrdine(conn, null, listinoId);
        conn.Execute(@"
            INSERT INTO listini_prezzi (listino_id, prodotto_id, prezzo, sconto, dati_extra, stili, ordine)
            VALUES (@listinoId, @ProdottoId, @Prezzo, @Sconto, COALESCE(@DatiExtra,'{}'), COALESCE(@Stili,'{}'), @ord)
            ON CONFLICT(listino_id, prodotto_id) DO UPDATE SET
              prezzo=excluded.prezzo, sconto=excluded.sconto,
              dati_extra=excluded.dati_extra, stili=excluded.stili",
            new { listinoId, p.ProdottoId, p.Prezzo, p.Sconto, p.DatiExtra, p.Stili, ord });
    }

    /// <summary>Aggiorna prezzo/sconto di una riga esistente del listino.</summary>
    public void UpdatePrezzo(long listinoId, long prezzoId, decimal? prezzo, decimal? sconto)
    {
        using var conn = Db.Open();
        conn.Execute(
            "UPDATE listini_prezzi SET prezzo=@prezzo, sconto=@sconto WHERE id=@prezzoId AND listino_id=@listinoId",
            new { prezzo, sconto, prezzoId, listinoId });
    }

    /// <summary>Rimuove una riga prezzo dal listino.</summary>
    public void DeletePrezzo(long listinoId, long prezzoId)
    {
        using var conn = Db.Open();
        conn.Execute(
            "DELETE FROM listini_prezzi WHERE id=@prezzoId AND listino_id=@listinoId",
            new { prezzoId, listinoId });
    }

    /// <summary>
    /// Aggiunge in blocco più prodotti al listino (ordine in coda, sconto opzionale),
    /// saltando quelli già presenti (ON CONFLICT DO NOTHING). Restituisce gli aggiunti.
    /// </summary>
    public int BulkAddProdotti(long listinoId, IEnumerable<long> prodottoIds, decimal? sconto)
    {
        var ids = prodottoIds.Where(p => p != 0).Distinct().Take(5000).ToList();
        if (ids.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        // Ordine in coda: parto dal max corrente e incremento (parità con next_ordine - 1).
        var maxOrd = NextOrdine(conn, tx, listinoId) - 1;
        var aggiunti = 0;
        foreach (var pid in ids)
        {
            maxOrd++;
            aggiunti += conn.Execute(@"
                INSERT INTO listini_prezzi (listino_id, prodotto_id, prezzo, sconto, dati_extra, ordine)
                VALUES (@listinoId, @pid, NULL, @sconto, '{}', @maxOrd)
                ON CONFLICT(listino_id, prodotto_id) DO NOTHING",
                new { listinoId, pid, sconto, maxOrd }, tx);
        }
        tx.Commit();
        return aggiunti;
    }

    // ── SEZIONI ─────────────────────────────────────────────────────────────────

    /// <summary>Sezioni del listino, ordinate per ordine poi id.</summary>
    public List<ListinoSezione> GetSezioni(long listinoId)
    {
        using var conn = Db.Open();
        return LoadSezioni(conn, listinoId);
    }

    /// <summary>Crea una sezione in coda (ordine condiviso con i prezzi). Nome max 80 char.</summary>
    public long CreateSezione(long listinoId, string nome)
    {
        using var conn = Db.Open();
        var ord = NextOrdine(conn, null, listinoId);
        return conn.ExecuteScalar<long>(@"
            INSERT INTO listini_sezioni (listino_id, nome, ordine) VALUES (@listinoId, @nome, @ord);
            SELECT last_insert_rowid();",
            new { listinoId, nome = Truncate(nome, 80), ord });
    }

    /// <summary>Rinomina una sezione del listino.</summary>
    public void UpdateSezione(long listinoId, long sezioneId, string nome)
    {
        using var conn = Db.Open();
        conn.Execute(
            "UPDATE listini_sezioni SET nome=@nome WHERE id=@sezioneId AND listino_id=@listinoId",
            new { nome = Truncate(nome, 80), sezioneId, listinoId });
    }

    /// <summary>Elimina una sezione del listino.</summary>
    public void DeleteSezione(long listinoId, long sezioneId)
    {
        using var conn = Db.Open();
        conn.Execute(
            "DELETE FROM listini_sezioni WHERE id=@sezioneId AND listino_id=@listinoId",
            new { sezioneId, listinoId });
    }

    /// <summary>
    /// Riordina prezzi e sezioni in un'unica sequenza: la posizione (1-based) nella
    /// lista diventa il nuovo <c>ordine</c>. Ogni item porta tipo ("sezione"/"prezzo")
    /// e id. Tutto in una transazione.
    /// </summary>
    public void Riordina(long listinoId, IEnumerable<(string Tipo, long Id)> items)
    {
        var list = items.Where(i => i.Id != 0).Take(10000).ToList();
        if (list.Count == 0) return;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        for (var i = 0; i < list.Count; i++)
        {
            var pos = i + 1;
            var (tipo, id) = list[i];
            var table = tipo == "sezione" ? "listini_sezioni" : "listini_prezzi";
            conn.Execute(
                $"UPDATE {table} SET ordine=@pos WHERE id=@id AND listino_id=@listinoId",
                new { pos, id, listinoId }, tx);
        }
        tx.Commit();
    }

    // ── RESOLVE prezzo effettivo ─────────────────────────────────────────────────

    /// <summary>
    /// Risolve prezzo/sconto/iva effettivi per cliente+prodotto seguendo il listino
    /// assegnato al cliente. Porta resolve() del backend:
    ///   - cliente senza listino (o listino non attivo) → BASE;
    ///   - prezzo override sul listino → LISTINO_OVERRIDE;
    ///   - altrimenti sconto di riga o di default → LISTINO_SCONTO se &gt; 0, altrimenti BASE.
    /// Restituisce null se il prodotto non esiste.
    /// </summary>
    public PrezzoRisolto? Resolve(long clienteId, long prodottoId)
    {
        using var conn = Db.Open();
        var prod = conn.QuerySingleOrDefault<(decimal? Prezzo, decimal? Iva)?>(
            "SELECT prezzo, iva FROM prodotti WHERE id=@prodottoId", new { prodottoId });
        if (prod == null) return null;
        var (pprezzo, piva) = prod.Value;

        var listinoId = conn.QuerySingleOrDefault<long?>(
            "SELECT listino_id FROM clienti WHERE id=@clienteId", new { clienteId });
        if (listinoId == null)
            return new PrezzoRisolto { Prezzo = pprezzo, Sconto = 0m, Iva = piva, Sorgente = "BASE" };

        var listino = conn.QuerySingleOrDefault<(long Id, string? Nome, decimal? ScontoDefault)?>(
            "SELECT id, nome, sconto_default FROM listini WHERE id=@listinoId AND attivo=1",
            new { listinoId });
        if (listino == null)
            return new PrezzoRisolto { Prezzo = pprezzo, Sconto = 0m, Iva = piva, Sorgente = "BASE" };
        var (lid, lnome, lscontoDef) = listino.Value;

        var lp = conn.QuerySingleOrDefault<(decimal? Prezzo, decimal? Sconto)?>(
            "SELECT prezzo, sconto FROM listini_prezzi WHERE listino_id=@listinoId AND prodotto_id=@prodottoId",
            new { listinoId, prodottoId });

        // Override di prezzo sul listino: vince su tutto.
        if (lp is { } row && row.Prezzo != null)
            return new PrezzoRisolto
            {
                Prezzo = row.Prezzo, Sconto = 0m, Iva = piva,
                Sorgente = "LISTINO_OVERRIDE", ListinoId = lid, ListinoNome = lnome ?? ""
            };

        var sconto = lp?.Sconto ?? lscontoDef ?? 0m;
        return new PrezzoRisolto
        {
            Prezzo = pprezzo, Sconto = sconto, Iva = piva,
            Sorgente = sconto > 0m ? "LISTINO_SCONTO" : "BASE",
            ListinoId = lid, ListinoNome = lnome ?? ""
        };
    }

    // ── helper privati ───────────────────────────────────────────────────────────

    private static List<ListinoPrezzo> LoadPrezzi(SqliteConnection conn, long listinoId)
        => conn.Query<ListinoPrezzo>($@"
            SELECT {PrezzoColumns}
            FROM listini_prezzi lp
            JOIN prodotti p ON p.id = lp.prodotto_id
            WHERE lp.listino_id = @listinoId
            ORDER BY lp.ordine, p.nome", new { listinoId }).ToList();

    private static List<ListinoSezione> LoadSezioni(SqliteConnection conn, long listinoId)
        => conn.Query<ListinoSezione>($@"
            SELECT {SezioneColumns}
            FROM listini_sezioni
            WHERE listino_id = @listinoId
            ORDER BY ordine, id", new { listinoId }).ToList();

    private static void DeleteCore(SqliteConnection conn, SqliteTransaction tx, long id)
    {
        // Clienti assegnati tornano ai prezzi base; prezzi/sezioni in CASCADE.
        conn.Execute("UPDATE clienti SET listino_id=NULL WHERE listino_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM listini WHERE id=@id", new { id }, tx);
    }

    /// <summary>
    /// Prossimo <c>ordine</c> condiviso: max tra prezzi e sezioni del listino + 1.
    /// Così sezioni e prodotti restano in una sequenza unica (parità con next_ordine).
    /// </summary>
    private static int NextOrdine(SqliteConnection conn, SqliteTransaction? tx, long listinoId)
    {
        var a = conn.ExecuteScalar<int>(
            "SELECT COALESCE(MAX(ordine),0) FROM listini_prezzi WHERE listino_id=@listinoId",
            new { listinoId }, tx);
        var b = conn.ExecuteScalar<int>(
            "SELECT COALESCE(MAX(ordine),0) FROM listini_sezioni WHERE listino_id=@listinoId",
            new { listinoId }, tx);
        return (a > b ? a : b) + 1;
    }

    private static string Truncate(string s, int n)
    {
        s = (s ?? "").Trim();
        return s.Length <= n ? s : s.Substring(0, n);
    }

    /// <summary>Parametri per INSERT/UPDATE listino. bool → INTEGER 0/1.</summary>
    private static object Bind(Listino l, long? id = null) => new
    {
        Id = id ?? l.Id,
        l.Nome,
        l.Descrizione,
        l.ScontoDefault,
        Attivo = l.Attivo ? 1 : 0,
        l.ColonneExtra,
        l.ColonneStandard,
        l.ColonneConfig,
        StampaDueColonne = l.StampaDueColonne ? 1 : 0,
        Griglia = l.Griglia ? 1 : 0,
        l.Tema,
    };
}

/// <summary>Esito di <see cref="ListinoRepository.Resolve"/>: prezzo/sconto/iva effettivi.</summary>
public sealed class PrezzoRisolto
{
    public decimal? Prezzo { get; set; }
    public decimal Sconto { get; set; }
    public decimal? Iva { get; set; }
    /// <summary>BASE | LISTINO_SCONTO | LISTINO_OVERRIDE.</summary>
    public string Sorgente { get; set; } = "BASE";
    public long? ListinoId { get; set; }
    public string ListinoNome { get; set; } = "";
}

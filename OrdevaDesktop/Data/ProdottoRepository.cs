using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD del catalogo prodotti con Dapper. Porta la logica del backend Rust
/// (routes/prodotti.rs): varianti che ricalcolano la quantità del prodotto,
/// fornitore predefinito sincronizzato sui campi legacy, delete che scollega
/// le righe documento. Le liste caricano varianti/fornitori in batch (niente
/// query in loop).
/// </summary>
public sealed class ProdottoRepository
{
    // Alias snake_case → PascalCase. Riusato da GetAll e GetById.
    private const string ProdottoColumns = @"
        id                     AS Id,
        nome                   AS Nome,
        categoria              AS Categoria,
        descrizione            AS Descrizione,
        prezzo                 AS Prezzo,
        prezzo_acquisto        AS PrezzoAcquisto,
        quantita               AS Quantita,
        soglia_minima          AS SogliaMinima,
        unita_misura           AS UnitaMisura,
        codice                 AS Codice,
        codice_fornitore       AS CodiceFornitore,
        iva                    AS Iva,
        barcode                AS Barcode,
        ha_varianti            AS HaVarianti,
        fornitore_id_preferito AS FornitoreIdPreferito,
        riordino_quantita      AS RiordinoQuantita,
        peso                   AS Peso,
        dimensioni             AS Dimensioni";

    /// <summary>Tutti i prodotti ordinati per nome, con varianti caricate in batch.</summary>
    public List<Prodotto> GetAll()
    {
        using var conn = Db.Open();
        var prodotti = conn.Query<Prodotto>(
            $"SELECT {ProdottoColumns} FROM prodotti ORDER BY nome").ToList();

        if (prodotti.Count == 0) return prodotti;

        // Carica TUTTE le varianti dei prodotti con varianti in un colpo solo e
        // raggruppale per prodotto_id (niente N+1).
        var varianti = conn.Query<ProdottoVariante>(@"
            SELECT id          AS Id,
                   prodotto_id AS ProdottoId,
                   taglia      AS Taglia,
                   colore      AS Colore,
                   quantita    AS Quantita,
                   barcode     AS Barcode
            FROM prodotto_varianti
            ORDER BY taglia, colore")
            .GroupBy(v => v.ProdottoId)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var p in prodotti)
            if (p.HaVarianti && varianti.TryGetValue(p.Id, out var vs))
                p.Varianti = vs;

        return prodotti;
    }

    /// <summary>Dettaglio completo: prodotto + varianti + fornitori (con nome).</summary>
    public Prodotto? GetById(long id)
    {
        using var conn = Db.Open();
        var p = conn.QuerySingleOrDefault<Prodotto>(
            $"SELECT {ProdottoColumns} FROM prodotti WHERE id = @id", new { id });
        if (p == null) return null;

        if (p.HaVarianti)
        {
            p.Varianti = conn.Query<ProdottoVariante>(@"
                SELECT id          AS Id,
                       prodotto_id AS ProdottoId,
                       taglia      AS Taglia,
                       colore      AS Colore,
                       quantita    AS Quantita,
                       barcode     AS Barcode
                FROM prodotto_varianti
                WHERE prodotto_id = @id
                ORDER BY taglia, colore", new { id }).ToList();
        }

        p.Fornitori = conn.Query<ProdottoFornitore>(@"
            SELECT pf.id               AS Id,
                   pf.prodotto_id      AS ProdottoId,
                   pf.fornitore_id     AS FornitoreId,
                   pf.codice_fornitore AS CodiceFornitore,
                   pf.prezzo_acquisto  AS PrezzoAcquisto,
                   pf.predefinito      AS Predefinito,
                   f.ragione_sociale   AS FornitoreNome
            FROM prodotto_fornitori pf
            LEFT JOIN fornitori f ON f.id = pf.fornitore_id
            WHERE pf.prodotto_id = @id
            ORDER BY pf.predefinito DESC, f.ragione_sociale", new { id }).ToList();

        return p;
    }

    /// <summary>Inserisce un prodotto (+ varianti/fornitori) e ne restituisce l'id.</summary>
    public long Insert(Prodotto p)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO prodotti
              (nome, categoria, descrizione, prezzo, prezzo_acquisto, quantita,
               soglia_minima, unita_misura, codice, codice_fornitore, iva, barcode,
               ha_varianti, fornitore_id_preferito, riordino_quantita, peso, dimensioni)
            VALUES
              (@Nome, @Categoria, @Descrizione, @Prezzo, @PrezzoAcquisto, @Quantita,
               @SogliaMinima, @UnitaMisura, @Codice, @CodiceFornitore, @Iva, @Barcode,
               @HaVarianti, @FornitoreIdPreferito, @RiordinoQuantita, @Peso, @Dimensioni);
            SELECT last_insert_rowid();", Bind(p), tx);

        if (p.HaVarianti && p.Varianti.Count > 0)
        {
            SaveVarianti(conn, tx, id, p.Varianti);
            SyncQuantita(conn, tx, id);
        }
        SaveFornitori(conn, tx, id, p.Fornitori);

        tx.Commit();
        return id;
    }

    /// <summary>Aggiorna un prodotto e ricostruisce varianti/fornitori.</summary>
    public void Update(Prodotto p)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        conn.Execute(@"
            UPDATE prodotti SET
              nome=@Nome, categoria=@Categoria, descrizione=@Descrizione, prezzo=@Prezzo,
              prezzo_acquisto=@PrezzoAcquisto, quantita=@Quantita, soglia_minima=@SogliaMinima,
              unita_misura=@UnitaMisura, codice=@Codice, codice_fornitore=@CodiceFornitore,
              iva=@Iva, barcode=@Barcode, ha_varianti=@HaVarianti,
              fornitore_id_preferito=@FornitoreIdPreferito, riordino_quantita=@RiordinoQuantita,
              peso=@Peso, dimensioni=@Dimensioni
            WHERE id=@Id", Bind(p, p.Id), tx);

        // Le varianti vengono sempre ricostruite. Parità con il backend Rust
        // (update in prodotti.rs): se ha_varianti è attivo la quantità del prodotto
        // diventa SEMPRE la somma delle varianti — anche con lista vuota (→ 0) —
        // mentre senza varianti resta quella inviata.
        conn.Execute("DELETE FROM prodotto_varianti WHERE prodotto_id=@Id", new { p.Id }, tx);
        if (p.HaVarianti)
        {
            if (p.Varianti.Count > 0)
                SaveVarianti(conn, tx, p.Id, p.Varianti);
            SyncQuantita(conn, tx, p.Id);
        }

        SaveFornitori(conn, tx, p.Id, p.Fornitori);

        tx.Commit();
    }

    /// <summary>
    /// Elimina un prodotto scollegando prima le righe documento (prodotto_id=NULL):
    /// così storico fatture/DDT non viene perso. Le varianti/fornitori vanno via in
    /// CASCADE.
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

    // ── helper privati ────────────────────────────────────────────────────────

    private static readonly string[] DocTables =
    {
        "ddt_righe", "fatture_righe", "note_credito_righe", "ordini_righe",
        "preventivi_righe", "acquisti_righe", "vendite_banco_righe", "arrivi_merce_righe",
    };

    private static void DeleteCore(SqliteConnection conn, SqliteTransaction tx, long id)
    {
        foreach (var t in DocTables)
            conn.Execute($"UPDATE {t} SET prodotto_id=NULL WHERE prodotto_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM prodotti WHERE id=@id", new { id }, tx);
    }

    private static void SaveVarianti(SqliteConnection conn, SqliteTransaction tx, long prodottoId, List<ProdottoVariante> varianti)
    {
        foreach (var v in varianti)
        {
            conn.Execute(@"
                INSERT INTO prodotto_varianti (prodotto_id, taglia, colore, quantita, barcode)
                VALUES (@prodottoId, @Taglia, @Colore, @Quantita, @Barcode)",
                new { prodottoId, v.Taglia, v.Colore, v.Quantita, v.Barcode }, tx);
        }
    }

    /// <summary>
    /// Sostituisce i fornitori del prodotto e sincronizza i campi legacy
    /// (fornitore_id_preferito, codice_fornitore) dal predefinito. Porta
    /// save_fornitori() del backend.
    /// </summary>
    private static void SaveFornitori(SqliteConnection conn, SqliteTransaction tx, long prodottoId, List<ProdottoFornitore> fornitori)
    {
        conn.Execute("DELETE FROM prodotto_fornitori WHERE prodotto_id=@prodottoId", new { prodottoId }, tx);

        var list = fornitori.Where(f => f.FornitoreId != 0).ToList();
        if (list.Count == 0)
        {
            conn.Execute(
                "UPDATE prodotti SET fornitore_id_preferito=NULL, codice_fornitore='' WHERE id=@prodottoId",
                new { prodottoId }, tx);
            return;
        }

        var prefIdx = list.FindIndex(f => f.Predefinito);
        if (prefIdx < 0) prefIdx = 0;

        for (var i = 0; i < list.Count; i++)
        {
            var f = list[i];
            conn.Execute(@"
                INSERT INTO prodotto_fornitori (prodotto_id, fornitore_id, codice_fornitore, prezzo_acquisto, predefinito)
                VALUES (@prodottoId, @FornitoreId, @CodiceFornitore, @PrezzoAcquisto, @predefinito)",
                new { prodottoId, f.FornitoreId, f.CodiceFornitore, f.PrezzoAcquisto, predefinito = i == prefIdx ? 1 : 0 }, tx);
        }

        var pref = list[prefIdx];
        conn.Execute(
            "UPDATE prodotti SET fornitore_id_preferito=@FornitoreId, codice_fornitore=@CodiceFornitore WHERE id=@prodottoId",
            new { pref.FornitoreId, pref.CodiceFornitore, prodottoId }, tx);
    }

    /// <summary>Allinea prodotti.quantita alla somma delle varianti.</summary>
    private static void SyncQuantita(SqliteConnection conn, SqliteTransaction tx, long prodottoId)
    {
        conn.Execute(@"
            UPDATE prodotti
            SET quantita = (SELECT COALESCE(SUM(quantita),0) FROM prodotto_varianti WHERE prodotto_id=@prodottoId)
            WHERE id=@prodottoId", new { prodottoId }, tx);
    }

    /// <summary>Parametri per INSERT/UPDATE. NULL d'acquisto resta NULL (non 0).</summary>
    private static object Bind(Prodotto p, long? id = null) => new
    {
        Id = id ?? p.Id,
        p.Nome,
        p.Categoria,
        p.Descrizione,
        p.Prezzo,
        p.PrezzoAcquisto,
        p.Quantita,
        p.SogliaMinima,
        p.UnitaMisura,
        p.Codice,
        p.CodiceFornitore,
        p.Iva,
        p.Barcode,
        HaVarianti = p.HaVarianti ? 1 : 0,
        p.FornitoreIdPreferito,
        p.RiordinoQuantita,
        p.Peso,
        p.Dimensioni,
    };
}

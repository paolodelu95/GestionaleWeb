using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD dell'agenda appuntamenti con Dapper. Porta la logica del backend Rust
/// (routes/agenda.rs): lista filtrata per intervallo di date con i nomi di
/// cliente/fornitore risolti via JOIN (niente N+1), default di colore/stato
/// all'inserimento, e cambio di stato veloce dal menu della lista.
///
/// In offline l'utente è l'unico proprietario: i filtri di visibilità per
/// gruppo/admin del backend si riducono a "tutte le righe", quindi non vengono
/// replicati. <c>user_id</c> e <c>condiviso</c> sono comunque persistiti per
/// parità di schema.
/// </summary>
public sealed class AppuntamentoRepository
{
    // Alias snake_case → PascalCase, con i nomi controparte via JOIN. Riusato
    // da GetAll e GetById.
    private const string SelectFrom = @"
        SELECT app.id            AS Id,
               app.titolo        AS Titolo,
               app.descrizione   AS Descrizione,
               app.inizio        AS Inizio,
               app.fine          AS Fine,
               app.tutto_giorno  AS TuttoGiorno,
               app.luogo         AS Luogo,
               app.cliente_id    AS ClienteId,
               app.fornitore_id  AS FornitoreId,
               app.colore        AS Colore,
               app.promemoria_min AS Promemoria,
               app.stato         AS Stato,
               app.user_id       AS UserId,
               app.condiviso     AS Condiviso,
               app.created_at    AS CreatedAt,
               c.ragione_sociale AS ClienteNome,
               f.ragione_sociale AS FornitoreNome
        FROM appuntamenti app
        LEFT JOIN clienti   c ON c.id = app.cliente_id
        LEFT JOIN fornitori f ON f.id = app.fornitore_id";

    /// <summary>
    /// Appuntamenti il cui inizio cade nell'intervallo [da, a] (estremi ISO
    /// inclusi), ordinati per inizio. Parità con list_app del backend: la lista
    /// di default copre l'anno corrente.
    /// </summary>
    public List<Appuntamento> GetAll(string? da = null, string? a = null)
    {
        var anno = System.DateTime.Now.Year;
        da ??= $"{anno}-01-01T00:00:00";
        a ??= $"{anno}-12-31T23:59:59";

        using var conn = Db.Open();
        return conn.Query<Appuntamento>(
            $"{SelectFrom} WHERE app.inizio BETWEEN @da AND @a ORDER BY app.inizio",
            new { da, a }).ToList();
    }

    /// <summary>Dettaglio singolo (con nomi controparte), o null se assente.</summary>
    public Appuntamento? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Appuntamento>(
            $"{SelectFrom} WHERE app.id = @id", new { id });
    }

    /// <summary>
    /// Inserisce un appuntamento e ne restituisce l'id. Replica i default del
    /// backend: colore vuoto → #3b82f6, stato vuoto → PIANIFICATO. titolo e
    /// inizio sono obbligatori (validati dal ViewModel, come il 400 del backend).
    /// </summary>
    public long Insert(Appuntamento ap)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO appuntamenti
              (titolo, descrizione, inizio, fine, tutto_giorno, luogo, cliente_id,
               fornitore_id, colore, promemoria_min, stato, user_id, condiviso)
            VALUES
              (@Titolo, @Descrizione, @Inizio, @Fine, @TuttoGiorno, @Luogo, @ClienteId,
               @FornitoreId, @Colore, @Promemoria, @Stato, @UserId, @Condiviso);
            SELECT last_insert_rowid();", Bind(ap));
    }

    /// <summary>
    /// Aggiorna un appuntamento. A differenza del backend (PATCH con
    /// coalescenze), qui l'editor desktop invia l'oggetto completo: scriviamo
    /// tutti i campi così come arrivano dal form. user_id non viene toccato
    /// (parità con l'UPDATE del backend che non lo modifica).
    /// </summary>
    public void Update(Appuntamento ap)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE appuntamenti SET
              titolo=@Titolo, descrizione=@Descrizione, inizio=@Inizio, fine=@Fine,
              tutto_giorno=@TuttoGiorno, luogo=@Luogo, cliente_id=@ClienteId,
              fornitore_id=@FornitoreId, colore=@Colore, promemoria_min=@Promemoria,
              stato=@Stato, condiviso=@Condiviso
            WHERE id=@Id", Bind(ap, ap.Id));
    }

    /// <summary>
    /// Cambia solo lo stato (PIANIFICATO/COMPLETATO/ANNULLATO). Porta
    /// cambiaStatoApp() del componente Angular, che fa una PUT col solo stato.
    /// </summary>
    public void CambiaStato(long id, string stato)
    {
        using var conn = Db.Open();
        conn.Execute("UPDATE appuntamenti SET stato=@stato WHERE id=@id", new { id, stato });
    }

    public void Delete(long id)
    {
        using var conn = Db.Open();
        conn.Execute("DELETE FROM appuntamenti WHERE id=@id", new { id });
    }

    /// <summary>Eliminazione in blocco in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in list)
            conn.Execute("DELETE FROM appuntamenti WHERE id=@id", new { id }, tx);
        tx.Commit();
        return list.Count;
    }

    // ── Lookup per i combo del form (id + ragione sociale) ───────────────────

    /// <summary>Clienti (id, nome) per il selettore controparte del form.</summary>
    public List<Controparte> GetClientiLookup()
    {
        using var conn = Db.Open();
        return conn.Query<Controparte>(
            "SELECT id AS Id, ragione_sociale AS Nome FROM clienti ORDER BY ragione_sociale").ToList();
    }

    /// <summary>Fornitori (id, nome) per il selettore controparte del form.</summary>
    public List<Controparte> GetFornitoriLookup()
    {
        using var conn = Db.Open();
        return conn.Query<Controparte>(
            "SELECT id AS Id, ragione_sociale AS Nome FROM fornitori ORDER BY ragione_sociale").ToList();
    }

    // ── helper privati ────────────────────────────────────────────────────────

    /// <summary>
    /// Parametri per INSERT/UPDATE. Applica i default del backend (colore/stato),
    /// e converte i bool in 0/1. Fine NULL resta NULL.
    /// </summary>
    private static object Bind(Appuntamento ap, long? id = null) => new
    {
        Id = id ?? ap.Id,
        ap.Titolo,
        ap.Descrizione,
        ap.Inizio,
        ap.Fine,
        TuttoGiorno = ap.TuttoGiorno ? 1 : 0,
        ap.Luogo,
        ap.ClienteId,
        ap.FornitoreId,
        Colore = string.IsNullOrEmpty(ap.Colore) ? "#3b82f6" : ap.Colore,
        ap.Promemoria,
        Stato = string.IsNullOrEmpty(ap.Stato) ? "PIANIFICATO" : ap.Stato,
        ap.UserId,
        Condiviso = ap.Condiviso ? 1 : 0,
    };
}

/// <summary>Voce di lookup leggera (id + ragione sociale) per i combo.</summary>
public sealed class Controparte
{
    public long Id { get; set; }
    public string Nome { get; set; } = "";
}

using System;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Lanciata da <see cref="ClienteRepository"/> quando l'eliminazione è bloccata
/// perché il cliente ha documenti collegati. Espone i conteggi per il messaggio
/// (parità con la risposta 409 del backend Rust).
/// </summary>
public sealed class ClienteHaDocumentiException : Exception
{
    public int Fatture { get; }
    public int Ddt { get; }
    public int Preventivi { get; }
    public int Ordini { get; }
    public int NoteCredito { get; }

    public ClienteHaDocumentiException(int fatture, int ddt, int preventivi, int ordini, int noteCredito)
        : base("Impossibile eliminare: il cliente ha documenti collegati.")
    {
        Fatture = fatture; Ddt = ddt; Preventivi = preventivi; Ordini = ordini; NoteCredito = noteCredito;
    }

    /// <summary>Riepilogo leggibile (es. "2 fatture, 1 preventivo").</summary>
    public string Riepilogo
    {
        get
        {
            var parts = new List<string>();
            if (Fatture > 0) parts.Add($"{Fatture} fattur{(Fatture == 1 ? "a" : "e")}");
            if (Ddt > 0) parts.Add($"{Ddt} document{(Ddt == 1 ? "o" : "i")} di trasporto");
            if (Preventivi > 0) parts.Add($"{Preventivi} preventiv{(Preventivi == 1 ? "o" : "i")}");
            if (Ordini > 0) parts.Add($"{Ordini} ordin{(Ordini == 1 ? "e" : "i")}");
            if (NoteCredito > 0) parts.Add($"{NoteCredito} nota di credito");
            return string.Join(", ", parts);
        }
    }
}

/// <summary>Lanciata su conflitto di P.IVA duplicata (parità col 409 del backend).</summary>
public sealed class PivaDuplicataException : Exception
{
    public long DuplicateId { get; }
    public PivaDuplicataException(string piva, long duplicateId)
        : base($"Esiste già un cliente con la P.IVA {piva}")
        => DuplicateId = duplicateId;
}

/// <summary>
/// CRUD dell'anagrafica clienti con Dapper. Porta la logica del backend Rust
/// (routes/clienti.rs + gemello.rs):
/// <list type="bullet">
///   <item>normalizzazione P.IVA e controllo duplicati (clean / IT+clean);</item>
///   <item>default tipoSoggetto=PRIVATO, FK opzionali 0→NULL;</item>
///   <item>gemello fornitore sincronizzato (applica_da_cliente);</item>
///   <item>delete bloccato se ci sono documenti, altrimenti scollega il gemello;</item>
///   <item>lista con insight (ultimo acquisto, fatturato anno, insoluti) in una
///         sola query (niente N+1).</item>
/// </list>
/// </summary>
public sealed class ClienteRepository
{
    // Alias snake_case → PascalCase. Riusato da GetAll e GetById.
    private const string ClienteColumns = @"
        id                     AS Id,
        ragione_sociale        AS RagioneSociale,
        email                  AS Email,
        telefono               AS Telefono,
        cellulare              AS Cellulare,
        via                    AS Via,
        cap                    AS Cap,
        citta                  AS Citta,
        provincia              AS Provincia,
        stato                  AS Stato,
        codice_fiscale         AS CodiceFiscale,
        p_iva                  AS PIva,
        sdi                    AS Sdi,
        pec                    AS Pec,
        tipo_soggetto          AS TipoSoggetto,
        cig                    AS Cig,
        cup                    AS Cup,
        tipo_pagamento_id      AS TipoPagamentoId,
        listino_id             AS ListinoId,
        aliquota_iva_id        AS AliquotaIvaId,
        anche_fornitore        AS AncheFornitore,
        fornitore_collegato_id AS FornitoreCollegatoId,
        estero                 AS Estero";

    // ── Read ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Tutti i clienti ordinati per ragione sociale, con gli insight commerciali
    /// calcolati in sottoselect (parità con la query list() del backend).
    /// </summary>
    public List<Cliente> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Cliente>($@"
            SELECT {ClienteColumns},
              (SELECT MAX(f.data_emissione) FROM fatture f WHERE f.cliente_id = c.id) AS UltimoAcquisto,
              (SELECT COALESCE(SUM(fr.quantita * fr.prezzo * (1 - COALESCE(fr.sconto,0)/100.0) * (1 + fr.iva/100.0)), 0)
                 FROM fatture f
                 LEFT JOIN fatture_righe fr ON fr.fattura_id = f.id
                 WHERE f.cliente_id = c.id
                   AND f.stato != 'ANNULLATA'
                   AND f.data_emissione >= date('now','start of year')) AS FatturatoAnno,
              (SELECT COUNT(*) FROM fatture f
                 LEFT JOIN tipi_pagamento tp ON tp.id = f.tipo_pagamento_id
                 WHERE f.cliente_id = c.id
                   AND f.stato NOT IN ('PAGATA','ANNULLATA','STORNATA')
                   AND date(f.data_emissione, '+' || COALESCE(tp.giorni_scadenza,30) || ' days') < date('now')) AS FattureInsolute
            FROM clienti c
            ORDER BY c.ragione_sociale").ToList();
    }

    /// <summary>Dettaglio completo: cliente + indirizzi aggiuntivi.</summary>
    public Cliente? GetById(long id)
    {
        using var conn = Db.Open();
        var c = conn.QuerySingleOrDefault<Cliente>(
            $"SELECT {ClienteColumns} FROM clienti c WHERE c.id = @id", new { id });
        if (c == null) return null;
        c.Indirizzi = LoadIndirizzi(conn, null, id);
        return c;
    }

    /// <summary>Solo gli indirizzi (destinazioni) di un cliente.</summary>
    public List<ClienteIndirizzo> GetIndirizzi(long clienteId)
    {
        using var conn = Db.Open();
        return LoadIndirizzi(conn, null, clienteId);
    }

    private static List<ClienteIndirizzo> LoadIndirizzi(SqliteConnection conn, SqliteTransaction? tx, long clienteId) =>
        conn.Query<ClienteIndirizzo>(@"
            SELECT id         AS Id,
                   cliente_id AS ClienteId,
                   nome       AS Nome,
                   via        AS Via,
                   cap        AS Cap,
                   citta      AS Citta,
                   provincia  AS Provincia,
                   stato      AS Stato
            FROM clienti_indirizzi
            WHERE cliente_id = @clienteId
            ORDER BY id", new { clienteId }, tx).ToList();

    // ── Write ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Inserisce un cliente e ne restituisce l'id. Valida la ragione sociale,
    /// normalizza la P.IVA e blocca i duplicati, poi allinea il gemello fornitore.
    /// </summary>
    public long Insert(Cliente c)
    {
        if (string.IsNullOrWhiteSpace(c.RagioneSociale))
            throw new ArgumentException("La ragione sociale è obbligatoria");

        var piva = NormPiva(c.PIva);

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        GuardPivaDuplicata(conn, tx, piva, excludeId: null);

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO clienti
              (ragione_sociale, email, telefono, cellulare, via, cap, citta, provincia, stato,
               codice_fiscale, p_iva, sdi, pec, tipo_pagamento_id, listino_id, tipo_soggetto,
               cig, cup, aliquota_iva_id, estero, anche_fornitore)
            VALUES
              (@RagioneSociale, @Email, @Telefono, @Cellulare, @Via, @Cap, @Citta, @Provincia, @Stato,
               @CodiceFiscale, @PIva, @Sdi, @Pec, @TipoPagamentoId, @ListinoId, @TipoSoggetto,
               @Cig, @Cup, @AliquotaIvaId, @Estero, @AncheFornitore);
            SELECT last_insert_rowid();", Bind(c, null, piva), tx);

        ApplicaDaCliente(conn, tx, id);

        tx.Commit();
        return id;
    }

    /// <summary>Aggiorna un cliente e riallinea il gemello fornitore.</summary>
    public void Update(Cliente c)
    {
        if (string.IsNullOrWhiteSpace(c.RagioneSociale))
            throw new ArgumentException("La ragione sociale è obbligatoria");

        var piva = NormPiva(c.PIva);

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        GuardPivaDuplicata(conn, tx, piva, excludeId: c.Id);

        conn.Execute(@"
            UPDATE clienti SET
              ragione_sociale=@RagioneSociale, email=@Email, telefono=@Telefono, cellulare=@Cellulare,
              via=@Via, cap=@Cap, citta=@Citta, provincia=@Provincia, stato=@Stato,
              codice_fiscale=@CodiceFiscale, p_iva=@PIva, sdi=@Sdi, pec=@Pec,
              tipo_pagamento_id=@TipoPagamentoId, listino_id=@ListinoId, tipo_soggetto=@TipoSoggetto,
              cig=@Cig, cup=@Cup, aliquota_iva_id=@AliquotaIvaId, estero=@Estero, anche_fornitore=@AncheFornitore
            WHERE id=@Id", Bind(c, c.Id, piva), tx);

        ApplicaDaCliente(conn, tx, c.Id);

        tx.Commit();
    }

    /// <summary>
    /// Elimina un cliente. Blocca se ha documenti collegati (fatture, ddt,
    /// preventivi, ordini, note di credito), altrimenti scollega il gemello
    /// fornitore prima di cancellare (parità con remove() del backend).
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        DeleteCore(conn, tx, id);
        tx.Commit();
    }

    /// <summary>
    /// Eliminazione in blocco in un'unica transazione. Se anche un solo cliente
    /// ha documenti, l'intera operazione viene annullata (la transazione non viene
    /// committata) e viene rilanciata l'eccezione.
    /// </summary>
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

    // ── Indirizzi (CRUD) ────────────────────────────────────────────────────────

    public long InsertIndirizzo(long clienteId, ClienteIndirizzo a)
    {
        using var conn = Db.Open();
        return conn.ExecuteScalar<long>(@"
            INSERT INTO clienti_indirizzi (cliente_id, nome, via, cap, citta, provincia, stato)
            VALUES (@clienteId, @Nome, @Via, @Cap, @Citta, @Provincia, @Stato);
            SELECT last_insert_rowid();",
            new
            {
                clienteId,
                Nome = Def(a.Nome, "Sede"),
                a.Via, a.Cap, a.Citta, a.Provincia,
                Stato = Def(a.Stato, "Italia"),
            });
    }

    public void UpdateIndirizzo(long clienteId, ClienteIndirizzo a)
    {
        using var conn = Db.Open();
        conn.Execute(@"
            UPDATE clienti_indirizzi
            SET nome=@Nome, via=@Via, cap=@Cap, citta=@Citta, provincia=@Provincia, stato=@Stato
            WHERE id=@Id AND cliente_id=@clienteId",
            new
            {
                a.Id, clienteId,
                Nome = Def(a.Nome, "Sede"),
                a.Via, a.Cap, a.Citta, a.Provincia,
                Stato = Def(a.Stato, "Italia"),
            });
    }

    public void DeleteIndirizzo(long clienteId, long indirizzoId)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        // Scollega le destinazioni dai DDT che la usano, poi elimina (parità col backend).
        conn.Execute("UPDATE ddt SET destinazione_id=NULL WHERE destinazione_id=@indirizzoId", new { indirizzoId }, tx);
        conn.Execute("DELETE FROM clienti_indirizzi WHERE id=@indirizzoId AND cliente_id=@clienteId",
            new { indirizzoId, clienteId }, tx);
        tx.Commit();
    }

    // ── helper privati ────────────────────────────────────────────────────────

    /// <summary>Tabelle documento che bloccano l'eliminazione del cliente.</summary>
    private static readonly string[] DocTables =
        { "fatture", "ddt", "preventivi", "ordini", "note_credito" };

    private static void DeleteCore(SqliteConnection conn, SqliteTransaction tx, long id)
    {
        int Cnt(string t) => conn.ExecuteScalar<int>(
            $"SELECT COUNT(*) FROM {t} WHERE cliente_id=@id", new { id }, tx);

        var fatture = Cnt("fatture");
        var ddt = Cnt("ddt");
        var preventivi = Cnt("preventivi");
        var ordini = Cnt("ordini");
        var noteCredito = Cnt("note_credito");
        if (fatture + ddt + preventivi + ordini + noteCredito > 0)
            throw new ClienteHaDocumentiException(fatture, ddt, preventivi, ordini, noteCredito);

        // Stacca l'eventuale gemello fornitore prima di cancellare.
        conn.Execute(
            "UPDATE fornitori SET anche_cliente=0, cliente_collegato_id=NULL WHERE cliente_collegato_id=@id",
            new { id }, tx);
        conn.Execute("DELETE FROM clienti WHERE id=@id", new { id }, tx);
    }

    /// <summary>
    /// Blocca l'inserimento/aggiornamento se la P.IVA (normalizzata) appartiene
    /// già a un altro cliente. Cerca sia "clean" sia "ITclean".
    /// </summary>
    private static void GuardPivaDuplicata(SqliteConnection conn, SqliteTransaction tx, string piva, long? excludeId)
    {
        if (string.IsNullOrEmpty(piva)) return;
        var it = $"IT{piva}";
        var dup = excludeId is long ex
            ? conn.ExecuteScalar<long?>(
                "SELECT id FROM clienti WHERE (p_iva=@piva OR p_iva=@it) AND id!=@ex",
                new { piva, it, ex }, tx)
            : conn.ExecuteScalar<long?>(
                "SELECT id FROM clienti WHERE p_iva=@piva OR p_iva=@it",
                new { piva, it }, tx);
        if (dup is long d)
            throw new PivaDuplicataException(piva, d);
    }

    /// <summary>
    /// Allinea il gemello FORNITORE dopo create/update del cliente. Porta
    /// applica_da_cliente() di gemello.rs: se "anche fornitore" è attivo crea o
    /// riusa un fornitore con gli stessi campi condivisi e li tiene collegati;
    /// se è disattivato scollega l'eventuale gemello.
    /// </summary>
    private static void ApplicaDaCliente(SqliteConnection conn, SqliteTransaction tx, long clienteId)
    {
        var row = conn.QuerySingleOrDefault(@"
            SELECT ragione_sociale, email, telefono, cellulare, via, cap, citta, provincia, stato,
                   p_iva, sdi, pec, anche_fornitore, fornitore_collegato_id
            FROM clienti WHERE id=@clienteId", new { clienteId }, tx);
        if (row == null) return;

        var d = (IDictionary<string, object?>)row;
        bool anche = ToLong(d["anche_fornitore"]) != 0;
        long? collegato = ToNullableLong(d["fornitore_collegato_id"]);
        string piva = (d["p_iva"] as string) ?? "";

        // Parametri dei campi condivisi (NULL → ""), riusati da INSERT e UPDATE.
        var shared = new
        {
            ragione_sociale = Str(d["ragione_sociale"]),
            email = Str(d["email"]),
            telefono = Str(d["telefono"]),
            cellulare = Str(d["cellulare"]),
            via = Str(d["via"]),
            cap = Str(d["cap"]),
            citta = Str(d["citta"]),
            provincia = Str(d["provincia"]),
            stato = Str(d["stato"]),
            p_iva = Str(d["p_iva"]),
            sdi = Str(d["sdi"]),
            pec = Str(d["pec"]),
            clienteId,
        };

        if (anche)
        {
            // Gemello già esistente?
            long? fid = collegato is long cid
                ? conn.ExecuteScalar<long?>("SELECT id FROM fornitori WHERE id=@cid", new { cid }, tx)
                : null;

            // Altrimenti riusa un fornitore libero con la stessa P.IVA.
            if (fid is null && ValidPiva(piva))
            {
                fid = conn.ExecuteScalar<long?>(@"
                    SELECT id FROM fornitori
                    WHERE (p_iva=@piva OR p_iva=@it)
                      AND (cliente_collegato_id IS NULL OR cliente_collegato_id=@clienteId)
                    LIMIT 1",
                    new { piva, it = $"IT{piva}", clienteId }, tx);
            }

            if (fid is long f)
            {
                conn.Execute(@"
                    UPDATE fornitori SET
                      ragione_sociale=@ragione_sociale, email=@email, telefono=@telefono, cellulare=@cellulare,
                      via=@via, cap=@cap, citta=@citta, provincia=@provincia, stato=@stato,
                      p_iva=@p_iva, sdi=@sdi, pec=@pec, anche_cliente=1, cliente_collegato_id=@clienteId
                    WHERE id=@f", new
                {
                    shared.ragione_sociale, shared.email, shared.telefono, shared.cellulare,
                    shared.via, shared.cap, shared.citta, shared.provincia, shared.stato,
                    shared.p_iva, shared.sdi, shared.pec, clienteId, f,
                }, tx);
            }
            else
            {
                f = conn.ExecuteScalar<long>(@"
                    INSERT INTO fornitori
                      (ragione_sociale, email, telefono, cellulare, via, cap, citta, provincia, stato,
                       p_iva, sdi, pec, anche_cliente, cliente_collegato_id)
                    VALUES
                      (@ragione_sociale, @email, @telefono, @cellulare, @via, @cap, @citta, @provincia, @stato,
                       @p_iva, @sdi, @pec, 1, @clienteId);
                    SELECT last_insert_rowid();", shared, tx);
            }

            conn.Execute("UPDATE clienti SET fornitore_collegato_id=@f WHERE id=@clienteId",
                new { f, clienteId }, tx);
        }
        else if (collegato is long fidOff)
        {
            conn.Execute(
                "UPDATE fornitori SET anche_cliente=0, cliente_collegato_id=NULL WHERE id=@fidOff",
                new { fidOff }, tx);
            conn.Execute(
                "UPDATE clienti SET fornitore_collegato_id=NULL WHERE id=@clienteId",
                new { clienteId }, tx);
        }
    }

    /// <summary>Parametri per INSERT/UPDATE clienti, con i default del backend.</summary>
    private static object Bind(Cliente c, long? id, string piva) => new
    {
        Id = id ?? c.Id,
        c.RagioneSociale,
        c.Email,
        c.Telefono,
        c.Cellulare,
        c.Via,
        c.Cap,
        c.Citta,
        Stato = Def(c.Stato, "Italia"),
        c.CodiceFiscale,
        PIva = piva,
        c.Sdi,
        c.Pec,
        // FK opzionali: 0/null → NULL (parità con `x || null` del backend).
        TipoPagamentoId = NullIfZero(c.TipoPagamentoId),
        ListinoId = NullIfZero(c.ListinoId),
        TipoSoggetto = Def(c.TipoSoggetto, "PRIVATO"),
        c.Cig,
        c.Cup,
        AliquotaIvaId = NullIfZero(c.AliquotaIvaId),
        Estero = c.Estero ? 1 : 0,
        AncheFornitore = c.AncheFornitore ? 1 : 0,
    };

    // normalizePiva: niente spazi, uppercase, scarta il prefisso "IT".
    private static string NormPiva(string? piva)
    {
        if (string.IsNullOrEmpty(piva)) return "";
        var v = new string(piva.Where(ch => !char.IsWhiteSpace(ch)).ToArray()).ToUpperInvariant();
        return v.StartsWith("IT", StringComparison.Ordinal) ? v[2..] : v;
    }

    private static bool ValidPiva(string p) => p.Length == 11 && p.All(char.IsAsciiDigit);

    private static long? NullIfZero(long? v) => v is null or 0 ? null : v;
    private static string Def(string? s, string d) => string.IsNullOrEmpty(s) ? d : s!;

    private static string Str(object? v) => v as string ?? "";
    private static long ToLong(object? v) => v is long l ? l : 0;
    private static long? ToNullableLong(object? v) => v is long l ? l : (long?)null;
}

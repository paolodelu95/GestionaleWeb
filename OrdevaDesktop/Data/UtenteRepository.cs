using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.Services;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD degli utenti (tabella <c>utenti</c>) con Dapper. Porta le regole del
/// backend (routes/utenti.rs / utenti.js) al contesto offline single-tenant:
/// niente colonna tenant, niente "utente loggato" (in offline non c'è sessione),
/// quindi cadono i controlli su tenant e su "non eliminare te stesso". Restano:
/// username obbligatorio e UNIQUE ("Username già in uso"); password
/// obbligatoria in create e opzionale in update (vuota = non cambiare);
/// protezione dell'unico SUPERADMIN attivo e dell'ultimo utente che può
/// amministrare (evita il lock-out totale).
///
/// La colonna <c>password_hash</c> non viene mai letta verso la UI: l'hash resta
/// nel DB. In create/update viene riscritto SOLO se è fornita una nuova password.
/// </summary>
public sealed class UtenteRepository
{
    // Alias snake_case → PascalCase. NIENTE password_hash: non deve uscire dal DB.
    private const string SelectColumns =
        "id                          AS Id, " +
        "username                    AS Username, " +
        "COALESCE(nome, '')          AS Nome, " +
        "COALESCE(email, '')         AS Email, " +
        "COALESCE(ruolo,'OPERATORE') AS Ruolo, " +
        "COALESCE(attivo, 1) <> 0    AS Attivo";

    /// <summary>Tutti gli utenti ordinati per username (parità con la API).</summary>
    public List<Utente> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<Utente>(
            $"SELECT {SelectColumns} FROM utenti ORDER BY username").ToList();
    }

    /// <summary>Un singolo utente, o null se l'id non esiste.</summary>
    public Utente? GetById(long id)
    {
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Utente>(
            $"SELECT {SelectColumns} FROM utenti WHERE id = @id", new { id });
    }

    /// <summary>
    /// Inserisce un utente e ne restituisce l'id. Username e password sono
    /// obbligatori (parità con create() del backend). UNIQUE su username →
    /// <see cref="DuplicateUsernameException"/>.
    /// </summary>
    public long Insert(Utente u)
    {
        Normalize(u);
        var hash = PasswordHasher.Hash(u.NuovaPassword);
        using var conn = Db.Open();
        try
        {
            return conn.ExecuteScalar<long>(
                @"INSERT INTO utenti (username, password_hash, nome, email, ruolo, attivo)
                  VALUES (@Username, @Hash, @Nome, @Email, @Ruolo, @Attivo);
                  SELECT last_insert_rowid();",
                new { u.Username, Hash = hash, u.Nome, u.Email, u.Ruolo, Attivo = u.Attivo ? 1 : 0 });
        }
        catch (SqliteException ex) when (IsUniqueViolation(ex))
        {
            throw new DuplicateUsernameException("Username già in uso");
        }
    }

    /// <summary>
    /// Aggiorna un utente. La password viene riscritta SOLO se
    /// <see cref="Utente.NuovaPassword"/> è non vuota (vuota = non cambiare,
    /// come il payload web che omette il campo). Protegge l'unico SUPERADMIN
    /// attivo dalla disattivazione. UNIQUE → <see cref="DuplicateUsernameException"/>.
    /// </summary>
    public void Update(Utente u)
    {
        Normalize(u);
        using var conn = Db.Open();

        // Disattivazione dell'unico SUPERADMIN attivo: vietata (parità backend).
        if (!u.Attivo)
        {
            var ruoloAttuale = conn.QuerySingleOrDefault<string>(
                "SELECT ruolo FROM utenti WHERE id = @Id", new { u.Id });
            if (ruoloAttuale == "SUPERADMIN" && CountAltriSuperadminAttivi(conn, u.Id) == 0)
                throw new UtenteRuleException("Non puoi disattivare l'unico SUPERADMIN attivo");
        }

        var setPassword = u.NuovaPassword.Length > 0;
        var hash = setPassword ? PasswordHasher.Hash(u.NuovaPassword) : null;

        var sql = setPassword
            ? @"UPDATE utenti SET username=@Username, password_hash=@Hash, nome=@Nome,
                    email=@Email, ruolo=@Ruolo, attivo=@Attivo WHERE id=@Id"
            : @"UPDATE utenti SET username=@Username, nome=@Nome, email=@Email,
                    ruolo=@Ruolo, attivo=@Attivo WHERE id=@Id";
        try
        {
            conn.Execute(sql, new
            {
                u.Id, u.Username, Hash = hash, u.Nome, u.Email, u.Ruolo, Attivo = u.Attivo ? 1 : 0,
            });
        }
        catch (SqliteException ex) when (IsUniqueViolation(ex))
        {
            throw new DuplicateUsernameException("Username già in uso");
        }
    }

    /// <summary>
    /// Elimina un utente. Parità col backend: non si può eliminare l'unico
    /// SUPERADMIN attivo. In più, per non restare chiusi fuori dall'app offline,
    /// non si può eliminare l'ultimo utente in grado di amministrare
    /// (SUPERADMIN/ADMIN) ancora attivo.
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        var target = conn.QuerySingleOrDefault<(string Ruolo, long Attivo)>(
            "SELECT ruolo AS Ruolo, COALESCE(attivo,1) AS Attivo FROM utenti WHERE id = @id",
            new { id });
        if (target.Ruolo is null) return; // non esiste: no-op

        if (target.Ruolo == "SUPERADMIN" && CountAltriSuperadminAttivi(conn, id) == 0)
            throw new UtenteRuleException("Non puoi eliminare l'unico SUPERADMIN attivo");

        if (EProprioUltimoAdmin(conn, id))
            throw new UtenteRuleException("Non puoi eliminare l'ultimo utente amministratore attivo");

        conn.Execute("DELETE FROM utenti WHERE id = @id", new { id });
    }

    /// <summary>Eliminazione in blocco: applica le stesse regole su ogni id.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        var n = 0;
        foreach (var id in list)
        {
            Delete(id);
            n++;
        }
        return n;
    }

    // ── helper privati ─────────────────────────────────────────────────────────

    /// <summary>SUPERADMIN attivi diversi da <paramref name="exceptId"/>.</summary>
    private static int CountAltriSuperadminAttivi(SqliteConnection conn, long exceptId) =>
        conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM utenti WHERE ruolo='SUPERADMIN' AND id<>@exceptId AND COALESCE(attivo,1)<>0",
            new { exceptId });

    /// <summary>True se <paramref name="id"/> è l'unico utente amministratore (ADMIN/SUPERADMIN) attivo.</summary>
    private static bool EProprioUltimoAdmin(SqliteConnection conn, long id)
    {
        var altri = conn.ExecuteScalar<int>(
            @"SELECT COUNT(*) FROM utenti
              WHERE ruolo IN ('ADMIN','SUPERADMIN') AND id<>@id AND COALESCE(attivo,1)<>0",
            new { id });
        if (altri > 0) return false;
        // È l'ultimo admin solo se lui stesso è admin-level e attivo.
        var io = conn.QuerySingleOrDefault<(string Ruolo, long Attivo)>(
            "SELECT ruolo AS Ruolo, COALESCE(attivo,1) AS Attivo FROM utenti WHERE id=@id", new { id });
        return io.Ruolo is "ADMIN" or "SUPERADMIN" && io.Attivo != 0;
    }

    private static void Normalize(Utente u)
    {
        u.Username = (u.Username ?? string.Empty).Trim();
        u.Nome = (u.Nome ?? string.Empty).Trim();
        u.Email = (u.Email ?? string.Empty).Trim();
        u.Ruolo = string.IsNullOrWhiteSpace(u.Ruolo) ? "OPERATORE" : u.Ruolo.Trim();
    }

    // SQLite error 19 = constraint; extended 2067 = UNIQUE.
    private static bool IsUniqueViolation(SqliteException ex) =>
        ex.SqliteErrorCode == 19 || ex.SqliteExtendedErrorCode == 2067;
}

/// <summary>Sollevata quando si salva un utente con username già esistente.</summary>
public sealed class DuplicateUsernameException : System.Exception
{
    public DuplicateUsernameException(string message) : base(message) { }
}

/// <summary>Sollevata quando un'operazione viola una regola di business sugli utenti.</summary>
public sealed class UtenteRuleException : System.Exception
{
    public UtenteRuleException(string message) : base(message) { }
}

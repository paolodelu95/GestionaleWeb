using System;
using System.Security.Cryptography;

namespace Ordeva.Desktop.Services;

/// <summary>
/// Cifratura delle password degli utenti. Il backend Rust/Node usa bcrypt; in
/// offline non possiamo aggiungere pacchetti NuGet, quindi usiamo PBKDF2-SHA256
/// dalla BCL (System.Security.Cryptography), che offre garanzie analoghe (salt
/// per-utente + fattore di lavoro alto).
///
/// Formato self-describing memorizzato in <c>utenti.password_hash</c> (TEXT):
/// <c>pbkdf2$sha256$&lt;iter&gt;$&lt;saltB64&gt;$&lt;hashB64&gt;</c>.
/// Gli hash bcrypt legacy ($2a$/$2b$/$2y$) NON sono verificabili qui: si
/// preservano nel DB finché l'utente non reimposta la password.
/// </summary>
public static class PasswordHasher
{
    private const int Iterations = 120_000; // fattore di lavoro
    private const int SaltSize = 16;        // byte
    private const int KeySize = 32;         // byte (SHA-256)
    private const string Prefix = "pbkdf2$sha256$";

    /// <summary>Genera l'hash da una password in chiaro.</summary>
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(
            password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"{Prefix}{Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    /// <summary>
    /// Verifica una password contro un hash memorizzato. Ritorna false (senza
    /// lanciare) per hash di formato sconosciuto, ad es. bcrypt legacy.
    /// </summary>
    public static bool Verify(string password, string? stored)
    {
        if (string.IsNullOrEmpty(stored) || !stored.StartsWith(Prefix, StringComparison.Ordinal))
            return false;

        var parts = stored.Substring(Prefix.Length).Split('$');
        if (parts.Length != 3) return false;
        if (!int.TryParse(parts[0], out var iter) || iter <= 0) return false;

        byte[] salt, expected;
        try
        {
            salt = Convert.FromBase64String(parts[1]);
            expected = Convert.FromBase64String(parts[2]);
        }
        catch (FormatException) { return false; }

        var actual = Rfc2898DeriveBytes.Pbkdf2(
            password, salt, iter, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}

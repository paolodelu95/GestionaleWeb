namespace Ordeva.Desktop.Models;

/// <summary>
/// Impostazioni azienda: riga singleton (id=1) della tabella <c>azienda</c>.
/// Specchio esatto delle colonne SQLite (snake_case) in PascalCase.
/// I segreti (SmtpPass, SdiApiKey) vengono restituiti mascherati dalla repo,
/// esattamente come faceva il backend per gli utenti non SUPERADMIN/ADMIN.
/// </summary>
public sealed class Azienda
{
    /// <summary>Placeholder mostrato al posto dei segreti già impostati.</summary>
    public const string MaskedSecret = "••••••••";

    public long Id { get; set; } = 1;

    // ── Dati societari ───────────────────────────────────────────────
    public string RagioneSociale { get; set; } = "";
    public string PIva { get; set; } = "";
    public string CodFiscale { get; set; } = "";

    // ── Regime fiscale / ritenute / cassa ────────────────────────────
    public string RegimeFiscale { get; set; } = "RF01";
    public decimal RitenutaAliquotaDefault { get; set; }
    public string RitenutaTipoDefault { get; set; } = "RT02";
    public string RitenutaCausaleDefault { get; set; } = "";
    public string CassaTipoDefault { get; set; } = "";
    public decimal CassaAliquotaDefault { get; set; }
    public decimal CassaIvaDefault { get; set; }

    // ── Sede legale ──────────────────────────────────────────────────
    public string Indirizzo { get; set; } = "";
    public string Cap { get; set; } = "";
    public string Citta { get; set; } = "";
    public string Provincia { get; set; } = "";
    public string Stato { get; set; } = "";

    // ── Contatti ─────────────────────────────────────────────────────
    public string Telefono { get; set; } = "";
    public string Email { get; set; } = "";
    public string Pec { get; set; } = "";
    public string Sdi { get; set; } = "";

    // ── Dati bancari ─────────────────────────────────────────────────
    public string Iban { get; set; } = "";
    public string Banca { get; set; } = "";

    // ── Logo (base64/data-url) ───────────────────────────────────────
    public string Logo { get; set; } = "";

    // ── Email / SMTP ─────────────────────────────────────────────────
    public string EmailMode { get; set; } = "SMTP";
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 587;
    public string SmtpUser { get; set; } = "";
    public string SmtpPass { get; set; } = "";
    public string SmtpFrom { get; set; } = "";
    public bool SmtpSecure { get; set; }
    public string EmailCorpoDocumento { get; set; } = "";

    // ── SDI / fatturazione elettronica ───────────────────────────────
    public string SdiProvider { get; set; } = "GENERICO";
    public string SdiApiUrl { get; set; } = "";
    public string SdiApiKey { get; set; } = "";

    // ── Comportamenti ────────────────────────────────────────────────
    public bool RiordinoAutomatico { get; set; }
    public bool MultiUtenteAttivo { get; set; }
    public bool NumerazioneAnnuale { get; set; } = true;
    public bool LockDocumentiDefault { get; set; } = true;

    // ── Blob JSON: conservati grezzi (la UI desktop non li edita ancora) ──
    /// <summary>JSON dei prefissi numerazione documenti. Default "{}".</summary>
    public string NumeroPrefissi { get; set; } = "{}";
    /// <summary>JSON config grafica template stampa, o null.</summary>
    public string? TemplateConfig { get; set; }
    /// <summary>JSON config notifiche, o null.</summary>
    public string? NotificheConfig { get; set; }
}

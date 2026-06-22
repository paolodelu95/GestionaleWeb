using System.Collections.Generic;
using System.Linq;
using Dapper;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// Accesso dati per le impostazioni azienda (tabella singleton <c>azienda</c>, id=1).
/// Anche se è una sola riga, espone le firme CRUD richieste dalla convenzione;
/// per l'uso reale conta <see cref="Get"/> / <see cref="Save"/>.
/// </summary>
public sealed class AziendaRepository
{
    // SELECT con alias snake_case -> PascalCase, mappabile direttamente su Azienda.
    private const string SelectSql = """
        SELECT
            id                          AS Id,
            ragione_sociale             AS RagioneSociale,
            p_iva                       AS PIva,
            cod_fiscale                 AS CodFiscale,
            regime_fiscale              AS RegimeFiscale,
            ritenuta_aliquota_default   AS RitenutaAliquotaDefault,
            ritenuta_tipo_default       AS RitenutaTipoDefault,
            ritenuta_causale_default    AS RitenutaCausaleDefault,
            cassa_tipo_default          AS CassaTipoDefault,
            cassa_aliquota_default      AS CassaAliquotaDefault,
            cassa_iva_default           AS CassaIvaDefault,
            indirizzo                   AS Indirizzo,
            cap                         AS Cap,
            citta                       AS Citta,
            provincia                   AS Provincia,
            stato                       AS Stato,
            telefono                    AS Telefono,
            email                       AS Email,
            pec                         AS Pec,
            sdi                         AS Sdi,
            iban                        AS Iban,
            banca                       AS Banca,
            logo                        AS Logo,
            email_mode                  AS EmailMode,
            smtp_host                   AS SmtpHost,
            smtp_port                   AS SmtpPort,
            smtp_user                   AS SmtpUser,
            smtp_pass                   AS SmtpPass,
            smtp_from                   AS SmtpFrom,
            smtp_secure                 AS SmtpSecure,
            email_corpo_documento       AS EmailCorpoDocumento,
            sdi_provider                AS SdiProvider,
            sdi_api_url                 AS SdiApiUrl,
            sdi_api_key                 AS SdiApiKey,
            riordino_automatico         AS RiordinoAutomatico,
            multi_utente_attivo         AS MultiUtenteAttivo,
            numerazione_annuale         AS NumerazioneAnnuale,
            lock_documenti_default      AS LockDocumentiDefault,
            COALESCE(numero_prefissi, '{}') AS NumeroPrefissi,
            template_config             AS TemplateConfig,
            notifiche_config            AS NotificheConfig
        FROM azienda
        """;

    private static readonly string[] SdiProviders = { "FIC", "ARUBA", "GENERICO" };
    private static readonly string[] EmailModes = { "SMTP", "MAILTO", "WEBMAIL_GMAIL", "WEBMAIL_OUTLOOK" };

    /// <summary>
    /// Legge la riga singleton. I segreti vengono mascherati come faceva il backend
    /// (così non finiscono in chiaro nella UI). Se la riga non esiste, ritorna i default.
    /// </summary>
    public Azienda Get()
    {
        using var conn = Db.Open();
        var a = conn.QuerySingleOrDefault<Azienda>($"{SelectSql} WHERE id = 1");
        if (a is null)
            return new Azienda();

        Normalize(a);
        // Maschera i segreti già impostati (parità con to_dto del backend).
        a.SmtpPass = string.IsNullOrEmpty(a.SmtpPass) ? "" : Azienda.MaskedSecret;
        a.SdiApiKey = string.IsNullOrEmpty(a.SdiApiKey) ? "" : Azienda.MaskedSecret;
        return a;
    }

    /// <summary>
    /// Salva (UPDATE) la riga singleton id=1. Se non esiste la crea (INSERT id=1).
    /// I segreti rimasti uguali al placeholder mascherato NON vengono sovrascritti:
    /// si preserva il valore reale già in DB.
    /// </summary>
    public void Save(Azienda a)
    {
        using var conn = Db.Open();

        // Sanitizza enum come faceva il backend (valori fuori lista -> default).
        var sdiProvider = SdiProviders.Contains(a.SdiProvider) ? a.SdiProvider : "GENERICO";
        var emailMode = EmailModes.Contains(a.EmailMode) ? a.EmailMode : "SMTP";
        var regime = string.IsNullOrEmpty(a.RegimeFiscale) ? "RF01" : a.RegimeFiscale;
        var ritTipo = string.IsNullOrEmpty(a.RitenutaTipoDefault) ? "RT02" : a.RitenutaTipoDefault;
        var smtpPort = a.SmtpPort != 0 ? a.SmtpPort : 587;

        // BUG FIX (vedi note): se l'utente non ha toccato il campo segreto, arriva
        // ancora il placeholder mascherato. Scriverlo cancellerebbe la password reale.
        // Leggiamo i valori correnti e li conserviamo quando il campo è "••••••••".
        var (curPass, curKey) = conn.QuerySingleOrDefault<(string? Pass, string? Key)>(
            "SELECT COALESCE(smtp_pass,'') AS Pass, COALESCE(sdi_api_key,'') AS Key FROM azienda WHERE id = 1");
        var smtpPass = a.SmtpPass == Azienda.MaskedSecret ? (curPass ?? "") : (a.SmtpPass ?? "");
        var sdiApiKey = a.SdiApiKey == Azienda.MaskedSecret ? (curKey ?? "") : (a.SdiApiKey ?? "");

        var p = new
        {
            a.RagioneSociale, a.Indirizzo, a.Cap, a.Citta, a.Provincia, a.Stato,
            a.PIva, a.CodFiscale, a.Email, a.Telefono, a.Pec, a.Sdi, a.Banca, a.Iban,
            Logo = a.Logo ?? "",
            SmtpHost = a.SmtpHost ?? "",
            SmtpPort = smtpPort,
            SmtpUser = a.SmtpUser ?? "",
            SmtpPass = smtpPass,
            SmtpFrom = a.SmtpFrom ?? "",
            SmtpSecure = a.SmtpSecure ? 1 : 0,
            SdiApiUrl = a.SdiApiUrl ?? "",
            SdiApiKey = sdiApiKey,
            SdiProvider = sdiProvider,
            RiordinoAutomatico = a.RiordinoAutomatico ? 1 : 0,
            MultiUtenteAttivo = a.MultiUtenteAttivo ? 1 : 0,
            NumerazioneAnnuale = a.NumerazioneAnnuale ? 1 : 0,
            NumeroPrefissi = string.IsNullOrEmpty(a.NumeroPrefissi) ? "{}" : a.NumeroPrefissi,
            a.TemplateConfig,
            a.NotificheConfig,
            EmailCorpoDocumento = a.EmailCorpoDocumento ?? "",
            EmailMode = emailMode,
            LockDocumentiDefault = a.LockDocumentiDefault ? 1 : 0,
            RegimeFiscale = regime,
            a.RitenutaAliquotaDefault,
            RitenutaCausaleDefault = a.RitenutaCausaleDefault ?? "",
            RitenutaTipoDefault = ritTipo,
            CassaTipoDefault = a.CassaTipoDefault ?? "",
            a.CassaAliquotaDefault,
            a.CassaIvaDefault,
        };

        const string UpdateSql = """
            UPDATE azienda SET
                ragione_sociale = @RagioneSociale, indirizzo = @Indirizzo, cap = @Cap,
                citta = @Citta, provincia = @Provincia, stato = @Stato,
                p_iva = @PIva, cod_fiscale = @CodFiscale, email = @Email, telefono = @Telefono,
                pec = @Pec, sdi = @Sdi, banca = @Banca, iban = @Iban, logo = @Logo,
                smtp_host = @SmtpHost, smtp_port = @SmtpPort, smtp_user = @SmtpUser,
                smtp_pass = @SmtpPass, smtp_from = @SmtpFrom, smtp_secure = @SmtpSecure,
                sdi_api_url = @SdiApiUrl, sdi_api_key = @SdiApiKey, sdi_provider = @SdiProvider,
                riordino_automatico = @RiordinoAutomatico, multi_utente_attivo = @MultiUtenteAttivo,
                numerazione_annuale = @NumerazioneAnnuale, numero_prefissi = @NumeroPrefissi,
                template_config = @TemplateConfig, notifiche_config = @NotificheConfig,
                email_corpo_documento = @EmailCorpoDocumento, email_mode = @EmailMode,
                lock_documenti_default = @LockDocumentiDefault,
                regime_fiscale = @RegimeFiscale, ritenuta_aliquota_default = @RitenutaAliquotaDefault,
                ritenuta_causale_default = @RitenutaCausaleDefault, ritenuta_tipo_default = @RitenutaTipoDefault,
                cassa_tipo_default = @CassaTipoDefault, cassa_aliquota_default = @CassaAliquotaDefault,
                cassa_iva_default = @CassaIvaDefault
            WHERE id = 1
            """;

        var affected = conn.Execute(UpdateSql, p);
        if (affected == 0)
        {
            // Riga assente: la inseriamo forzando id=1 (installazione vergine).
            const string InsertSql = """
                INSERT INTO azienda (
                    id, ragione_sociale, indirizzo, cap, citta, provincia, stato,
                    p_iva, cod_fiscale, email, telefono, pec, sdi, banca, iban, logo,
                    smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure,
                    sdi_api_url, sdi_api_key, sdi_provider,
                    riordino_automatico, multi_utente_attivo, numerazione_annuale, numero_prefissi,
                    template_config, notifiche_config, email_corpo_documento, email_mode,
                    lock_documenti_default, regime_fiscale, ritenuta_aliquota_default,
                    ritenuta_causale_default, ritenuta_tipo_default, cassa_tipo_default,
                    cassa_aliquota_default, cassa_iva_default
                ) VALUES (
                    1, @RagioneSociale, @Indirizzo, @Cap, @Citta, @Provincia, @Stato,
                    @PIva, @CodFiscale, @Email, @Telefono, @Pec, @Sdi, @Banca, @Iban, @Logo,
                    @SmtpHost, @SmtpPort, @SmtpUser, @SmtpPass, @SmtpFrom, @SmtpSecure,
                    @SdiApiUrl, @SdiApiKey, @SdiProvider,
                    @RiordinoAutomatico, @MultiUtenteAttivo, @NumerazioneAnnuale, @NumeroPrefissi,
                    @TemplateConfig, @NotificheConfig, @EmailCorpoDocumento, @EmailMode,
                    @LockDocumentiDefault, @RegimeFiscale, @RitenutaAliquotaDefault,
                    @RitenutaCausaleDefault, @RitenutaTipoDefault, @CassaTipoDefault,
                    @CassaAliquotaDefault, @CassaIvaDefault
                )
                """;
            conn.Execute(InsertSql, p);
        }
    }

    // ── Firme CRUD richieste dalla convenzione (entità singleton) ─────────────

    /// <summary>La "lista" è al più la singola riga di impostazioni.</summary>
    public IReadOnlyList<Azienda> GetAll() => new[] { Get() };

    /// <summary>Esiste solo id=1; qualsiasi altro id non trova nulla.</summary>
    public Azienda? GetById(long id) => id == 1 ? Get() : null;

    /// <summary>Per il singleton coincide con <see cref="Save"/>.</summary>
    public void Insert(Azienda a) => Save(a);

    /// <summary>Per il singleton coincide con <see cref="Save"/>.</summary>
    public void Update(Azienda a) => Save(a);

    /// <summary>Reset alle impostazioni di default (non si "elimina" un singleton).</summary>
    public void Delete(long id)
    {
        if (id != 1) return;
        Save(new Azienda());
    }

    /// <summary>Normalizza i valori letti dal DB (default per enum/null).</summary>
    private static void Normalize(Azienda a)
    {
        if (string.IsNullOrEmpty(a.RegimeFiscale)) a.RegimeFiscale = "RF01";
        if (string.IsNullOrEmpty(a.RitenutaTipoDefault)) a.RitenutaTipoDefault = "RT02";
        if (!SdiProviders.Contains(a.SdiProvider)) a.SdiProvider = "GENERICO";
        if (!EmailModes.Contains(a.EmailMode)) a.EmailMode = "SMTP";
        if (a.SmtpPort == 0) a.SmtpPort = 587;
        if (string.IsNullOrEmpty(a.NumeroPrefissi)) a.NumeroPrefissi = "{}";
    }
}

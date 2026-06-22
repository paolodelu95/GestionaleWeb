using System;
using System.Collections.Generic;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// ViewModel delle impostazioni azienda. È un record singolo (singleton id=1):
/// nessuna lista, ma un form a sezioni con caricamento e salvataggio.
/// </summary>
public sealed partial class AziendaViewModel : ViewModelBase
{
    private readonly AziendaRepository _repo;

    public AziendaViewModel() : this(new AziendaRepository()) { }

    public AziendaViewModel(AziendaRepository repo)
    {
        _repo = repo;
        Load();
    }

    // ── Dati societari ───────────────────────────────────────────────
    [ObservableProperty] private string _ragioneSociale = "";
    [ObservableProperty] private string _pIva = "";
    [ObservableProperty] private string _codFiscale = "";

    // ── Regime fiscale / ritenute / cassa ────────────────────────────
    [ObservableProperty] private string _regimeFiscale = "RF01";
    [ObservableProperty] private decimal _ritenutaAliquotaDefault;
    [ObservableProperty] private string _ritenutaTipoDefault = "RT02";
    [ObservableProperty] private string _ritenutaCausaleDefault = "";
    [ObservableProperty] private string _cassaTipoDefault = "";
    [ObservableProperty] private decimal _cassaAliquotaDefault;
    [ObservableProperty] private decimal _cassaIvaDefault;

    // ── Sede legale ──────────────────────────────────────────────────
    [ObservableProperty] private string _indirizzo = "";
    [ObservableProperty] private string _cap = "";
    [ObservableProperty] private string _citta = "";
    [ObservableProperty] private string _provincia = "";
    [ObservableProperty] private string _stato = "";

    // ── Contatti ─────────────────────────────────────────────────────
    [ObservableProperty] private string _telefono = "";
    [ObservableProperty] private string _email = "";
    [ObservableProperty] private string _pec = "";
    [ObservableProperty] private string _sdi = "";

    // ── Dati bancari ─────────────────────────────────────────────────
    [ObservableProperty] private string _iban = "";
    [ObservableProperty] private string _banca = "";

    // ── Email / SMTP ─────────────────────────────────────────────────
    [ObservableProperty] private string _emailMode = "SMTP";
    [ObservableProperty] private string _smtpHost = "";
    [ObservableProperty] private int _smtpPort = 587;
    [ObservableProperty] private string _smtpUser = "";
    [ObservableProperty] private string _smtpPass = "";
    [ObservableProperty] private string _smtpFrom = "";
    [ObservableProperty] private bool _smtpSecure;
    [ObservableProperty] private string _emailCorpoDocumento = "";

    // ── SDI ──────────────────────────────────────────────────────────
    [ObservableProperty] private string _sdiProvider = "GENERICO";
    [ObservableProperty] private string _sdiApiUrl = "";
    [ObservableProperty] private string _sdiApiKey = "";

    // ── Comportamenti ────────────────────────────────────────────────
    [ObservableProperty] private bool _riordinoAutomatico;
    [ObservableProperty] private bool _multiUtenteAttivo;
    [ObservableProperty] private bool _numerazioneAnnuale = true;
    [ObservableProperty] private bool _lockDocumentiDefault = true;

    // Blob JSON preservati grezzi tra load e save (la UI non li edita ancora).
    private string _numeroPrefissi = "{}";
    private string? _templateConfig;
    private string? _notificheConfig;

    // ── Stato UI ─────────────────────────────────────────────────────
    [ObservableProperty] private string _statusMessage = "";

    // ── Opzioni dropdown ─────────────────────────────────────────────
    public IReadOnlyList<string> RegimiFiscali { get; } = new[]
    {
        "RF01", "RF02", "RF04", "RF05", "RF06", "RF07", "RF08", "RF09",
        "RF10", "RF11", "RF12", "RF13", "RF14", "RF15", "RF16", "RF17",
        "RF18", "RF19",
    };

    public IReadOnlyList<string> TipiRitenuta { get; } = new[]
    {
        "RT01", "RT02", "RT03", "RT04", "RT05", "RT06",
    };

    public IReadOnlyList<string> EmailModes { get; } = new[]
    {
        "SMTP", "MAILTO", "WEBMAIL_GMAIL", "WEBMAIL_OUTLOOK",
    };

    public IReadOnlyList<string> SdiProviders { get; } = new[]
    {
        "GENERICO", "FIC", "ARUBA",
    };

    /// <summary>(Ri)carica la riga dal database nel form.</summary>
    [RelayCommand]
    private void Load()
    {
        var a = _repo.Get();
        RagioneSociale = a.RagioneSociale;
        PIva = a.PIva;
        CodFiscale = a.CodFiscale;
        RegimeFiscale = a.RegimeFiscale;
        RitenutaAliquotaDefault = a.RitenutaAliquotaDefault;
        RitenutaTipoDefault = a.RitenutaTipoDefault;
        RitenutaCausaleDefault = a.RitenutaCausaleDefault;
        CassaTipoDefault = a.CassaTipoDefault;
        CassaAliquotaDefault = a.CassaAliquotaDefault;
        CassaIvaDefault = a.CassaIvaDefault;
        Indirizzo = a.Indirizzo;
        Cap = a.Cap;
        Citta = a.Citta;
        Provincia = a.Provincia;
        Stato = a.Stato;
        Telefono = a.Telefono;
        Email = a.Email;
        Pec = a.Pec;
        Sdi = a.Sdi;
        Iban = a.Iban;
        Banca = a.Banca;
        EmailMode = a.EmailMode;
        SmtpHost = a.SmtpHost;
        SmtpPort = a.SmtpPort;
        SmtpUser = a.SmtpUser;
        SmtpPass = a.SmtpPass;       // arriva mascherato se impostato
        SmtpFrom = a.SmtpFrom;
        SmtpSecure = a.SmtpSecure;
        EmailCorpoDocumento = a.EmailCorpoDocumento;
        SdiProvider = a.SdiProvider;
        SdiApiUrl = a.SdiApiUrl;
        SdiApiKey = a.SdiApiKey;     // arriva mascherato se impostato
        RiordinoAutomatico = a.RiordinoAutomatico;
        MultiUtenteAttivo = a.MultiUtenteAttivo;
        NumerazioneAnnuale = a.NumerazioneAnnuale;
        LockDocumentiDefault = a.LockDocumentiDefault;
        _numeroPrefissi = a.NumeroPrefissi;
        _templateConfig = a.TemplateConfig;
        _notificheConfig = a.NotificheConfig;
        StatusMessage = "Impostazioni caricate.";
    }

    /// <summary>Salva il form sulla riga singleton.</summary>
    [RelayCommand]
    private void Save()
    {
        try
        {
            var a = new Azienda
            {
                Id = 1,
                RagioneSociale = RagioneSociale,
                PIva = PIva,
                CodFiscale = CodFiscale,
                RegimeFiscale = RegimeFiscale,
                RitenutaAliquotaDefault = RitenutaAliquotaDefault,
                RitenutaTipoDefault = RitenutaTipoDefault,
                RitenutaCausaleDefault = RitenutaCausaleDefault,
                CassaTipoDefault = CassaTipoDefault,
                CassaAliquotaDefault = CassaAliquotaDefault,
                CassaIvaDefault = CassaIvaDefault,
                Indirizzo = Indirizzo,
                Cap = Cap,
                Citta = Citta,
                Provincia = Provincia,
                Stato = Stato,
                Telefono = Telefono,
                Email = Email,
                Pec = Pec,
                Sdi = Sdi,
                Iban = Iban,
                Banca = Banca,
                EmailMode = EmailMode,
                SmtpHost = SmtpHost,
                SmtpPort = SmtpPort,
                SmtpUser = SmtpUser,
                SmtpPass = SmtpPass,
                SmtpFrom = SmtpFrom,
                SmtpSecure = SmtpSecure,
                EmailCorpoDocumento = EmailCorpoDocumento,
                SdiProvider = SdiProvider,
                SdiApiUrl = SdiApiUrl,
                SdiApiKey = SdiApiKey,
                RiordinoAutomatico = RiordinoAutomatico,
                MultiUtenteAttivo = MultiUtenteAttivo,
                NumerazioneAnnuale = NumerazioneAnnuale,
                LockDocumentiDefault = LockDocumentiDefault,
                NumeroPrefissi = _numeroPrefissi,
                TemplateConfig = _templateConfig,
                NotificheConfig = _notificheConfig,
            };
            _repo.Save(a);
            // Ricarica per riallineare i segreti mascherati appena salvati.
            Load();
            StatusMessage = $"Salvato alle {DateTime.Now:HH:mm:ss}.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Errore nel salvataggio: {ex.Message}";
        }
    }
}

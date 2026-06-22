using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Coppia valore/etichetta per i menù a tendina dei filtri (tipo movimento,
/// causale, mese). Tiene un <c>Value</c> "tecnico" e una <c>Label</c> leggibile.
/// </summary>
public sealed class OpzioneFiltro
{
    public OpzioneFiltro(string? value, string label) { Value = value; Label = label; }
    public string? Value { get; }
    public string Label { get; }
    public override string ToString() => Label;
}

/// <summary>
/// ViewModel della gestione magazzino. Riunisce, come il componente Angular:
///  - lo <b>storico movimenti</b> con filtri (prodotto, cliente, tipo, causale,
///    anno, mese, intervallo date);
///  - i <b>depositi</b> (CRUD con selezione multipla ed eliminazione in blocco) e
///    le <b>giacenze</b> del deposito selezionato;
///  - le azioni <b>Trasferimento</b> e <b>Rettifica</b> giacenza.
///
/// Tutta la logica di scrittura (predefinito unico, blocco delete con giacenze,
/// upsert giacenza, movimento di rettifica/trasferimento) vive nel repository,
/// portata dal backend Rust.
/// </summary>
public partial class MagazzinoViewModel : ViewModelBase
{
    private readonly MagazzinoRepository _repo;
    private readonly ProdottoRepository _prodottiRepo;
    private readonly ClienteRepository _clientiRepo;

    // ── Movimenti (storico) ───────────────────────────────────────────────────

    private readonly List<MovimentoMagazzino> _movimenti = new();

    /// <summary>Movimenti mostrati (già filtrati lato DB).</summary>
    public ObservableCollection<MovimentoMagazzino> Movimenti { get; } = new();

    /// <summary>Prodotti per i menù di filtro/azioni (etichetta = Nome).</summary>
    public ObservableCollection<Prodotto> Prodotti { get; } = new();

    /// <summary>Clienti per il filtro controparte.</summary>
    public ObservableCollection<Cliente> Clienti { get; } = new();

    public ObservableCollection<OpzioneFiltro> TipiMovimento { get; } = new()
    {
        new OpzioneFiltro(null, "Tutti i tipi"),
        new OpzioneFiltro("CARICO", "Carico"),
        new OpzioneFiltro("SCARICO", "Scarico"),
        new OpzioneFiltro("TRASFERIMENTO", "Trasferimento"),
    };

    public ObservableCollection<OpzioneFiltro> Causali { get; } = new()
    {
        new OpzioneFiltro(null, "Tutte le causali"),
        new OpzioneFiltro("DDT", "Doc. di trasporto"),
        new OpzioneFiltro("FATTURA", "Fattura"),
        new OpzioneFiltro("RETTIFICA", "Rettifica"),
        new OpzioneFiltro("STORNO", "Storno"),
        new OpzioneFiltro("ELIMINAZIONE", "Eliminazione"),
        new OpzioneFiltro("ANNULLAMENTO", "Annullamento"),
        new OpzioneFiltro("RIATTIVAZIONE", "Riattivazione"),
        new OpzioneFiltro("TRASFERIMENTO", "Trasferimento"),
    };

    /// <summary>Anni per il filtro: "Tutti gli anni" (null) + ultimi 5 anni,
    /// come il selettore del componente Angular.</summary>
    public ObservableCollection<OpzioneFiltro> Anni { get; } = new();

    public ObservableCollection<OpzioneFiltro> Mesi { get; } = new()
    {
        new OpzioneFiltro(null, "Tutti i mesi"),
        new OpzioneFiltro("1", "Gennaio"), new OpzioneFiltro("2", "Febbraio"),
        new OpzioneFiltro("3", "Marzo"), new OpzioneFiltro("4", "Aprile"),
        new OpzioneFiltro("5", "Maggio"), new OpzioneFiltro("6", "Giugno"),
        new OpzioneFiltro("7", "Luglio"), new OpzioneFiltro("8", "Agosto"),
        new OpzioneFiltro("9", "Settembre"), new OpzioneFiltro("10", "Ottobre"),
        new OpzioneFiltro("11", "Novembre"), new OpzioneFiltro("12", "Dicembre"),
    };

    [ObservableProperty] private Prodotto? _filtroProdotto;
    [ObservableProperty] private Cliente? _filtroCliente;
    [ObservableProperty] private OpzioneFiltro? _filtroTipo;
    [ObservableProperty] private OpzioneFiltro? _filtroCausale;
    [ObservableProperty] private OpzioneFiltro? _filtroAnno;
    [ObservableProperty] private OpzioneFiltro? _filtroMese;
    [ObservableProperty] private string _filtroDataFrom = string.Empty;
    [ObservableProperty] private string _filtroDataTo = string.Empty;

    /// <summary>Totali del riepilogo (somma carichi/scarichi sui movimenti mostrati).</summary>
    public decimal TotaleCarichi => _movimenti.Where(m => m.Tipo == "CARICO").Sum(m => m.Quantita);
    public decimal TotaleScarichi => _movimenti.Where(m => m.Tipo == "SCARICO").Sum(m => m.Quantita);

    // ── Depositi & giacenze ───────────────────────────────────────────────────

    /// <summary>Depositi (lista CRUD principale; supporta la selezione multipla).</summary>
    public ObservableCollection<Magazzino> Depositi { get; } = new();

    /// <summary>Depositi selezionati in griglia (eliminazione in blocco).</summary>
    public ObservableCollection<Magazzino> DepositiSelezionati { get; } = new();

    /// <summary>Giacenze (disponibili) del deposito selezionato.</summary>
    public ObservableCollection<Giacenza> Giacenze { get; } = new();

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ModificaDepositoCommand))]
    [NotifyCanExecuteChangedFor(nameof(EliminaDepositoCommand))]
    private Magazzino? _depositoSelezionato;

    [ObservableProperty] private string _errore = string.Empty;

    // ── Editor deposito (overlay inline) ──────────────────────────────────────

    [ObservableProperty] private bool _editorDepositoAperto;
    [ObservableProperty] private string _editorDepositoTitolo = "Nuovo deposito";
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaDepositoCommand))]
    private string _editNome = string.Empty;
    [ObservableProperty] private string _editCodice = string.Empty;
    [ObservableProperty] private string _editIndirizzo = string.Empty;
    [ObservableProperty] private bool _editPredefinito;
    [ObservableProperty] private bool _editAttivo = true;
    private long? _editDepositoId;

    // ── Dialog Trasferimento ──────────────────────────────────────────────────

    [ObservableProperty] private bool _trasferimentoAperto;
    [ObservableProperty] private Prodotto? _trProdotto;

    /// <summary>Giacenze del prodotto scelto, una per deposito di origine possibile.</summary>
    public ObservableCollection<Giacenza> TrGiacenze { get; } = new();

    [ObservableProperty] private Giacenza? _trOrigine;
    [ObservableProperty] private Magazzino? _trDestinazione;
    [ObservableProperty] private decimal _trQuantita;
    [ObservableProperty] private string _trNote = string.Empty;

    // ── Dialog Rettifica ──────────────────────────────────────────────────────

    [ObservableProperty] private bool _rettificaAperta;
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RettificaGiacenzaAttuale))]
    [NotifyPropertyChangedFor(nameof(RettificaDelta))]
    private Prodotto? _retProdotto;
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RettificaDelta))]
    private decimal _retNuova;
    [ObservableProperty] private string _retNote = string.Empty;

    public decimal RettificaGiacenzaAttuale => RetProdotto?.Quantita ?? 0;
    public decimal RettificaDelta => RetNuova - RettificaGiacenzaAttuale;

    public MagazzinoViewModel()
        : this(new MagazzinoRepository(), new ProdottoRepository(), new ClienteRepository()) { }

    public MagazzinoViewModel(MagazzinoRepository repo, ProdottoRepository prodottiRepo, ClienteRepository clientiRepo)
    {
        _repo = repo;
        _prodottiRepo = prodottiRepo;
        _clientiRepo = clientiRepo;

        var y = DateTime.Today.Year;
        Anni.Add(new OpzioneFiltro(null, "Tutti gli anni"));
        for (var i = 0; i < 5; i++)
        {
            var anno = y - i;
            Anni.Add(new OpzioneFiltro(anno.ToString(CultureInfo.InvariantCulture), anno.ToString(CultureInfo.InvariantCulture)));
        }

        CaricaAnagrafiche();
        CaricaDepositi();
        CaricaMovimenti();
    }

    // ── Caricamenti ───────────────────────────────────────────────────────────

    private void CaricaAnagrafiche()
    {
        Prodotti.Clear();
        foreach (var p in _prodottiRepo.GetAll()) Prodotti.Add(p);
        Clienti.Clear();
        foreach (var c in _clientiRepo.GetAll()) Clienti.Add(c);
    }

    /// <summary>(Ri)carica i depositi e seleziona il predefinito (o il primo).</summary>
    public void CaricaDepositi()
    {
        var precedente = DepositoSelezionato?.Id;
        Depositi.Clear();
        foreach (var m in _repo.GetAll()) Depositi.Add(m);

        DepositoSelezionato =
            (precedente is long id ? Depositi.FirstOrDefault(d => d.Id == id) : null)
            ?? Depositi.FirstOrDefault(d => d.Predefinito)
            ?? Depositi.FirstOrDefault();
    }

    partial void OnDepositoSelezionatoChanged(Magazzino? value) => CaricaGiacenze();

    private void CaricaGiacenze()
    {
        Giacenze.Clear();
        if (DepositoSelezionato is null) return;
        foreach (var g in _repo.GetGiacenze(DepositoSelezionato.Id, soloDisponibili: true))
            Giacenze.Add(g);
    }

    /// <summary>(Ri)carica lo storico movimenti applicando i filtri correnti.</summary>
    public void CaricaMovimenti()
    {
        var f = new MovimentiFiltro
        {
            ProdottoId = FiltroProdotto?.Id,
            ClienteId = FiltroCliente?.Id,
            Tipo = FiltroTipo?.Value,
            Causale = FiltroCausale?.Value,
            Anno = FiltroAnno?.Value is { } a ? int.Parse(a, CultureInfo.InvariantCulture) : null,
            Mese = FiltroMese?.Value is { } m ? int.Parse(m, CultureInfo.InvariantCulture) : null,
            DataFrom = string.IsNullOrWhiteSpace(FiltroDataFrom) ? null : FiltroDataFrom.Trim(),
            DataTo = string.IsNullOrWhiteSpace(FiltroDataTo) ? null : FiltroDataTo.Trim(),
        };

        _movimenti.Clear();
        _movimenti.AddRange(_repo.GetMovimenti(f));
        Movimenti.Clear();
        foreach (var mov in _movimenti) Movimenti.Add(mov);

        OnPropertyChanged(nameof(TotaleCarichi));
        OnPropertyChanged(nameof(TotaleScarichi));
    }

    // I filtri ricaricano i movimenti appena cambiano (live).
    partial void OnFiltroProdottoChanged(Prodotto? value) => CaricaMovimenti();
    partial void OnFiltroClienteChanged(Cliente? value) => CaricaMovimenti();
    partial void OnFiltroTipoChanged(OpzioneFiltro? value) => CaricaMovimenti();
    partial void OnFiltroCausaleChanged(OpzioneFiltro? value) => CaricaMovimenti();
    partial void OnFiltroAnnoChanged(OpzioneFiltro? value) => CaricaMovimenti();
    partial void OnFiltroMeseChanged(OpzioneFiltro? value) => CaricaMovimenti();
    partial void OnFiltroDataFromChanged(string value) => CaricaMovimenti();
    partial void OnFiltroDataToChanged(string value) => CaricaMovimenti();

    [RelayCommand]
    private void AzzeraFiltri()
    {
        FiltroProdotto = null;
        FiltroCliente = null;
        FiltroTipo = null;
        FiltroCausale = null;
        FiltroAnno = null;
        FiltroMese = null;
        FiltroDataFrom = string.Empty;
        FiltroDataTo = string.Empty;
        // I setter già ricaricano; un'ultima passata garantisce coerenza.
        CaricaMovimenti();
    }

    // ── Depositi: CRUD ────────────────────────────────────────────────────────

    [RelayCommand]
    private void AggiungiDeposito()
    {
        _editDepositoId = null;
        EditNome = EditCodice = EditIndirizzo = string.Empty;
        EditPredefinito = Depositi.Count == 0; // il primo diventa predefinito di default
        EditAttivo = true;
        Errore = string.Empty;
        EditorDepositoTitolo = "Nuovo deposito";
        EditorDepositoAperto = true;
    }

    [RelayCommand(CanExecute = nameof(HasDeposito))]
    private void ModificaDeposito()
    {
        if (DepositoSelezionato is not { } m) return;
        _editDepositoId = m.Id;
        EditNome = m.Nome;
        EditCodice = m.Codice;
        EditIndirizzo = m.Indirizzo;
        EditPredefinito = m.Predefinito;
        EditAttivo = m.Attivo;
        Errore = string.Empty;
        EditorDepositoTitolo = "Modifica deposito";
        EditorDepositoAperto = true;
    }

    [RelayCommand]
    private void AnnullaDeposito()
    {
        Errore = string.Empty;
        EditorDepositoAperto = false;
    }

    [RelayCommand(CanExecute = nameof(PuoSalvareDeposito))]
    private void SalvaDeposito()
    {
        var entita = new Magazzino
        {
            Id = _editDepositoId ?? 0,
            Nome = EditNome.Trim(),
            Codice = EditCodice?.Trim() ?? string.Empty,
            Indirizzo = EditIndirizzo?.Trim() ?? string.Empty,
            Predefinito = EditPredefinito,
            Attivo = EditAttivo,
        };

        long? targetId;
        try
        {
            if (_editDepositoId is null)
                targetId = _repo.Insert(entita);
            else
            {
                _repo.Update(entita);
                targetId = entita.Id;
            }
        }
        catch (MagazzinoException ex)
        {
            Errore = ex.Message;
            return;
        }

        Errore = string.Empty;
        EditorDepositoAperto = false;
        CaricaDepositi();
        DepositoSelezionato = Depositi.FirstOrDefault(d => d.Id == targetId);
    }

    [RelayCommand(CanExecute = nameof(HasDeposito))]
    private void EliminaDeposito()
    {
        if (DepositoSelezionato?.Id is not long id) return;
        try
        {
            _repo.Delete(id);
        }
        catch (MagazzinoException ex)
        {
            Errore = ex.Message;
            return;
        }
        Errore = string.Empty;
        CaricaDepositi();
    }

    [RelayCommand(CanExecute = nameof(HasDepositiSelezionati))]
    private void EliminaDepositiSelezionati()
    {
        var ids = DepositiSelezionati.Select(d => d.Id).ToList();
        if (ids.Count == 0) return;

        var errori = new List<string>();
        foreach (var id in ids)
        {
            try { _repo.Delete(id); }
            catch (MagazzinoException ex) { errori.Add(ex.Message); }
        }
        Errore = errori.Count == 0 ? string.Empty : string.Join(" ", errori.Distinct());
        DepositiSelezionati.Clear();
        CaricaDepositi();
    }

    // ── Trasferimento ─────────────────────────────────────────────────────────

    [RelayCommand]
    private void ApriTrasferimento()
    {
        TrProdotto = null;
        TrGiacenze.Clear();
        TrOrigine = null;
        TrDestinazione = null;
        TrQuantita = 0;
        TrNote = string.Empty;
        Errore = string.Empty;
        TrasferimentoAperto = true;
    }

    partial void OnTrProdottoChanged(Prodotto? value)
    {
        TrGiacenze.Clear();
        TrOrigine = null;
        TrQuantita = 0;
        if (value is null) return;
        foreach (var g in _repo.GetGiacenzeProdotto(value.Id)) TrGiacenze.Add(g);
        TrOrigine = TrGiacenze.FirstOrDefault();
    }

    /// <summary>Massimo trasferibile dal deposito/lotto di origine selezionato.</summary>
    public decimal TrMax => TrOrigine?.Quantita ?? 0;

    partial void OnTrOrigineChanged(Giacenza? value) => OnPropertyChanged(nameof(TrMax));

    [RelayCommand]
    private void AnnullaTrasferimento()
    {
        Errore = string.Empty;
        TrasferimentoAperto = false;
    }

    [RelayCommand]
    private void ConfermaTrasferimento()
    {
        if (TrProdotto is null || TrOrigine is null || TrDestinazione is null)
        {
            Errore = "Prodotto e depositi obbligatori";
            return;
        }
        try
        {
            _repo.Trasferimento(
                TrProdotto.Id,
                TrOrigine.MagazzinoId,
                TrDestinazione.Id,
                TrQuantita,
                TrOrigine.VarianteId,
                TrOrigine.Lotto,
                TrOrigine.Scadenza,
                TrNote);
        }
        catch (MagazzinoException ex)
        {
            Errore = ex.Message;
            return;
        }
        Errore = string.Empty;
        TrasferimentoAperto = false;
        CaricaGiacenze();
        CaricaMovimenti();
    }

    // ── Rettifica ─────────────────────────────────────────────────────────────

    [RelayCommand]
    private void ApriRettifica()
    {
        RetProdotto = null;
        RetNuova = 0;
        RetNote = string.Empty;
        Errore = string.Empty;
        RettificaAperta = true;
    }

    partial void OnRetProdottoChanged(Prodotto? value) =>
        RetNuova = value?.Quantita ?? 0;

    [RelayCommand]
    private void AnnullaRettifica()
    {
        Errore = string.Empty;
        RettificaAperta = false;
    }

    [RelayCommand]
    private void ConfermaRettifica()
    {
        if (RetProdotto is null)
        {
            Errore = "Seleziona un prodotto";
            return;
        }
        try
        {
            _repo.RettificaGiacenza(RetProdotto.Id, RetNuova, RetNote,
                magazzinoId: DepositoSelezionato?.Id);
        }
        catch (MagazzinoException ex)
        {
            Errore = ex.Message;
            return;
        }
        Errore = string.Empty;
        RettificaAperta = false;
        CaricaAnagrafiche();   // la quantità prodotto è cambiata
        CaricaGiacenze();
        CaricaMovimenti();
    }

    // ── CanExecute ────────────────────────────────────────────────────────────

    private bool HasDeposito() => DepositoSelezionato is not null;
    private bool HasDepositiSelezionati() => DepositiSelezionati.Count > 0;
    private bool PuoSalvareDeposito() => !string.IsNullOrWhiteSpace(EditNome);

    /// <summary>Da chiamare quando cambia la selezione multipla in griglia depositi.</summary>
    public void NotificaSelezioneCambiata() => EliminaDepositiSelezionatiCommand.NotifyCanExecuteChanged();
}

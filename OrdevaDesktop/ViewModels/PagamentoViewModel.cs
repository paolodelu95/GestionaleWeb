using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Registro incassi/pagamenti + scadenzario. Replica il componente Angular
/// <c>pagamenti</c>: due viste (movimenti registrati / documenti da saldare),
/// filtri per verso, anno, mese e controparte, riepiloghi a totali, editor inline
/// del movimento e saldo (singolo / multiplo) delle voci di scadenzario.
/// </summary>
public partial class PagamentoViewModel : ViewModelBase
{
    private readonly PagamentoRepository _repo;
    private readonly FatturaRepository _fattureRepo;
    private readonly TipoPagamentoRepository _tipiRepo;

    /// <summary>Sorgenti complete non filtrate.</summary>
    private readonly List<Pagamento> _tuttiPagamenti = new();
    private readonly List<ScadenzarioEntry> _tuttoScadenzario = new();

    public PagamentoViewModel() : this(new PagamentoRepository(), new FatturaRepository(), new TipoPagamentoRepository()) { }

    public PagamentoViewModel(PagamentoRepository repo, FatturaRepository fattureRepo, TipoPagamentoRepository tipiRepo)
    {
        _repo = repo;
        _fattureRepo = fattureRepo;
        _tipiRepo = tipiRepo;
        Selezionati.CollectionChanged += (_, _) => OnSelezioneScadenzeChanged();
        Carica();
    }

    // ── Liste osservabili ───────────────────────────────────────────────────────

    /// <summary>Movimenti registrati, filtrati. Bindata alla DataGrid dei pagamenti.</summary>
    public ObservableCollection<Pagamento> Pagamenti { get; } = new();

    /// <summary>Voci da saldare, filtrate. Bindata alla DataGrid dello scadenzario.</summary>
    public ObservableCollection<ScadenzarioEntry> Scadenzario { get; } = new();

    /// <summary>Voci di scadenzario selezionate (saldo multiplo).</summary>
    public ObservableCollection<ScadenzarioEntry> Selezionati { get; } = new();

    /// <summary>Tipi di pagamento attivi (combo dell'editor e del saldo).</summary>
    public ObservableCollection<TipoPagamento> TipiPagamento { get; } = new();

    /// <summary>Fatture collegabili nell'editor (esclude le annullate).</summary>
    public ObservableCollection<Fattura> Fatture { get; } = new();

    /// <summary>Anni distinti per il combo del filtro (null = tutti).</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Controparti distinte per il combo del filtro (null = tutte).</summary>
    public ObservableCollection<string?> Controparti { get; } = new();

    /// <summary>Verso possibili nell'editor.</summary>
    public IReadOnlyList<string> Tipi { get; } = new[] { "ENTRATA", "USCITA" };

    /// <summary>Viste disponibili (valore tecnico + etichetta) per il combo selettore.</summary>
    public IReadOnlyList<VistaOption> Viste { get; } = new[]
    {
        new VistaOption("TUTTI", "Tutti"),
        new VistaOption("ENTRATE", "Entrate"),
        new VistaOption("USCITE", "Uscite"),
        new VistaOption("DA_SALDARE", "Da saldare"),
    };

    /// <summary>Vista selezionata nel combo (specchio di Filtro).</summary>
    public VistaOption? VistaSelezionata
    {
        get => Viste.FirstOrDefault(v => v.Valore == Filtro);
        set { if (value is not null) Filtro = value.Valore; }
    }

    /// <summary>Mesi per il combo del filtro (null = tutti).</summary>
    public ObservableCollection<int?> Mesi { get; } = new()
        { null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };

    // ── Stato vista / filtri ─────────────────────────────────────────────────────

    /// <summary>Vista corrente: "TUTTI", "ENTRATE", "USCITE", "DA_SALDARE".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(MostraScadenzario))]
    [NotifyPropertyChangedFor(nameof(MostraPagamenti))]
    private string _filtro = "TUTTI";

    [ObservableProperty] private int? _filtroAnno;
    [ObservableProperty] private int? _filtroMese;
    [ObservableProperty] private string? _filtroControparte;

    private bool _sospendiFiltri;

    /// <summary>Lo scadenzario è visibile solo nella vista "DA_SALDARE".</summary>
    public bool MostraScadenzario => Filtro == "DA_SALDARE";

    /// <summary>I movimenti registrati si vedono in tutte le viste tranne "DA_SALDARE".</summary>
    public bool MostraPagamenti => Filtro != "DA_SALDARE";

    /// <summary>True se almeno una voce di scadenzario è selezionata (saldo multiplo).</summary>
    public bool HasSelezione => Selezionati.Count > 0;

    /// <summary>Numero di voci di scadenzario selezionate.</summary>
    public int NumSelezionati => Selezionati.Count;

    /// <summary>Somma dei residui selezionati (per la barra del saldo multiplo).</summary>
    public decimal TotaleSelezionato => Selezionati.Sum(e => e.Rimanente);

    // ── Riepiloghi ───────────────────────────────────────────────────────────────

    public decimal TotaleEntrate => Pagamenti.Where(p => p.Tipo == "ENTRATA").Sum(p => p.Importo);
    public decimal TotaleUscite => Pagamenti.Where(p => p.Tipo == "USCITA").Sum(p => p.Importo);
    public decimal DaSaldareEntrate => Scadenzario.Where(e => e.TipoEntry == "FATTURA").Sum(e => e.Rimanente);
    public decimal DaSaldareUscite => Scadenzario.Where(e => e.TipoEntry == "ACQUISTO").Sum(e => e.Rimanente);

    // ── Editor inline del movimento ──────────────────────────────────────────────

    private long? _editId;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TitoloEditor))]
    private bool _editorAperto;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editDataPagamento = DateTime.Today.ToString("yyyy-MM-dd");

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private decimal _editImporto;

    [ObservableProperty] private string _editTipo = "ENTRATA";
    [ObservableProperty] private string _editCausale = "";
    [ObservableProperty] private string _editNote = "";
    [ObservableProperty] private TipoPagamento? _editTipoPagamento;
    [ObservableProperty] private Fattura? _editFattura;

    /// <summary>Messaggio di errore di validazione mostrato nell'editor (null = nessuno).</summary>
    [ObservableProperty] private string? _erroreEditor;

    public string TitoloEditor => _editId is > 0 ? "Modifica pagamento" : "Nuovo pagamento";

    // ── Editor del saldo (singolo / multiplo) ────────────────────────────────────

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TitoloSaldo))]
    private bool _saldoAperto;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ConfermaSaldoCommand))]
    private decimal _saldoImporto;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ConfermaSaldoCommand))]
    private string _saldoData = DateTime.Today.ToString("yyyy-MM-dd");

    [ObservableProperty] private TipoPagamento? _saldoTipoPagamento;
    [ObservableProperty] private string? _erroreSaldo;

    /// <summary>Voce singola in saldo (null se saldo multiplo).</summary>
    private ScadenzarioEntry? _saldoEntry;

    /// <summary>Voci in saldo multiplo (vuoto se saldo singolo).</summary>
    private readonly List<ScadenzarioEntry> _saldoMultiplo = new();

    public string TitoloSaldo => _saldoEntry is not null
        ? $"Salda {_saldoEntry.Numero}"
        : $"Salda {_saldoMultiplo.Count} voci";

    // ── Reazioni ai filtri ───────────────────────────────────────────────────────

    partial void OnFiltroChanged(string value)
    {
        OnPropertyChanged(nameof(VistaSelezionata));
        if (_sospendiFiltri) return;
        // Cambiando vista ricarico i dati pertinenti e riaggiorno anni/controparti.
        Carica();
    }

    partial void OnFiltroAnnoChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroMeseChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroControparteChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    // ── Caricamento ──────────────────────────────────────────────────────────────

    [RelayCommand]
    private void Carica()
    {
        // Movimenti: nelle viste ENTRATE/USCITE filtro già in SQL (come il backend).
        var tipoSql = Filtro switch { "ENTRATE" => "ENTRATA", "USCITE" => "USCITA", _ => (string?)null };

        _tuttiPagamenti.Clear();
        if (MostraPagamenti)
            _tuttiPagamenti.AddRange(_repo.GetAll(tipoSql));

        _tuttoScadenzario.Clear();
        if (MostraScadenzario)
            _tuttoScadenzario.AddRange(_repo.GetScadenzario());

        // Combo dell'editor (sempre disponibili).
        TipiPagamento.Clear();
        foreach (var t in _tipiRepo.GetAll().Where(t => t.Attivo))
            TipiPagamento.Add(t);

        Fatture.Clear();
        foreach (var f in _fattureRepo.GetAll().Where(f => f.Stato != "ANNULLATA"))
            Fatture.Add(f);

        RicostruisciFiltri();
        Selezionati.Clear();
        ApplicaFiltri();
    }

    /// <summary>Ricostruisce i valori dei combo anno/controparte dalla vista corrente.</summary>
    private void RicostruisciFiltri()
    {
        IEnumerable<int> anni;
        IEnumerable<string> controparti;

        if (MostraScadenzario)
        {
            anni = _tuttoScadenzario.Select(e => Anno(e.DataEmissione));
            controparti = _tuttoScadenzario.Select(e => e.Controparte ?? "");
        }
        else
        {
            anni = _tuttiPagamenti.Select(p => Anno(p.DataPagamento));
            controparti = _tuttiPagamenti.Select(p => p.Controparte);
        }

        Anni.Clear();
        Anni.Add(null);
        foreach (var a in anni.Where(a => a > 0).Distinct().OrderByDescending(a => a))
            Anni.Add(a);

        Controparti.Clear();
        Controparti.Add(null);
        foreach (var c in controparti.Where(c => !string.IsNullOrWhiteSpace(c) && c != "—")
                     .Distinct().OrderBy(c => c, StringComparer.OrdinalIgnoreCase))
            Controparti.Add(c);
    }

    private void ApplicaFiltri()
    {
        if (MostraScadenzario)
        {
            IEnumerable<ScadenzarioEntry> q = _tuttoScadenzario;
            if (FiltroAnno is int anno) q = q.Where(e => Anno(e.DataEmissione) == anno);
            if (FiltroMese is int mese) q = q.Where(e => Mese(e.DataEmissione) == mese);
            if (!string.IsNullOrEmpty(FiltroControparte)) q = q.Where(e => e.Controparte == FiltroControparte);

            Scadenzario.Clear();
            foreach (var e in q) Scadenzario.Add(e);
            Selezionati.Clear();
        }
        else
        {
            IEnumerable<Pagamento> q = _tuttiPagamenti;
            if (FiltroAnno is int anno) q = q.Where(p => Anno(p.DataPagamento) == anno);
            if (FiltroMese is int mese) q = q.Where(p => Mese(p.DataPagamento) == mese);
            if (!string.IsNullOrEmpty(FiltroControparte)) q = q.Where(p => p.Controparte == FiltroControparte);

            Pagamenti.Clear();
            foreach (var p in q) Pagamenti.Add(p);
        }

        NotificaTotali();
    }

    private void NotificaTotali()
    {
        OnPropertyChanged(nameof(TotaleEntrate));
        OnPropertyChanged(nameof(TotaleUscite));
        OnPropertyChanged(nameof(DaSaldareEntrate));
        OnPropertyChanged(nameof(DaSaldareUscite));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        FiltroAnno = null;
        FiltroMese = null;
        FiltroControparte = null;
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    // ── Editor del movimento ─────────────────────────────────────────────────────

    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditDataPagamento = DateTime.Today.ToString("yyyy-MM-dd");
        EditImporto = 0m;
        EditTipo = "ENTRATA";
        EditCausale = "";
        EditNote = "";
        EditTipoPagamento = null;
        EditFattura = null;
        ErroreEditor = null;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    [RelayCommand(CanExecute = nameof(HasSingoloMovimentoSelezionato))]
    private void Modifica()
    {
        var p = PagamentoSelezionato;
        if (p?.Id is not > 0) return;

        _editId = p.Id;
        EditDataPagamento = p.DataPagamento;
        EditImporto = p.Importo;
        EditTipo = string.IsNullOrEmpty(p.Tipo) ? "ENTRATA" : p.Tipo;
        EditCausale = p.Causale;
        EditNote = p.Note;
        EditTipoPagamento = TipiPagamento.FirstOrDefault(t => t.Id == p.TipoPagamentoId);
        EditFattura = Fatture.FirstOrDefault(f => f.Id == p.FatturaId);
        ErroreEditor = null;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Movimento singolo attualmente selezionato nella DataGrid (per Modifica/Elimina).</summary>
    public Pagamento? PagamentoSelezionato { get; set; }

    private bool HasSingoloMovimentoSelezionato() => PagamentoSelezionato is not null;

    /// <summary>Notifica al cambio di selezione del DataGrid movimenti.</summary>
    public void AggiornaMovimentoSelezionato(Pagamento? p)
    {
        PagamentoSelezionato = p;
        ModificaCommand.NotifyCanExecuteChanged();
        EliminaCommand.NotifyCanExecuteChanged();
    }

    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    [RelayCommand(CanExecute = nameof(CanSalva))]
    private void Salva()
    {
        var p = new Pagamento
        {
            Id = _editId,
            DataPagamento = EditDataPagamento,
            Importo = EditImporto,
            Tipo = EditTipo,
            Causale = EditCausale,
            Note = EditNote,
            TipoPagamentoId = EditTipoPagamento?.Id,
            FatturaId = EditFattura?.Id,
            // Il conto viene impostato dal repository in base al tipo di pagamento.
            Conto = EditTipoPagamento?.Conto ?? "BANCA",
            Metodo = EditTipoPagamento?.Nome ?? "Bonifico",
        };

        try
        {
            if (p.Id is > 0) _repo.Update(p);
            else _repo.Insert(p);
        }
        catch (InvalidOperationException ex)
        {
            ErroreEditor = ex.Message;
            return;
        }

        EditorAperto = false;
        Carica();
    }

    private bool CanSalva() => EditImporto > 0m && !string.IsNullOrWhiteSpace(EditDataPagamento);

    [RelayCommand(CanExecute = nameof(HasSingoloMovimentoSelezionato))]
    private void Elimina()
    {
        if (PagamentoSelezionato?.Id is not > 0) return;
        _repo.Delete(PagamentoSelezionato.Id.Value);
        if (_editId == PagamentoSelezionato.Id) EditorAperto = false;
        Carica();
    }

    // ── Saldo dallo scadenzario ──────────────────────────────────────────────────

    [RelayCommand]
    private void Salda(ScadenzarioEntry? entry)
    {
        if (entry is null) return;
        _saldoEntry = entry;
        _saldoMultiplo.Clear();
        SaldoImporto = entry.Rimanente;
        SaldoData = DateTime.Today.ToString("yyyy-MM-dd");
        SaldoTipoPagamento = null;
        ErroreSaldo = null;
        OnPropertyChanged(nameof(TitoloSaldo));
        SaldoAperto = true;
    }

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void SaldaSelezionati()
    {
        if (Selezionati.Count == 0) return;
        _saldoEntry = null;
        _saldoMultiplo.Clear();
        _saldoMultiplo.AddRange(Selezionati);
        SaldoImporto = TotaleSelezionato;     // sola informazione, ogni voce si salda per intero
        SaldoData = DateTime.Today.ToString("yyyy-MM-dd");
        SaldoTipoPagamento = null;
        ErroreSaldo = null;
        OnPropertyChanged(nameof(TitoloSaldo));
        SaldoAperto = true;
    }

    [RelayCommand]
    private void AnnullaSaldo() => SaldoAperto = false;

    [RelayCommand(CanExecute = nameof(CanConfermaSaldo))]
    private void ConfermaSaldo()
    {
        try
        {
            if (_saldoEntry is not null)
            {
                _repo.SaldaScadenza(_saldoEntry, SaldoImporto, SaldoData, SaldoTipoPagamento?.Id);
            }
            else
            {
                // Saldo multiplo: ogni voce per il suo residuo intero (come Angular).
                foreach (var e in _saldoMultiplo)
                    _repo.SaldaScadenza(e, e.Rimanente, SaldoData, SaldoTipoPagamento?.Id);
            }
        }
        catch (InvalidOperationException ex)
        {
            ErroreSaldo = ex.Message;
            return;
        }

        SaldoAperto = false;
        Carica();
    }

    private bool CanConfermaSaldo() =>
        !string.IsNullOrWhiteSpace(SaldoData) &&
        (_saldoEntry is null || SaldoImporto > 0m);

    private void OnSelezioneScadenzeChanged()
    {
        OnPropertyChanged(nameof(HasSelezione));
        OnPropertyChanged(nameof(NumSelezionati));
        OnPropertyChanged(nameof(TotaleSelezionato));
        SaldaSelezionatiCommand.NotifyCanExecuteChanged();
    }

    /// <summary>Chiamato dalla View quando cambia la selezione del DataGrid scadenzario.</summary>
    public void AggiornaSelezioneScadenze(IEnumerable<ScadenzarioEntry> selezione)
    {
        Selezionati.Clear();
        foreach (var e in selezione) Selezionati.Add(e);
    }

    // ── util ─────────────────────────────────────────────────────────────────────

    private static int Anno(string iso) =>
        iso.Length >= 4 && int.TryParse(iso.AsSpan(0, 4), out var y) ? y : 0;

    private static int Mese(string iso) =>
        iso.Length >= 7 && int.TryParse(iso.AsSpan(5, 2), out var m) ? m : 0;
}

/// <summary>Opzione del selettore di vista: valore tecnico (Filtro) ed etichetta visibile.</summary>
public sealed record VistaOption(string Valore, string Etichetta);

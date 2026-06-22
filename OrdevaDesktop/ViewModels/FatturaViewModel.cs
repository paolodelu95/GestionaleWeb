using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Elenco fatture: lista filtrabile, ricerca testuale, filtri stato/anno/da-pagare,
/// selezione multipla con eliminazione e cambio stato in blocco. Replica il
/// comportamento del componente Angular <c>fatture</c> (colonne numero, data,
/// cliente, totale, stato; filtri anni/stati/da-pagare; azioni paga/elimina).
/// </summary>
public partial class FatturaViewModel : ViewModelBase
{
    private readonly FatturaRepository _repo = new();

    /// <summary>Tutte le fatture caricate (sorgente non filtrata).</summary>
    private readonly List<Fattura> _tutte = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Fattura> Fatture { get; } = new();

    /// <summary>Anni distinti per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Stati possibili per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Stati { get; } = new() { null, "EMESSA", "PAGATA", "ANNULLATA" };

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Fattura> Selezionate { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionate;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private int? filtroAnno;
    [ObservableProperty] private string? filtroStato;
    [ObservableProperty] private bool filtroDaPagare;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionate > 0;

    /// <summary>Fatture EMESSA = da pagare (come daPagareCount dell'Angular).</summary>
    public int DaPagareCount => _tutte.Count(f => f.Stato == "EMESSA");

    /// <summary>True se c'è almeno una fattura da pagare (per la visibilità del badge).</summary>
    public bool HasDaPagare => DaPagareCount > 0;

    /// <summary>Totale (netto a pagare) delle fatture visibili, per il riepilogo a piè di lista.</summary>
    public decimal TotaleVisibile => Fatture.Sum(f => f.NettoVisualizzato);

    public FatturaViewModel()
    {
        Selezionate.CollectionChanged += (_, _) => NumSelezionate = Selezionate.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroAnnoChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroStatoChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroDaPagareChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutte.Clear();
            _tutte.AddRange(_repo.GetAll());

            Anni.Clear();
            Anni.Add(null); // "Tutti gli anni"
            foreach (var a in _tutte.Select(f => f.Anno)
                         .Where(a => a > 0)
                         .Distinct()
                         .OrderByDescending(a => a))
                Anni.Add(a);

            Selezionate.Clear();
            ApplicaFiltri();
            OnPropertyChanged(nameof(DaPagareCount));
            OnPropertyChanged(nameof(HasDaPagare));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Fattura> q = _tutte;

        if (FiltroAnno is int anno)
            q = q.Where(f => f.Anno == anno);

        if (!string.IsNullOrWhiteSpace(FiltroStato))
            q = q.Where(f => f.Stato == FiltroStato);

        // Da pagare = solo EMESSA (parità con il filtro Angular filtroDaPagare).
        if (FiltroDaPagare)
            q = q.Where(f => f.Stato == "EMESSA");

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(f =>
                f.Numero.ToLowerInvariant().Contains(t) ||
                (f.ClienteNome ?? "").ToLowerInvariant().Contains(t) ||
                f.Note.ToLowerInvariant().Contains(t));
        }

        Fatture.Clear();
        foreach (var f in q)
            Fatture.Add(f);

        OnPropertyChanged(nameof(TotaleVisibile));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo i filtri, azzero, ricalcolo una volta.
        _sospendiFiltri = true;
        FiltroAnno = null;
        FiltroStato = null;
        FiltroDaPagare = false;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea una nuova fattura base (testata minima). Il form completo di dettaglio
    /// (righe, fiscale, DDT, riferimenti) sarà cablato dalla fase di integrazione
    /// tramite dialog: qui si predispone solo la riga in lista.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        // Hook per il dialog di creazione (integrazione). Non si inserisce subito:
        // il backend richiede cliente + almeno una riga, che il dialog raccoglierà.
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        var sel = Selezionate.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetById(sel.Id);
        if (dettaglio == null) return;
        // Quando il dialog sarà cablato: aprilo con `dettaglio`, poi Update + Carica.
    }

    private bool HasSingoloSelezionato() => NumSelezionate == 1;

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionate == 0) return;
        var ids = Selezionate.Select(f => f.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    /// <summary>Segna come pagate le fatture selezionate (bulkSetStato 'PAGATA' dell'Angular).</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void SegnaPagate()
    {
        if (NumSelezionate == 0) return;
        var ids = Selezionate.Select(f => f.Id).ToList();
        _repo.SetStatoMany(ids, "PAGATA");
        Carica();
    }

    /// <summary>Riporta a EMESSA le fatture selezionate (annulla il pagamento).</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void SegnaEmesse()
    {
        if (NumSelezionate == 0) return;
        var ids = Selezionate.Select(f => f.Id).ToList();
        _repo.SetStatoMany(ids, "EMESSA");
        Carica();
    }

    partial void OnNumSelezionateChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        SegnaPagateCommand.NotifyCanExecuteChanged();
        SegnaEmesseCommand.NotifyCanExecuteChanged();
    }
}

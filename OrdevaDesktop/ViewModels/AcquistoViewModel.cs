using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Elenco fatture d'acquisto (ciclo passivo): lista filtrabile, ricerca testuale,
/// filtri anno/stato/fornitore, selezione multipla con eliminazione e cambio stato
/// in blocco. Replica il comportamento del componente Angular <c>acquisti</c>
/// (colonne numero, data, fornitore, pagamento, importo, stato; filtri
/// anni/mesi/fornitori; azioni bulk PAGATA/ANNULLATA).
/// </summary>
public partial class AcquistoViewModel : ViewModelBase
{
    private readonly AcquistoRepository _repo = new();

    /// <summary>Tutti gli acquisti caricati (sorgente non filtrata).</summary>
    private readonly List<Acquisto> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Acquisto> Acquisti { get; } = new();

    /// <summary>Anni distinti per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Fornitori distinti (per nome) presenti nella lista (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Fornitori { get; } = new();

    /// <summary>Stati possibili per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Stati { get; } = new() { null, "RICEVUTA", "PAGATA", "ANNULLATA" };

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Acquisto> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private int? filtroAnno;
    [ObservableProperty] private string? filtroStato;
    [ObservableProperty] private string? filtroFornitore;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    /// <summary>Acquisti RICEVUTA = ancora da pagare (badge a testata).</summary>
    public int DaPagareCount => _tutti.Count(a => a.Stato == "RICEVUTA");

    /// <summary>True se c'è almeno un acquisto da pagare (per la visibilità del badge).</summary>
    public bool HasDaPagare => DaPagareCount > 0;

    /// <summary>Totale (ivato) degli acquisti visibili, per il riepilogo a piè di lista.</summary>
    public decimal TotaleVisibile => Acquisti.Sum(a => a.TotaleVisualizzato);

    public AcquistoViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroAnnoChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroStatoChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroFornitoreChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());

            Anni.Clear();
            Anni.Add(null); // "Tutti gli anni"
            foreach (var y in _tutti.Select(a => a.Anno)
                         .Where(y => y > 0)
                         .Distinct()
                         .OrderByDescending(y => y))
                Anni.Add(y);

            Fornitori.Clear();
            Fornitori.Add(null); // "Tutti i fornitori"
            foreach (var f in _tutti.Select(a => a.FornitoreNome)
                         .Where(f => !string.IsNullOrWhiteSpace(f))
                         .Distinct()
                         .OrderBy(f => f))
                Fornitori.Add(f);

            Selezionati.Clear();
            ApplicaFiltri();
            OnPropertyChanged(nameof(DaPagareCount));
            OnPropertyChanged(nameof(HasDaPagare));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Acquisto> q = _tutti;

        if (FiltroAnno is int anno)
            q = q.Where(a => a.Anno == anno);

        if (!string.IsNullOrWhiteSpace(FiltroStato))
            q = q.Where(a => a.Stato == FiltroStato);

        if (!string.IsNullOrWhiteSpace(FiltroFornitore))
            q = q.Where(a => a.FornitoreNome == FiltroFornitore);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(a =>
                a.Numero.ToLowerInvariant().Contains(t) ||
                (a.FornitoreNome ?? "").ToLowerInvariant().Contains(t) ||
                a.Note.ToLowerInvariant().Contains(t));
        }

        Acquisti.Clear();
        foreach (var a in q)
            Acquisti.Add(a);

        OnPropertyChanged(nameof(TotaleVisibile));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo i filtri, azzero, ricalcolo una volta.
        _sospendiFiltri = true;
        FiltroAnno = null;
        FiltroStato = null;
        FiltroFornitore = null;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea una nuova fattura d'acquisto. Il form completo di dettaglio (righe,
    /// fornitore, pagamento) sarà cablato dalla fase di integrazione tramite dialog:
    /// qui si predispone solo l'hook (il backend ammette anche acquisti senza righe).
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        // Hook per il dialog di creazione (integrazione). Aprirà il form, poi
        // Insert + Carica.
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetById(sel.Id);
        if (dettaglio == null) return;
        // Quando il dialog sarà cablato: aprilo con `dettaglio`, poi Update + Carica.
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(a => a.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    /// <summary>Segna come pagati gli acquisti selezionati (bulk setStato 'PAGATA').</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void SegnaPagati()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(a => a.Id).ToList();
        _repo.SetStatoMany(ids, "PAGATA");
        Carica();
    }

    /// <summary>Annulla gli acquisti selezionati (bulk setStato 'ANNULLATA').</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void SegnaAnnullati()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(a => a.Id).ToList();
        _repo.SetStatoMany(ids, "ANNULLATA");
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        SegnaPagatiCommand.NotifyCanExecuteChanged();
        SegnaAnnullatiCommand.NotifyCanExecuteChanged();
    }
}

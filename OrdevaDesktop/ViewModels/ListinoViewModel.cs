using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Pagina Listini (Vendite → Listini): elenco filtrabile dei listini prezzi,
/// ricerca testuale, filtro solo-attivi, selezione multipla ed eliminazione in
/// blocco. Replica l'elenco del componente Angular <c>listini</c> (l'editor riga
/// per riga — prezzi, sezioni, colonne, stampa — sarà cablato dall'integrazione).
/// </summary>
public partial class ListinoViewModel : ViewModelBase
{
    private readonly ListinoRepository _repo = new();

    /// <summary>Tutti i listini caricati (sorgente non filtrata).</summary>
    private readonly List<Listino> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Listino> Listini { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Listino> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private bool soloAttivi;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    public ListinoViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnSoloAttiviChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());
            Selezionati.Clear();
            ApplicaFiltri();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtro attivi.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Listino> q = _tutti;

        if (SoloAttivi)
            q = q.Where(l => l.Attivo);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(l =>
                l.Nome.ToLowerInvariant().Contains(t) ||
                l.Descrizione.ToLowerInvariant().Contains(t));
        }

        Listini.Clear();
        foreach (var l in q)
            Listini.Add(l);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        SoloAttivi = false;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo listino base. La gestione dell'editor (prezzi, sezioni,
    /// colonne, stampa) sarà cablata dalla fase di integrazione.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuovo = new Listino { Nome = "Nuovo listino", Attivo = true };
        nuovo.Id = _repo.Insert(nuovo);
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per l'editor (integrazione): ricarico il dettaglio completo
        // (prezzi + sezioni) dell'elemento selezionato.
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetById(sel.Id);
        if (dettaglio == null) return;
        // Quando l'editor sarà cablato: aprilo con `dettaglio`, poi Update + Carica.
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(l => l.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
    }
}

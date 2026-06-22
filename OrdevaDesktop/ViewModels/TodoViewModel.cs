using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Attività / cose da fare: lista filtrabile, ricerca testuale, filtri
/// stato/priorità/categoria, spunta rapida di completamento, selezione multipla
/// ed eliminazione in blocco. Replica il comportamento della tab "Todo" del
/// componente Angular <c>agenda</c>.
/// </summary>
public partial class TodoViewModel : ViewModelBase
{
    private readonly TodoRepository _repo = new();

    /// <summary>Tutte le todo caricate (sorgente non filtrata, già ordinata dal repo).</summary>
    private readonly List<Todo> _tutte = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Todo> Todos { get; } = new();

    /// <summary>Categorie distinte per il combo del filtro (con "Tutte" = null).</summary>
    public ObservableCollection<string?> Categorie { get; } = new();

    /// <summary>Valori ammessi per stato/priorità nei combo (form e filtri).</summary>
    public IReadOnlyList<string> Stati { get; } = new[] { "DA_FARE", "IN_CORSO", "FATTA" };
    public IReadOnlyList<string> Priorita { get; } = new[] { "BASSA", "MEDIA", "ALTA" };

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Todo> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string? filtroStato;
    [ObservableProperty] private string? filtroPriorita;
    [ObservableProperty] private string? filtroCategoria;
    [ObservableProperty] private bool nascondiCompletate;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    // Contatori della testata (parità con todoPending/todoInCorso/todoFatte).
    public int DaFareCount => _tutte.Count(t => t.Stato == "DA_FARE");
    public int InCorsoCount => _tutte.Count(t => t.Stato == "IN_CORSO");
    public int FatteCount => _tutte.Count(t => t.Stato == "FATTA");

    public TodoViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroStatoChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroPrioritaChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroCategoriaChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnNascondiCompletateChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutte.Clear();
            _tutte.AddRange(_repo.GetAll());

            Categorie.Clear();
            Categorie.Add(null); // "Tutte le categorie"
            foreach (var c in _tutte.Select(t => t.Categoria)
                         .Where(c => !string.IsNullOrWhiteSpace(c))
                         .Distinct()
                         .OrderBy(c => c))
                Categorie.Add(c);

            Selezionati.Clear();
            ApplicaFiltri();
            NotificaContatori();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Todo> q = _tutte;

        if (!string.IsNullOrWhiteSpace(FiltroStato))
            q = q.Where(t => t.Stato == FiltroStato);

        if (!string.IsNullOrWhiteSpace(FiltroPriorita))
            q = q.Where(t => t.Priorita == FiltroPriorita);

        if (!string.IsNullOrWhiteSpace(FiltroCategoria))
            q = q.Where(t => t.Categoria == FiltroCategoria);

        if (NascondiCompletate)
            q = q.Where(t => t.Stato != "FATTA");

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var s = term.ToLowerInvariant();
            q = q.Where(t =>
                t.Titolo.ToLowerInvariant().Contains(s) ||
                t.Descrizione.ToLowerInvariant().Contains(s) ||
                t.Categoria.ToLowerInvariant().Contains(s));
        }

        Todos.Clear();
        foreach (var t in q)
            Todos.Add(t);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo, azzero, ricalcolo una volta sola.
        _sospendiFiltri = true;
        FiltroStato = null;
        FiltroPriorita = null;
        FiltroCategoria = null;
        NascondiCompletate = false;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea una todo base. La modifica di dettaglio (form completo) sarà cablata
    /// dalla fase di integrazione tramite dialog. Default MEDIA/DA_FARE come backend.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuova = new Todo { Titolo = "Nuova attività", Priorita = "MEDIA", Stato = "DA_FARE" };
        nuova.Id = _repo.Insert(nuova);
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione): ricarichiamo il dettaglio
        // dell'elemento selezionato. Quando il dialog sarà cablato: apri con
        // `dettaglio`, poi _repo.Update + Carica.
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetById(sel.Id);
        if (dettaglio == null) return;
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    /// <summary>
    /// Spunta/de-spunta rapida: passa a FATTA o torna a DA_FARE. Replica
    /// toggleTodo() dell'Angular; il repository gestisce completata_at.
    /// </summary>
    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void ToggleFatta()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        _repo.SetStato(sel.Id, sel.Stato == "FATTA" ? "DA_FARE" : "FATTA");
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(t => t.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        ToggleFattaCommand.NotifyCanExecuteChanged();
    }

    private void NotificaContatori()
    {
        OnPropertyChanged(nameof(DaFareCount));
        OnPropertyChanged(nameof(InCorsoCount));
        OnPropertyChanged(nameof(FatteCount));
    }
}

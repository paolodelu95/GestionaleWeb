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
/// ViewModel dell'anagrafica "Conti di Acquisto". Espone la lista filtrabile,
/// la selezione multipla per l'eliminazione in blocco e un editor inline
/// (pannello laterale) per creare/modificare un conto.
/// </summary>
public partial class ContoAcquistoViewModel : ViewModelBase
{
    private readonly ContoAcquistoRepository _repo;

    /// <summary>Sorgente completa (non filtrata) caricata dal DB.</summary>
    private readonly List<ContoAcquisto> _all = new();

    public ContoAcquistoViewModel() : this(new ContoAcquistoRepository()) { }

    public ContoAcquistoViewModel(ContoAcquistoRepository repo)
    {
        _repo = repo;
        Load();
    }

    /// <summary>Righe attualmente mostrate (dopo ricerca/filtro).</summary>
    public ObservableCollection<ContoAcquisto> Items { get; } = new();

    /// <summary>Righe selezionate nel DataGrid (per l'eliminazione in blocco).</summary>
    public ObservableCollection<ContoAcquisto> Selezionati { get; } = new();

    /// <summary>Testo di ricerca libera (nome / tag predefinito).</summary>
    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>Se true mostra solo i conti attivi.</summary>
    [ObservableProperty]
    private bool _soloAttivi;

    /// <summary>Id del conto in editing (null = nuovo). Solo stato interno.</summary>
    private int? _editId;

    /// <summary>True quando l'editor laterale è visibile.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TitoloEditor))]
    private bool _editorAperto;

    /// <summary>Campo Nome dell'editor.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editNome = string.Empty;

    /// <summary>Campo "Predefinito per" dell'editor (tag libero).</summary>
    [ObservableProperty]
    private string _editPredefinitoPer = string.Empty;

    /// <summary>Campo Attivo dell'editor.</summary>
    [ObservableProperty]
    private bool _editAttivo = true;

    /// <summary>Titolo del pannello editor.</summary>
    public string TitoloEditor =>
        _editId is > 0 ? "Modifica conto acquisto" : "Nuovo conto acquisto";

    partial void OnRicercaChanged(string value) => ApplyFilter();
    partial void OnSoloAttiviChanged(bool value) => ApplyFilter();

    /// <summary>(Ri)carica i dati dal database e riapplica il filtro corrente.</summary>
    [RelayCommand]
    private void Load()
    {
        _all.Clear();
        _all.AddRange(_repo.GetAll());
        ApplyFilter();
    }

    private void ApplyFilter()
    {
        var q = (Ricerca ?? string.Empty).Trim();
        IEnumerable<ContoAcquisto> filtered = _all;

        if (SoloAttivi)
            filtered = filtered.Where(c => c.Attivo);

        if (q.Length > 0)
            filtered = filtered.Where(c =>
                (c.Nome?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (c.PredefinitoPer?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false));

        Items.Clear();
        foreach (var c in filtered)
            Items.Add(c);

        Selezionati.Clear();
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }

    /// <summary>Apre l'editor su un nuovo conto con i default.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditNome = string.Empty;
        EditPredefinitoPer = string.Empty;
        EditAttivo = true;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sui valori del conto selezionato.</summary>
    [RelayCommand]
    private void Modifica(ContoAcquisto? c)
    {
        if (c is null) return;
        _editId = c.Id;
        EditNome = c.Nome;
        EditPredefinitoPer = c.PredefinitoPer ?? string.Empty;
        EditAttivo = c.Attivo;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    /// <summary>Salva (insert o update) il conto in editing e ricarica.</summary>
    [RelayCommand(CanExecute = nameof(CanSalva))]
    private void Salva()
    {
        var c = new ContoAcquisto
        {
            Id = _editId,
            Nome = EditNome,
            PredefinitoPer = EditPredefinitoPer,
            Attivo = EditAttivo,
        };

        if (c.Id is > 0) _repo.Update(c);
        else _repo.Insert(c);

        EditorAperto = false;
        Load();
    }

    private bool CanSalva() => !string.IsNullOrWhiteSpace(EditNome);

    /// <summary>Elimina un singolo conto e ricarica.</summary>
    [RelayCommand]
    private void Elimina(ContoAcquisto? c)
    {
        if (c?.Id is not > 0) return;
        _repo.Delete(c.Id.Value);
        if (_editId == c.Id) EditorAperto = false;
        Load();
    }

    /// <summary>Elimina in blocco tutte le righe selezionate (una sola query).</summary>
    [RelayCommand(CanExecute = nameof(CanEliminaSelezionati))]
    private void EliminaSelezionati()
    {
        var ids = Selezionati.Where(c => c.Id is > 0).Select(c => c.Id!.Value).ToList();
        if (ids.Count == 0) return;
        _repo.DeleteMany(ids);
        if (_editId is not null && ids.Contains(_editId.Value)) EditorAperto = false;
        Load();
    }

    private bool CanEliminaSelezionati() => Selezionati.Count > 0;

    /// <summary>Numero di righe selezionate (per la barra azioni di blocco).</summary>
    public int NumeroSelezionati => Selezionati.Count;

    /// <summary>Chiamato dalla View quando cambia la selezione del DataGrid.</summary>
    public void AggiornaSelezione(IEnumerable<ContoAcquisto> selezione)
    {
        Selezionati.Clear();
        foreach (var c in selezione)
            Selezionati.Add(c);
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }
}

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
/// ViewModel dell'anagrafica "Causali pagamento". Espone la lista filtrabile,
/// la selezione multipla per l'eliminazione in blocco e un editor inline
/// (pannello laterale) per creare/modificare una causale. Replica il dialog
/// Angular <c>CausaleDialogComponent</c> (solo il campo Nome) aggiungendo, come
/// le altre anagrafiche desktop, il flag Attivo.
/// </summary>
public partial class CausalePagamentoViewModel : ViewModelBase
{
    private readonly CausalePagamentoRepository _repo;

    /// <summary>Sorgente completa (non filtrata) caricata dal DB.</summary>
    private readonly List<CausalePagamento> _all = new();

    public CausalePagamentoViewModel() : this(new CausalePagamentoRepository()) { }

    public CausalePagamentoViewModel(CausalePagamentoRepository repo)
    {
        _repo = repo;
        Load();
    }

    /// <summary>Righe attualmente mostrate (dopo ricerca/filtro).</summary>
    public ObservableCollection<CausalePagamento> Items { get; } = new();

    /// <summary>Righe selezionate nel DataGrid (per l'eliminazione in blocco).</summary>
    public ObservableCollection<CausalePagamento> Selezionati { get; } = new();

    /// <summary>Testo di ricerca libera (sul nome).</summary>
    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>Se true mostra solo le causali attive.</summary>
    [ObservableProperty]
    private bool _soloAttive;

    /// <summary>Id della causale in editing (null = nuova). Solo stato interno.</summary>
    private int? _editId;

    /// <summary>True quando l'editor laterale è visibile.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TitoloEditor))]
    private bool _editorAperto;

    /// <summary>Campo Nome dell'editor.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editNome = string.Empty;

    /// <summary>Campo Attivo dell'editor.</summary>
    [ObservableProperty]
    private bool _editAttivo = true;

    /// <summary>Messaggio d'errore dell'editor (es. nome duplicato). Vuoto = nessuno.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasErrore))]
    private string _erroreEditor = string.Empty;

    public bool HasErrore => !string.IsNullOrEmpty(ErroreEditor);

    /// <summary>Titolo del pannello editor.</summary>
    public string TitoloEditor =>
        _editId is > 0 ? "Modifica causale" : "Nuova causale";

    partial void OnRicercaChanged(string value) => ApplyFilter();
    partial void OnSoloAttiveChanged(bool value) => ApplyFilter();

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
        IEnumerable<CausalePagamento> filtered = _all;

        if (SoloAttive)
            filtered = filtered.Where(c => c.Attivo);

        if (q.Length > 0)
            filtered = filtered.Where(c =>
                c.Nome?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false);

        Items.Clear();
        foreach (var c in filtered)
            Items.Add(c);

        Selezionati.Clear();
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }

    /// <summary>Apre l'editor su una nuova causale con i default.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditNome = string.Empty;
        EditAttivo = true;
        ErroreEditor = string.Empty;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sui valori della causale selezionata.</summary>
    [RelayCommand]
    private void Modifica(CausalePagamento? c)
    {
        if (c is null) return;
        _editId = c.Id;
        EditNome = c.Nome;
        EditAttivo = c.Attivo;
        ErroreEditor = string.Empty;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    /// <summary>Salva (insert o update) la causale in editing e ricarica.</summary>
    [RelayCommand(CanExecute = nameof(CanSalva))]
    private void Salva()
    {
        var c = new CausalePagamento
        {
            Id = _editId,
            Nome = EditNome,
            Attivo = EditAttivo,
        };

        try
        {
            if (c.Id is > 0) _repo.Update(c);
            else _repo.Insert(c);
        }
        catch (DuplicateNameException ex)
        {
            // Parità col backend: UNIQUE → "Causale già esistente". Tengo aperto
            // l'editor e mostro l'errore invece di propagare l'eccezione.
            ErroreEditor = ex.Message;
            return;
        }

        EditorAperto = false;
        Load();
    }

    private bool CanSalva() => !string.IsNullOrWhiteSpace(EditNome);

    /// <summary>Elimina una singola causale e ricarica.</summary>
    [RelayCommand]
    private void Elimina(CausalePagamento? c)
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
    public void AggiornaSelezione(IEnumerable<CausalePagamento> selezione)
    {
        Selezionati.Clear();
        foreach (var c in selezione)
            Selezionati.Add(c);
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }
}

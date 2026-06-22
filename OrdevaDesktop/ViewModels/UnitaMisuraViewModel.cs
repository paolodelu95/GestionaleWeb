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
/// Gestione anagrafica Unità di misura: lista, ricerca, CRUD su form inline,
/// selezione multipla ed eliminazione in blocco.
/// </summary>
public partial class UnitaMisuraViewModel : ViewModelBase
{
    private readonly UnitaMisuraRepository _repo;

    /// <summary>Sorgente completa (non filtrata) caricata dal DB.</summary>
    private readonly List<UnitaMisura> _all = new();

    /// <summary>Righe attualmente mostrate (dopo il filtro di ricerca).</summary>
    public ObservableCollection<UnitaMisura> Items { get; } = new();

    /// <summary>Selezione multipla per l'eliminazione in blocco.</summary>
    public ObservableCollection<UnitaMisura> SelectedItems { get; } = new();

    /// <summary>Testo del filtro di ricerca (nome o simbolo).</summary>
    [ObservableProperty]
    private string _searchText = string.Empty;

    /// <summary>Record in modifica/creazione, null quando il form è chiuso.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEditing))]
    private UnitaMisura? _editing;

    /// <summary>Campo nome del form.</summary>
    [ObservableProperty]
    private string _formNome = string.Empty;

    /// <summary>Campo simbolo del form.</summary>
    [ObservableProperty]
    private string _formSimbolo = string.Empty;

    /// <summary>Messaggio di stato (salvato/eliminato/errore).</summary>
    [ObservableProperty]
    private string? _status;

    /// <summary>True quando il form di inserimento/modifica è aperto.</summary>
    public bool IsEditing => Editing != null;

    public UnitaMisuraViewModel() : this(new UnitaMisuraRepository()) { }

    public UnitaMisuraViewModel(UnitaMisuraRepository repo)
    {
        _repo = repo;
        SelectedItems.CollectionChanged += (_, _) => DeleteSelectedCommand.NotifyCanExecuteChanged();
        Load();
    }

    partial void OnSearchTextChanged(string value) => ApplyFilter();

    /// <summary>Ricarica tutto dal database e riapplica il filtro corrente.</summary>
    [RelayCommand]
    private void Load()
    {
        _all.Clear();
        _all.AddRange(_repo.GetAll());
        ApplyFilter();
    }

    private void ApplyFilter()
    {
        var q = (SearchText ?? string.Empty).Trim();
        IEnumerable<UnitaMisura> filtered = _all;
        if (q.Length > 0)
            filtered = _all.Where(u =>
                (u.Nome?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.Simbolo?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false));

        Items.Clear();
        foreach (var u in filtered) Items.Add(u);
    }

    /// <summary>Apre il form per una nuova unità di misura.</summary>
    [RelayCommand]
    private void Add()
    {
        Editing = new UnitaMisura();
        FormNome = string.Empty;
        FormSimbolo = string.Empty;
        Status = null;
    }

    /// <summary>Apre il form sul record selezionato.</summary>
    [RelayCommand]
    private void Edit(UnitaMisura? um)
    {
        if (um == null) return;
        Editing = um;
        FormNome = um.Nome;
        FormSimbolo = um.Simbolo;
        Status = null;
    }

    private bool CanSave() => !string.IsNullOrWhiteSpace(FormNome);

    /// <summary>Salva il form (insert o update) e ricarica la lista.</summary>
    [RelayCommand(CanExecute = nameof(CanSave))]
    private void Save()
    {
        if (Editing == null) return;
        Editing.Nome = FormNome;
        Editing.Simbolo = FormSimbolo;
        try
        {
            if (Editing.Id is null) _repo.Insert(Editing);
            else _repo.Update(Editing);
            Status = "Salvato";
            Editing = null;
            Load();
        }
        catch (Exception ex) { Status = ex.Message; }
    }

    partial void OnFormNomeChanged(string value) => SaveCommand.NotifyCanExecuteChanged();

    /// <summary>Chiude il form senza salvare.</summary>
    [RelayCommand]
    private void Cancel() => Editing = null;

    /// <summary>Elimina la singola unità di misura.</summary>
    [RelayCommand]
    private void Delete(UnitaMisura? um)
    {
        if (um?.Id is null) return;
        try
        {
            _repo.Delete(um.Id.Value);
            Status = "Eliminato";
            Load();
        }
        catch (Exception ex) { Status = ex.Message; }
    }

    private bool CanDeleteSelected() => SelectedItems.Count > 0;

    /// <summary>Eliminazione in blocco dei record selezionati (una sola query).</summary>
    [RelayCommand(CanExecute = nameof(CanDeleteSelected))]
    private void DeleteSelected()
    {
        var ids = SelectedItems.Where(u => u.Id != null).Select(u => u.Id!.Value).ToArray();
        if (ids.Length == 0) return;
        try
        {
            var n = _repo.DeleteMany(ids);
            SelectedItems.Clear();
            Status = $"Eliminati {n} elementi";
            Load();
        }
        catch (Exception ex) { Status = ex.Message; }
    }
}

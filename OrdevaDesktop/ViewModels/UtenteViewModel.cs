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
/// ViewModel della gestione utenti (multi-utente). Lista filtrabile per testo /
/// ruolo / solo attivi, selezione multipla per l'eliminazione in blocco ed
/// editor inline (pannello laterale) per creare/modificare un utente. Replica la
/// scheda "Utenti" del componente Angular <c>admin</c> adattandola al contesto
/// offline single-tenant (niente colonna Tenant).
/// </summary>
public partial class UtenteViewModel : ViewModelBase
{
    private readonly UtenteRepository _repo;

    /// <summary>Sorgente completa (non filtrata) caricata dal DB.</summary>
    private readonly List<Utente> _all = new();

    public UtenteViewModel() : this(new UtenteRepository()) { }

    public UtenteViewModel(UtenteRepository repo)
    {
        _repo = repo;
        Load();
    }

    /// <summary>Righe attualmente mostrate (dopo ricerca/filtro).</summary>
    public ObservableCollection<Utente> Items { get; } = new();

    /// <summary>Righe selezionate nel DataGrid (per l'eliminazione in blocco).</summary>
    public ObservableCollection<Utente> Selezionati { get; } = new();

    /// <summary>Ruoli selezionabili nel filtro (null = "Tutti i ruoli").</summary>
    public ObservableCollection<string?> RuoliFiltro { get; } =
        new() { null, "SUPERADMIN", "ADMIN", "OPERATORE" };

    /// <summary>Ruoli assegnabili nell'editor.</summary>
    public ObservableCollection<string> Ruoli { get; } =
        new() { "SUPERADMIN", "ADMIN", "OPERATORE" };

    [ObservableProperty]
    private string _ricerca = string.Empty;

    [ObservableProperty]
    private string? _filtroRuolo;

    [ObservableProperty]
    private bool _soloAttivi;

    /// <summary>Id dell'utente in editing (null = nuovo). Solo stato interno.</summary>
    private long? _editId;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TitoloEditor))]
    [NotifyPropertyChangedFor(nameof(PasswordObbligatoria))]
    [NotifyPropertyChangedFor(nameof(PasswordLabel))]
    private bool _editorAperto;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editUsername = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editPassword = string.Empty;

    [ObservableProperty]
    private string _editNome = string.Empty;

    [ObservableProperty]
    private string _editEmail = string.Empty;

    [ObservableProperty]
    private string _editRuolo = "OPERATORE";

    [ObservableProperty]
    private bool _editAttivo = true;

    /// <summary>Messaggio d'errore dell'editor (es. username duplicato). Vuoto = nessuno.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasErrore))]
    private string _erroreEditor = string.Empty;

    public bool HasErrore => !string.IsNullOrEmpty(ErroreEditor);

    public string TitoloEditor => _editId is > 0 ? "Modifica utente" : "Nuovo utente";

    /// <summary>In creazione la password è obbligatoria; in modifica è opzionale.</summary>
    public bool PasswordObbligatoria => _editId is not > 0;

    public string PasswordLabel =>
        PasswordObbligatoria ? "Password *" : "Password (lascia vuoto per non cambiare)";

    /// <summary>Numero di righe selezionate (per la barra azioni di blocco).</summary>
    public int NumeroSelezionati => Selezionati.Count;

    partial void OnRicercaChanged(string value) => ApplyFilter();
    partial void OnFiltroRuoloChanged(string? value) => ApplyFilter();
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
        IEnumerable<Utente> filtered = _all;

        if (!string.IsNullOrWhiteSpace(FiltroRuolo))
            filtered = filtered.Where(u => u.Ruolo == FiltroRuolo);

        if (SoloAttivi)
            filtered = filtered.Where(u => u.Attivo);

        if (q.Length > 0)
            filtered = filtered.Where(u =>
                (u.Username?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.Nome?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (u.Email?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false));

        Items.Clear();
        foreach (var u in filtered)
            Items.Add(u);

        Selezionati.Clear();
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }

    /// <summary>Apre l'editor su un nuovo utente con i default.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditUsername = string.Empty;
        EditPassword = string.Empty;
        EditNome = string.Empty;
        EditEmail = string.Empty;
        EditRuolo = "OPERATORE";
        EditAttivo = true;
        ErroreEditor = string.Empty;
        OnPropertyChanged(nameof(TitoloEditor));
        OnPropertyChanged(nameof(PasswordObbligatoria));
        OnPropertyChanged(nameof(PasswordLabel));
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sui valori dell'utente passato.</summary>
    [RelayCommand]
    private void Modifica(Utente? u)
    {
        if (u is null) return;
        _editId = u.Id;
        EditUsername = u.Username;
        EditPassword = string.Empty; // mai precompilata: l'hash non lascia il DB
        EditNome = u.Nome;
        EditEmail = u.Email;
        EditRuolo = string.IsNullOrWhiteSpace(u.Ruolo) ? "OPERATORE" : u.Ruolo;
        EditAttivo = u.Attivo;
        ErroreEditor = string.Empty;
        OnPropertyChanged(nameof(TitoloEditor));
        OnPropertyChanged(nameof(PasswordObbligatoria));
        OnPropertyChanged(nameof(PasswordLabel));
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    /// <summary>Salva (insert o update) l'utente in editing e ricarica.</summary>
    [RelayCommand(CanExecute = nameof(CanSalva))]
    private void Salva()
    {
        if (!CanSalva()) return;

        var u = new Utente
        {
            Id = _editId ?? 0,
            Username = EditUsername,
            Nome = EditNome,
            Email = EditEmail,
            Ruolo = EditRuolo,
            Attivo = EditAttivo,
            NuovaPassword = EditPassword,
        };

        try
        {
            if (_editId is > 0) _repo.Update(u);
            else _repo.Insert(u);
        }
        catch (DuplicateUsernameException ex)
        {
            // Parità col backend: UNIQUE → "Username già in uso". Tengo aperto
            // l'editor e mostro l'errore invece di propagare l'eccezione.
            ErroreEditor = ex.Message;
            return;
        }
        catch (UtenteRuleException ex)
        {
            ErroreEditor = ex.Message;
            return;
        }

        EditorAperto = false;
        Load();
    }

    // Username sempre richiesto; password richiesta solo in creazione.
    private bool CanSalva() =>
        !string.IsNullOrWhiteSpace(EditUsername) &&
        (!PasswordObbligatoria || !string.IsNullOrWhiteSpace(EditPassword));

    /// <summary>Elimina un singolo utente e ricarica.</summary>
    [RelayCommand]
    private void Elimina(Utente? u)
    {
        if (u?.Id is not > 0) return;
        try
        {
            _repo.Delete(u.Id);
        }
        catch (UtenteRuleException ex)
        {
            ErroreEditor = ex.Message;
            EditorAperto = true; // mostro l'errore nel pannello
            return;
        }
        if (_editId == u.Id) EditorAperto = false;
        Load();
    }

    /// <summary>Elimina in blocco le righe selezionate (regole applicate per id).</summary>
    [RelayCommand(CanExecute = nameof(CanEliminaSelezionati))]
    private void EliminaSelezionati()
    {
        var ids = Selezionati.Where(u => u.Id > 0).Select(u => u.Id).ToList();
        if (ids.Count == 0) return;
        try
        {
            _repo.DeleteMany(ids);
        }
        catch (UtenteRuleException ex)
        {
            ErroreEditor = ex.Message;
            EditorAperto = true;
            Load(); // ricarico: alcune eliminazioni potrebbero essere già passate
            return;
        }
        if (_editId is not null && ids.Contains(_editId.Value)) EditorAperto = false;
        Load();
    }

    private bool CanEliminaSelezionati() => Selezionati.Count > 0;

    /// <summary>Chiamato dalla View quando cambia la selezione del DataGrid.</summary>
    public void AggiornaSelezione(IEnumerable<Utente> selezione)
    {
        Selezionati.Clear();
        foreach (var u in selezione)
            Selezionati.Add(u);
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }
}

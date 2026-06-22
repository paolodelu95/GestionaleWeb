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
/// Gestione delle note rapide: lista filtrabile, editor inline (testo + ordine),
/// selezione multipla ed eliminazione in blocco. Replica le regole della dialog
/// Angular (NotaRapidaDialogComponent in impostazioni): testo obbligatorio (trim),
/// ordine intero con default 0. Le note appaiono nel menu "Aggiungi nota" dei
/// documenti.
/// </summary>
public partial class NotaRapidaViewModel : ViewModelBase
{
    private readonly NotaRapidaRepository _repo;

    /// <summary>Sorgente completa (non filtrata); la lista mostrata è <see cref="Items"/>.</summary>
    private readonly List<NotaRapida> _all = new();

    /// <summary>Note rapide attualmente visibili (dopo il filtro di ricerca).</summary>
    public ObservableCollection<NotaRapida> Items { get; } = new();

    /// <summary>Note rapide selezionate nella griglia (per l'eliminazione in blocco).</summary>
    public ObservableCollection<NotaRapida> Selezionate { get; } = new();

    /// <summary>Testo di ricerca; filtra per testo della nota.</summary>
    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>Nota attualmente selezionata in griglia (riga singola).</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ModificaCommand))]
    [NotifyCanExecuteChangedFor(nameof(EliminaCommand))]
    private NotaRapida? _selezionata;

    // ── Stato dell'editor inline ────────────────────────────────────────────

    /// <summary>True quando il pannello di modifica/inserimento è aperto.</summary>
    [ObservableProperty]
    private bool _editorAperto;

    /// <summary>Titolo del pannello editor.</summary>
    [ObservableProperty]
    private string _editorTitolo = "Nuova nota rapida";

    /// <summary>Testo in modifica (obbligatorio).</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editTesto = string.Empty;

    /// <summary>
    /// Ordine in modifica, come stringa per il TextBox. Vuoto/non numerico → 0,
    /// coerente con il default del backend (<c>ordine</c> DEFAULT 0).
    /// </summary>
    [ObservableProperty]
    private string _editOrdine = "0";

    /// <summary>Id della nota in modifica (null = nuovo inserimento).</summary>
    private long? _editId;

    public NotaRapidaViewModel() : this(new NotaRapidaRepository()) { }

    public NotaRapidaViewModel(NotaRapidaRepository repo)
    {
        _repo = repo;
        Carica();
    }

    /// <summary>(Ri)carica le note rapide dal database.</summary>
    public void Carica()
    {
        _all.Clear();
        _all.AddRange(_repo.GetAll());
        ApplicaFiltro();
    }

    partial void OnRicercaChanged(string value) => ApplicaFiltro();

    /// <summary>Filtra la lista in base al testo di ricerca (per testo, case-insensitive).</summary>
    private void ApplicaFiltro()
    {
        var q = Ricerca?.Trim();
        IEnumerable<NotaRapida> filtrate = _all;
        if (!string.IsNullOrEmpty(q))
            filtrate = _all.Where(n =>
                n.Testo.Contains(q, System.StringComparison.OrdinalIgnoreCase));

        Items.Clear();
        foreach (var n in filtrate)
            Items.Add(n);
    }

    // ── Comandi ───────────────────────────────────────────────────────────────

    /// <summary>Apre l'editor per una nuova nota rapida.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditTesto = string.Empty;
        EditOrdine = "0";
        EditorTitolo = "Nuova nota rapida";
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sulla nota selezionata.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezionata))]
    private void Modifica()
    {
        if (Selezionata is null) return;
        _editId = Selezionata.Id;
        EditTesto = Selezionata.Testo;
        EditOrdine = Selezionata.Ordine.ToString(CultureInfo.InvariantCulture);
        EditorTitolo = "Modifica nota rapida";
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    /// <summary>Salva (insert o update) la nota in editor. Testo obbligatorio.</summary>
    [RelayCommand(CanExecute = nameof(PuoSalvare))]
    private void Salva()
    {
        var testo = EditTesto.Trim();
        if (testo.Length == 0) return; // parità con il 400 "testo richiesto" del backend

        // Ordine: parse tollerante, default 0 (come Value::as_i64().unwrap_or(0)).
        long ordine = long.TryParse(EditOrdine?.Trim(), NumberStyles.Integer,
            CultureInfo.InvariantCulture, out var o) ? o : 0;

        var entita = new NotaRapida
        {
            Id = _editId ?? 0,
            Testo = testo,
            Ordine = ordine,
        };

        if (_editId is null)
            entita.Id = _repo.Insert(entita);
        else
            _repo.Update(entita);

        EditorAperto = false;
        Carica();
        Selezionata = Items.FirstOrDefault(n => n.Id == entita.Id);
    }

    /// <summary>Elimina la nota selezionata.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezionata))]
    private void Elimina()
    {
        if (Selezionata is null) return;
        _repo.Delete(Selezionata.Id);
        Carica();
    }

    /// <summary>Elimina in blocco tutte le note selezionate.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezioneMultipla))]
    private void EliminaSelezionate()
    {
        var ids = Selezionate.Select(n => n.Id).ToList();
        if (ids.Count == 0) return;
        _repo.DeleteMany(ids);
        Selezionate.Clear();
        Carica();
    }

    // ── Predicati CanExecute ──────────────────────────────────────────────────

    private bool HasSelezionata() => Selezionata is not null;
    private bool HasSelezioneMultipla() => Selezionate.Count > 0;
    private bool PuoSalvare() => !string.IsNullOrWhiteSpace(EditTesto);

    /// <summary>Da richiamare quando cambia la selezione multipla in griglia.</summary>
    public void NotificaSelezioneCambiata() => EliminaSelezionateCommand.NotifyCanExecuteChanged();
}

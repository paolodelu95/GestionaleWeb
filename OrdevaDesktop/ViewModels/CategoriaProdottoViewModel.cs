using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Gestione delle categorie prodotto: lista filtrabile, editor inline
/// (nome + IVA predefinita), selezione multipla ed eliminazione in blocco.
/// Replica le regole della dialog Angular: nome obbligatorio (trim), opzioni IVA
/// limitate alle aliquote attive di categoria "Imponibile".
/// </summary>
public partial class CategoriaProdottoViewModel : ViewModelBase
{
    private readonly CategoriaProdottoRepository _repo;

    /// <summary>Sorgente completa (non filtrata); la lista mostrata è <see cref="Items"/>.</summary>
    private readonly List<CategoriaProdotto> _all = new();

    /// <summary>Categorie attualmente visibili (dopo il filtro di ricerca).</summary>
    public ObservableCollection<CategoriaProdotto> Items { get; } = new();

    /// <summary>Categorie selezionate nella griglia (per l'eliminazione in blocco).</summary>
    public ObservableCollection<CategoriaProdotto> Selezionate { get; } = new();

    /// <summary>Opzioni della tendina "IVA predefinita" (aliquote Imponibili attive).</summary>
    public ObservableCollection<AliquotaIva> AliquoteImponibili { get; } = new();

    /// <summary>Testo di ricerca; filtra per nome.</summary>
    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>Categoria attualmente selezionata in griglia (riga singola).</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ModificaCommand))]
    [NotifyCanExecuteChangedFor(nameof(EliminaCommand))]
    private CategoriaProdotto? _selezionata;

    // ── Stato dell'editor inline ────────────────────────────────────────────

    /// <summary>True quando il pannello di modifica/inserimento è aperto.</summary>
    [ObservableProperty]
    private bool _editorAperto;

    /// <summary>Titolo del pannello editor.</summary>
    [ObservableProperty]
    private string _editorTitolo = "Nuova categoria";

    /// <summary>Nome in modifica.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editNome = string.Empty;

    /// <summary>IVA predefinita scelta (null = nessuna).</summary>
    [ObservableProperty]
    private AliquotaIva? _editAliquota;

    /// <summary>Id della categoria in modifica (null = nuovo inserimento).</summary>
    private long? _editId;

    public CategoriaProdottoViewModel() : this(new CategoriaProdottoRepository()) { }

    public CategoriaProdottoViewModel(CategoriaProdottoRepository repo)
    {
        _repo = repo;
        Carica();
    }

    /// <summary>(Ri)carica categorie e opzioni IVA dal database.</summary>
    public void Carica()
    {
        _all.Clear();
        _all.AddRange(_repo.GetAll());

        AliquoteImponibili.Clear();
        foreach (var a in _repo.GetAliquoteImponibili())
            AliquoteImponibili.Add(a);

        ApplicaFiltro();
    }

    partial void OnRicercaChanged(string value) => ApplicaFiltro();

    /// <summary>Filtra la lista in base al testo di ricerca (per nome, case-insensitive).</summary>
    private void ApplicaFiltro()
    {
        var q = Ricerca?.Trim();
        IEnumerable<CategoriaProdotto> filtrate = _all;
        if (!string.IsNullOrEmpty(q))
            filtrate = _all.Where(c =>
                c.Nome.Contains(q, System.StringComparison.OrdinalIgnoreCase));

        Items.Clear();
        foreach (var c in filtrate)
            Items.Add(c);
    }

    // ── Comandi ───────────────────────────────────────────────────────────────

    /// <summary>Apre l'editor per una nuova categoria.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditNome = string.Empty;
        EditAliquota = null;
        EditorTitolo = "Nuova categoria";
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sulla categoria selezionata.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezionata))]
    private void Modifica()
    {
        if (Selezionata is null) return;
        _editId = Selezionata.Id;
        EditNome = Selezionata.Nome;
        EditAliquota = AliquoteImponibili.FirstOrDefault(a => a.Id == Selezionata.AliquotaIvaId);
        EditorTitolo = "Modifica categoria";
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    /// <summary>Salva (insert o update) la categoria in editor. Nome obbligatorio.</summary>
    [RelayCommand(CanExecute = nameof(PuoSalvare))]
    private void Salva()
    {
        var nome = EditNome.Trim();
        if (nome.Length == 0) return;

        var entita = new CategoriaProdotto
        {
            Id = _editId,
            Nome = nome,
            AliquotaIvaId = EditAliquota?.Id,
        };

        if (_editId is null)
            entita.Id = _repo.Insert(entita);
        else
            _repo.Update(entita);

        EditorAperto = false;
        Carica();
        Selezionata = Items.FirstOrDefault(c => c.Id == entita.Id);
    }

    /// <summary>Elimina la categoria selezionata.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezionata))]
    private void Elimina()
    {
        if (Selezionata?.Id is not long id) return;
        _repo.Delete(id);
        Carica();
    }

    /// <summary>Elimina in blocco tutte le categorie selezionate.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezioneMultipla))]
    private void EliminaSelezionate()
    {
        var ids = Selezionate.Where(c => c.Id is not null).Select(c => c.Id!.Value).ToList();
        if (ids.Count == 0) return;
        _repo.DeleteMany(ids);
        Selezionate.Clear();
        Carica();
    }

    // ── Predicati CanExecute ──────────────────────────────────────────────────

    private bool HasSelezionata() => Selezionata is not null;
    private bool HasSelezioneMultipla() => Selezionate.Count > 0;
    private bool PuoSalvare() => !string.IsNullOrWhiteSpace(EditNome);

    /// <summary>Da richiamare quando cambia la selezione multipla in griglia.</summary>
    public void NotificaSelezioneCambiata() => EliminaSelezionateCommand.NotifyCanExecuteChanged();
}

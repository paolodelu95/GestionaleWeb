using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// ViewModel dell'anagrafica "Tipi di Pagamento". Espone la lista filtrabile,
/// la selezione multipla per l'eliminazione in blocco e un editor inline
/// (pannello laterale) per creare/modificare un tipo.
/// </summary>
public partial class TipoPagamentoViewModel : ViewModelBase
{
    private readonly TipoPagamentoRepository _repo;

    /// <summary>Sorgente completa (non filtrata) caricata dal DB.</summary>
    private readonly List<TipoPagamento> _all = new();

    public TipoPagamentoViewModel() : this(new TipoPagamentoRepository()) { }

    public TipoPagamentoViewModel(TipoPagamentoRepository repo)
    {
        _repo = repo;
        Load();
    }

    /// <summary>Righe attualmente mostrate (dopo ricerca/filtro).</summary>
    public ObservableCollection<TipoPagamento> Items { get; } = new();

    /// <summary>Righe selezionate nel DataGrid (per l'eliminazione in blocco).</summary>
    public ObservableCollection<TipoPagamento> Selezionati { get; } = new();

    /// <summary>Testo di ricerca libera (nome / conto / etichetta scadenza).</summary>
    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>Se true mostra solo i tipi attivi.</summary>
    [ObservableProperty]
    private bool _soloAttivi;

    /// <summary>Id del tipo in editing (null = nuovo). Solo stato interno.</summary>
    private int? _editId;

    /// <summary>True quando l'editor laterale è visibile.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TitoloEditor))]
    private bool _editorAperto;

    /// <summary>Campo Nome dell'editor.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editNome = string.Empty;

    /// <summary>Campo Conto dell'editor (BANCA/CASSA).</summary>
    [ObservableProperty]
    private string _editConto = "BANCA";

    /// <summary>Campo Giorni di scadenza dell'editor.</summary>
    [ObservableProperty]
    private int _editGiorniScadenza;

    /// <summary>Campo Fine mese dell'editor.</summary>
    [ObservableProperty]
    private bool _editFineMese;

    /// <summary>Campo Pagamento immediato dell'editor.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(EditFineMeseAbilitato))]
    [NotifyPropertyChangedFor(nameof(EditGiorniAbilitato))]
    private bool _editImmediato;

    /// <summary>Campo Attivo dell'editor.</summary>
    [ObservableProperty]
    private bool _editAttivo = true;

    /// <summary>I "giorni scadenza" sono modificabili solo se non immediato.</summary>
    public bool EditGiorniAbilitato => !EditImmediato;

    /// <summary>"Fine mese" è abilitato solo con giorni &gt; 0 e non immediato.</summary>
    public bool EditFineMeseAbilitato => !EditImmediato && EditGiorniScadenza > 0;

    /// <summary>Titolo del pannello editor.</summary>
    public string TitoloEditor =>
        _editId is > 0 ? "Modifica tipo pagamento" : "Nuovo tipo pagamento";

    /// <summary>Conti disponibili nella combo dell'editor.</summary>
    public IReadOnlyList<string> Conti { get; } = new[] { "BANCA", "CASSA" };

    partial void OnRicercaChanged(string value) => ApplyFilter();
    partial void OnSoloAttiviChanged(bool value) => ApplyFilter();

    partial void OnEditGiorniScadenzaChanged(int value)
    {
        if (value < 0) { EditGiorniScadenza = 0; return; }
        OnPropertyChanged(nameof(EditFineMeseAbilitato));
        if (value == 0) EditFineMese = false;
    }

    /// <summary>
    /// Regola del web (onImmediatoChange): selezionando "immediato" i giorni e
    /// il fine-mese si azzerano subito.
    /// </summary>
    partial void OnEditImmediatoChanged(bool value)
    {
        if (value)
        {
            EditGiorniScadenza = 0;
            EditFineMese = false;
        }
    }

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
        IEnumerable<TipoPagamento> filtered = _all;

        if (SoloAttivi)
            filtered = filtered.Where(t => t.Attivo);

        if (q.Length > 0)
            filtered = filtered.Where(t =>
                (t.Nome?.Contains(q, System.StringComparison.OrdinalIgnoreCase) ?? false) ||
                (t.Conto?.Contains(q, System.StringComparison.OrdinalIgnoreCase) ?? false) ||
                t.ScadenzaLabel.Contains(q, System.StringComparison.OrdinalIgnoreCase));

        Items.Clear();
        foreach (var t in filtered)
            Items.Add(t);

        Selezionati.Clear();
    }

    /// <summary>Apre l'editor su un nuovo tipo con i default del web.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditNome = string.Empty;
        EditConto = "BANCA";
        EditGiorniScadenza = 0;
        EditFineMese = false;
        EditImmediato = false;
        EditAttivo = true;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sui valori del tipo selezionato.</summary>
    [RelayCommand]
    private void Modifica(TipoPagamento? t)
    {
        if (t is null) return;
        _editId = t.Id;
        EditNome = t.Nome;
        EditConto = string.IsNullOrWhiteSpace(t.Conto) ? "BANCA" : t.Conto;
        EditGiorniScadenza = t.GiorniScadenza;
        EditFineMese = t.FineMese;
        EditImmediato = t.Immediato;
        EditAttivo = t.Attivo;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    /// <summary>Salva (insert o update) il tipo in editing e ricarica.</summary>
    [RelayCommand(CanExecute = nameof(CanSalva))]
    private void Salva()
    {
        var t = new TipoPagamento
        {
            Id = _editId,
            Nome = EditNome,
            Conto = EditConto,
            GiorniScadenza = EditGiorniScadenza,
            FineMese = EditFineMese,
            Immediato = EditImmediato,
            Attivo = EditAttivo,
        };

        if (t.Id is > 0) _repo.Update(t);
        else _repo.Insert(t);

        EditorAperto = false;
        Load();
    }

    private bool CanSalva() => !string.IsNullOrWhiteSpace(EditNome);

    /// <summary>Elimina un singolo tipo e ricarica.</summary>
    [RelayCommand]
    private void Elimina(TipoPagamento? t)
    {
        if (t?.Id is not > 0) return;
        _repo.Delete(t.Id.Value);
        if (_editId == t.Id) EditorAperto = false;
        Load();
    }

    /// <summary>Elimina in blocco tutte le righe selezionate (una sola query).</summary>
    [RelayCommand(CanExecute = nameof(CanEliminaSelezionati))]
    private void EliminaSelezionati()
    {
        var ids = Selezionati.Where(t => t.Id is > 0).Select(t => t.Id!.Value).ToList();
        if (ids.Count == 0) return;
        _repo.DeleteMany(ids);
        if (_editId is not null && ids.Contains(_editId.Value)) EditorAperto = false;
        Load();
    }

    private bool CanEliminaSelezionati() => Selezionati.Count > 0;

    /// <summary>Numero di righe selezionate (per la barra azioni di blocco).</summary>
    public int NumeroSelezionati => Selezionati.Count;

    /// <summary>Chiamato dalla View quando cambia la selezione del DataGrid.</summary>
    public void AggiornaSelezione(IEnumerable<TipoPagamento> selezione)
    {
        Selezionati.Clear();
        foreach (var t in selezione)
            Selezionati.Add(t);
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }
}

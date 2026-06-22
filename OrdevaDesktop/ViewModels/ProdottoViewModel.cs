using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Anagrafica prodotti: lista filtrabile, ricerca testuale, filtri
/// categoria/sotto-soglia/margine, selezione multipla ed eliminazione in blocco.
/// Replica il comportamento del componente Angular <c>prodotti</c>.
/// </summary>
public partial class ProdottoViewModel : ViewModelBase
{
    private readonly ProdottoRepository _repo = new();

    /// <summary>Tutti i prodotti caricati (sorgente non filtrata).</summary>
    private readonly List<Prodotto> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Prodotto> Prodotti { get; } = new();

    /// <summary>Categorie distinte per il combo del filtro (con "Tutte" = null).</summary>
    public ObservableCollection<string?> Categorie { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Prodotto> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string? filtroCategoria;
    [ObservableProperty] private bool filtroSottoSoglia;
    [ObservableProperty] private bool filtroMargineBasso;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;
    public int SottoSogliaCount => _tutti.Count(p => p.IsSottoSoglia);

    public ProdottoViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroCategoriaChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroSottoSogliaChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroMargineBassoChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());

            Categorie.Clear();
            Categorie.Add(null); // "Tutte le categorie"
            foreach (var c in _tutti.Select(p => p.Categoria)
                         .Where(c => !string.IsNullOrWhiteSpace(c))
                         .Distinct()
                         .OrderBy(c => c))
                Categorie.Add(c);

            Selezionati.Clear();
            ApplicaFiltri();
            OnPropertyChanged(nameof(SottoSogliaCount));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Prodotto> q = _tutti;

        if (!string.IsNullOrWhiteSpace(FiltroCategoria))
            q = q.Where(p => p.Categoria == FiltroCategoria);

        if (FiltroSottoSoglia)
            q = q.Where(p => p.IsSottoSoglia);

        if (FiltroMargineBasso)
            q = q.Where(p => p.MarginePerc is < 15m);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(p =>
                p.Nome.ToLowerInvariant().Contains(t) ||
                p.Categoria.ToLowerInvariant().Contains(t) ||
                p.Codice.ToLowerInvariant().Contains(t) ||
                p.CodiceFornitore.ToLowerInvariant().Contains(t) ||
                p.Barcode.ToLowerInvariant().Contains(t) ||
                p.Descrizione.ToLowerInvariant().Contains(t));
        }

        Prodotti.Clear();
        foreach (var p in q)
            Prodotti.Add(p);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito 4 riapplicazioni: sospendo i filtri, azzero i campi, ricalcolo una volta sola.
        _sospendiFiltri = true;
        FiltroCategoria = null;
        FiltroSottoSoglia = false;
        FiltroMargineBasso = false;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo prodotto base. La modifica di dettaglio (form completo,
    /// varianti, fornitori) sarà cablata dalla fase di integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuovo = new Prodotto { Nome = "Nuovo prodotto", UnitaMisura = "pz", Iva = 22m };
        nuovo.Id = _repo.Insert(nuovo);
        // Come l'originale Angular: dopo il reload la selezione viene azzerata
        // (Carica() svuota Selezionati). Non pre-selezioniamo qui perché la
        // DataGrid è la sorgente di verità della selezione e scriverla dal VM
        // creerebbe uno stato fantasma (comandi abilitati senza riga evidenziata).
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione). Qui ricarichiamo il
        // dettaglio completo dell'elemento selezionato.
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
        var ids = Selezionati.Select(p => p.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
    }
}

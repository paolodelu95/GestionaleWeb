using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Configurazioni e-commerce (WooCommerce/Shopify): lista filtrabile, ricerca
/// testuale, filtri provider/solo-attive, selezione multipla ed eliminazione in
/// blocco. La sync vera richiede rete e non è disponibile in offline (vedi
/// backend); qui si gestisce solo la configurazione locale.
/// </summary>
public partial class EcommerceViewModel : ViewModelBase
{
    private readonly EcommerceRepository _repo = new();

    /// <summary>Tutte le config caricate (sorgente non filtrata).</summary>
    private readonly List<EcommerceConfig> _tutte = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<EcommerceConfig> Configs { get; } = new();

    /// <summary>Provider distinti per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Providers { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<EcommerceConfig> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string? filtroProvider;
    [ObservableProperty] private bool filtroSoloAttive;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;
    public int AttiveCount => _tutte.Count(c => c.Attivo);

    public EcommerceViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroProviderChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroSoloAttiveChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutte.Clear();
            _tutte.AddRange(_repo.GetAll());

            Providers.Clear();
            Providers.Add(null); // "Tutti i provider"
            foreach (var p in _tutte.Select(c => c.Provider)
                         .Where(p => !string.IsNullOrWhiteSpace(p))
                         .Distinct()
                         .OrderBy(p => p))
                Providers.Add(p);

            Selezionati.Clear();
            ApplicaFiltri();
            OnPropertyChanged(nameof(AttiveCount));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<EcommerceConfig> q = _tutte;

        if (!string.IsNullOrWhiteSpace(FiltroProvider))
            q = q.Where(c => c.Provider == FiltroProvider);

        if (FiltroSoloAttive)
            q = q.Where(c => c.Attivo);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(c =>
                c.Nome.ToLowerInvariant().Contains(t) ||
                c.BaseUrl.ToLowerInvariant().Contains(t) ||
                c.Provider.ToLowerInvariant().Contains(t));
        }

        Configs.Clear();
        foreach (var c in q)
            Configs.Add(c);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo, azzero, ricalcolo una volta sola.
        _sospendiFiltri = true;
        FiltroProvider = null;
        FiltroSoloAttive = false;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea una configurazione base. Il form completo (provider, URL, credenziali,
    /// mapping) sarà cablato dalla fase di integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuova = new EcommerceConfig
        {
            Provider = EcommerceProvider.WooCommerce,
            Nome = "Nuova configurazione",
            BaseUrl = "https://",
            Attivo = true,
        };
        nuova.Id = _repo.Insert(nuova);
        // Come l'originale: dopo il reload la selezione viene azzerata. Non
        // pre-selezioniamo (la DataGrid è la sorgente di verità della selezione).
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione): ricarico il dettaglio
        // completo della config selezionata. Quando il dialog sarà cablato:
        // aprilo con `dettaglio`, poi Update + Carica.
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetById(sel.Id);
        if (dettaglio == null) return;
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(c => c.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
    }
}

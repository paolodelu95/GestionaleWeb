using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Anagrafica clienti: lista filtrabile, ricerca testuale, filtri insight
/// (dormienti / con insoluti), selezione multipla ed eliminazione in blocco.
/// Replica il comportamento del componente Angular <c>clienti</c>.
/// </summary>
public partial class ClienteViewModel : ViewModelBase
{
    private readonly ClienteRepository _repo = new();

    /// <summary>Tutti i clienti caricati (sorgente non filtrata).</summary>
    private readonly List<Cliente> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Cliente> Clienti { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Cliente> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private bool filtroDormienti;
    [ObservableProperty] private bool filtroInsoluti;
    [ObservableProperty] private bool occupato;

    /// <summary>Messaggio di errore/esito mostrato in cima alla lista.</summary>
    [ObservableProperty] private string? messaggio;

    public bool HasSelezione => NumSelezionati > 0;
    public int TotaleClienti => _tutti.Count;
    public int InsolutiCount => _tutti.Count(c => c.HasInsoluti);

    public ClienteViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) => ApplicaFiltri();
    partial void OnFiltroDormientiChanged(bool value) => ApplicaFiltri();
    partial void OnFiltroInsolutiChanged(bool value) => ApplicaFiltri();

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());
            Selezionati.Clear();
            ApplicaFiltri();
            OnPropertyChanged(nameof(TotaleClienti));
            OnPropertyChanged(nameof(InsolutiCount));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri insight.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Cliente> q = _tutti;

        if (FiltroDormienti)
            q = q.Where(c => c.IsDormiente);

        if (FiltroInsoluti)
            q = q.Where(c => c.HasInsoluti);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(c =>
                c.RagioneSociale.ToLowerInvariant().Contains(t) ||
                c.Email.ToLowerInvariant().Contains(t) ||
                c.Telefono.ToLowerInvariant().Contains(t) ||
                c.CodiceFiscale.ToLowerInvariant().Contains(t) ||
                c.PIva.ToLowerInvariant().Contains(t) ||
                c.IndirizzoCompatto.ToLowerInvariant().Contains(t));
        }

        Clienti.Clear();
        foreach (var c in q)
            Clienti.Add(c);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Azzero i campi senza riapplicare 3 volte, poi una sola ApplicaFiltri.
        filtroDormienti = false; OnPropertyChanged(nameof(FiltroDormienti));
        filtroInsoluti = false; OnPropertyChanged(nameof(FiltroInsoluti));
        ricerca = ""; OnPropertyChanged(nameof(Ricerca));
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo cliente base. Il form completo (anagrafica, fiscale,
    /// indirizzi) sarà cablato dalla fase di integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        Messaggio = null;
        var nuovo = new Cliente { RagioneSociale = "Nuovo cliente", Stato = "Italia", TipoSoggetto = "PRIVATO" };
        nuovo.Id = _repo.Insert(nuovo);
        Carica();
        Seleziona(nuovo.Id);
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione): qui carichiamo il
        // dettaglio completo (con indirizzi) dell'elemento selezionato.
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
        Messaggio = null;
        var ids = Selezionati.Select(c => c.Id).ToList();
        try
        {
            _repo.DeleteMany(ids);
            Carica();
        }
        catch (ClienteHaDocumentiException ex)
        {
            // Parità col 409 del backend: nessuna cancellazione, messaggio coi conteggi.
            Messaggio = $"Impossibile eliminare: alcuni clienti hanno {ex.Riepilogo} collegati.";
        }
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
    }

    private void Seleziona(long id)
    {
        var c = Clienti.FirstOrDefault(x => x.Id == id);
        if (c == null) return;
        Selezionati.Clear();
        Selezionati.Add(c);
    }
}

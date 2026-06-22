using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Agenda appuntamenti: lista filtrabile per intervallo di date, ricerca
/// testuale, filtro per stato; selezione multipla con eliminazione in blocco e
/// cambio stato veloce (Completa / Annulla). Replica il comportamento del
/// componente Angular <c>agenda</c> (sezione appuntamenti).
/// </summary>
public partial class AppuntamentoViewModel : ViewModelBase
{
    private readonly AppuntamentoRepository _repo;

    /// <summary>Tutti gli appuntamenti caricati per l'anno (sorgente non filtrata).</summary>
    private readonly List<Appuntamento> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Appuntamento> Appuntamenti { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Appuntamento> Selezionati { get; } = new();

    /// <summary>Valori di stato per il filtro (vuoto = tutti).</summary>
    public IReadOnlyList<string> StatiFiltro { get; } =
        new[] { "", "PIANIFICATO", "COMPLETATO", "ANNULLATO" };

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string filtroStato = "";
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante azzeramenti multipli, per filtrare una volta sola.</summary>
    private bool _sospendiFiltri;

    /// <summary>Messaggio di errore/esito mostrato in cima alla lista.</summary>
    [ObservableProperty] private string? messaggio;

    public bool HasSelezione => NumSelezionati > 0;
    public int TotaleAppuntamenti => _tutti.Count;
    public int PianificatiCount => _tutti.Count(a => a.Stato == "PIANIFICATO");

    public AppuntamentoViewModel() : this(new AppuntamentoRepository()) { }

    public AppuntamentoViewModel(AppuntamentoRepository repo)
    {
        _repo = repo;
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroStatoChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }

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
            OnPropertyChanged(nameof(TotaleAppuntamenti));
            OnPropertyChanged(nameof(PianificatiCount));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtro stato.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Appuntamento> q = _tutti;

        if (!string.IsNullOrEmpty(FiltroStato))
            q = q.Where(a => a.Stato == FiltroStato);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(a =>
                a.Titolo.ToLowerInvariant().Contains(t) ||
                a.Descrizione.ToLowerInvariant().Contains(t) ||
                a.Luogo.ToLowerInvariant().Contains(t) ||
                a.ClienteNome.ToLowerInvariant().Contains(t) ||
                a.FornitoreNome.ToLowerInvariant().Contains(t));
        }

        Appuntamenti.Clear();
        foreach (var a in q)
            Appuntamenti.Add(a);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Azzero entrambi i criteri sospendendo i filtri, poi applico una volta sola.
        _sospendiFiltri = true;
        FiltroStato = "";
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un appuntamento base (oggi alle 09:00). Il form completo (orari,
    /// controparte, colore, promemoria) sarà cablato dall'integrazione tramite
    /// dialog; qui rispettiamo i campi obbligatori titolo+inizio del backend.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        Messaggio = null;
        var oggi = System.DateTime.Now.ToString("yyyy-MM-dd");
        var nuovo = new Appuntamento
        {
            Titolo = "Nuovo appuntamento",
            Inizio = $"{oggi}T09:00:00",
            Fine = $"{oggi}T10:00:00",
            Colore = "#3b82f6",
            Stato = "PIANIFICATO",
        };
        nuovo.Id = _repo.Insert(nuovo);
        Carica();
        Seleziona(nuovo.Id);
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione): carichiamo il dettaglio
        // completo dell'elemento selezionato.
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
        var ids = Selezionati.Select(a => a.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    /// <summary>Segna come COMPLETATO gli appuntamenti selezionati (parità cambiaStatoApp).</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Completa() => CambiaStatoSelezionati("COMPLETATO");

    /// <summary>Segna come ANNULLATO gli appuntamenti selezionati.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Annulla() => CambiaStatoSelezionati("ANNULLATO");

    private void CambiaStatoSelezionati(string stato)
    {
        if (NumSelezionati == 0) return;
        Messaggio = null;
        foreach (var id in Selezionati.Select(a => a.Id).ToList())
            _repo.CambiaStato(id, stato);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        CompletaCommand.NotifyCanExecuteChanged();
        AnnullaCommand.NotifyCanExecuteChanged();
    }

    private void Seleziona(long id)
    {
        var a = Appuntamenti.FirstOrDefault(x => x.Id == id);
        if (a == null) return;
        Selezionati.Clear();
        Selezionati.Add(a);
    }
}

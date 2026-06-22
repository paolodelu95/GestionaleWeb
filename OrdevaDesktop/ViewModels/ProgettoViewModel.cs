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
/// Timesheet · Progetti/commesse: lista progetti filtrabile (ricerca testuale +
/// filtro stato), selezione multipla ed eliminazione in blocco, generazione
/// fattura da timesheet; secondo elenco con le voci, filtrabili per progetto.
/// Replica il componente Angular <c>timesheet</c> (e routes/timesheet.rs).
/// </summary>
public partial class ProgettoViewModel : ViewModelBase
{
    private readonly ProgettoRepository _repo = new();
    private readonly ClienteRepository _clientiRepo = new();

    /// <summary>Tutti i progetti caricati (sorgente non filtrata).</summary>
    private readonly List<Progetto> _tutti = new();

    /// <summary>Lista progetti mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Progetto> Progetti { get; } = new();

    /// <summary>Voci timesheet mostrate (filtrate per progetto se impostato).</summary>
    public ObservableCollection<TimesheetVoce> Voci { get; } = new();

    /// <summary>Clienti per il combo del progetto (con "Nessuno" = null).</summary>
    public ObservableCollection<Cliente?> Clienti { get; } = new();

    /// <summary>Stati selezionabili per il filtro (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Stati { get; } = new() { null, "APERTO", "IN_CORSO", "SOSPESO", "CHIUSO" };

    /// <summary>Progetti selezionati nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Progetto> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string? filtroStato;

    /// <summary>Progetto su cui filtrare le voci timesheet (null = tutte).</summary>
    [ObservableProperty] private Progetto? filtroVociProgetto;

    [ObservableProperty] private bool occupato;

    /// <summary>Esito/errore dell'ultima operazione (es. genera fattura), per la UI.</summary>
    [ObservableProperty] private string messaggio = "";

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    public ProgettoViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroStatoChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroVociProgettoChanged(Progetto? value) { if (!_sospendiFiltri) CaricaVoci(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());

            Clienti.Clear();
            Clienti.Add(null); // "Nessun cliente"
            foreach (var c in _clientiRepo.GetAll())
                Clienti.Add(c);

            Selezionati.Clear();
            ApplicaFiltri();
            CaricaVoci();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricarica le voci timesheet rispettando il filtro progetto.</summary>
    private void CaricaVoci()
    {
        Voci.Clear();
        foreach (var v in _repo.GetVoci(FiltroVociProgetto?.Id))
            Voci.Add(v);
    }

    /// <summary>Ricalcola la lista progetti visibile combinando ricerca + filtro stato.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Progetto> q = _tutti;

        if (!string.IsNullOrWhiteSpace(FiltroStato))
            q = q.Where(p => p.Stato == FiltroStato);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(p =>
                p.Nome.ToLowerInvariant().Contains(t) ||
                p.Descrizione.ToLowerInvariant().Contains(t) ||
                p.ClienteNome.ToLowerInvariant().Contains(t) ||
                p.Stato.ToLowerInvariant().Contains(t) ||
                p.Note.ToLowerInvariant().Contains(t));
        }

        Progetti.Clear();
        foreach (var p in q)
            Progetti.Add(p);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        FiltroStato = null;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un progetto base. Il form di dettaglio completo (cliente, date,
    /// tariffa, budget) sarà cablato dall'integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuovo = new Progetto { Nome = "Nuovo progetto", Stato = "APERTO" };
        nuovo.Id = _repo.Insert(nuovo);
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione): carica il dettaglio completo.
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

    /// <summary>
    /// Genera la fattura dalle ore non fatturate del progetto selezionato.
    /// Abilitato solo se il singolo progetto selezionato è fatturabile (ore da
    /// fatturare, cliente e tariffa &gt; 0), come i controlli del backend.
    /// </summary>
    [RelayCommand(CanExecute = nameof(PuoGenerareFattura))]
    private void GeneraFattura()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        try
        {
            var esito = _repo.GeneraFattura(sel.Id);
            Messaggio = $"Fattura {esito.Numero} creata ({esito.OreTotali} h, € {esito.Importo:0.00})";
            Carica();
        }
        catch (Exception ex)
        {
            Messaggio = ex.Message;
        }
    }

    private bool PuoGenerareFattura()
        => NumSelezionati == 1 && (Selezionati.FirstOrDefault()?.PuoFatturare ?? false);

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        GeneraFatturaCommand.NotifyCanExecuteChanged();
    }
}

using System;
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
/// Timesheet · voci (ore lavorate): lista filtrabile delle voci con ricerca
/// testuale, filtro per progetto, selezione multipla ed eliminazione in blocco,
/// più la generazione fattura da timesheet sul progetto della voce selezionata.
/// Replica le azioni della tab "Voci timesheet" del componente Angular
/// <c>timesheet</c>. I progetti caricati alimentano sia il combo di filtro sia il
/// progetto della nuova voce (parità con nuovaVoce(): progettoId = progetti[0]).
/// </summary>
public partial class TimesheetViewModel : ViewModelBase
{
    // Stesso repository dei progetti: in routes/timesheet.rs voci e progetti vivono
    // sotto lo stesso modulo. Qui usiamo la sezione "voci" (+ GeneraFattura).
    private readonly ProgettoRepository _repo = new();

    /// <summary>Tutte le voci caricate (sorgente non filtrata in memoria).</summary>
    private readonly List<TimesheetVoce> _tutte = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<TimesheetVoce> Voci { get; } = new();

    /// <summary>Progetti disponibili (per la nuova voce e per il combo di filtro).</summary>
    public ObservableCollection<Progetto> Progetti { get; } = new();

    /// <summary>Progetti per il filtro, con "Tutti i progetti" = null in testa.</summary>
    public ObservableCollection<Progetto?> ProgettiFiltro { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<TimesheetVoce> Selezionate { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionate;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private Progetto? filtroProgetto;
    [ObservableProperty] private bool occupato;

    /// <summary>Messaggio di esito/errore (es. fattura generata). La UI lo mostra se non vuoto.</summary>
    [ObservableProperty] private string messaggio = "";

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionate > 0;

    /// <summary>Ore totali (somma) delle voci attualmente visibili.</summary>
    public decimal OreVisibili => Voci.Sum(v => v.Ore);

    public TimesheetViewModel()
    {
        Selezionate.CollectionChanged += (_, _) => NumSelezionate = Selezionate.Count;
        Carica();
    }

    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    // Il filtro progetto è server-side (ricarica le voci di quel progetto), come
    // nell'Angular (loadVoci con ?progettoId=...).
    partial void OnFiltroProgettoChanged(Progetto? value) { if (!_sospendiFiltri) RicaricaVoci(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            Progetti.Clear();
            foreach (var p in _repo.GetAll())
                Progetti.Add(p);

            ProgettiFiltro.Clear();
            ProgettiFiltro.Add(null); // "Tutti i progetti"
            foreach (var p in Progetti)
                ProgettiFiltro.Add(p);

            RicaricaVoci();
            AggiungiCommand.NotifyCanExecuteChanged();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricarica le voci dal repository rispettando il filtro progetto.</summary>
    private void RicaricaVoci()
    {
        _tutte.Clear();
        _tutte.AddRange(_repo.GetVoci(FiltroProgetto?.Id));
        Selezionate.Clear();
        ApplicaFiltri();
    }

    /// <summary>Ricalcola la lista visibile applicando la ricerca testuale.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<TimesheetVoce> q = _tutte;

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(v =>
                v.ProgettoNome.ToLowerInvariant().Contains(t) ||
                v.Descrizione.ToLowerInvariant().Contains(t) ||
                v.Utente.ToLowerInvariant().Contains(t) ||
                v.Data.ToLowerInvariant().Contains(t));
        }

        Voci.Clear();
        foreach (var v in q)
            Voci.Add(v);

        OnPropertyChanged(nameof(OreVisibili));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        Ricerca = "";
        FiltroProgetto = null;
        _sospendiFiltri = false;
        RicaricaVoci();
    }

    /// <summary>
    /// Crea una voce base sul primo progetto disponibile (parità con nuovaVoce():
    /// progettoId = progetti[0], data = oggi, ore = 1). Niente progetti → nessuna
    /// azione. Il form completo sarà cablato dall'integrazione tramite dialog.
    /// </summary>
    [RelayCommand(CanExecute = nameof(HasProgetti))]
    private void Aggiungi()
    {
        var primo = Progetti.FirstOrDefault();
        if (primo == null) return;

        var nuova = new TimesheetVoce
        {
            ProgettoId = primo.Id,
            Data = DateTime.Now.ToString("yyyy-MM-dd"),
            Ore = 1m,
        };
        nuova.Id = _repo.InsertVoce(nuova);
        Carica();
    }

    private bool HasProgetti() => Progetti.Count > 0;

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        var sel = Selezionate.FirstOrDefault();
        if (sel == null) return;
        // Quando il dialog sarà cablato: aprilo con `sel`, poi UpdateVoce + Carica.
    }

    private bool HasSingoloSelezionato() => NumSelezionate == 1;

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionate == 0) return;
        // Il repository espone la delete singola: eliminiamo in blocco le voci
        // selezionate una per una (la lista è breve, niente transazione dedicata
        // richiesta per parità col backend, che cancella per id).
        foreach (var id in Selezionate.Select(v => v.Id).ToList())
            _repo.DeleteVoce(id);
        Carica();
    }

    /// <summary>
    /// Genera la fattura da timesheet per il progetto della voce selezionata
    /// (porta generaFattura dell'Angular). Le precondizioni (cliente, tariffa, ore
    /// da fatturare) sono verificate nel repository, che lancia un'eccezione: qui
    /// la trasformiamo in messaggio UI.
    /// </summary>
    [RelayCommand(CanExecute = nameof(PuoGenerareFattura))]
    private void GeneraFattura()
    {
        var sel = Selezionate.FirstOrDefault();
        if (sel == null) return;

        try
        {
            var esito = _repo.GeneraFattura(sel.ProgettoId);
            Messaggio = string.Format(
                CultureInfo.CurrentCulture,
                "Fattura {0} creata ({1} h, {2:C2}) da {3} voci",
                esito.Numero, esito.OreTotali, esito.Importo, esito.Voci);
            Carica();
        }
        catch (Exception ex)
        {
            // Il repository segnala le precondizioni con InvalidOperationException,
            // ma numerazione/SQLite (es. UNIQUE numero) possono lanciare altri tipi:
            // qualunque errore diventa un messaggio UI, niente crash (parità ProgettoViewModel).
            Messaggio = ex.Message;
        }
    }

    /// <summary>
    /// Genera fattura abilitato solo con una singola voce selezionata non ancora
    /// fatturata: una voce con fatturata=1 farebbe sempre fallire il backend
    /// ("Nessuna voce da fatturare"). Le altre precondizioni (cliente, tariffa)
    /// vivono sul progetto e restano verificate nel repository.
    /// </summary>
    private bool PuoGenerareFattura()
        => NumSelezionate == 1 && !(Selezionate.FirstOrDefault()?.Fatturata ?? true);

    partial void OnNumSelezionateChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        GeneraFatturaCommand.NotifyCanExecuteChanged();
    }
}

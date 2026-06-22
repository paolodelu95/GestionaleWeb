using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Fatture ricorrenti (template pianificati): lista filtrabile, ricerca testuale,
/// filtro per stato (tutte/attive/non attive), selezione multipla con eliminazione
/// in blocco, attiva/disattiva ed emissione manuale. Replica il comportamento del
/// componente Angular <c>fatture-ricorrenti</c>.
/// </summary>
public partial class FatturaRicorrenteViewModel : ViewModelBase
{
    private readonly FatturaRicorrenteRepository _repo = new();

    /// <summary>Tutti i template caricati (sorgente non filtrata).</summary>
    private readonly List<FatturaRicorrente> _tutte = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<FatturaRicorrente> Ricorrenti { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<FatturaRicorrente> Selezionati { get; } = new();

    /// <summary>Opzioni del filtro per stato attivazione.</summary>
    public IReadOnlyList<string> FiltriStato { get; } = new[] { "Tutte", "Attive", "Non attive" };

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string filtroStato = "Tutte";
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;
    public bool HasSingoloSelezionatoPub => NumSelezionati == 1;
    public int ScaduteCount => _tutte.Count(r => r.Attiva && r.IsScaduta);

    public FatturaRicorrenteViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroStatoChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutte.Clear();
            _tutte.AddRange(_repo.GetAll());
            Selezionati.Clear();
            ApplicaFiltri();
            OnPropertyChanged(nameof(ScaduteCount));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtro stato.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<FatturaRicorrente> q = _tutte;

        q = FiltroStato switch
        {
            "Attive" => q.Where(r => r.Attiva),
            "Non attive" => q.Where(r => !r.Attiva),
            _ => q,
        };

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(r =>
                r.Descrizione.ToLowerInvariant().Contains(t) ||
                r.ClienteNome.ToLowerInvariant().Contains(t) ||
                r.FrequenzaLabel.ToLowerInvariant().Contains(t) ||
                r.Note.ToLowerInvariant().Contains(t));
        }

        Ricorrenti.Clear();
        foreach (var r in q)
            Ricorrenti.Add(r);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        FiltroStato = "Tutte";
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un template base. Il form completo (cliente, righe, pianificazione) sarà
    /// cablato dalla fase di integrazione tramite dialog; qui inseriamo un record
    /// minimo coerente con i default del dialog Angular.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuova = new FatturaRicorrente
        {
            Descrizione = "Nuova ricorrente",
            Frequenza = "MENSILE",
            GiornoEmissione = 1,
            // Default UTC come il dialog Angular (new Date().toISOString().substring(0,10)).
            ProssimaEmissione = System.DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Attiva = true,
        };
        // Nota: ClienteId è obbligatorio (Valida lancia se mancante). Il dialog di
        // integrazione fornirà cliente e righe prima del salvataggio. Qui non
        // inseriamo subito per non violare il vincolo: l'integrazione aprirà il
        // form su `nuova` e chiamerà Insert al salvataggio.
        // _repo.Insert(nuova); Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetById(sel.Id);
        if (dettaglio == null) return;
        // Quando il dialog sarà cablato: aprilo con `dettaglio`, poi Update + Carica.
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Attiva_Disattiva()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        _repo.SetAttiva(sel.Id, !sel.Attiva);
        Carica();
    }

    /// <summary>Emette manualmente la fattura dal template selezionato e avanza il periodo.</summary>
    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Emetti()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        _repo.Emetti(sel.Id);
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(r => r.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        OnPropertyChanged(nameof(HasSingoloSelezionatoPub));
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        Attiva_DisattivaCommand.NotifyCanExecuteChanged();
        EmettiCommand.NotifyCanExecuteChanged();
    }
}

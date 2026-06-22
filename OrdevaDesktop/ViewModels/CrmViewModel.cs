using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// CRM · pipeline opportunità: lista filtrabile delle opportunità con ricerca
/// testuale, filtro per stage, selezione multipla ed eliminazione in blocco.
/// Replica le azioni del componente Angular <c>crm</c> (nuova/modifica/elimina,
/// spostamento di stage); la kanban con drag&amp;drop dell'originale è resa qui
/// come tabella + comando di spostamento.
/// </summary>
public partial class CrmViewModel : ViewModelBase
{
    private readonly CrmRepository _repo = new();

    /// <summary>Tutte le opportunità caricate (sorgente non filtrata).</summary>
    private readonly List<CrmOpportunita> _tutte = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<CrmOpportunita> Opportunita { get; } = new();

    /// <summary>Stage disponibili (per il combo del filtro e per lo spostamento).</summary>
    public ObservableCollection<CrmStage> Stages { get; } = new();

    /// <summary>Stage per il filtro, con "Tutti" = null in testa.</summary>
    public ObservableCollection<CrmStage?> StagesFiltro { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<CrmOpportunita> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private CrmStage? filtroStage;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    /// <summary>Valore totale (somma) delle opportunità attualmente visibili.</summary>
    public decimal TotaleVisibile => Opportunita.Sum(o => o.Valore);

    public CrmViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroStageChanged(CrmStage? value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            Stages.Clear();
            foreach (var s in _repo.GetStages())
                Stages.Add(s);

            StagesFiltro.Clear();
            StagesFiltro.Add(null); // "Tutti gli stage"
            foreach (var s in Stages)
                StagesFiltro.Add(s);

            _tutte.Clear();
            _tutte.AddRange(_repo.GetOpportunita());

            Selezionati.Clear();
            ApplicaFiltri();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtro stage.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<CrmOpportunita> q = _tutte;

        if (FiltroStage != null)
            q = q.Where(o => o.StageId == FiltroStage.Id);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(o =>
                o.Titolo.ToLowerInvariant().Contains(t) ||
                o.ClienteNome.ToLowerInvariant().Contains(t) ||
                o.Contatto.ToLowerInvariant().Contains(t) ||
                o.Email.ToLowerInvariant().Contains(t) ||
                o.Telefono.ToLowerInvariant().Contains(t) ||
                o.Assegnatario.ToLowerInvariant().Contains(t) ||
                o.StageNome.ToLowerInvariant().Contains(t));
        }

        Opportunita.Clear();
        foreach (var o in q)
            Opportunita.Add(o);

        OnPropertyChanged(nameof(TotaleVisibile));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        FiltroStage = null;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea una nuova opportunità base assegnata al primo stage disponibile
    /// (parità con nuova() dell'Angular: stageId = stages[0]). Il form completo
    /// di dettaglio sarà cablato dall'integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuova = new CrmOpportunita
        {
            Titolo = "Nuova opportunità",
            StageId = Stages.FirstOrDefault()?.Id,
            Probabilita = 50,
        };
        nuova.Id = _repo.InsertOpportunita(nuova);
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetOpportunitaById(sel.Id);
        if (dettaglio == null) return;
        // Quando il dialog sarà cablato: aprilo con `dettaglio`, poi Update + Carica.
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(o => o.Id).ToList();
        _repo.DeleteManyOpportunita(ids);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
    }
}

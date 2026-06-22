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
/// Documenti di trasporto: lista filtrabile (anno/mese/cliente/da fatturare),
/// ricerca testuale, selezione multipla con eliminazione e annullamento in
/// blocco, duplica e conversione in fattura. Replica il componente Angular
/// <c>ddt</c>; la logica di salvataggio/totali è nel repository.
/// </summary>
public partial class DdtViewModel : ViewModelBase
{
    private readonly DdtRepository _repo = new();

    /// <summary>Tutti i documenti caricati (sorgente non filtrata).</summary>
    private readonly List<Ddt> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Ddt> Documenti { get; } = new();

    /// <summary>Anni distinti per il filtro (più recenti prima), con "Tutti" = null.</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Clienti distinti presenti nei documenti, con "Tutti" = null.</summary>
    public ObservableCollection<ClienteVoce> Clienti { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Ddt> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private int? filtroAnno;
    [ObservableProperty] private ClienteVoce? filtroCliente;
    [ObservableProperty] private bool filtroDaFatturare;
    [ObservableProperty] private bool occupato;

    /// <summary>Messaggio d'errore/esito ultima operazione (mostrato dalla View).</summary>
    [ObservableProperty] private string? messaggio;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    /// <summary>Conteggio documenti ancora da fatturare (per il badge del filtro).</summary>
    public int DaFatturareCount => _tutti.Count(d => d.DaFatturare);

    /// <summary>Totale degli importi mostrati nella lista filtrata.</summary>
    public decimal TotaleLista => Documenti.Sum(d => d.TotaleVisualizzato);

    public DdtViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroAnnoChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroClienteChanged(ClienteVoce? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroDaFatturareChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());

            // Combo anni (null = tutti) + clienti distinti presenti nei documenti.
            Anni.Clear();
            Anni.Add(null);
            foreach (var y in _tutti.Select(d => d.Anno).Where(y => y > 0).Distinct().OrderByDescending(y => y))
                Anni.Add(y);

            Clienti.Clear();
            Clienti.Add(new ClienteVoce(null, "Tutti i clienti"));
            foreach (var v in _tutti
                         .Where(d => d.ClienteId != null && !string.IsNullOrWhiteSpace(d.ClienteNome))
                         .Select(d => new ClienteVoce(d.ClienteId, d.ClienteNome!))
                         .DistinctBy(v => v.Id)
                         .OrderBy(v => v.Nome))
                Clienti.Add(v);

            Selezionati.Clear();
            ApplicaFiltri();
            OnPropertyChanged(nameof(DaFatturareCount));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri (porta applyFilters()).</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Ddt> q = _tutti;

        if (FiltroAnno is int anno)
            q = q.Where(d => d.Anno == anno);

        if (FiltroCliente?.Id is long cid)
            q = q.Where(d => d.ClienteId == cid);

        if (FiltroDaFatturare)
            q = q.Where(d => d.DaFatturare);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(d =>
                d.Numero.ToLowerInvariant().Contains(t) ||
                d.ControparteNome.ToLowerInvariant().Contains(t) ||
                (d.ClienteNome ?? "").ToLowerInvariant().Contains(t) ||
                (d.FornitoreNome ?? "").ToLowerInvariant().Contains(t) ||
                d.Stato.ToLowerInvariant().Contains(t) ||
                (d.FatturaNumero ?? "").ToLowerInvariant().Contains(t));
        }

        Documenti.Clear();
        foreach (var d in q)
            Documenti.Add(d);

        OnPropertyChanged(nameof(TotaleLista));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo, azzero, ricalcolo una volta.
        _sospendiFiltri = true;
        FiltroAnno = null;
        FiltroCliente = null;
        FiltroDaFatturare = false;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo DDT base verso cliente, con numero progressivo. Il form di
    /// dettaglio (righe, controparte, trasporto) sarà cablato in integrazione.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        try
        {
            var nuovo = new Ddt
            {
                Numero = _repo.ProssimoNumero(),
                DataEmissione = DateTime.Now.ToString("yyyy-MM-dd"),
                Tipo = "CLIENTE",
                Stato = "EMESSO",
            };
            nuovo.Id = _repo.Insert(nuovo);
            Carica();
            Seleziona(nuovo.Id);
            Messaggio = $"Documento di trasporto creato (n. {nuovo.Numero})";
        }
        catch (Exception ex) { Messaggio = ex.Message; }
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione): carico il dettaglio
        // completo dell'elemento selezionato, poi il dialog farà Update + Carica.
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        _ = _repo.GetById(sel.Id);
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        try
        {
            var ids = Selezionati.Select(d => d.Id).ToList();
            var n = _repo.DeleteMany(ids);
            Carica();
            Messaggio = n == 1 ? "Documento eliminato" : $"{n} documenti eliminati";
        }
        catch (Exception ex) { Messaggio = ex.Message; }
    }

    /// <summary>Annulla in blocco i documenti selezionati (porta bulkSetStato).</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void AnnullaSelezionati()
    {
        if (NumSelezionati == 0) return;
        try
        {
            var ids = Selezionati.Select(d => d.Id).ToList();
            _repo.SetStatoMany(ids, "ANNULLATO");
            Carica();
            Messaggio = ids.Count == 1 ? "Documento annullato" : $"{ids.Count} documenti annullati";
        }
        catch (Exception ex) { Messaggio = ex.Message; }
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Duplica()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        try
        {
            var id = _repo.Duplica(sel.Id);
            if (id < 0) { Messaggio = "Documento non trovato"; return; }
            Carica();
            Seleziona(id);
            Messaggio = "Documento di trasporto duplicato";
        }
        catch (Exception ex) { Messaggio = ex.Message; }
    }

    /// <summary>Genera la fattura dal DDT selezionato (porta generaFattura/to_fattura).</summary>
    [RelayCommand(CanExecute = nameof(PuoFatturare))]
    private void GeneraFattura()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        try
        {
            _repo.ToFattura(sel.Id);
            Carica();
            Messaggio = $"Fattura generata dal documento n. {sel.Numero}";
        }
        catch (Exception ex) { Messaggio = ex.Message; }
    }

    private bool PuoFatturare() => HasSingoloSelezionato() && (Selezionati.FirstOrDefault()?.DaFatturare ?? false);

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        AnnullaSelezionatiCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        DuplicaCommand.NotifyCanExecuteChanged();
        GeneraFatturaCommand.NotifyCanExecuteChanged();
    }

    private void Seleziona(long id)
    {
        var d = Documenti.FirstOrDefault(x => x.Id == id);
        if (d == null) return;
        Selezionati.Clear();
        Selezionati.Add(d);
    }

    /// <summary>Voce del combo filtro cliente (id nullo = "Tutti").</summary>
    public sealed record ClienteVoce(long? Id, string Nome)
    {
        public override string ToString() => Nome;
    }
}

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
/// Ordini cliente: lista filtrabile (anno/mese), ricerca testuale, selezione
/// multipla con azioni in blocco (cambio stato, conversione in DDT, eliminazione),
/// CRUD base. Replica il componente Angular <c>ordini</c> (mostra solo gli ordini
/// di tipo CLIENTE).
/// </summary>
public partial class OrdineViewModel : ViewModelBase
{
    private readonly OrdineRepository _repo = new();

    /// <summary>Tutti gli ordini cliente caricati (sorgente non filtrata).</summary>
    private readonly List<Ordine> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Ordine> Ordini { get; } = new();

    /// <summary>Anni distinti presenti nei dati, per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Mesi 1–12 per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<int?> Mesi { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Ordine> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private int? filtroAnno;
    [ObservableProperty] private int? filtroMese;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    public OrdineViewModel()
    {
        for (var m = 1; m <= 12; m++) Mesi.Add(m);
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroAnnoChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroMeseChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll("CLIENTE"));

            Anni.Clear();
            Anni.Add(null); // "Tutti gli anni"
            foreach (var y in _tutti.Select(AnnoDi)
                         .Where(y => y > 0)
                         .Distinct()
                         .OrderByDescending(y => y))
                Anni.Add(y);

            Selezionati.Clear();
            ApplicaFiltri();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando filtri anno/mese + ricerca.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Ordine> q = _tutti;

        if (FiltroAnno is int anno)
            q = q.Where(o => AnnoDi(o) == anno);

        if (FiltroMese is int mese)
            q = q.Where(o => MeseDi(o) == mese);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(o =>
                o.Numero.ToLowerInvariant().Contains(t) ||
                (o.ClienteNome ?? "").ToLowerInvariant().Contains(t) ||
                (o.FornitoreNome ?? "").ToLowerInvariant().Contains(t) ||
                o.Stato.ToLowerInvariant().Contains(t) ||
                o.Tipo.ToLowerInvariant().Contains(t));
        }

        Ordini.Clear();
        foreach (var o in q)
            Ordini.Add(o);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        FiltroAnno = null;
        FiltroMese = null;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo ordine cliente base (numero provvisorio per anno corrente).
    /// Il form di dettaglio completo (righe, intestatario) sarà cablato dalla fase
    /// di integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuovo = new Ordine
        {
            Numero = ProponiNumero(),
            DataOrdine = DateTime.Now.ToString("yyyy-MM-dd"),
            Tipo = "CLIENTE",
            Stato = "APERTO",
        };
        nuovo.Id = _repo.Insert(nuovo);
        Carica();
        Seleziona(nuovo.Id);
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

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        _repo.DeleteMany(Selezionati.Select(o => o.Id).ToList());
        Carica();
    }

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Conferma() => CambiaStatoSelezionati("CONFERMATO");

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Evadi() => CambiaStatoSelezionati("EVASO");

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Annulla() => CambiaStatoSelezionati("ANNULLATO");

    /// <summary>Converte in DDT i soli ordini selezionati validi (CLIENTE, non già evasi/annullati).</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void ConvertiInDdt()
    {
        var convertibili = Selezionati
            .Where(o => o.Tipo == "CLIENTE" && o.Stato != "ANNULLATO" && o.Stato != "EVASO")
            .Select(o => o.Id)
            .ToList();
        if (convertibili.Count == 0) return;

        foreach (var id in convertibili)
            _repo.ToDdt(id);
        Carica();
    }

    private void CambiaStatoSelezionati(string stato)
    {
        if (NumSelezionati == 0) return;
        _repo.SetStatoMany(Selezionati.Select(o => o.Id).ToList(), stato);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        ConfermaCommand.NotifyCanExecuteChanged();
        EvadiCommand.NotifyCanExecuteChanged();
        AnnullaCommand.NotifyCanExecuteChanged();
        ConvertiInDdtCommand.NotifyCanExecuteChanged();
    }

    private void Seleziona(long id)
    {
        var o = Ordini.FirstOrDefault(x => x.Id == id);
        if (o == null) return;
        Selezionati.Clear();
        Selezionati.Add(o);
    }

    // ── helper ──────────────────────────────────────────────────────────────

    /// <summary>Anno dalla data ISO "yyyy-MM-dd" (0 se assente, come substring del backend).</summary>
    private static int AnnoDi(Ordine o) =>
        o.DataOrdine.Length >= 4 && int.TryParse(o.DataOrdine.Substring(0, 4), out var y) ? y : 0;

    private static int MeseDi(Ordine o) =>
        o.DataOrdine.Length >= 7 && int.TryParse(o.DataOrdine.Substring(5, 2), out var m) ? m : 0;

    /// <summary>
    /// Prossimo numero proposto: max numero "puramente numerico" + 1, altrimenti
    /// conteggio + 1. Stessa convenzione semplificata (numero "nudo") usata dagli
    /// altri ViewModel del port (es. PreventivoViewModel.ProssimoNumero), così la
    /// serie ordini resta coerente. Surrogato locale di get_next_numero finché
    /// l'integrazione non collega la numerazione ufficiale.
    /// </summary>
    private string ProponiNumero()
    {
        var max = _tutti
            .Select(o => int.TryParse(o.Numero, out var n) ? n : 0)
            .DefaultIfEmpty(0)
            .Max();
        return (max > 0 ? max + 1 : _tutti.Count + 1).ToString();
    }
}

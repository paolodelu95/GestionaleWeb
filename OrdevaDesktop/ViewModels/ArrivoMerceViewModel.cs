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
/// Arrivi merce (ricezione/carico merce): lista filtrabile per anno e fornitore,
/// ricerca testuale (numero, fornitore, documento fornitore), selezione multipla
/// con eliminazione in blocco, creazione/eliminazione base e cambio stato.
/// Replica il componente Angular <c>arrivi-merce</c> (colonne numero, data,
/// fornitore, documento fornitore, totale, stato).
/// </summary>
public partial class ArrivoMerceViewModel : ViewModelBase
{
    private readonly ArrivoMerceRepository _repo = new();

    /// <summary>Tutti gli arrivi caricati (sorgente non filtrata).</summary>
    private readonly List<ArrivoMerce> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<ArrivoMerce> Arrivi { get; } = new();

    /// <summary>Anni distinti presenti nei dati, per il combo del filtro ("Tutti" = null).</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Fornitori distinti presenti nei dati, per il combo del filtro ("Tutti" = null).</summary>
    public ObservableCollection<FornitoreOpzione?> Fornitori { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<ArrivoMerce> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private int? filtroAnno;
    [ObservableProperty] private FornitoreOpzione? filtroFornitore;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    public ArrivoMerceViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroAnnoChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroFornitoreChanged(FornitoreOpzione? value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());

            Anni.Clear();
            Anni.Add(null); // "Tutti gli anni"
            foreach (var y in _tutti.Select(AnnoDi)
                         .Where(y => y > 0)
                         .Distinct()
                         .OrderByDescending(y => y))
                Anni.Add(y);

            Fornitori.Clear();
            Fornitori.Add(null); // "Tutti i fornitori"
            foreach (var f in _tutti
                         .Where(a => a.FornitoreId is long id && id != 0)
                         .Select(a => new FornitoreOpzione(a.FornitoreId!.Value, a.FornitoreNome ?? ""))
                         .DistinctBy(f => f.Id)
                         .OrderBy(f => f.Nome, StringComparer.OrdinalIgnoreCase))
                Fornitori.Add(f);

            Selezionati.Clear();
            ApplicaFiltri();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando filtri anno/fornitore + ricerca.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<ArrivoMerce> q = _tutti;

        if (FiltroAnno is int anno)
            q = q.Where(a => AnnoDi(a) == anno);

        if (FiltroFornitore is FornitoreOpzione f)
            q = q.Where(a => a.FornitoreId == f.Id);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(a =>
                a.Numero.ToLowerInvariant().Contains(t) ||
                (a.FornitoreNome ?? "").ToLowerInvariant().Contains(t) ||
                a.NumeroDocumentoFornitore.ToLowerInvariant().Contains(t));
        }

        Arrivi.Clear();
        foreach (var a in q)
            Arrivi.Add(a);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        FiltroAnno = null;
        FiltroFornitore = null;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo arrivo merce base (numero provvisorio per anno corrente, in
    /// attesa). Il form di dettaglio completo (righe, fornitore, deposito,
    /// importazione da fattura acquisto) sarà cablato dall'integrazione via dialog.
    /// Nasce in "ATTESA" così non movimenta il magazzino finché non ha righe reali.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuovo = new ArrivoMerce
        {
            Numero = ProponiNumero(),
            Data = DateTime.Now.ToString("yyyy-MM-dd"),
            Stato = "ATTESA",
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

    /// <summary>Conferma la ricezione dell'arrivo selezionato (carica le scorte).</summary>
    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void ConfermaRicezione()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        _repo.SetStato(sel.Id, "RICEVUTO");
        Carica();
    }

    /// <summary>Annulla l'arrivo selezionato (storna le scorte se era ricevuto).</summary>
    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Annulla()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
        _repo.SetStato(sel.Id, "ANNULLATO");
        Carica();
    }

    /// <summary>Eliminazione in blocco degli arrivi selezionati (con storno scorte).</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        _repo.DeleteMany(Selezionati.Select(a => a.Id).ToList());
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        ConfermaRicezioneCommand.NotifyCanExecuteChanged();
        AnnullaCommand.NotifyCanExecuteChanged();
    }

    private void Seleziona(long id)
    {
        var a = Arrivi.FirstOrDefault(x => x.Id == id);
        if (a == null) return;
        Selezionati.Clear();
        Selezionati.Add(a);
    }

    // ── helper ──────────────────────────────────────────────────────────────

    /// <summary>Anno dalla data ISO "yyyy-MM-dd" (0 se assente).</summary>
    private static int AnnoDi(ArrivoMerce a) =>
        a.Data.Length >= 4 && int.TryParse(a.Data.Substring(0, 4), out var y) ? y : 0;

    /// <summary>Numero provvisorio progressivo per l'anno corrente in base ai dati caricati.</summary>
    private string ProponiNumero()
    {
        var anno = DateTime.Now.Year;
        var maxN = _tutti
            .Where(a => AnnoDi(a) == anno)
            .Select(a => ParsePrefisso(a.Numero))
            .DefaultIfEmpty(0)
            .Max();
        return $"{maxN + 1}/{anno}";
    }

    /// <summary>Estrae il primo gruppo numerico dal numero ("12/2026" → 12), 0 se assente.</summary>
    private static int ParsePrefisso(string numero)
    {
        var i = 0;
        while (i < numero.Length && char.IsDigit(numero[i])) i++;
        return i > 0 && int.TryParse(numero.Substring(0, i), out var n) ? n : 0;
    }

    /// <summary>Opzione fornitore per il combo del filtro (id + nome). Record per ==/GetHashCode.</summary>
    public sealed record FornitoreOpzione(long Id, string Nome)
    {
        public override string ToString() => Nome;
    }
}

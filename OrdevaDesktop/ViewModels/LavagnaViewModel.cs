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
/// Bacheca "Lavagna": elenco filtrabile dei post-it, ricerca testuale, filtro per
/// tipo e per stato (attivi/ridotti), creazione/modifica/eliminazione e selezione
/// multipla per l'eliminazione in blocco. Replica il componente Angular
/// <c>lavagna</c>, ma adattato a una vista a tabella (il canvas drag&amp;drop è
/// fuori scope qui: posizione/dimensione restano nei dati e sono modificabili
/// dal form di dettaglio nell'integrazione).
///
/// La bacheca è un singolo blob JSON: ogni mutazione salva l'intero stato tramite
/// <see cref="LavagnaRepository.Save"/> (come fa il salvataggio debounced del web).
/// </summary>
public partial class LavagnaViewModel : ViewModelBase
{
    private readonly LavagnaRepository _repo = new();

    /// <summary>Palette tenue, identica all'array COLORI del componente Angular.</summary>
    public static readonly string[] Colori =
    {
        "#e8e1c4", // sabbia
        "#cfe0d2", // salvia
        "#cdd9e6", // azzurro polvere
        "#e6d2d2", // rosa antico
        "#ddd3e6", // lavanda
        "#e2dccb", // beige
        "#d6dde0", // grigio nebbia
        "#dde3cf", // verde oliva chiaro
    };

    /// <summary>Tipi di corpo ammessi (parità con TipoCorpo dell'Angular).</summary>
    public IReadOnlyList<string> Tipi { get; } = new[] { "testo", "elenco", "todo" };

    /// <summary>Tutti i post-it caricati dal blob (sorgente non filtrata).</summary>
    private readonly List<PostIt> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<PostIt> Note { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<PostIt> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string? filtroTipo;
    [ObservableProperty] private bool nascondiRidotti;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    // Contatori della testata (parità con attivi()/ridotti() dell'Angular).
    public int TotaleCount => _tutti.Count;
    public int AttiviCount => _tutti.Count(n => !n.Minimizzato);
    public int RidottiCount => _tutti.Count(n => n.Minimizzato);

    public LavagnaViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroTipoChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnNascondiRidottiChanged(bool value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            var board = _repo.Get();
            _tutti.Clear();
            foreach (var n in board.Note)
                _tutti.Add(Normalizza(n));

            Selezionati.Clear();
            ApplicaFiltri();
            NotificaContatori();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<PostIt> q = _tutti;

        if (!string.IsNullOrWhiteSpace(FiltroTipo))
            q = q.Where(n => n.Tipo == FiltroTipo);

        if (NascondiRidotti)
            q = q.Where(n => !n.Minimizzato);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var s = term.ToLowerInvariant();
            q = q.Where(n =>
                n.Titolo.ToLowerInvariant().Contains(s) ||
                n.Testo.ToLowerInvariant().Contains(s) ||
                n.Voci.Any(v => (v.T ?? "").ToLowerInvariant().Contains(s)));
        }

        Note.Clear();
        foreach (var n in q)
            Note.Add(n);
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        _sospendiFiltri = true;
        FiltroTipo = null;
        NascondiRidotti = false;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo post-it con i default dell'Angular (colore ciclico sulla palette,
    /// posizione a cascata, 250x220, tipo "testo") e salva la bacheca.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var attivi = _tutti.Count(n => !n.Minimizzato);
        var nuovo = new PostIt
        {
            Id = "p" + Guid.NewGuid().ToString("N"),
            Titolo = "",
            Colore = Colori[_tutti.Count % Colori.Length],
            X = 40 + (attivi % 6) * 36,
            Y = 40 + (attivi % 6) * 36,
            W = 250,
            H = 220,
            Tipo = "testo",
            Testo = "",
            Voci = new List<PostItVoce>(),
            Minimizzato = false,
        };
        _tutti.Add(nuovo);
        Salva();
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di dettaglio (titolo/tipo/contenuto/colore/posizione),
        // cablato nell'integrazione. Qui restano disponibili i comandi rapidi
        // (SetTipo, CambiaColore, Minimizza/Ripristina) che bastano alla vista a tabella.
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;
    }

    private bool HasSingoloSelezionato() => NumSelezionati == 1;

    /// <summary>Cambia il tipo di corpo del post-it selezionato (parità con setTipo()).</summary>
    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void SetTipo(string? tipo)
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null || string.IsNullOrEmpty(tipo) || !Tipi.Contains(tipo)) return;

        sel.Tipo = tipo;
        // setTipo() dell'Angular: passando a elenco/todo senza voci, ne crea una vuota.
        if ((tipo == "elenco" || tipo == "todo") && sel.Voci.Count == 0)
            sel.Voci.Add(new PostItVoce());
        Salva();
    }

    /// <summary>Cicla il colore del post-it selezionato sulla palette.</summary>
    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void CambiaColore()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;

        var idx = Array.IndexOf(Colori, sel.Colore);
        sel.Colore = Colori[(idx + 1 + Colori.Length) % Colori.Length];
        Salva();
    }

    /// <summary>Riduce/ripristina il post-it selezionato (minimizza()/ripristina()).</summary>
    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void ToggleRidotto()
    {
        var sel = Selezionati.FirstOrDefault();
        if (sel == null) return;

        sel.Minimizzato = !sel.Minimizzato;
        Salva();
    }

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionati == 0) return;
        var daEliminare = new HashSet<PostIt>(Selezionati);
        _tutti.RemoveAll(daEliminare.Contains);
        Salva();
    }

    /// <summary>Persiste l'intero stato e ricarica la vista (parità con saveLavagna()).</summary>
    private void Salva()
    {
        _repo.Save(new Lavagna { Note = _tutti.ToList() });
        ApplicaFiltri();
        Selezionati.Clear();
        NotificaContatori();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        SetTipoCommand.NotifyCanExecuteChanged();
        CambiaColoreCommand.NotifyCanExecuteChanged();
        ToggleRidottoCommand.NotifyCanExecuteChanged();
    }

    private void NotificaContatori()
    {
        OnPropertyChanged(nameof(TotaleCount));
        OnPropertyChanged(nameof(AttiviCount));
        OnPropertyChanged(nameof(RidottiCount));
    }

    /// <summary>
    /// Riempie i campi mancanti/incoerenti del blob salvato (robustezza su versioni
    /// vecchie), come normalizza() dell'Angular: id di fallback, tipo valido,
    /// dimensioni di default, voci sempre come lista.
    /// </summary>
    private static PostIt Normalizza(PostIt n)
    {
        n.Id = string.IsNullOrEmpty(n.Id) ? "p" + Guid.NewGuid().ToString("N") : n.Id;
        n.Titolo ??= "";
        n.Colore = string.IsNullOrEmpty(n.Colore) ? Colori[0] : n.Colore;
        if (n.W <= 0) n.W = 250;
        if (n.H <= 0) n.H = 220;
        n.Tipo = new[] { "testo", "elenco", "todo" }.Contains(n.Tipo) ? n.Tipo : "testo";
        n.Testo ??= "";
        n.Voci ??= new List<PostItVoce>();
        foreach (var v in n.Voci)
            v.T ??= "";
        return n;
    }
}

using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Elenco preventivi: ricerca testuale, filtri anno/mese/cliente, selezione
/// multipla con eliminazione in blocco e cambio stato di massa
/// (Invia/Accetta/Rifiuta). Replica il componente Angular <c>preventivi</c>.
/// La modifica di dettaglio (righe, totali) sarà cablata dalla fase di
/// integrazione tramite un dialog sul ViewModel del documento.
/// </summary>
public partial class PreventivoViewModel : ViewModelBase
{
    private readonly PreventivoRepository _repo = new();

    /// <summary>Tutti i preventivi caricati (sorgente non filtrata).</summary>
    private readonly List<Preventivo> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Preventivo> Preventivi { get; } = new();

    /// <summary>Anni distinti per il filtro (più recente per primo), con "Tutti" = null.</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Mesi per il filtro (Gen..Dic), con "Tutti" = null.</summary>
    public ObservableCollection<MeseOpzione> Mesi { get; } = new();

    /// <summary>Clienti distinti presenti nei preventivi, con "Tutti" = null.</summary>
    public ObservableCollection<ClienteOpzione> Clienti { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<Preventivo> Selezionati { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionati;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private int? filtroAnno;
    [ObservableProperty] private int? filtroMese;
    [ObservableProperty] private long? filtroClienteId;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionati > 0;

    /// <summary>Numero di documenti in lista (dopo i filtri).</summary>
    public int Conteggio => Preventivi.Count;

    /// <summary>Somma dei totali della lista filtrata (riga di riepilogo).</summary>
    public decimal TotaleLista => Preventivi.Sum(p => p.TotaleVisualizzato);

    public PreventivoViewModel()
    {
        Selezionati.CollectionChanged += (_, _) => NumSelezionati = Selezionati.Count;
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroAnnoChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroMeseChanged(int? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroClienteIdChanged(long? value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());

            // Anni (più recenti per primi).
            Anni.Clear();
            Anni.Add(null); // "Tutti gli anni"
            foreach (var y in _tutti.Select(p => p.Anno)
                         .Where(y => y > 0).Distinct().OrderByDescending(y => y))
                Anni.Add(y);

            // Mesi (statici Gen..Dic).
            if (Mesi.Count == 0)
            {
                Mesi.Add(new MeseOpzione(null, "Tutti i mesi"));
                string[] et = { "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic" };
                for (var m = 1; m <= 12; m++) Mesi.Add(new MeseOpzione(m, et[m - 1]));
            }

            // Clienti presenti nei preventivi (ordinati per nome).
            Clienti.Clear();
            Clienti.Add(new ClienteOpzione(null, "Tutti i clienti"));
            foreach (var c in _tutti
                         .Where(p => p.ClienteId is > 0)
                         .Select(p => new { Id = p.ClienteId!.Value, Nome = p.ClienteNome ?? "" })
                         .DistinctBy(x => x.Id)
                         .OrderBy(x => x.Nome))
                Clienti.Add(new ClienteOpzione(c.Id, c.Nome));

            Selezionati.Clear();
            ApplicaFiltri();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Preventivo> q = _tutti;

        if (FiltroAnno is { } anno) q = q.Where(p => p.Anno == anno);
        if (FiltroMese is { } mese) q = q.Where(p => p.Mese == mese);
        if (FiltroClienteId is { } cid) q = q.Where(p => p.ClienteId == cid);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            // Stessi campi del filterPredicate Angular: numero, cliente, stato.
            q = q.Where(p =>
                p.Numero.ToLowerInvariant().Contains(t) ||
                (p.ClienteNome ?? "").ToLowerInvariant().Contains(t) ||
                p.Stato.ToLowerInvariant().Contains(t));
        }

        Preventivi.Clear();
        foreach (var p in q) Preventivi.Add(p);

        OnPropertyChanged(nameof(Conteggio));
        OnPropertyChanged(nameof(TotaleLista));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo, azzero, ricalcolo una volta sola.
        _sospendiFiltri = true;
        FiltroAnno = null;
        FiltroMese = null;
        FiltroClienteId = null;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }

    /// <summary>
    /// Crea un nuovo preventivo base. Il form completo (cliente, righe, totali)
    /// sarà cablato dalla fase di integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuovo = new Preventivo
        {
            Numero = ProssimoNumero(),
            DataEmissione = System.DateTime.Today.ToString("yyyy-MM-dd"),
            Validita = 30,
            Stato = "INVIATO",
        };
        nuovo.Id = _repo.Insert(nuovo);
        Carica();
        Seleziona(nuovo.Id);
    }

    [RelayCommand(CanExecute = nameof(HasSingoloSelezionato))]
    private void Modifica()
    {
        // Hook per il dialog di modifica (integrazione): qui carichiamo il
        // dettaglio completo (testata + righe) dell'elemento selezionato.
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

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void BulkInvia() => CambiaStatoSelezionati("INVIATO");

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void BulkAccetta() => CambiaStatoSelezionati("ACCETTATO");

    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void BulkRifiuta() => CambiaStatoSelezionati("RIFIUTATO");

    private void CambiaStatoSelezionati(string stato)
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(p => p.Id).ToList();
        _repo.SetStatoMany(ids, stato);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        BulkInviaCommand.NotifyCanExecuteChanged();
        BulkAccettaCommand.NotifyCanExecuteChanged();
        BulkRifiutaCommand.NotifyCanExecuteChanged();
    }

    /// <summary>
    /// Prossimo numero proposto: max numero "puramente numerico" + 1, altrimenti
    /// conteggio + 1. Surrogato locale di getNextNumero finché l'integrazione non
    /// collega la numerazione ufficiale.
    /// </summary>
    private string ProssimoNumero()
    {
        var max = _tutti
            .Select(p => int.TryParse(p.Numero, out var n) ? n : 0)
            .DefaultIfEmpty(0)
            .Max();
        return (max > 0 ? max + 1 : _tutti.Count + 1).ToString();
    }

    private void Seleziona(long id)
    {
        var p = Preventivi.FirstOrDefault(x => x.Id == id);
        if (p == null) return;
        Selezionati.Clear();
        Selezionati.Add(p);
    }
}

/// <summary>Voce del combo "Mese" (valore null = tutti).</summary>
public sealed record MeseOpzione(int? Valore, string Etichetta);

/// <summary>Voce del combo "Cliente" (id null = tutti).</summary>
public sealed record ClienteOpzione(long? Id, string Nome);

using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Elenco note di credito: ricerca testuale, filtri anno/mese/cliente, selezione
/// multipla con eliminazione in blocco e annullamento di massa. Replica il
/// componente Angular <c>note-credito</c> (colonne numero/data/cliente/importo/
/// stato, filtro su numero+cliente+stato, bulk "Annulla" → stato ANNULLATA).
/// Le voci dei combo (MeseOpzione/ClienteOpzione) sono condivise con gli altri
/// elenchi di documenti. La modifica di dettaglio (righe, totali fiscali) sarà
/// cablata dalla fase di integrazione tramite un dialog sul ViewModel del documento.
/// </summary>
public partial class NotaCreditoViewModel : ViewModelBase
{
    private readonly NotaCreditoRepository _repo = new();

    /// <summary>Tutte le note caricate (sorgente non filtrata).</summary>
    private readonly List<NotaCredito> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<NotaCredito> NoteCredito { get; } = new();

    /// <summary>Anni distinti per il filtro (più recente per primo), con "Tutti" = null.</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Mesi per il filtro (Gen..Dic), con "Tutti" = null.</summary>
    public ObservableCollection<MeseOpzione> Mesi { get; } = new();

    /// <summary>Clienti distinti presenti nelle note, con "Tutti" = null.</summary>
    public ObservableCollection<ClienteOpzione> Clienti { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<NotaCredito> Selezionati { get; } = new();

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
    public int Conteggio => NoteCredito.Count;

    /// <summary>Somma dei totali della lista filtrata (riga di riepilogo).</summary>
    public decimal TotaleLista => NoteCredito.Sum(n => n.TotaleVisualizzato);

    public NotaCreditoViewModel()
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
            foreach (var y in _tutti.Select(n => n.Anno)
                         .Where(y => y > 0).Distinct().OrderByDescending(y => y))
                Anni.Add(y);

            // Mesi (statici Gen..Dic).
            if (Mesi.Count == 0)
            {
                Mesi.Add(new MeseOpzione(null, "Tutti i mesi"));
                string[] et = { "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic" };
                for (var m = 1; m <= 12; m++) Mesi.Add(new MeseOpzione(m, et[m - 1]));
            }

            // Clienti presenti nelle note (ordinati per nome).
            Clienti.Clear();
            Clienti.Add(new ClienteOpzione(null, "Tutti i clienti"));
            foreach (var c in _tutti
                         .Where(n => n.ClienteId is > 0)
                         .Select(n => new { Id = n.ClienteId!.Value, Nome = n.ClienteNome ?? "" })
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
        IEnumerable<NotaCredito> q = _tutti;

        if (FiltroAnno is { } anno) q = q.Where(n => n.Anno == anno);
        if (FiltroMese is { } mese) q = q.Where(n => n.Mese == mese);
        if (FiltroClienteId is { } cid) q = q.Where(n => n.ClienteId == cid);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            // Stessi campi del filterPredicate Angular: numero, cliente, stato.
            q = q.Where(n =>
                n.Numero.ToLowerInvariant().Contains(t) ||
                (n.ClienteNome ?? "").ToLowerInvariant().Contains(t) ||
                n.Stato.ToLowerInvariant().Contains(t));
        }

        NoteCredito.Clear();
        foreach (var n in q) NoteCredito.Add(n);

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
    /// Crea una nota di credito base. Il form completo (cliente, fattura, righe,
    /// parametri fiscali) sarà cablato dalla fase di integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuova = new NotaCredito
        {
            Numero = ProssimoNumero(),
            DataEmissione = System.DateTime.Today.ToString("yyyy-MM-dd"),
            Stato = "EMESSA",
        };
        nuova.Id = _repo.Insert(nuova);
        Carica();
        Seleziona(nuova.Id);
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
        var ids = Selezionati.Select(n => n.Id).ToList();
        _repo.DeleteMany(ids);
        Carica();
    }

    /// <summary>Annulla le note selezionate (stato ANNULLATA), come il bulk Angular.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void BulkAnnulla() => CambiaStatoSelezionati("ANNULLATA");

    private void CambiaStatoSelezionati(string stato)
    {
        if (NumSelezionati == 0) return;
        var ids = Selezionati.Select(n => n.Id).ToList();
        _repo.SetStatoMany(ids, stato);
        Carica();
    }

    partial void OnNumSelezionatiChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
        BulkAnnullaCommand.NotifyCanExecuteChanged();
    }

    /// <summary>
    /// Prossimo numero proposto: max numero "puramente numerico" + 1, altrimenti
    /// conteggio + 1. Surrogato locale finché l'integrazione non collega la
    /// numerazione ufficiale.
    /// </summary>
    private string ProssimoNumero()
    {
        var max = _tutti
            .Select(n => int.TryParse(n.Numero, out var v) ? v : 0)
            .DefaultIfEmpty(0)
            .Max();
        return (max > 0 ? max + 1 : _tutti.Count + 1).ToString();
    }

    private void Seleziona(long id)
    {
        var n = NoteCredito.FirstOrDefault(x => x.Id == id);
        if (n == null) return;
        Selezionati.Clear();
        Selezionati.Add(n);
    }
}

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
/// Storico delle vendite al banco: lista filtrabile (anno/mese), ricerca testuale,
/// selezione multipla con eliminazione in blocco, creazione/eliminazione base.
/// Replica il tab "Storico vendite" del componente Angular <c>vendita-banco</c>
/// (colonne data, numero, cliente, pagamento, totale).
/// </summary>
public partial class VenditaBancoViewModel : ViewModelBase
{
    private readonly VenditaBancoRepository _repo = new();

    /// <summary>Tutte le vendite caricate (sorgente non filtrata).</summary>
    private readonly List<VenditaBanco> _tutte = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<VenditaBanco> Vendite { get; } = new();

    /// <summary>Anni distinti presenti nei dati, per il combo del filtro ("Tutti" = null).</summary>
    public ObservableCollection<int?> Anni { get; } = new();

    /// <summary>Mesi 1–12 per il combo del filtro ("Tutti" = null).</summary>
    public ObservableCollection<int?> Mesi { get; } = new();

    /// <summary>Righe selezionate nella DataGrid (selezione multipla).</summary>
    public ObservableCollection<VenditaBanco> Selezionate { get; } = new();

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelezione))]
    private int numSelezionate;

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private int? filtroAnno;
    [ObservableProperty] private int? filtroMese;
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public bool HasSelezione => NumSelezionate > 0;

    public VenditaBancoViewModel()
    {
        for (var m = 1; m <= 12; m++) Mesi.Add(m);
        Selezionate.CollectionChanged += (_, _) => NumSelezionate = Selezionate.Count;
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
            _tutte.Clear();
            _tutte.AddRange(_repo.GetAll());

            Anni.Clear();
            Anni.Add(null); // "Tutti gli anni"
            foreach (var y in _tutte.Select(AnnoDi)
                         .Where(y => y > 0)
                         .Distinct()
                         .OrderByDescending(y => y))
                Anni.Add(y);

            Selezionate.Clear();
            ApplicaFiltri();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando filtri anno/mese + ricerca.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<VenditaBanco> q = _tutte;

        if (FiltroAnno is int anno)
            q = q.Where(v => AnnoDi(v) == anno);

        if (FiltroMese is int mese)
            q = q.Where(v => MeseDi(v) == mese);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(v =>
                v.Numero.ToLowerInvariant().Contains(t) ||
                (v.ClienteNome ?? "").ToLowerInvariant().Contains(t) ||
                v.MetodoPagamento.ToLowerInvariant().Contains(t));
        }

        Vendite.Clear();
        foreach (var v in q)
            Vendite.Add(v);
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
    /// Crea una nuova vendita al banco base (numero provvisorio per anno corrente,
    /// contanti). Il form di dettaglio completo (righe, metodo pagamento, resto)
    /// sarà cablato dalla fase di integrazione tramite dialog.
    /// </summary>
    [RelayCommand]
    private void Aggiungi()
    {
        var nuova = new VenditaBanco
        {
            Numero = ProponiNumero(),
            Data = DateTime.Now.ToString("yyyy-MM-dd"),
            MetodoPagamento = "CONTANTI",
            Stato = "EMESSA",
        };
        nuova.Id = _repo.Insert(nuova);
        Carica();
        Seleziona(nuova.Id);
    }

    [RelayCommand(CanExecute = nameof(HasSingolaSelezionata))]
    private void Modifica()
    {
        var sel = Selezionate.FirstOrDefault();
        if (sel == null) return;
        var dettaglio = _repo.GetById(sel.Id);
        if (dettaglio == null) return;
        // Quando il dialog sarà cablato: aprilo con `dettaglio`, poi Update + Carica.
    }

    private bool HasSingolaSelezionata() => NumSelezionate == 1;

    /// <summary>Eliminazione in blocco delle vendite selezionate (con i pagamenti).</summary>
    [RelayCommand(CanExecute = nameof(HasSelezione))]
    private void Elimina()
    {
        if (NumSelezionate == 0) return;
        _repo.DeleteMany(Selezionate.Select(v => v.Id).ToList());
        Carica();
    }

    partial void OnNumSelezionateChanged(int value)
    {
        EliminaCommand.NotifyCanExecuteChanged();
        ModificaCommand.NotifyCanExecuteChanged();
    }

    private void Seleziona(long id)
    {
        var v = Vendite.FirstOrDefault(x => x.Id == id);
        if (v == null) return;
        Selezionate.Clear();
        Selezionate.Add(v);
    }

    // ── helper ──────────────────────────────────────────────────────────────

    /// <summary>Anno dalla data ISO "yyyy-MM-dd" (0 se assente).</summary>
    private static int AnnoDi(VenditaBanco v) =>
        v.Data.Length >= 4 && int.TryParse(v.Data.Substring(0, 4), out var y) ? y : 0;

    private static int MeseDi(VenditaBanco v) =>
        v.Data.Length >= 7 && int.TryParse(v.Data.Substring(5, 2), out var m) ? m : 0;

    /// <summary>Numero provvisorio progressivo per l'anno corrente in base ai dati caricati.</summary>
    private string ProponiNumero()
    {
        var anno = DateTime.Now.Year;
        var maxN = _tutte
            .Where(v => AnnoDi(v) == anno)
            .Select(v => ParsePrefisso(v.Numero))
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
}

using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Storico solleciti di pagamento. È un registro di SOLA LETTURA (come un Audit):
/// niente Aggiungi/Modifica/Elimina — i solleciti li crea il backend dopo l'invio
/// email. La lista è filtrabile per documento (entità: Fattura/Acquisto), per esito
/// (azione) e per intervallo di date, oltre alla ricerca testuale libera.
/// </summary>
public partial class SollecitoViewModel : ViewModelBase
{
    private readonly SollecitoRepository _repo = new();

    /// <summary>Sorgente completa non filtrata.</summary>
    private readonly List<Sollecito> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Sollecito> Solleciti { get; } = new();

    /// <summary>Tipi documento distinti per il filtro entità (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Tipi { get; } = new();

    /// <summary>Esiti distinti per il filtro azione (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Esiti { get; } = new();

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string? filtroTipo;
    [ObservableProperty] private string? filtroEsito;
    [ObservableProperty] private string dataDa = "";
    [ObservableProperty] private string dataA = "";
    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public int TotaleVisibili => Solleciti.Count;

    public SollecitoViewModel()
    {
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroTipoChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroEsitoChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnDataDaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnDataAChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetAll());

            Tipi.Clear();
            Tipi.Add(null); // "Tutti i tipi"
            foreach (var t in _tutti.Select(s => s.DocumentoTipo)
                         .Where(t => !string.IsNullOrWhiteSpace(t))
                         .Distinct()
                         .OrderBy(t => t))
                Tipi.Add(t);

            Esiti.Clear();
            Esiti.Add(null); // "Tutti gli esiti"
            foreach (var e in _tutti.Select(s => s.Esito)
                         .Where(e => !string.IsNullOrWhiteSpace(e))
                         .Distinct()
                         .OrderBy(e => e))
                Esiti.Add(e);

            ApplicaFiltri();
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri + intervallo date.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Sollecito> q = _tutti;

        if (!string.IsNullOrWhiteSpace(FiltroTipo))
            q = q.Where(s => s.DocumentoTipo == FiltroTipo);

        if (!string.IsNullOrWhiteSpace(FiltroEsito))
            q = q.Where(s => s.Esito == FiltroEsito);

        // Date ISO (yyyy-MM-dd): il confronto lessicografico coincide con quello
        // cronologico. Estremi inclusi.
        var da = DataDa?.Trim();
        if (!string.IsNullOrEmpty(da))
            q = q.Where(s => string.CompareOrdinal(s.DataInvio, da) >= 0);

        var a = DataA?.Trim();
        if (!string.IsNullOrEmpty(a))
            q = q.Where(s => string.CompareOrdinal(s.DataInvio, a) <= 0);

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(s =>
                (s.DocumentoNumero ?? "").ToLowerInvariant().Contains(t) ||
                (s.Controparte ?? "").ToLowerInvariant().Contains(t) ||
                s.EmailDestinatario.ToLowerInvariant().Contains(t) ||
                s.DocumentoTipoLabel.ToLowerInvariant().Contains(t) ||
                s.Esito.ToLowerInvariant().Contains(t));
        }

        Solleciti.Clear();
        foreach (var s in q)
            Solleciti.Add(s);
        OnPropertyChanged(nameof(TotaleVisibili));
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo i filtri, azzero, ricalcolo una volta.
        _sospendiFiltri = true;
        FiltroTipo = null;
        FiltroEsito = null;
        DataDa = "";
        DataA = "";
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }
}

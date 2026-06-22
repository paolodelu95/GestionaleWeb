using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Registro attività in SOLA LETTURA (tabella <c>audit_log</c>): lista filtrabile
/// per tipo entità, azione e data, con ricerca testuale. Nessun comando di
/// creazione/modifica/eliminazione — l'audit lo scrive solo il backend.
/// Replica il componente Angular <c>storico</c> (audit/recent?limit=200) aggiungendo
/// il filtro per data, richiesto dalla specifica desktop.
/// </summary>
public partial class AuditViewModel : ViewModelBase
{
    private readonly AuditRepository _repo = new();

    /// <summary>Voci caricate (sorgente non filtrata).</summary>
    private readonly List<Audit> _tutti = new();

    /// <summary>Lista mostrata, già filtrata. Bindata alla DataGrid.</summary>
    public ObservableCollection<Audit> Voci { get; } = new();

    /// <summary>Tipi entità distinti per il combo del filtro (con "Tutti" = null).</summary>
    public ObservableCollection<string?> Tipi { get; } = new();

    /// <summary>Azioni selezionabili nel combo (con "Tutte" = null).</summary>
    public ObservableCollection<string?> Azioni { get; } = new() { null, "CREATE", "UPDATE", "DELETE" };

    [ObservableProperty] private string ricerca = "";
    [ObservableProperty] private string? filtroEntity;
    [ObservableProperty] private string? filtroAction;

    /// <summary>Estremo inferiore del filtro data (incluso); null = nessun limite.</summary>
    [ObservableProperty] private DateTimeOffset? filtroDa;

    /// <summary>Estremo superiore del filtro data (incluso fino a fine giornata); null = nessun limite.</summary>
    [ObservableProperty] private DateTimeOffset? filtroA;

    [ObservableProperty] private bool occupato;

    /// <summary>Sospende ApplicaFiltri durante reset/caricamenti multipli.</summary>
    private bool _sospendiFiltri;

    public int TotaleCount => _tutti.Count;
    public int VisibiliCount => Voci.Count;

    public AuditViewModel()
    {
        Carica();
    }

    // I filtri si riapplicano appena cambia uno dei criteri.
    partial void OnRicercaChanged(string value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroEntityChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroActionChanged(string? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroDaChanged(DateTimeOffset? value) { if (!_sospendiFiltri) ApplicaFiltri(); }
    partial void OnFiltroAChanged(DateTimeOffset? value) { if (!_sospendiFiltri) ApplicaFiltri(); }

    /// <summary>Ricarica le 200 voci più recenti dal DB (parità con load()).</summary>
    [RelayCommand]
    private void Carica()
    {
        Occupato = true;
        try
        {
            _tutti.Clear();
            _tutti.AddRange(_repo.GetRecent());

            // "Tutti" + tipi entità distinti ordinati (parità con get tipi()).
            Tipi.Clear();
            Tipi.Add(null);
            foreach (var t in _tutti.Select(a => a.EntityType)
                         .Where(t => !string.IsNullOrWhiteSpace(t))
                         .Distinct()
                         .OrderBy(t => t, StringComparer.CurrentCultureIgnoreCase))
                Tipi.Add(t);

            ApplicaFiltri();
            OnPropertyChanged(nameof(TotaleCount));
        }
        finally { Occupato = false; }
    }

    /// <summary>Ricalcola la lista visibile combinando ricerca + filtri.</summary>
    private void ApplicaFiltri()
    {
        IEnumerable<Audit> q = _tutti;

        if (!string.IsNullOrWhiteSpace(FiltroEntity))
            q = q.Where(a => a.EntityType == FiltroEntity);

        if (!string.IsNullOrWhiteSpace(FiltroAction))
            q = q.Where(a => a.Action == FiltroAction);

        // Filtro per data: confronto sulla data locale della voce. "A" è inclusivo
        // fino a fine giornata.
        if (FiltroDa is { } da)
        {
            var soglia = da.Date;
            q = q.Where(a => DataLocale(a) is { } d && d >= soglia);
        }
        if (FiltroA is { } a2)
        {
            var soglia = a2.Date.AddDays(1);
            q = q.Where(a => DataLocale(a) is { } d && d < soglia);
        }

        var term = Ricerca?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var t = term.ToLowerInvariant();
            q = q.Where(a =>
                a.EntityType.ToLowerInvariant().Contains(t) ||
                a.Action.ToLowerInvariant().Contains(t) ||
                a.EntityId.ToString().Contains(t) ||
                (a.Payload?.ToLowerInvariant().Contains(t) ?? false));
        }

        Voci.Clear();
        foreach (var a in q)
            Voci.Add(a);
        OnPropertyChanged(nameof(VisibiliCount));
    }

    /// <summary>Data/ora locale parsata dal TEXT ISO (UTC) della voce; null se illeggibile.</summary>
    private static DateTime? DataLocale(Audit a)
    {
        if (string.IsNullOrWhiteSpace(a.CreatedAt)) return null;
        var s = a.CreatedAt.Replace(' ', 'T');
        return DateTime.TryParse(s, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var utc)
            ? utc.ToLocalTime()
            : null;
    }

    [RelayCommand]
    private void ResetFiltri()
    {
        // Evito riapplicazioni multiple: sospendo i filtri, azzero i campi, ricalcolo una volta.
        _sospendiFiltri = true;
        FiltroEntity = null;
        FiltroAction = null;
        FiltroDa = null;
        FiltroA = null;
        Ricerca = "";
        _sospendiFiltri = false;
        ApplicaFiltri();
    }
}

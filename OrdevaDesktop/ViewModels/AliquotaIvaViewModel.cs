using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// ViewModel dell'anagrafica "Aliquote IVA": lista osservabile con ricerca,
/// form di editing inline e comandi Aggiungi / Salva / Annulla / Elimina.
/// I campi del form sono proprietà flat sul ViewModel così i binding compilati
/// notificano correttamente (la validazione di Salva reagisce al Nome).
/// </summary>
public sealed partial class AliquotaIvaViewModel : ViewModelBase
{
    private readonly AliquotaIvaRepository _repo;

    // Sorgente completa non filtrata: la lista mostrata viene derivata da qui.
    private List<AliquotaIva> _all = new();

    /// <summary>Elenco mostrato nel DataGrid (già filtrato per <see cref="Ricerca"/>).</summary>
    public ObservableCollection<AliquotaIva> Aliquote { get; } = new();

    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>Riga selezionata nel DataGrid.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ModificaCommand))]
    [NotifyCanExecuteChangedFor(nameof(EliminaCommand))]
    private AliquotaIva? _selezionata;

    // ── form di editing (campi flat) ─────────────────────────────────────────────

    /// <summary>True quando il form (nuovo/modifica) è aperto.</summary>
    [ObservableProperty]
    private bool _inModifica;

    // Id in modifica (0 = nuovo inserimento).
    private long _formId;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _formNome = string.Empty;

    [ObservableProperty]
    private decimal _formValore = 22m;

    [ObservableProperty]
    private string _formCodice = string.Empty;

    [ObservableProperty]
    private string _formCategoria = string.Empty;

    [ObservableProperty]
    private string _formDescrizione = string.Empty;

    [ObservableProperty]
    private string _formNatura = string.Empty;

    [ObservableProperty]
    private string _formNote = string.Empty;

    [ObservableProperty]
    private bool _formPredefinito;

    [ObservableProperty]
    private bool _formAttiva = true;

    public string TitoloForm => _formId == 0 ? "Nuova aliquota IVA" : "Modifica aliquota IVA";

    public AliquotaIvaViewModel() : this(new AliquotaIvaRepository()) { }

    public AliquotaIvaViewModel(AliquotaIvaRepository repo)
    {
        _repo = repo;
        Carica();
    }

    /// <summary>(Ri)carica dal DB e riapplica il filtro corrente.</summary>
    public void Carica()
    {
        _all = _repo.GetAll();
        ApplicaFiltro();
    }

    partial void OnRicercaChanged(string value) => ApplicaFiltro();

    private void ApplicaFiltro()
    {
        var q = (Ricerca ?? string.Empty).Trim();
        IEnumerable<AliquotaIva> filtrate = _all;
        if (q.Length > 0)
        {
            filtrate = _all.Where(a =>
                (a.Nome?.Contains(q, System.StringComparison.OrdinalIgnoreCase) ?? false) ||
                (a.Codice?.Contains(q, System.StringComparison.OrdinalIgnoreCase) ?? false) ||
                (a.Categoria?.Contains(q, System.StringComparison.OrdinalIgnoreCase) ?? false) ||
                (a.Descrizione?.Contains(q, System.StringComparison.OrdinalIgnoreCase) ?? false));
        }

        Aliquote.Clear();
        foreach (var a in filtrate) Aliquote.Add(a);
    }

    // ── comandi ───────────────────────────────────────────────────────────────

    [RelayCommand]
    private void Aggiungi()
    {
        CaricaForm(null);
        InModifica = true;
    }

    private bool HaSelezione() => Selezionata is not null;

    [RelayCommand(CanExecute = nameof(HaSelezione))]
    private void Modifica()
    {
        if (Selezionata is null) return;
        CaricaForm(Selezionata);
        InModifica = true;
    }

    private bool PuoSalvare() => !string.IsNullOrWhiteSpace(FormNome);

    [RelayCommand(CanExecute = nameof(PuoSalvare))]
    private void Salva()
    {
        if (!PuoSalvare()) return;
        var a = new AliquotaIva
        {
            Id = _formId,
            Nome = FormNome,
            Valore = FormValore,
            Codice = FormCodice,
            Categoria = FormCategoria,
            Descrizione = FormDescrizione,
            Natura = FormNatura,
            Note = FormNote,
            Predefinito = FormPredefinito,
            Attiva = FormAttiva,
        };
        if (_formId == 0) _repo.Insert(a);
        else _repo.Update(a);
        InModifica = false;
        Carica();
    }

    [RelayCommand]
    private void Annulla() => InModifica = false;

    [RelayCommand(CanExecute = nameof(HaSelezione))]
    private void Elimina()
    {
        if (Selezionata is null) return;
        _repo.Delete(Selezionata.Id);
        Selezionata = null;
        Carica();
    }

    // Riempie i campi del form da una riga (null = nuovo inserimento).
    private void CaricaForm(AliquotaIva? a)
    {
        _formId = a?.Id ?? 0;
        FormNome = a?.Nome ?? string.Empty;
        FormValore = a?.Valore ?? 22m;
        FormCodice = a?.Codice ?? string.Empty;
        FormCategoria = a?.Categoria ?? string.Empty;
        FormDescrizione = a?.Descrizione ?? string.Empty;
        FormNatura = a?.Natura ?? string.Empty;
        FormNote = a?.Note ?? string.Empty;
        FormPredefinito = a?.Predefinito ?? false;
        FormAttiva = a?.Attiva ?? true;
        OnPropertyChanged(nameof(TitoloForm));
    }
}

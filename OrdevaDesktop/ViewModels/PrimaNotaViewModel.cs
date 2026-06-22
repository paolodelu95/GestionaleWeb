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
/// ViewModel della "Prima Nota" (cassa/banca). Espone la lista filtrabile per
/// mese, conto e tipo, i totali di riepilogo (entrate/uscite/saldo), la selezione
/// multipla per l'eliminazione in blocco e un editor inline (pannello laterale)
/// per creare/modificare una registrazione. Replica le regole di
/// routes/prima_nota.rs e i filtri del componente Angular prima-nota.
/// </summary>
public partial class PrimaNotaViewModel : ViewModelBase
{
    private readonly PrimaNotaRepository _repo;

    /// <summary>Sorgente del mese caricato dal DB (prima dei filtri conto/tipo).</summary>
    private readonly List<PrimaNota> _all = new();

    public PrimaNotaViewModel() : this(new PrimaNotaRepository()) { }

    public PrimaNotaViewModel(PrimaNotaRepository repo)
    {
        _repo = repo;
        Load();
    }

    /// <summary>Righe attualmente mostrate (dopo ricerca/filtri).</summary>
    public ObservableCollection<PrimaNota> Items { get; } = new();

    /// <summary>Righe selezionate nel DataGrid (per l'eliminazione in blocco).</summary>
    public ObservableCollection<PrimaNota> Selezionati { get; } = new();

    // ── Filtri ────────────────────────────────────────────────────────────────

    /// <summary>Testo di ricerca libera (causale / note / conto).</summary>
    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>
    /// Mese selezionato come "MM" (01..12) oppure stringa vuota per "tutti".
    /// Il filtro per mese è server-side (strftime), come la API.
    /// </summary>
    [ObservableProperty]
    private MeseOption _filtroMese = MesiOptions[0];

    /// <summary>Filtro per conto: "" (tutti), "CASSA" o "BANCA".</summary>
    [ObservableProperty]
    private string _filtroConto = string.Empty;

    /// <summary>Filtro per tipo: "" (tutti), "ENTRATA" o "USCITA".</summary>
    [ObservableProperty]
    private string _filtroTipo = string.Empty;

    /// <summary>Anno usato per costruire il parametro mese ("yyyy-MM").</summary>
    public int AnnoCorrente { get; } = DateTime.Today.Year;

    // ── Totali di riepilogo ─────────────────────────────────────────────────────

    /// <summary>Totale entrate del mese caricato.</summary>
    [ObservableProperty]
    private decimal _totaleEntrate;

    /// <summary>Totale uscite del mese caricato.</summary>
    [ObservableProperty]
    private decimal _totaleUscite;

    /// <summary>Saldo (entrate - uscite) del mese caricato.</summary>
    [ObservableProperty]
    private decimal _saldo;

    // ── Editor inline ───────────────────────────────────────────────────────────

    /// <summary>Id della registrazione in editing (null = nuova). Stato interno.</summary>
    private int? _editId;

    /// <summary>True quando l'editor laterale è visibile.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TitoloEditor))]
    private bool _editorAperto;

    /// <summary>Campo Data dell'editor (ISO "yyyy-MM-dd").</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private DateTimeOffset _editData = DateTimeOffset.Now;

    /// <summary>Campo Tipo dell'editor (ENTRATA/USCITA).</summary>
    [ObservableProperty]
    private string _editTipo = "ENTRATA";

    /// <summary>Campo Causale dell'editor.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editCausale = string.Empty;

    /// <summary>Campo Importo dell'editor (deve essere &gt; 0).</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private decimal _editImporto;

    /// <summary>Campo Conto dell'editor (CASSA/BANCA).</summary>
    [ObservableProperty]
    private string _editConto = "CASSA";

    /// <summary>Campo Note dell'editor.</summary>
    [ObservableProperty]
    private string _editNote = string.Empty;

    /// <summary>Titolo del pannello editor.</summary>
    public string TitoloEditor =>
        _editId is > 0 ? "Modifica registrazione" : "Nuova registrazione";

    // ── Opzioni delle combo ─────────────────────────────────────────────────────

    /// <summary>Tipi disponibili nell'editor.</summary>
    public IReadOnlyList<string> Tipi { get; } = new[] { "ENTRATA", "USCITA" };

    /// <summary>Conti disponibili nell'editor.</summary>
    public IReadOnlyList<string> Conti { get; } = new[] { "CASSA", "BANCA" };

    /// <summary>Conti disponibili nel filtro (con voce "tutti").</summary>
    public IReadOnlyList<string> FiltroConti { get; } = new[] { string.Empty, "CASSA", "BANCA" };

    /// <summary>Tipi disponibili nel filtro (con voce "tutti").</summary>
    public IReadOnlyList<string> FiltroTipi { get; } = new[] { string.Empty, "ENTRATA", "USCITA" };

    /// <summary>Mesi disponibili nel filtro (con voce "Tutti i mesi"), come nel web.</summary>
    public static IReadOnlyList<MeseOption> MesiOptions { get; } = BuildMesi();

    public IReadOnlyList<MeseOption> Mesi => MesiOptions;

    // ── Reazioni ai filtri ──────────────────────────────────────────────────────

    partial void OnRicercaChanged(string value) => ApplyFilter();
    partial void OnFiltroContoChanged(string value) => ApplyFilter();
    partial void OnFiltroTipoChanged(string value) => ApplyFilter();
    partial void OnFiltroMeseChanged(MeseOption value) => Load(); // mese = ricarica server-side

    // ── Comandi ─────────────────────────────────────────────────────────────────

    /// <summary>(Ri)carica dal DB il mese selezionato e riapplica i filtri locali.</summary>
    [RelayCommand]
    private void Load()
    {
        _all.Clear();
        _all.AddRange(_repo.GetAll(BuildMeseParam()));

        // Totali come la API: somma su TUTTE le righe del mese (prima dei filtri
        // locali conto/tipo), così il riepilogo non "salta" cambiando i filtri.
        TotaleEntrate = _all.Where(p => p.Tipo == "ENTRATA").Sum(p => p.Importo);
        TotaleUscite = _all.Where(p => p.Tipo == "USCITA").Sum(p => p.Importo);
        Saldo = TotaleEntrate - TotaleUscite;

        ApplyFilter();
    }

    private void ApplyFilter()
    {
        var q = (Ricerca ?? string.Empty).Trim();
        IEnumerable<PrimaNota> filtered = _all;

        if (!string.IsNullOrEmpty(FiltroConto))
            filtered = filtered.Where(p => p.Conto == FiltroConto);

        if (!string.IsNullOrEmpty(FiltroTipo))
            filtered = filtered.Where(p => p.Tipo == FiltroTipo);

        if (q.Length > 0)
            filtered = filtered.Where(p =>
                (p.Causale?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (p.Note?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (p.Conto?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false));

        Items.Clear();
        foreach (var p in filtered)
            Items.Add(p);

        Selezionati.Clear();
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }

    /// <summary>Azzera tutti i filtri e ricarica (come resetFiltri del web).</summary>
    [RelayCommand]
    private void ResetFiltri()
    {
        Ricerca = string.Empty;
        FiltroConto = string.Empty;
        FiltroTipo = string.Empty;
        FiltroMese = MesiOptions[0]; // scatena Load()
    }

    /// <summary>Apre l'editor su una nuova registrazione con i default del web.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditData = DateTimeOffset.Now;
        EditTipo = "ENTRATA";
        EditCausale = string.Empty;
        EditImporto = 0m;
        EditConto = "CASSA";
        EditNote = string.Empty;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sui valori della registrazione selezionata.</summary>
    [RelayCommand]
    private void Modifica(PrimaNota? p)
    {
        if (p is null) return;
        _editId = p.Id;
        EditData = ParseData(p.Data);
        EditTipo = p.Tipo == "USCITA" ? "USCITA" : "ENTRATA";
        EditCausale = p.Causale;
        EditImporto = p.Importo;
        EditConto = p.Conto == "BANCA" ? "BANCA" : "CASSA";
        EditNote = p.Note;
        OnPropertyChanged(nameof(TitoloEditor));
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla() => EditorAperto = false;

    /// <summary>Salva (insert o update) la registrazione in editing e ricarica.</summary>
    [RelayCommand(CanExecute = nameof(CanSalva))]
    private void Salva()
    {
        var p = new PrimaNota
        {
            Id = _editId,
            Data = EditData.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            Tipo = EditTipo,
            Causale = EditCausale,
            Importo = EditImporto,
            Conto = EditConto,
            Note = EditNote,
            // riferimento_* non sono editabili da UI: si conservano lato DB solo
            // per le righe generate automaticamente (incassi). Qui restano vuoti.
        };

        if (p.Id is > 0) _repo.Update(p);
        else _repo.Insert(p);

        EditorAperto = false;
        Load();
    }

    /// <summary>
    /// Regola di validazione del backend (valida()): data, causale e importo &gt; 0
    /// obbligatori; tipo già vincolato dalla combo.
    /// </summary>
    private bool CanSalva() =>
        !string.IsNullOrWhiteSpace(EditCausale) && EditImporto > 0m;

    /// <summary>Elimina una singola registrazione e ricarica.</summary>
    [RelayCommand]
    private void Elimina(PrimaNota? p)
    {
        if (p?.Id is not > 0) return;
        _repo.Delete(p.Id.Value);
        if (_editId == p.Id) EditorAperto = false;
        Load();
    }

    /// <summary>Elimina in blocco le righe selezionate (una sola query).</summary>
    [RelayCommand(CanExecute = nameof(CanEliminaSelezionati))]
    private void EliminaSelezionati()
    {
        var ids = Selezionati.Where(p => p.Id is > 0).Select(p => p.Id!.Value).ToList();
        if (ids.Count == 0) return;
        _repo.DeleteMany(ids);
        if (_editId is not null && ids.Contains(_editId.Value)) EditorAperto = false;
        Load();
    }

    private bool CanEliminaSelezionati() => Selezionati.Count > 0;

    /// <summary>Numero di righe selezionate (per la barra azioni di blocco).</summary>
    public int NumeroSelezionati => Selezionati.Count;

    /// <summary>Chiamato dalla View quando cambia la selezione del DataGrid.</summary>
    public void AggiornaSelezione(IEnumerable<PrimaNota> selezione)
    {
        Selezionati.Clear();
        foreach (var p in selezione)
            Selezionati.Add(p);
        OnPropertyChanged(nameof(NumeroSelezionati));
        EliminaSelezionatiCommand.NotifyCanExecuteChanged();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /// <summary>Costruisce "yyyy-MM" dal mese filtro, o null per "tutti i mesi".</summary>
    private string? BuildMeseParam()
    {
        var mm = FiltroMese?.Valore;
        if (string.IsNullOrEmpty(mm)) return null;
        return $"{AnnoCorrente}-{mm}";
    }

    /// <summary>Converte la data ISO della riga in DateTimeOffset (oggi se vuota).</summary>
    private static DateTimeOffset ParseData(string? iso)
    {
        if (!string.IsNullOrWhiteSpace(iso) &&
            DateTimeOffset.TryParse(iso, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeLocal, out var d))
        {
            return d;
        }
        return DateTimeOffset.Now;
    }

    private static IReadOnlyList<MeseOption> BuildMesi()
    {
        var it = CultureInfo.GetCultureInfo("it-IT");
        var list = new List<MeseOption> { new(string.Empty, "Tutti i mesi") };
        for (var i = 1; i <= 12; i++)
        {
            var nome = it.DateTimeFormat.GetMonthName(i);
            list.Add(new MeseOption(i.ToString("00", CultureInfo.InvariantCulture), nome));
        }
        return list;
    }
}

/// <summary>Opzione per la combo "mese": valore "MM" (o vuoto) ed etichetta.</summary>
public sealed record MeseOption(string Valore, string Etichetta)
{
    public override string ToString() => Etichetta;
}

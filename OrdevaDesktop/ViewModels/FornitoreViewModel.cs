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
/// Anagrafica fornitori: lista filtrabile, editor inline e selezione multipla con
/// eliminazione in blocco. Replica le regole del componente Angular e del backend:
/// ricerca su ragione sociale / email / città / P.IVA, ragione sociale obbligatoria,
/// duplicati P.IVA bloccati con messaggio, doppio ruolo "anche cliente".
/// </summary>
public partial class FornitoreViewModel : ViewModelBase
{
    private readonly FornitoreRepository _repo;

    /// <summary>Sorgente completa (non filtrata); la lista mostrata è <see cref="Items"/>.</summary>
    private readonly List<Fornitore> _all = new();

    /// <summary>Fornitori attualmente visibili (dopo il filtro di ricerca).</summary>
    public ObservableCollection<Fornitore> Items { get; } = new();

    /// <summary>Fornitori selezionati in griglia (per l'eliminazione in blocco).</summary>
    public ObservableCollection<Fornitore> Selezionati { get; } = new();

    /// <summary>Testo di ricerca; filtra su più campi.</summary>
    [ObservableProperty]
    private string _ricerca = string.Empty;

    /// <summary>Fornitore selezionato in griglia (riga singola).</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ModificaCommand))]
    [NotifyCanExecuteChangedFor(nameof(EliminaCommand))]
    private Fornitore? _selezionato;

    /// <summary>Messaggio d'errore mostrato nell'editor (vuoto = nessun errore).</summary>
    [ObservableProperty]
    private string _errore = string.Empty;

    // ── Stato dell'editor inline ─────────────────────────────────────────────

    [ObservableProperty]
    private bool _editorAperto;

    [ObservableProperty]
    private string _editorTitolo = "Nuovo fornitore";

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SalvaCommand))]
    private string _editRagioneSociale = string.Empty;

    [ObservableProperty] private string _editEmail = string.Empty;
    [ObservableProperty] private string _editTelefono = string.Empty;
    [ObservableProperty] private string _editCellulare = string.Empty;
    [ObservableProperty] private string _editVia = string.Empty;
    [ObservableProperty] private string _editCap = string.Empty;
    [ObservableProperty] private string _editCitta = string.Empty;
    [ObservableProperty] private string _editProvincia = string.Empty;
    [ObservableProperty] private string _editStato = "Italia";
    [ObservableProperty] private string _editPIva = string.Empty;
    [ObservableProperty] private string _editSdi = string.Empty;
    [ObservableProperty] private string _editPec = string.Empty;
    [ObservableProperty] private bool _editEstero;
    [ObservableProperty] private bool _editAncheCliente;

    /// <summary>Id del fornitore in modifica (null = nuovo inserimento).</summary>
    private long? _editId;

    public FornitoreViewModel() : this(new FornitoreRepository()) { }

    public FornitoreViewModel(FornitoreRepository repo)
    {
        _repo = repo;
        Carica();
    }

    /// <summary>(Ri)carica i fornitori dal database.</summary>
    public void Carica()
    {
        _all.Clear();
        _all.AddRange(_repo.GetAll());
        ApplicaFiltro();
    }

    partial void OnRicercaChanged(string value) => ApplicaFiltro();

    /// <summary>
    /// Filtra la lista: match case-insensitive su ragione sociale, email, città
    /// e P.IVA (come la ricerca della tabella Angular).
    /// </summary>
    private void ApplicaFiltro()
    {
        var q = Ricerca?.Trim();
        IEnumerable<Fornitore> filtrati = _all;
        if (!string.IsNullOrEmpty(q))
            filtrati = _all.Where(f =>
                Contiene(f.RagioneSociale, q) ||
                Contiene(f.Email, q) ||
                Contiene(f.Citta, q) ||
                Contiene(f.PIva, q));

        Items.Clear();
        foreach (var f in filtrati)
            Items.Add(f);
    }

    private static bool Contiene(string? s, string q) =>
        !string.IsNullOrEmpty(s) && s.Contains(q, StringComparison.OrdinalIgnoreCase);

    // ── Comandi ───────────────────────────────────────────────────────────────

    /// <summary>Apre l'editor per un nuovo fornitore.</summary>
    [RelayCommand]
    private void Aggiungi()
    {
        _editId = null;
        EditRagioneSociale = string.Empty;
        EditEmail = EditTelefono = EditCellulare = string.Empty;
        EditVia = EditCap = EditCitta = EditProvincia = string.Empty;
        EditStato = "Italia";
        EditPIva = EditSdi = EditPec = string.Empty;
        EditEstero = false;
        EditAncheCliente = false;
        Errore = string.Empty;
        EditorTitolo = "Nuovo fornitore";
        EditorAperto = true;
    }

    /// <summary>Apre l'editor sul fornitore selezionato.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezionato))]
    private void Modifica()
    {
        if (Selezionato is null) return;
        var f = Selezionato;
        _editId = f.Id;
        EditRagioneSociale = f.RagioneSociale;
        EditEmail = f.Email;
        EditTelefono = f.Telefono;
        EditCellulare = f.Cellulare;
        EditVia = f.Via;
        EditCap = f.Cap;
        EditCitta = f.Citta;
        EditProvincia = f.Provincia;
        EditStato = string.IsNullOrWhiteSpace(f.Stato) ? "Italia" : f.Stato;
        EditPIva = f.PIva;
        EditSdi = f.Sdi;
        EditPec = f.Pec;
        EditEstero = f.Estero;
        EditAncheCliente = f.AncheCliente;
        Errore = string.Empty;
        EditorTitolo = "Modifica fornitore";
        EditorAperto = true;
    }

    /// <summary>Chiude l'editor senza salvare.</summary>
    [RelayCommand]
    private void Annulla()
    {
        Errore = string.Empty;
        EditorAperto = false;
    }

    /// <summary>Salva (insert o update) il fornitore in editor.</summary>
    [RelayCommand(CanExecute = nameof(PuoSalvare))]
    private void Salva()
    {
        var rs = EditRagioneSociale.Trim();
        if (rs.Length == 0)
        {
            Errore = "La ragione sociale è obbligatoria";
            return;
        }

        var entita = new Fornitore
        {
            Id = _editId,
            RagioneSociale = rs,
            Email = EditEmail?.Trim() ?? string.Empty,
            Telefono = EditTelefono?.Trim() ?? string.Empty,
            Cellulare = EditCellulare?.Trim() ?? string.Empty,
            Via = EditVia?.Trim() ?? string.Empty,
            Cap = EditCap?.Trim() ?? string.Empty,
            Citta = EditCitta?.Trim() ?? string.Empty,
            Provincia = EditProvincia?.Trim() ?? string.Empty,
            Stato = string.IsNullOrWhiteSpace(EditStato) ? "Italia" : EditStato.Trim(),
            PIva = EditPIva?.Trim() ?? string.Empty,
            Sdi = EditSdi?.Trim() ?? string.Empty,
            Pec = EditPec?.Trim() ?? string.Empty,
            Estero = EditEstero,
            AncheCliente = EditAncheCliente,
        };

        try
        {
            if (_editId is null)
                entita.Id = _repo.Insert(entita);
            else
                _repo.Update(entita);
        }
        catch (DuplicatePivaException ex)
        {
            Errore = ex.Message;
            return;
        }
        catch (ArgumentException ex)
        {
            Errore = ex.Message;
            return;
        }

        Errore = string.Empty;
        EditorAperto = false;
        Carica();
        Selezionato = Items.FirstOrDefault(c => c.Id == entita.Id);
    }

    /// <summary>Elimina il fornitore selezionato.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezionato))]
    private void Elimina()
    {
        if (Selezionato?.Id is not long id) return;
        _repo.Delete(id);
        Carica();
    }

    /// <summary>Elimina in blocco tutti i fornitori selezionati.</summary>
    [RelayCommand(CanExecute = nameof(HasSelezioneMultipla))]
    private void EliminaSelezionati()
    {
        var ids = Selezionati.Where(f => f.Id is not null).Select(f => f.Id!.Value).ToList();
        if (ids.Count == 0) return;
        _repo.DeleteMany(ids);
        Selezionati.Clear();
        Carica();
    }

    // ── Predicati CanExecute ──────────────────────────────────────────────────

    private bool HasSelezionato() => Selezionato is not null;
    private bool HasSelezioneMultipla() => Selezionati.Count > 0;
    private bool PuoSalvare() => !string.IsNullOrWhiteSpace(EditRagioneSociale);

    /// <summary>Da richiamare quando cambia la selezione multipla in griglia.</summary>
    public void NotificaSelezioneCambiata() => EliminaSelezionatiCommand.NotifyCanExecuteChanged();
}

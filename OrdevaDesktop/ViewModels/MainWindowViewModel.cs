using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

namespace Ordeva.Desktop.ViewModels;

/// <summary>Una voce della barra di navigazione laterale.</summary>
public record NavItem(string Titolo, string Icona, ViewModelBase Vm);

public partial class MainWindowViewModel : ViewModelBase
{
    /// <summary>Voci della sidebar di navigazione.</summary>
    public ObservableCollection<NavItem> Nav { get; } = new();

    /// <summary>ViewModel della pagina attualmente mostrata a destra.</summary>
    [ObservableProperty]
    private ViewModelBase? _currentPage;

    /// <summary>Voce di nav selezionata: ne aggiorna la pagina corrente.</summary>
    [ObservableProperty]
    private NavItem? _selectedNav;

    public MainWindowViewModel()
    {
        // Documenti & anagrafiche principali
        AddNav(new NavItem("Home", "", new HomeViewModel()));
        AddNav(new NavItem("Prodotti", "", new ProdottoViewModel()));
        AddNav(new NavItem("Clienti", "", new ClienteViewModel()));
        AddNav(new NavItem("Fornitori", "", new FornitoreViewModel()));
        AddNav(new NavItem("Fatture", "", new FatturaViewModel()));
        AddNav(new NavItem("Preventivi", "", new PreventivoViewModel()));
        AddNav(new NavItem("Ordini", "", new OrdineViewModel()));
        AddNav(new NavItem("DDT", "", new DdtViewModel()));
        AddNav(new NavItem("Note credito", "", new NotaCreditoViewModel()));
        AddNav(new NavItem("Vendite banco", "", new VenditaBancoViewModel()));
        AddNav(new NavItem("Magazzino", "", new MagazzinoViewModel()));

        // Vendite/Documenti: ciclo passivo, ricorrenti, solleciti
        AddNav(new NavItem("Acquisti", "", new AcquistoViewModel()));
        AddNav(new NavItem("Arrivi merce", "", new ArrivoMerceViewModel()));
        AddNav(new NavItem("Fatture ricorrenti", "", new FatturaRicorrenteViewModel()));
        AddNav(new NavItem("Solleciti", "", new SollecitoViewModel()));

        // Contabilita'
        AddNav(new NavItem("Pagamenti", "", new PagamentoViewModel()));
        AddNav(new NavItem("Prima nota", "", new PrimaNotaViewModel()));

        // Produttivita'
        AddNav(new NavItem("Progetti", "", new ProgettoViewModel()));
        AddNav(new NavItem("Timesheet", "", new TimesheetViewModel()));
        AddNav(new NavItem("Agenda", "", new AppuntamentoViewModel()));
        AddNav(new NavItem("To-do", "", new TodoViewModel()));
        AddNav(new NavItem("Note rapide", "", new NotaRapidaViewModel()));
        AddNav(new NavItem("Lavagna", "", new LavagnaViewModel()));
        AddNav(new NavItem("CRM", "", new CrmViewModel()));

        // Integrazioni
        AddNav(new NavItem("Ecommerce", "", new EcommerceViewModel()));

        // Impostazioni: azienda + anagrafiche di servizio
        AddNav(new NavItem("Azienda", "", new AziendaViewModel()));
        AddNav(new NavItem("Categorie", "", new CategoriaProdottoViewModel()));
        AddNav(new NavItem("Aliquote IVA", "", new AliquotaIvaViewModel()));
        AddNav(new NavItem("Unita' di misura", "", new UnitaMisuraViewModel()));
        AddNav(new NavItem("Tipi pagamento", "", new TipoPagamentoViewModel()));
        AddNav(new NavItem("Listini", "", new ListinoViewModel()));
        AddNav(new NavItem("Causali pagamento", "", new CausalePagamentoViewModel()));
        AddNav(new NavItem("Conti acquisto", "", new ContoAcquistoViewModel()));
        AddNav(new NavItem("Utenti", "", new UtenteViewModel()));

        // Sistema
        AddNav(new NavItem("Registro attivita'", "", new AuditViewModel()));

        SelectedNav = Nav.Count > 0 ? Nav[0] : null;
    }

    /// <summary>Aggiunge una voce alla navigazione.</summary>
    public void AddNav(NavItem item) => Nav.Add(item);

    partial void OnSelectedNavChanged(NavItem? value)
    {
        if (value != null)
            CurrentPage = value.Vm;
    }
}

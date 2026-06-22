using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

public partial class MagazzinoView : UserControl
{
    public MagazzinoView()
    {
        InitializeComponent();
        // SelectedItems del DataGrid non è bindabile: la riallineo a mano al VM
        // per abilitare l'eliminazione in blocco dei depositi.
        GrigliaDepositi.SelectionChanged += OnDepositiSelectionChanged;
    }

    private void OnDepositiSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not MagazzinoViewModel vm) return;

        vm.DepositiSelezionati.Clear();
        foreach (var item in GrigliaDepositi.SelectedItems)
            if (item is Magazzino m)
                vm.DepositiSelezionati.Add(m);

        vm.NotificaSelezioneCambiata();
    }
}

using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

public partial class FornitoreView : UserControl
{
    public FornitoreView()
    {
        InitializeComponent();
        // SelectedItems del DataGrid non è bindabile: la riallineo a mano al VM
        // per abilitare l'eliminazione in blocco (selezione multipla).
        Griglia.SelectionChanged += OnGrigliaSelectionChanged;
    }

    private void OnGrigliaSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not FornitoreViewModel vm) return;

        vm.Selezionati.Clear();
        foreach (var item in Griglia.SelectedItems)
            if (item is Fornitore f)
                vm.Selezionati.Add(f);

        vm.NotificaSelezioneCambiata();
    }
}

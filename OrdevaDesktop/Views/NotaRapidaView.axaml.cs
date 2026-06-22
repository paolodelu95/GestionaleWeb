using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

public partial class NotaRapidaView : UserControl
{
    public NotaRapidaView()
    {
        InitializeComponent();
        // SelectedItems del DataGrid non è bindabile: la riallineo a mano al VM
        // per abilitare l'eliminazione in blocco (selezione multipla).
        Griglia.SelectionChanged += OnGrigliaSelectionChanged;
    }

    private void OnGrigliaSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not NotaRapidaViewModel vm) return;

        vm.Selezionate.Clear();
        foreach (var item in Griglia.SelectedItems)
            if (item is NotaRapida n)
                vm.Selezionate.Add(n);

        vm.NotificaSelezioneCambiata();
    }
}

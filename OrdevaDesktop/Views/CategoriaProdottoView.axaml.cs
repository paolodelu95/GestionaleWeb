using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

public partial class CategoriaProdottoView : UserControl
{
    public CategoriaProdottoView()
    {
        InitializeComponent();
        // SelectedItems del DataGrid non è bindabile: la riallineo a mano al VM
        // per abilitare l'eliminazione in blocco (selezione multipla).
        Griglia.SelectionChanged += OnGrigliaSelectionChanged;
    }

    private void OnGrigliaSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not CategoriaProdottoViewModel vm) return;

        vm.Selezionate.Clear();
        foreach (var item in Griglia.SelectedItems)
            if (item is CategoriaProdotto c)
                vm.Selezionate.Add(c);

        vm.NotificaSelezioneCambiata();
    }
}

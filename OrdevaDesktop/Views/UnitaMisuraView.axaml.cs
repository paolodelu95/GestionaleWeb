using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

public partial class UnitaMisuraView : UserControl
{
    public UnitaMisuraView()
    {
        InitializeComponent();
    }

    /// <summary>
    /// La DataGrid di Avalonia non espone SelectedItems bindabile: sincronizziamo
    /// qui la selezione multipla verso la collezione del ViewModel.
    /// </summary>
    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not UnitaMisuraViewModel vm || sender is not DataGrid grid) return;
        vm.SelectedItems.Clear();
        foreach (var item in grid.SelectedItems)
            if (item is UnitaMisura um) vm.SelectedItems.Add(um);
    }
}

using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View di timesheet/progetti. La DataGrid di Avalonia non espone
/// <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione multipla dei
/// progetti nel ViewModel (unica logica ammessa nel code-behind oltre a
/// InitializeComponent).
/// </summary>
public partial class ProgettoView : UserControl
{
    public ProgettoView()
    {
        InitializeComponent();
        GridProgetti.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not ProgettoViewModel vm) return;

        vm.Selezionati.Clear();
        foreach (var item in GridProgetti.SelectedItems)
            if (item is Progetto p)
                vm.Selezionati.Add(p);
    }
}

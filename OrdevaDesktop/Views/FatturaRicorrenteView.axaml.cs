using Avalonia.Controls;
using Avalonia.Interactivity;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View delle fatture ricorrenti. La DataGrid di Avalonia non espone
/// <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione multipla nel
/// ViewModel (unica logica ammessa nel code-behind oltre a InitializeComponent).
/// </summary>
public partial class FatturaRicorrenteView : UserControl
{
    public FatturaRicorrenteView()
    {
        InitializeComponent();
        Grid.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not FatturaRicorrenteViewModel vm) return;

        vm.Selezionati.Clear();
        foreach (var item in Grid.SelectedItems)
            if (item is FatturaRicorrente r)
                vm.Selezionati.Add(r);
    }
}

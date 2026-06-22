using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View dello storico vendite al banco. La DataGrid di Avalonia non espone
/// <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione multipla nel
/// ViewModel (unica logica ammessa nel code-behind oltre a InitializeComponent).
/// </summary>
public partial class VenditaBancoView : UserControl
{
    public VenditaBancoView()
    {
        InitializeComponent();
        Grid.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not VenditaBancoViewModel vm) return;

        vm.Selezionate.Clear();
        foreach (var item in Grid.SelectedItems)
            if (item is VenditaBanco v)
                vm.Selezionate.Add(v);
    }
}

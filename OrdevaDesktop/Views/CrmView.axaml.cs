using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View della pipeline CRM. Come nelle altre liste, la DataGrid di Avalonia non
/// espone <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione multipla
/// nel ViewModel (unica logica ammessa nel code-behind oltre a InitializeComponent).
/// </summary>
public partial class CrmView : UserControl
{
    public CrmView()
    {
        InitializeComponent();
        Grid.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not CrmViewModel vm) return;

        vm.Selezionati.Clear();
        foreach (var item in Grid.SelectedItems)
            if (item is CrmOpportunita o)
                vm.Selezionati.Add(o);
    }
}

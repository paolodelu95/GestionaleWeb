using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View delle voci di timesheet. Come nelle altre liste, la DataGrid di Avalonia
/// non espone <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione
/// multipla nel ViewModel (unica logica ammessa nel code-behind oltre a
/// InitializeComponent).
/// </summary>
public partial class TimesheetView : UserControl
{
    public TimesheetView()
    {
        InitializeComponent();
        Grid.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not TimesheetViewModel vm) return;

        vm.Selezionate.Clear();
        foreach (var item in Grid.SelectedItems)
            if (item is TimesheetVoce v)
                vm.Selezionate.Add(v);
    }
}

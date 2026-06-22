using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View della bacheca "Lavagna". La DataGrid di Avalonia non espone
/// <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione multipla nel
/// ViewModel (unica logica ammessa nel code-behind oltre a InitializeComponent).
/// </summary>
public partial class LavagnaView : UserControl
{
    public LavagnaView()
    {
        InitializeComponent();
        Grid.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not LavagnaViewModel vm) return;

        vm.Selezionati.Clear();
        foreach (var item in Grid.SelectedItems)
            if (item is PostIt n)
                vm.Selezionati.Add(n);
    }
}

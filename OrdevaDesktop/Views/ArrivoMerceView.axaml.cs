using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View della lista arrivi merce. La DataGrid di Avalonia non espone
/// <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione multipla nel
/// ViewModel (unica logica ammessa nel code-behind oltre a InitializeComponent).
/// </summary>
public partial class ArrivoMerceView : UserControl
{
    public ArrivoMerceView()
    {
        InitializeComponent();
        Grid.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not ArrivoMerceViewModel vm) return;

        vm.Selezionati.Clear();
        foreach (var item in Grid.SelectedItems)
            if (item is ArrivoMerce a)
                vm.Selezionati.Add(a);
    }
}

using Avalonia.Controls;
using Avalonia.Interactivity;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View dell'elenco listini. La DataGrid di Avalonia non espone
/// <c>SelectedItems</c> bindabile: sincronizziamo qui la selezione multipla nel
/// ViewModel (unica logica ammessa nel code-behind oltre a InitializeComponent).
/// </summary>
public partial class ListinoView : UserControl
{
    public ListinoView()
    {
        InitializeComponent();
        Grid.SelectionChanged += OnSelectionChanged;
    }

    private void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not ListinoViewModel vm) return;

        vm.Selezionati.Clear();
        foreach (var item in Grid.SelectedItems)
            if (item is Listino l)
                vm.Selezionati.Add(l);
    }
}

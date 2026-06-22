using System.Collections.Generic;
using Avalonia.Controls;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

public partial class CausalePagamentoView : UserControl
{
    public CausalePagamentoView()
    {
        InitializeComponent();
        // SelectedItems del DataGrid non è bindabile: la riallineo a mano al VM
        // per abilitare l'eliminazione in blocco (selezione multipla).
        Griglia.SelectionChanged += OnGrigliaSelectionChanged;
    }

    private void OnGrigliaSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not CausalePagamentoViewModel vm) return;

        var selezione = new List<CausalePagamento>();
        foreach (var item in Griglia.SelectedItems)
            if (item is CausalePagamento c)
                selezione.Add(c);

        vm.AggiornaSelezione(selezione);
    }
}

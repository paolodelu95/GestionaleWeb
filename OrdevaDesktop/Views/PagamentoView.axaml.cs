using Avalonia.Controls;
using Avalonia.Interactivity;
using Ordeva.Desktop.Models;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View del registro pagamenti/scadenzario. La DataGrid di Avalonia non espone
/// SelectedItems bindabile: qui sincronizziamo la selezione singola dei movimenti
/// e la selezione multipla dello scadenzario verso il ViewModel (unica logica
/// ammessa nel code-behind oltre a InitializeComponent).
/// </summary>
public partial class PagamentoView : UserControl
{
    public PagamentoView()
    {
        InitializeComponent();
        GrigliaPagamenti.SelectionChanged += OnPagamentiSelectionChanged;
        GrigliaScadenzario.SelectionChanged += OnScadenzarioSelectionChanged;
    }

    private void OnPagamentiSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not PagamentoViewModel vm) return;
        vm.AggiornaMovimentoSelezionato(GrigliaPagamenti.SelectedItem as Pagamento);
    }

    private void OnScadenzarioSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is not PagamentoViewModel vm) return;

        var sel = new System.Collections.Generic.List<ScadenzarioEntry>();
        foreach (var item in GrigliaScadenzario.SelectedItems)
            if (item is ScadenzarioEntry s)
                sel.Add(s);
        vm.AggiornaSelezioneScadenze(sel);
    }
}

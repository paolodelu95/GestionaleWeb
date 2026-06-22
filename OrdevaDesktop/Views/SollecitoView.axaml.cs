using Avalonia.Controls;

namespace Ordeva.Desktop.Views;

/// <summary>
/// Storico solleciti: registro di sola lettura. Nessuna selezione multipla né
/// azioni di modifica, quindi il code-behind si limita a InitializeComponent.
/// </summary>
public partial class SollecitoView : UserControl
{
    public SollecitoView()
    {
        InitializeComponent();
    }
}

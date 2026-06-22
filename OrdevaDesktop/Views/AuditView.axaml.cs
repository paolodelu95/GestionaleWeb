using Avalonia.Controls;

namespace Ordeva.Desktop.Views;

/// <summary>
/// View del registro attività (storico modifiche). Sola lettura: nessuna selezione
/// multipla da sincronizzare, quindi il code-behind si limita a InitializeComponent.
/// </summary>
public partial class AuditView : UserControl
{
    public AuditView()
    {
        InitializeComponent();
    }
}

using System;
using Avalonia.Controls;
using Avalonia.Controls.Templates;
using Ordeva.Desktop.ViewModels;

namespace Ordeva.Desktop;

/// <summary>
/// Risolve un ViewModel nella sua View per convenzione di nome:
/// Ordeva.Desktop.ViewModels.XxxViewModel -> Ordeva.Desktop.Views.XxxView.
/// </summary>
public class ViewLocator : IDataTemplate
{
    public Control? Build(object? param)
    {
        if (param is null)
            return null;

        var name = param.GetType().FullName!
            .Replace("ViewModels", "Views", StringComparison.Ordinal)
            .Replace("ViewModel", "View", StringComparison.Ordinal);
        var type = Type.GetType(name);

        if (type != null)
            return (Control)Activator.CreateInstance(type)!;

        return new TextBlock { Text = "Not Found: " + name };
    }

    public bool Match(object? data)
    {
        return data is ViewModelBase;
    }
}

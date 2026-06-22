using CommunityToolkit.Mvvm.ComponentModel;
using Ordeva.Desktop.Services;

namespace Ordeva.Desktop.ViewModels;

public partial class HomeViewModel : ViewModelBase
{
    /// <summary>Titolo dell'app.</summary>
    [ObservableProperty]
    private string _titolo = "Ordeva";

    /// <summary>Percorso del file di database in uso.</summary>
    [ObservableProperty]
    private string _dbPath = AppPaths.DbPath;
}

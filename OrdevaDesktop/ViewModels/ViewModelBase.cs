using CommunityToolkit.Mvvm.ComponentModel;

namespace Ordeva.Desktop.ViewModels;

/// <summary>
/// Base di tutti i ViewModel. Estende ObservableObject del CommunityToolkit:
/// abilita [ObservableProperty] e [RelayCommand] nelle classi derivate.
/// </summary>
public abstract class ViewModelBase : ObservableObject
{
}

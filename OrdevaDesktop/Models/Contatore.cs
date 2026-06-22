namespace Ordeva.Desktop.Models;

/// <summary>
/// Contatore di numerazione documenti (tabella <c>contatori</c>). La chiave è
/// composta (tipo, anno): per ogni tipo di documento (es. "FATTURA", "DDT") e anno
/// si tiene l'ultimo progressivo usato in <see cref="Valore"/>.
///
/// NB: la numerazione "viva" della app usa il gap-filling (numerazione.rs) che scorre
/// i numeri già presenti e NON tocca questa tabella; <c>contatori</c> resta come
/// riserva/compatibilità. Questa entità rispecchia 1:1 la riga del DB.
/// </summary>
public sealed class Contatore
{
    /// <summary>Tipo di documento numerato (es. "FATTURA"). Parte della PK. NOT NULL.</summary>
    public string Tipo { get; set; } = "";

    /// <summary>Anno di riferimento del contatore. Parte della PK. NOT NULL.</summary>
    public int Anno { get; set; }

    /// <summary>Ultimo progressivo assegnato per (tipo, anno). Colonna DB "contatore", default 0.</summary>
    public int Valore { get; set; }
}

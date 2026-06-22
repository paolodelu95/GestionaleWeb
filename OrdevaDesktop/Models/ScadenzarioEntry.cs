namespace Ordeva.Desktop.Models;

/// <summary>
/// Voce dello scadenzario: un documento (fattura emessa o acquisto ricevuto) con
/// un residuo da incassare/pagare. È un DTO derivato (non una tabella): si calcola
/// con la stessa logica di routes/pagamenti.rs::scadenzario (totale righe IVA
/// inclusa, meno i pagamenti registrati; scadenza dal tipo di pagamento).
/// </summary>
public sealed class ScadenzarioEntry
{
    /// <summary>Id del documento (fattura o acquisto, a seconda di TipoEntry).</summary>
    public long Id { get; set; }

    /// <summary>"FATTURA" (da incassare) oppure "ACQUISTO" (da pagare).</summary>
    public string TipoEntry { get; set; } = "FATTURA";

    /// <summary>Numero del documento.</summary>
    public string? Numero { get; set; }

    /// <summary>Data emissione del documento (ISO "yyyy-MM-dd").</summary>
    public string DataEmissione { get; set; } = "";

    /// <summary>Data di scadenza calcolata dal tipo di pagamento (ISO, può essere null).</summary>
    public string? DataScadenza { get; set; }

    /// <summary>Controparte: cliente (fattura) o fornitore (acquisto).</summary>
    public string? Controparte { get; set; }

    /// <summary>Nome del tipo di pagamento del documento.</summary>
    public string? TipoPagamentoNome { get; set; }

    /// <summary>Conto suggerito per il saldo (dal tipo di pagamento). Default "BANCA".</summary>
    public string Conto { get; set; } = "BANCA";

    /// <summary>Totale documento (IVA inclusa).</summary>
    public decimal ImportoTotale { get; set; }

    /// <summary>Totale già pagato/incassato.</summary>
    public decimal ImportoPagato { get; set; }

    /// <summary>Residuo ancora da saldare (ImportoTotale - ImportoPagato).</summary>
    public decimal Rimanente { get; set; }
}

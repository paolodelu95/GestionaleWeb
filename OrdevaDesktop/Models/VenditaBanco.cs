using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Documento di vendita al banco / cassa (tabella <c>vendite_banco</c>) con le
/// righe e il totale calcolato. Le colonne SQLite sono snake_case: le query del
/// repository usano alias espliciti verso queste proprietà PascalCase.
/// Porta la logica del backend Rust (routes/vendite_banco.rs).
/// </summary>
public sealed class VenditaBanco
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";
    /// <summary>Data della vendita in formato ISO "yyyy-MM-dd" (TEXT in DB).</summary>
    public string Data { get; set; } = "";

    /// <summary>Nome cliente (testo libero, non FK). Vuoto = "al banco".</summary>
    public string ClienteNome { get; set; } = "";

    /// <summary>
    /// Metodo di pagamento salvato: "CONTANTI" (default), un singolo metodo, oppure
    /// i metodi del pagamento misto uniti da "+" (es. "CONTANTI+CARTA").
    /// </summary>
    public string MetodoPagamento { get; set; } = "CONTANTI";

    public string Note { get; set; } = "";
    /// <summary>"EMESSA" (default). La vendita al banco nasce già emessa.</summary>
    public string Stato { get; set; } = "EMESSA";

    /// <summary>Righe del documento, caricate nel dettaglio (GetById).</summary>
    public List<VenditaBancoRiga> Righe { get; set; } = new();

    /// <summary>
    /// Totale documento IVA inclusa. In lista arriva già calcolato dal DB
    /// (SUM su vendite_banco_righe), come il backend (calcola_totale → to_dto).
    /// </summary>
    public decimal Totale { get; set; }

    /// <summary>Controparte mostrata in lista: nome cliente o "— al banco —".</summary>
    public string ClienteVisualizzato =>
        string.IsNullOrWhiteSpace(ClienteNome) ? "— al banco —" : ClienteNome;

    /// <summary>Ricalcola il totale dalle righe in memoria (parità con calcola_totale).</summary>
    public void RicalcolaTotali() => Totale = Righe.Sum(r => r.Totale);
}

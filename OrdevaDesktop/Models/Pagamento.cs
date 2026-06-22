namespace Ordeva.Desktop.Models;

/// <summary>
/// Movimento di cassa/banca: un incasso (ENTRATA) o un pagamento (USCITA),
/// eventualmente collegato a una fattura (incasso da cliente), a un acquisto
/// (pagamento a fornitore) o a una vendita al banco. Tabella SQLite: pagamenti.
///
/// Convenzioni: importo REAL → decimal; data_pagamento TEXT ISO "yyyy-MM-dd" →
/// string; i riferimenti fattura_id/acquisto_id/vendita_banco_id/tipo_pagamento_id
/// sono nullable (0/NULL = scollegato, come opt_i64 nel backend). I campi *Nome
/// e *Numero sono risolti via JOIN e non sono colonne della tabella.
/// </summary>
public sealed class Pagamento
{
    /// <summary>Chiave primaria. Null finché non è stato inserito.</summary>
    public long? Id { get; set; }

    /// <summary>Fattura collegata (incasso da cliente). Mutuamente esclusiva con AcquistoId.</summary>
    public long? FatturaId { get; set; }

    /// <summary>Acquisto collegato (pagamento a fornitore).</summary>
    public long? AcquistoId { get; set; }

    /// <summary>Vendita al banco collegata (incasso immediato).</summary>
    public long? VenditaBancoId { get; set; }

    /// <summary>Data del movimento in formato ISO "yyyy-MM-dd".</summary>
    public string DataPagamento { get; set; } = "";

    /// <summary>Importo del movimento (sempre positivo: il segno è dato da Tipo).</summary>
    public decimal Importo { get; set; }

    /// <summary>Metodo testuale libero (es. "Bonifico", "Contanti"). Default "Bonifico".</summary>
    public string Metodo { get; set; } = "Bonifico";

    /// <summary>Note libere.</summary>
    public string Note { get; set; } = "";

    /// <summary>Verso del movimento: "ENTRATA" (incasso) o "USCITA" (pagamento). Default "ENTRATA".</summary>
    public string Tipo { get; set; } = "ENTRATA";

    /// <summary>Conto su cui transita il movimento: "BANCA" o "CASSA". Default "BANCA".</summary>
    public string Conto { get; set; } = "BANCA";

    /// <summary>Causale (testo libero, scelta da un elenco gestito in impostazioni).</summary>
    public string Causale { get; set; } = "";

    /// <summary>Tipo di pagamento collegato (da cui si eredita il conto). Nullable.</summary>
    public long? TipoPagamentoId { get; set; }

    // ── Campi risolti via JOIN (sola lettura, non colonne di pagamenti) ─────────

    /// <summary>Numero della fattura collegata (JOIN fatture).</summary>
    public string? FatturaNumero { get; set; }

    /// <summary>Numero dell'acquisto collegato (JOIN acquisti).</summary>
    public string? AcquistoNumero { get; set; }

    /// <summary>Numero della vendita al banco collegata (JOIN vendite_banco).</summary>
    public string? VenditaBancoNumero { get; set; }

    /// <summary>Ragione sociale del cliente (fattura) o nome cliente della vendita al banco.</summary>
    public string? ClienteNome { get; set; }

    /// <summary>Ragione sociale del fornitore (acquisto).</summary>
    public string? FornitoreNome { get; set; }

    /// <summary>Nome del tipo di pagamento collegato (JOIN tipi_pagamento).</summary>
    public string? TipoPagamentoNome { get; set; }

    /// <summary>
    /// Controparte mostrata in lista: cliente (se incasso) o fornitore (se
    /// pagamento). Replica la logica del backend (clienteNome ?? vbClienteNome,
    /// poi fornitoreNome in fallback per le uscite).
    /// </summary>
    public string Controparte =>
        !string.IsNullOrWhiteSpace(ClienteNome) ? ClienteNome!
        : !string.IsNullOrWhiteSpace(FornitoreNome) ? FornitoreNome!
        : "—";

    /// <summary>Etichetta sintetica del documento collegato, per la colonna "Documento".</summary>
    public string DocumentoLabel =>
        !string.IsNullOrWhiteSpace(FatturaNumero) ? $"Fatt. {FatturaNumero}"
        : !string.IsNullOrWhiteSpace(AcquistoNumero) ? $"Acq. {AcquistoNumero}"
        : !string.IsNullOrWhiteSpace(VenditaBancoNumero) ? $"Banco {VenditaBancoNumero}"
        : "—";
}

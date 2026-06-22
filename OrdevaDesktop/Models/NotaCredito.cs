using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Documento nota di credito (tabella <c>note_credito</c>) con le sue righe.
/// Le colonne SQLite sono snake_case: il repository usa alias espliciti verso
/// queste proprietà PascalCase. I flag INTEGER 0/1 (ritenuta_su_cassa, bollo)
/// diventano bool; i valori REAL fiscali diventano decimal.
///
/// I totali (imponibile, IVA, ritenuta, cassa, bollo, totale, netto a pagare)
/// sono derivati dalle righe e dai parametri fiscali con la STESSA logica del
/// backend Rust (fiscale.rs::calcola_totali_fiscali + note_credito.rs::to_dto),
/// portata qui in decimal. Per la lista il solo imponibile/totale base arriva
/// precalcolato dal repository (vedi *Listato) per evitare di caricare ogni riga.
/// </summary>
public sealed class NotaCredito
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";

    /// <summary>Data emissione in formato ISO "yyyy-MM-dd" (come salvata dal backend).</summary>
    public string DataEmissione { get; set; } = "";

    public long? ClienteId { get; set; }

    /// <summary>Ragione sociale del cliente, risolta via JOIN (non è colonna di note_credito).</summary>
    public string? ClienteNome { get; set; }

    /// <summary>Fattura collegata (storno). NULL = nota di credito autonoma.</summary>
    public long? FatturaId { get; set; }

    public string Note { get; set; } = "";

    /// <summary>Stato: default backend "EMESSA".</summary>
    public string Stato { get; set; } = "EMESSA";

    // ── Parametri fiscali (colonne dedicate su note_credito) ──────────────────

    /// <summary>Aliquota ritenuta d'acconto (% sull'imponibile, eventualmente +cassa).</summary>
    public decimal RitenutaAliquota { get; set; }
    public string RitenutaCausale { get; set; } = "";
    public string RitenutaTipo { get; set; } = "";

    /// <summary>Se la ritenuta si applica anche sull'importo cassa (INTEGER 0/1).</summary>
    public bool RitenutaSuCassa { get; set; }

    public string CassaTipo { get; set; } = "";

    /// <summary>Aliquota cassa previdenziale (% sull'imponibile).</summary>
    public decimal CassaAliquota { get; set; }

    /// <summary>Aliquota IVA applicata all'importo cassa (%).</summary>
    public decimal CassaIva { get; set; }

    /// <summary>Bollo da 2,00 € (INTEGER 0/1).</summary>
    public bool Bollo { get; set; }

    /// <summary>Stato SDI (e-fattura). Solo lettura/passaggio: non calcolato qui.</summary>
    public string StatoSdi { get; set; } = "";
    public string DataInvioSdi { get; set; } = "";
    public string IdTrasmissioneSdi { get; set; } = "";

    /// <summary>Righe del documento, caricate da GetById.</summary>
    public List<NotaCreditoRiga> Righe { get; set; } = new();

    // ── Totali derivati (parità con fiscale.rs::calcola_totali_fiscali) ──────

    private static decimal Round2(decimal n) => decimal.Round(n, 2, System.MidpointRounding.AwayFromZero);

    /// <summary>Imponibile = Σ q·p·(1 - sconto/100), arrotondato a 2 decimali.</summary>
    public decimal Imponibile => Round2(Righe.Where(r => !r.IsNota)
        .Sum(r => r.Quantita * r.Prezzo * (1m - r.Sconto / 100m)));

    /// <summary>IVA delle sole righe = Σ base·iva/100, arrotondata a 2 decimali.</summary>
    private decimal IvaRighe => Round2(Righe.Where(r => !r.IsNota)
        .Sum(r => r.Quantita * r.Prezzo * (1m - r.Sconto / 100m) * r.Iva / 100m));

    /// <summary>Importo cassa previdenziale = imponibile·cassaAliquota/100 (0 se assente).</summary>
    public decimal CassaImporto => CassaAliquota != 0m ? Round2(Imponibile * CassaAliquota / 100m) : 0m;

    /// <summary>IVA sull'importo cassa = cassaImporto·cassaIva/100 (0 se nessuna cassa).</summary>
    public decimal IvaCassa => CassaImporto != 0m ? Round2(CassaImporto * CassaIva / 100m) : 0m;

    /// <summary>IVA totale = IVA righe + IVA cassa.</summary>
    public decimal IvaTotale => Round2(IvaRighe + IvaCassa);

    /// <summary>Base ritenuta = imponibile (+ cassa se ritenutaSuCassa).</summary>
    private decimal RitenutaBase => Imponibile + (RitenutaSuCassa ? CassaImporto : 0m);

    /// <summary>Importo ritenuta d'acconto = base·aliquota/100 (0 se aliquota 0).</summary>
    public decimal RitenutaImporto => RitenutaAliquota != 0m ? Round2(RitenutaBase * RitenutaAliquota / 100m) : 0m;

    /// <summary>Importo bollo: 2,00 € se attivo.</summary>
    public decimal BolloImporto => Bollo ? 2.00m : 0m;

    /// <summary>Totale documento = imponibile + cassa + IVA + bollo.</summary>
    public decimal Totale => Round2(Imponibile + CassaImporto + IvaTotale + BolloImporto);

    /// <summary>Netto a pagare = totale - ritenuta.</summary>
    public decimal NettoAPagare => Round2(Totale - RitenutaImporto);

    // Valori precalcolati dal repository per la lista (niente caricamento righe).

    /// <summary>Imponibile base calcolato in SQL per la lista (NULL nel dettaglio).</summary>
    public decimal? ImponibileListato { get; set; }

    /// <summary>Totale base (imponibile+IVA righe) calcolato in SQL per la lista (NULL nel dettaglio).</summary>
    public decimal? TotaleListato { get; set; }

    /// <summary>Totale da mostrare in lista: usa il precalcolato se presente, altrimenti le righe.</summary>
    public decimal TotaleVisualizzato => TotaleListato ?? Totale;

    /// <summary>Anno dell'emissione (per i filtri). 0 se la data non è valorizzata.</summary>
    public int Anno =>
        DataEmissione.Length >= 4 && int.TryParse(DataEmissione[..4], out var y) ? y : 0;

    /// <summary>Mese dell'emissione 1..12 (per i filtri). 0 se la data non è valida.</summary>
    public int Mese =>
        DataEmissione.Length >= 7 && int.TryParse(DataEmissione.Substring(5, 2), out var m) ? m : 0;
}

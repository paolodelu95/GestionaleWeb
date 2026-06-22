using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Stato completo della bacheca "Lavagna" (tabella <c>lavagna</c>, una sola riga
/// con <c>id = 1</c> e un blob JSON in <c>dati</c>). Porta il modello del backend
/// Rust (routes/lavagna.rs) e del componente Angular <c>lavagna</c>: la bacheca è
/// un singolo documento JSON con la lista dei post-it.
///
/// I nomi JSON (camelCase, qui via <see cref="JsonPropertyNameAttribute"/>) DEVONO
/// combaciare con quelli salvati dall'app esistente, così il blob resta compatibile
/// in entrambe le direzioni (la web app e il desktop leggono/scrivono lo stesso file).
/// Default del backend quando manca/è corrotto: <c>{ "note": [] }</c>.
/// </summary>
public sealed class Lavagna
{
    /// <summary>Elenco dei post-it. Mai null: il backend usa lista vuota come default.</summary>
    [JsonPropertyName("note")]
    public List<PostIt> Note { get; set; } = new();
}

/// <summary>
/// Un singolo post-it della bacheca. Replica l'interfaccia <c>PostIt</c> dell'Angular:
/// posizione/dimensione sul canvas, colore, tipo di corpo e contenuto.
/// </summary>
public sealed class PostIt
{
    /// <summary>Identificativo client (UUID o "p" + timestamp); generato dal VM, non dal DB.</summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("titolo")]
    public string Titolo { get; set; } = "";

    /// <summary>Colore di sfondo (#rrggbb), preso dalla palette tenue dell'app.</summary>
    [JsonPropertyName("colore")]
    public string Colore { get; set; } = "";

    [JsonPropertyName("x")]
    public double X { get; set; }

    [JsonPropertyName("y")]
    public double Y { get; set; }

    [JsonPropertyName("w")]
    public double W { get; set; } = 250;

    [JsonPropertyName("h")]
    public double H { get; set; } = 220;

    /// <summary>Tipo di corpo: "testo" | "elenco" | "todo" (default "testo").</summary>
    [JsonPropertyName("tipo")]
    public string Tipo { get; set; } = "testo";

    /// <summary>Contenuto quando <see cref="Tipo"/> == "testo".</summary>
    [JsonPropertyName("testo")]
    public string Testo { get; set; } = "";

    /// <summary>Voci quando <see cref="Tipo"/> == "elenco" o "todo".</summary>
    [JsonPropertyName("voci")]
    public List<PostItVoce> Voci { get; set; } = new();

    /// <summary>Post-it ridotto nella barra laterale.</summary>
    [JsonPropertyName("minimizzato")]
    public bool Minimizzato { get; set; }

    // ── Derivati per la UI (non mappati sul blob JSON) ───────────────────────

    /// <summary>Titolo per la tabella; ripiega su "Senza titolo" se vuoto (come il web).</summary>
    [JsonIgnore]
    public string TitoloLabel => string.IsNullOrWhiteSpace(Titolo) ? "Senza titolo" : Titolo;

    /// <summary>Etichetta leggibile del tipo per la colonna.</summary>
    [JsonIgnore]
    public string TipoLabel => Tipo switch
    {
        "testo" => "Testo",
        "elenco" => "Elenco",
        "todo" => "Checklist",
        _ => Tipo,
    };

    /// <summary>Etichetta stato attivo/ridotto.</summary>
    [JsonIgnore]
    public string StatoLabel => Minimizzato ? "Ridotto" : "Attivo";

    /// <summary>Anteprima del contenuto: testo per "testo", numero voci per elenco/todo.</summary>
    [JsonIgnore]
    public string Anteprima => Tipo == "testo"
        ? Riassumi(Testo)
        : Voci.Count switch { 0 => "Nessuna voce", 1 => "1 voce", var c => $"{c} voci" };

    private static string Riassumi(string? testo)
    {
        var s = (testo ?? "").Replace('\n', ' ').Replace('\r', ' ').Trim();
        if (s.Length == 0) return "";
        return s.Length <= 60 ? s : s.Substring(0, 60) + "…";
    }
}

/// <summary>
/// Voce di un post-it di tipo elenco/checklist. <c>fatto</c> è significativo solo
/// per i post-it "todo" (parità con l'interfaccia <c>Voce</c> dell'Angular).
/// </summary>
public sealed class PostItVoce
{
    [JsonPropertyName("t")]
    public string T { get; set; } = "";

    [JsonPropertyName("fatto")]
    public bool Fatto { get; set; }
}

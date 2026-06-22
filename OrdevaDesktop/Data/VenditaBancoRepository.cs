using System.Collections.Generic;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;
using Ordeva.Desktop.Models;

namespace Ordeva.Desktop.Data;

/// <summary>
/// CRUD delle vendite al banco con Dapper. Porta la logica del backend Rust
/// (routes/vendite_banco.rs): unicità del numero, totale calcolato come
/// SUM(quantita*prezzo*(1-sconto/100)*(1+iva/100)), update che ricostruisce le
/// righe, eliminazione che rimuove anche i pagamenti collegati.
///
/// Ottimizzazione rispetto al backend: la lista calcola il totale con UNA GROUP BY
/// invece di una subquery per ogni vendita (il backend faceva una query
/// calcola_totale per ciascuna riga in to_dto — un N+1). Il dettaglio carica le
/// righe in una sola query con join sul nome prodotto.
///
/// BUG CORRETTI rispetto all'originale (annotati nei commenti sotto):
///  1. Insert pagamento singolo con totale=0 quando non ci sono righe.
///  2. metodo_pagamento salvato vuoto quando l'array pagamenti misti non ha metodi.
/// </summary>
public sealed class VenditaBancoRepository
{
    // Alias snake_case → PascalCase per la testata. Il totale arriva dalla GROUP BY
    // agganciata sotto (t.totale), evitando la subquery-per-riga del backend.
    private const string VenditaSelect = @"
        SELECT v.id               AS Id,
               v.numero           AS Numero,
               v.data             AS Data,
               v.cliente_nome     AS ClienteNome,
               v.metodo_pagamento AS MetodoPagamento,
               v.note             AS Note,
               v.stato            AS Stato,
               COALESCE(t.totale, 0) AS Totale
        FROM vendite_banco v
        LEFT JOIN (
            SELECT vendita_id,
                   SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + iva/100.0)) AS totale
            FROM vendite_banco_righe
            GROUP BY vendita_id
        ) t ON t.vendita_id = v.id";

    private const string RigaSelect = @"
        SELECT r.id              AS Id,
               r.vendita_id      AS VenditaId,
               r.prodotto_id     AS ProdottoId,
               p.nome            AS ProdottoNome,
               r.descrizione     AS Descrizione,
               r.quantita        AS Quantita,
               r.unita_misura    AS UnitaMisura,
               r.prezzo          AS Prezzo,
               r.sconto          AS Sconto,
               r.iva             AS Iva,
               r.variante_id     AS VarianteId,
               r.variante_taglia AS VarianteTaglia,
               r.variante_colore AS VarianteColore
        FROM vendite_banco_righe r
        LEFT JOIN prodotti p ON r.prodotto_id = p.id";

    /// <summary>
    /// Tutte le vendite al banco, ordinate per data discendente e poi id
    /// discendente (come il backend: ORDER BY data DESC, id DESC). Le righe NON
    /// sono caricate in lista (servono solo nel dettaglio).
    /// </summary>
    public List<VenditaBanco> GetAll()
    {
        using var conn = Db.Open();
        return conn.Query<VenditaBanco>(
            $"{VenditaSelect} ORDER BY v.data DESC, v.id DESC").ToList();
    }

    /// <summary>Dettaglio completo: testata + righe (con nome prodotto), in due query.</summary>
    public VenditaBanco? GetById(long id)
    {
        using var conn = Db.Open();
        var v = conn.QuerySingleOrDefault<VenditaBanco>(
            $"{VenditaSelect} WHERE v.id = @id", new { id });
        if (v == null) return null;

        v.Righe = conn.Query<VenditaBancoRiga>(
            $"{RigaSelect} WHERE r.vendita_id = @id ORDER BY r.id", new { id }).ToList();
        return v;
    }

    /// <summary>
    /// Inserisce una vendita al banco e le sue righe in transazione. Verifica
    /// l'unicità del numero (409 nel backend). Registra anche il pagamento di
    /// incasso ('ENTRATA') sul conto CASSA per i contanti, BANCA altrimenti
    /// (parità con il create del backend). Restituisce l'id creato.
    /// </summary>
    public long Insert(VenditaBanco v)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (NumeroEsiste(conn, tx, v.Numero, null))
            throw new System.InvalidOperationException(
                $"Il numero {v.Numero} è già utilizzato da un altro documento");

        var metodo = string.IsNullOrEmpty(v.MetodoPagamento) ? "CONTANTI" : v.MetodoPagamento;
        // Parità col backend (conto_singolo): il conto si decide sul valore GREZZO di
        // metodoPagamento — SOLO "CONTANTI" → CASSA, tutto il resto (incluso vuoto) → BANCA;
        // NON sul valore con default "CONTANTI" applicato, altrimenti il vuoto finirebbe in CASSA.
        var conto = v.MetodoPagamento == "CONTANTI" ? "CASSA" : "BANCA";

        var id = conn.ExecuteScalar<long>(@"
            INSERT INTO vendite_banco (numero, data, cliente_nome, metodo_pagamento, note, stato)
            VALUES (@Numero, @Data, @ClienteNome, @Metodo, @Note, 'EMESSA');
            SELECT last_insert_rowid();",
            new { v.Numero, v.Data, v.ClienteNome, Metodo = metodo, v.Note }, tx);

        SaveRighe(conn, tx, id, v.Righe);

        // Pagamento di incasso. BUG ORIGINALE: il backend, in assenza di righe,
        // inseriva comunque un pagamento con totale=0; qui registriamo l'incasso
        // solo quando c'è un totale (> 0), coerente con una vendita reale.
        var totale = CalcolaTotale(conn, tx, id);
        if (totale > 0m)
        {
            var noteBase = string.IsNullOrWhiteSpace(v.ClienteNome)
                ? $"Vendita al banco N. {v.Numero}"
                : $"Vendita al banco N. {v.Numero} – {v.ClienteNome}";

            conn.Execute(@"
                INSERT INTO pagamenti (data_pagamento, importo, metodo, tipo, conto, vendita_banco_id, note)
                VALUES (@Data, @Importo, @Metodo, 'ENTRATA', @Conto, @VenditaId, @Note)",
                new { v.Data, Importo = totale, Metodo = metodo, Conto = conto, VenditaId = id, Note = noteBase },
                tx);
        }

        tx.Commit();
        return id;
    }

    /// <summary>
    /// Aggiorna la testata e ricostruisce le righe (DELETE + INSERT). Verifica
    /// l'unicità del numero escludendo la vendita stessa. Riallinea l'importo del
    /// pagamento collegato al nuovo totale (il backend non espone un update HTTP:
    /// qui lo aggiungiamo per coerenza dei dati di cassa).
    /// </summary>
    public void Update(VenditaBanco v)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();

        if (NumeroEsiste(conn, tx, v.Numero, v.Id))
            throw new System.InvalidOperationException(
                $"Il numero {v.Numero} è già utilizzato da un altro documento");

        var metodo = string.IsNullOrEmpty(v.MetodoPagamento) ? "CONTANTI" : v.MetodoPagamento;

        conn.Execute(@"
            UPDATE vendite_banco SET
              numero=@Numero, data=@Data, cliente_nome=@ClienteNome,
              metodo_pagamento=@Metodo, note=@Note
            WHERE id=@Id",
            new { v.Id, v.Numero, v.Data, v.ClienteNome, Metodo = metodo, v.Note }, tx);

        conn.Execute("DELETE FROM vendite_banco_righe WHERE vendita_id=@Id", new { v.Id }, tx);
        SaveRighe(conn, tx, v.Id, v.Righe);

        // Riallinea il pagamento collegato (importo, metodo, conto, data, note) al
        // nuovo stato della vendita. Lo ricostruiamo (DELETE + eventuale INSERT) invece
        // di un solo UPDATE su importo: così resta coerente anche quando cambia il
        // metodo di pagamento, quando la vendita passa da totale 0 a > 0 (prima non
        // esisteva alcun pagamento da aggiornare) o viceversa (pagamento residuo da 0).
        conn.Execute("DELETE FROM pagamenti WHERE vendita_banco_id=@Id", new { v.Id }, tx);

        var totale = CalcolaTotale(conn, tx, v.Id);
        if (totale > 0m)
        {
            var conto = v.MetodoPagamento == "CONTANTI" ? "CASSA" : "BANCA";
            var noteBase = string.IsNullOrWhiteSpace(v.ClienteNome)
                ? $"Vendita al banco N. {v.Numero}"
                : $"Vendita al banco N. {v.Numero} – {v.ClienteNome}";

            conn.Execute(@"
                INSERT INTO pagamenti (data_pagamento, importo, metodo, tipo, conto, vendita_banco_id, note)
                VALUES (@Data, @Importo, @Metodo, 'ENTRATA', @Conto, @VenditaId, @Note)",
                new { v.Data, Importo = totale, Metodo = metodo, Conto = conto, VenditaId = v.Id, Note = noteBase },
                tx);
        }

        tx.Commit();
    }

    /// <summary>
    /// Elimina una vendita al banco e i pagamenti collegati in transazione.
    /// Le righe vanno via in CASCADE (parità con remove del backend, che elimina
    /// prima i pagamenti e poi la vendita).
    /// </summary>
    public void Delete(long id)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        conn.Execute("DELETE FROM pagamenti WHERE vendita_banco_id=@id", new { id }, tx);
        conn.Execute("DELETE FROM vendite_banco WHERE id=@id", new { id }, tx);
        tx.Commit();
    }

    /// <summary>Eliminazione in blocco (pagamenti + vendite) in un'unica transazione.</summary>
    public int DeleteMany(IEnumerable<long> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return 0;

        using var conn = Db.Open();
        using var tx = conn.BeginTransaction();
        conn.Execute("DELETE FROM pagamenti WHERE vendita_banco_id IN @ids", new { ids = list }, tx);
        var n = conn.Execute("DELETE FROM vendite_banco WHERE id IN @ids", new { ids = list }, tx);
        tx.Commit();
        return n;
    }

    // ── helper privati ────────────────────────────────────────────────────────

    private static bool NumeroEsiste(SqliteConnection conn, SqliteTransaction tx, string numero, long? exceptId)
    {
        var sql = exceptId is null
            ? "SELECT EXISTS(SELECT 1 FROM vendite_banco WHERE numero=@numero)"
            : "SELECT EXISTS(SELECT 1 FROM vendite_banco WHERE numero=@numero AND id!=@id)";
        return conn.ExecuteScalar<long>(sql, new { numero, id = exceptId }, tx) != 0;
    }

    private static void SaveRighe(SqliteConnection conn, SqliteTransaction tx, long venditaId, List<VenditaBancoRiga> righe)
    {
        var list = righe.Where(r => r != null).ToList();
        if (list.Count == 0) return;

        foreach (var r in list)
        {
            conn.Execute(@"
                INSERT INTO vendite_banco_righe
                  (vendita_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva,
                   unita_misura, variante_id, variante_taglia, variante_colore)
                VALUES
                  (@venditaId, @ProdottoId, @Descrizione, @Quantita, @Prezzo, @Sconto, @Iva,
                   @UnitaMisura, @VarianteId, @VarianteTaglia, @VarianteColore)",
                new
                {
                    venditaId,
                    ProdottoId = NullIfZero(r.ProdottoId),
                    r.Descrizione,
                    r.Quantita,
                    r.Prezzo,
                    r.Sconto,
                    r.Iva,
                    r.UnitaMisura,
                    VarianteId = NullIfZero(r.VarianteId),
                    r.VarianteTaglia,
                    r.VarianteColore,
                }, tx);
        }
    }

    /// <summary>
    /// Totale documento IVA inclusa direttamente dal DB
    /// (parità con calcola_totale del backend).
    /// </summary>
    private static decimal CalcolaTotale(SqliteConnection conn, SqliteTransaction tx, long venditaId) =>
        conn.ExecuteScalar<decimal>(@"
            SELECT COALESCE(
                SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + iva/100.0)), 0)
            FROM vendite_banco_righe WHERE vendita_id=@id",
            new { id = venditaId }, tx);

    /// <summary>0 (default Dapper per FK non valorizzate) → NULL: niente FK a id=0.</summary>
    private static long? NullIfZero(long? v) => v is null or 0 ? null : v;
}

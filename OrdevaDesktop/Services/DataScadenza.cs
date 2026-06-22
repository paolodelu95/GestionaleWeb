using System.Globalization;

namespace Ordeva.Desktop.Services;

/// <summary>
/// Calcolo della data di scadenza di un documento dal tipo di pagamento, portato
/// byte-identico da web.rs::data_scadenza (algoritmo civile di Howard Hinnant +
/// la regola "fine mese" che imita setMonth/setDate(0) del JS originale).
/// Tutto in aritmetica intera per restare identici al backend.
/// </summary>
public static class DataScadenza
{
    /// <summary>
    /// Data di scadenza ISO "yyyy-MM-dd" partendo dalla data di emissione, sommando
    /// <paramref name="giorni"/> ed eventualmente spostando a fine mese. Restituisce
    /// null se la data di emissione non è parsabile (come Option::None del backend).
    /// </summary>
    public static string? Calcola(string data, long giorni, bool fineMese)
    {
        if (!TryParseYmd(data, out var y, out var m, out var d))
            return null;

        var days = DaysFromCivil(y, m, d) + giorni;
        var (y2, m2, d2) = CivilFromDays(days);

        if (!fineMese)
            return Format(y2, m2, d2);

        // setMonth(m2+1) mantenendo il giorno d2 (con overflow JS), poi setDate(0).
        var (ny, nm) = m2 == 12 ? (y2 + 1, 1L) : (y2, m2 + 1);
        var landed = DaysFromCivil(ny, nm, 1) + (d2 - 1);
        var (y3, m3, _) = CivilFromDays(landed);
        var last = DaysFromCivil(y3, m3, 1) - 1;
        var (y4, m4, d4) = CivilFromDays(last);
        return Format(y4, m4, d4);
    }

    private static string Format(long y, long m, long d) =>
        $"{y:D4}-{m:D2}-{d:D2}";

    private static bool TryParseYmd(string s, out long y, out long m, out long d)
    {
        y = m = d = 0;
        var head = s.Length > 10 ? s[..10] : s;
        var p = head.Split('-');
        if (p.Length != 3) return false;
        return long.TryParse(p[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out y)
            && long.TryParse(p[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out m)
            && long.TryParse(p[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out d);
    }

    private static long DaysFromCivil(long y, long m, long d)
    {
        y = m <= 2 ? y - 1 : y;
        var era = (y >= 0 ? y : y - 399) / 400;
        var yoe = y - era * 400;
        var doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
        var doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    private static (long Y, long M, long D) CivilFromDays(long z)
    {
        z += 719468;
        var era = (z >= 0 ? z : z - 146096) / 146097;
        var doe = z - era * 146097;
        var yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        var y = yoe + era * 400;
        var doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        var mp = (5 * doy + 2) / 153;
        var d = doy - (153 * mp + 2) / 5 + 1;
        var m = mp < 10 ? mp + 3 : mp - 9;
        return (m <= 2 ? y + 1 : y, m, d);
    }
}

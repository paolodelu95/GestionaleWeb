import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

export interface CityResult {
  name: string;
  cap: string;
  provincia: string;
}

const PROVINCE_SIGLE: Record<string, string> = {
  "Agrigento":"AG","Alessandria":"AL","Ancona":"AN","Aosta":"AO","Arezzo":"AR",
  "Ascoli Piceno":"AP","Asti":"AT","Avellino":"AV","L'Aquila":"AQ","Bari":"BA",
  "Barletta-Andria-Trani":"BT","Belluno":"BL","Benevento":"BN","Bergamo":"BG",
  "Biella":"BI","Bologna":"BO","Bolzano":"BZ","Brescia":"BS","Brindisi":"BR",
  "Cagliari":"CA","Caltanissetta":"CL","Campobasso":"CB","Caserta":"CE",
  "Catania":"CT","Catanzaro":"CZ","Chieti":"CH","Como":"CO","Cosenza":"CS",
  "Cremona":"CR","Crotone":"KR","Cuneo":"CN","Enna":"EN","Fermo":"FM",
  "Ferrara":"FE","Firenze":"FI","Foggia":"FG","Forlì-Cesena":"FC",
  "Frosinone":"FR","Genova":"GE","Gorizia":"GO","Grosseto":"GR","Imperia":"IM",
  "Isernia":"IS","La Spezia":"SP","Lecce":"LE","Lecco":"LC","Livorno":"LI",
  "Lodi":"LO","Lucca":"LU","Macerata":"MC","Mantova":"MN","Massa-Carrara":"MS",
  "Matera":"MT","Messina":"ME","Milano":"MI","Modena":"MO",
  "Monza e della Brianza":"MB","Napoli":"NA","Novara":"NO","Nuoro":"NU",
  "Oristano":"OR","Padova":"PD","Palermo":"PA","Parma":"PR","Pavia":"PV",
  "Perugia":"PG","Pesaro e Urbino":"PU","Pescara":"PE","Piacenza":"PC",
  "Pisa":"PI","Pistoia":"PT","Pordenone":"PN","Potenza":"PZ","Prato":"PO",
  "Ragusa":"RG","Ravenna":"RA","Reggio Calabria":"RC","Reggio Emilia":"RE",
  "Rieti":"RI","Rimini":"RN","Roma":"RM","Rovigo":"RO","Salerno":"SA",
  "Sassari":"SS","Savona":"SV","Siena":"SI","Siracusa":"SR","Sondrio":"SO",
  "Sud Sardegna":"SU","Taranto":"TA","Teramo":"TE","Terni":"TR","Torino":"TO",
  "Trapani":"TP","Trento":"TN","Treviso":"TV","Trieste":"TS","Udine":"UD",
  "Varese":"VA","Venezia":"VE","Verbano-Cusio-Ossola":"VB","Vercelli":"VC",
  "Verona":"VR","Vibo Valentia":"VV","Vicenza":"VI","Viterbo":"VT"
};

function siglaProvincia(county: string): string {
  const name = county
    .replace(/^(Città Metropolitana|Provincia Autonoma|Libero consorzio comunale|Provincia)\s+(di\s+|dell'|dello\s+|della\s+|dei\s+|degli\s+|delle\s+)?/i, '')
    .replace(/\/.*$/, '')
    .trim();
  return PROVINCE_SIGLE[name] ?? '';
}

@Injectable({ providedIn: 'root' })
export class CityService {
  private readonly NOMINATIM = 'https://nominatim.openstreetmap.org';
  private readonly ZIPPOPOTAM = 'https://api.zippopotam.us/it';

  private capCache = new Map<string, CityResult | null>();
  private searchCache = new Map<string, CityResult[]>();

  constructor(private http: HttpClient) {}

  searchCities(query: string): Observable<CityResult[]> {
    if (!query || query.length < 2) return of([]);
    const key = query.toLowerCase().trim();
    if (this.searchCache.has(key)) return of(this.searchCache.get(key)!);

    return this.http.get<any[]>(`${this.NOMINATIM}/search`, {
      params: {
        q: query,
        countrycodes: 'it',
        format: 'json',
        addressdetails: '1',
        limit: '10',
        'accept-language': 'it'
      }
    }).pipe(
      map(results => {
        const seen = new Set<string>();
        return (results ?? [])
          .filter(r => r.address)
          .map(r => {
            const a = r.address;
            const name: string = a.city || a.town || a.village || a.municipality || '';
            const cap: string = (a.postcode || '').split(';')[0].trim();
            const provincia: string = siglaProvincia(a.county || '');
            return { name, cap, provincia };
          })
          .filter(r => r.name && !seen.has(r.name) && seen.add(r.name));
      }),
      tap(r => this.searchCache.set(key, r)),
      catchError(() => of([]))
    );
  }

  lookupByCap(cap: string): Observable<CityResult | null> {
    if (this.capCache.has(cap)) return of(this.capCache.get(cap)!);
    return this.http.get<any>(`${this.ZIPPOPOTAM}/${cap}`).pipe(
      map(r => {
        const place = r?.places?.[0];
        if (!place) return null;
        return {
          name: place['place name'] as string,
          cap: r['post code'] as string,
          provincia: place['state abbreviation'] as string
        };
      }),
      tap(r => this.capCache.set(cap, r)),
      catchError(() => of(null))
    );
  }
}

export interface CityInfo { cap: string; provincia: string; }

const CITIES: Record<string, CityInfo> = {
  "L'Aquila":{"cap":"67100","provincia":"AQ"},"Teramo":{"cap":"64100","provincia":"TE"},
  "Chieti":{"cap":"66100","provincia":"CH"},"Pescara":{"cap":"65100","provincia":"PE"},
  "Avezzano":{"cap":"67051","provincia":"AQ"},"Sulmona":{"cap":"67039","provincia":"AQ"},
  "Potenza":{"cap":"85100","provincia":"PZ"},"Matera":{"cap":"75100","provincia":"MT"},
  "Catanzaro":{"cap":"88100","provincia":"CZ"},"Reggio Calabria":{"cap":"89100","provincia":"RC"},
  "Cosenza":{"cap":"87100","provincia":"CS"},"Crotone":{"cap":"88900","provincia":"KR"},
  "Vibo Valentia":{"cap":"89900","provincia":"VV"},"Lamezia Terme":{"cap":"88046","provincia":"CZ"},
  "Napoli":{"cap":"80100","provincia":"NA"},"Salerno":{"cap":"84100","provincia":"SA"},
  "Caserta":{"cap":"81100","provincia":"CE"},"Benevento":{"cap":"82100","provincia":"BN"},
  "Avellino":{"cap":"83100","provincia":"AV"},"Torre del Greco":{"cap":"80059","provincia":"NA"},
  "Pozzuoli":{"cap":"80078","provincia":"NA"},"Castellammare di Stabia":{"cap":"80053","provincia":"NA"},
  "Bologna":{"cap":"40100","provincia":"BO"},"Ferrara":{"cap":"44100","provincia":"FE"},
  "Forli":{"cap":"47121","provincia":"FC"},"Cesena":{"cap":"47521","provincia":"FC"},
  "Modena":{"cap":"41100","provincia":"MO"},"Parma":{"cap":"43100","provincia":"PR"},
  "Piacenza":{"cap":"29100","provincia":"PC"},"Ravenna":{"cap":"48100","provincia":"RA"},
  "Reggio Emilia":{"cap":"42100","provincia":"RE"},"Rimini":{"cap":"47900","provincia":"RN"},
  "Imola":{"cap":"40026","provincia":"BO"},"Faenza":{"cap":"48018","provincia":"RA"},
  "Carpi":{"cap":"41012","provincia":"MO"},"Trieste":{"cap":"34100","provincia":"TS"},
  "Udine":{"cap":"33100","provincia":"UD"},"Pordenone":{"cap":"33170","provincia":"PN"},
  "Gorizia":{"cap":"34170","provincia":"GO"},"Roma":{"cap":"00100","provincia":"RM"},
  "Latina":{"cap":"04100","provincia":"LT"},"Frosinone":{"cap":"03100","provincia":"FR"},
  "Rieti":{"cap":"02100","provincia":"RI"},"Viterbo":{"cap":"01100","provincia":"VT"},
  "Civitavecchia":{"cap":"00053","provincia":"RM"},"Tivoli":{"cap":"00019","provincia":"RM"},
  "Pomezia":{"cap":"00071","provincia":"RM"},"Genova":{"cap":"16100","provincia":"GE"},
  "La Spezia":{"cap":"19100","provincia":"SP"},"Savona":{"cap":"17100","provincia":"SV"},
  "Imperia":{"cap":"18100","provincia":"IM"},"Sanremo":{"cap":"18038","provincia":"IM"},
  "Milano":{"cap":"20100","provincia":"MI"},"Bergamo":{"cap":"24100","provincia":"BG"},
  "Brescia":{"cap":"25100","provincia":"BS"},"Como":{"cap":"22100","provincia":"CO"},
  "Cremona":{"cap":"26100","provincia":"CR"},"Lecco":{"cap":"23900","provincia":"LC"},
  "Lodi":{"cap":"26900","provincia":"LO"},"Mantova":{"cap":"46100","provincia":"MN"},
  "Monza":{"cap":"20900","provincia":"MB"},"Pavia":{"cap":"27100","provincia":"PV"},
  "Sondrio":{"cap":"23100","provincia":"SO"},"Varese":{"cap":"21100","provincia":"VA"},
  "Busto Arsizio":{"cap":"21052","provincia":"VA"},"Vigevano":{"cap":"27029","provincia":"PV"},
  "Cinisello Balsamo":{"cap":"20092","provincia":"MI"},"Sesto San Giovanni":{"cap":"20099","provincia":"MI"},
  "Ancona":{"cap":"60100","provincia":"AN"},"Pesaro":{"cap":"61100","provincia":"PU"},
  "Fano":{"cap":"61032","provincia":"PU"},"Macerata":{"cap":"62100","provincia":"MC"},
  "Ascoli Piceno":{"cap":"63100","provincia":"AP"},"Senigallia":{"cap":"60019","provincia":"AN"},
  "Campobasso":{"cap":"86100","provincia":"CB"},"Isernia":{"cap":"86170","provincia":"IS"},
  "Torino":{"cap":"10100","provincia":"TO"},"Alessandria":{"cap":"15100","provincia":"AL"},
  "Asti":{"cap":"14100","provincia":"AT"},"Biella":{"cap":"13900","provincia":"BI"},
  "Cuneo":{"cap":"12100","provincia":"CN"},"Novara":{"cap":"28100","provincia":"NO"},
  "Verbania":{"cap":"28921","provincia":"VB"},"Vercelli":{"cap":"13100","provincia":"VC"},
  "Moncalieri":{"cap":"10024","provincia":"TO"},"Alba":{"cap":"12051","provincia":"CN"},
  "Ivrea":{"cap":"10015","provincia":"TO"},"Orbassano":{"cap":"10043","provincia":"TO"},
  "Collegno":{"cap":"10093","provincia":"TO"},"Grugliasco":{"cap":"10095","provincia":"TO"},
  "Rivoli":{"cap":"10098","provincia":"TO"},"Nichelino":{"cap":"10042","provincia":"TO"},
  "Pinerolo":{"cap":"10064","provincia":"TO"},"Chieri":{"cap":"10023","provincia":"TO"},
  "Settimo Torinese":{"cap":"10036","provincia":"TO"},"Chivasso":{"cap":"10034","provincia":"TO"},"Bari":{"cap":"70100","provincia":"BA"},
  "Foggia":{"cap":"71100","provincia":"FG"},"Lecce":{"cap":"73100","provincia":"LE"},
  "Brindisi":{"cap":"72100","provincia":"BR"},"Taranto":{"cap":"74100","provincia":"TA"},
  "Andria":{"cap":"76123","provincia":"BT"},"Barletta":{"cap":"76121","provincia":"BT"},
  "Trani":{"cap":"76125","provincia":"BT"},"Altamura":{"cap":"70022","provincia":"BA"},
  "Molfetta":{"cap":"70056","provincia":"BA"},"Cagliari":{"cap":"09100","provincia":"CA"},
  "Sassari":{"cap":"07100","provincia":"SS"},"Nuoro":{"cap":"08100","provincia":"NU"},
  "Oristano":{"cap":"09170","provincia":"OR"},"Olbia":{"cap":"07026","provincia":"OT"},
  "Quartu Sant'Elena":{"cap":"09045","provincia":"CA"},"Alghero":{"cap":"07041","provincia":"SS"},
  "Palermo":{"cap":"90100","provincia":"PA"},"Catania":{"cap":"95100","provincia":"CT"},
  "Messina":{"cap":"98100","provincia":"ME"},"Siracusa":{"cap":"96100","provincia":"SR"},
  "Agrigento":{"cap":"92100","provincia":"AG"},"Caltanissetta":{"cap":"93100","provincia":"CL"},
  "Enna":{"cap":"94100","provincia":"EN"},"Ragusa":{"cap":"97100","provincia":"RG"},
  "Trapani":{"cap":"91100","provincia":"TP"},"Marsala":{"cap":"91025","provincia":"TP"},
  "Gela":{"cap":"93012","provincia":"CL"},"Vittoria":{"cap":"97019","provincia":"RG"},
  "Bagheria":{"cap":"90011","provincia":"PA"},"Mazara del Vallo":{"cap":"91026","provincia":"TP"},
  "Firenze":{"cap":"50100","provincia":"FI"},"Arezzo":{"cap":"52100","provincia":"AR"},
  "Grosseto":{"cap":"58100","provincia":"GR"},"Livorno":{"cap":"57100","provincia":"LI"},
  "Lucca":{"cap":"55100","provincia":"LU"},"Massa":{"cap":"54100","provincia":"MS"},
  "Pisa":{"cap":"56100","provincia":"PI"},"Pistoia":{"cap":"51100","provincia":"PT"},
  "Prato":{"cap":"59100","provincia":"PO"},"Siena":{"cap":"53100","provincia":"SI"},
  "Carrara":{"cap":"54033","provincia":"MS"},"Empoli":{"cap":"50053","provincia":"FI"},
  "Viareggio":{"cap":"55049","provincia":"LU"},"Trento":{"cap":"38100","provincia":"TN"},
  "Bolzano":{"cap":"39100","provincia":"BZ"},"Merano":{"cap":"39012","provincia":"BZ"},
  "Rovereto":{"cap":"38068","provincia":"TN"},"Perugia":{"cap":"06100","provincia":"PG"},
  "Terni":{"cap":"05100","provincia":"TR"},"Foligno":{"cap":"06034","provincia":"PG"},
  "Spoleto":{"cap":"06049","provincia":"PG"},"Aosta":{"cap":"11100","provincia":"AO"},
  "Venezia":{"cap":"30100","provincia":"VE"},"Verona":{"cap":"37100","provincia":"VR"},
  "Vicenza":{"cap":"36100","provincia":"VI"},"Padova":{"cap":"35100","provincia":"PD"},
  "Treviso":{"cap":"31100","provincia":"TV"},"Belluno":{"cap":"32100","provincia":"BL"},
  "Rovigo":{"cap":"45100","provincia":"RO"},"Chioggia":{"cap":"30015","provincia":"VE"},
  "Bassano del Grappa":{"cap":"36061","provincia":"VI"},"Mestre":{"cap":"30170","provincia":"VE"},
};

const CAP_TO_CITY: Record<string, string> = {};
for (const [city, info] of Object.entries(CITIES)) {
  if (!CAP_TO_CITY[info.cap]) CAP_TO_CITY[info.cap] = city;
}

export const CITY_NAMES = Object.keys(CITIES).sort((a, b) => a.localeCompare(b, 'it'));
export function cityInfo(name: string): CityInfo | undefined { return CITIES[name]; }
export function cityByCap(cap: string): string | undefined { return CAP_TO_CITY[cap]; }
export function filterCities(query: string): string[] {
  if (!query) return CITY_NAMES;
  const q = query.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
  return CITY_NAMES.filter(c =>
    c.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().startsWith(q)
  );
}

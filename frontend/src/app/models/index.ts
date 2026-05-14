export interface Azienda {
  id?: number;
  ragioneSociale: string;
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  stato?: string;
  pIva?: string;
  codFiscale?: string;
  email?: string;
  telefono?: string;
  pec?: string;
  sdi?: string;
  banca?: string;
  iban?: string;
}

export interface Prodotto {
  id?: number;
  nome: string;
  categoria: string;
  descrizione?: string;
  prezzo: number;
  quantita?: number;
  sogliaMinima?: number;
  unitaMisura?: string;
  codice?: string;
  iva: number;
}

export interface Cliente {
  id?: number;
  ragioneSociale: string;
  email?: string;
  telefono?: string;
  via?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  stato?: string;
  codiceFiscale?: string;
  pIva?: string;
  sdi?: string;
  pec?: string;
  tipoPagamentoId?: number | null;
}

export interface Fornitore {
  id?: number;
  ragioneSociale: string;
  email?: string;
  telefono?: string;
  via?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  stato?: string;
  pIva?: string;
  sdi?: string;
  pec?: string;
}

export interface RigaDocumento {
  id?: number;
  prodottoId?: number | null;
  prodottoNome?: string;
  descrizione: string;
  quantita: number;
  unitaMisura?: string;
  prezzo: number;
  sconto?: number;
  iva: number;
}

export interface PrezzoRecente {
  prezzo: number;
  sconto: number;
  prezzoEffettivo: number;
  quantita: number;
  numero: string;
  dataEmissione: string;
  tipo: string;
}

export interface Ddt {
  id?: number;
  numero: string;
  dataEmissione: string;
  clienteId?: number | null;
  clienteNome?: string;
  note?: string;
  stato: string;
  totale?: number;
  imponibile?: number;
  righe?: RigaDocumento[];
  fatturaId?: number | null;
  fatturaNumero?: string | null;
  // Dati trasporto
  dataOraInizioTrasporto?: string;
  causaleTrasporto?: string;
  aspettoBeni?: string;
  porto?: string;
  numeroColli?: number | null;
  pesoLordo?: number | null;
  incaricatoTrasporto?: string;
  vettore?: string;
  destinazioneDiversa?: string;
  noteTrasporto?: string;
}

export interface Fattura {
  id?: number;
  numero: string;
  dataEmissione: string;
  clienteId?: number | null;
  clienteNome?: string;
  ddtId?: number | null;
  ddtIds?: number[];
  note?: string;
  stato: string;
  totale?: number;
  imponibile?: number;
  tipoPagamentoId?: number | null;
  righe?: RigaDocumento[];
}

export interface NotaCredito {
  id?: number;
  numero: string;
  dataEmissione: string;
  clienteId?: number | null;
  clienteNome?: string;
  fatturaId?: number | null;
  note?: string;
  stato: string;
  totale?: number;
  imponibile?: number;
  righe?: RigaDocumento[];
}

export interface Ordine {
  id?: number;
  numero: string;
  dataOrdine: string;
  clienteId?: number | null;
  clienteNome?: string;
  fornitoreId?: number | null;
  fornitoreNome?: string;
  tipo: string;
  stato: string;
  note?: string;
  totale?: number;
  imponibile?: number;
  righe?: RigaDocumento[];
}

export interface Preventivo {
  id?: number;
  numero: string;
  dataEmissione: string;
  clienteId?: number | null;
  clienteNome?: string;
  validita: number;
  stato: string;
  note?: string;
  totale?: number;
  imponibile?: number;
  righe?: RigaDocumento[];
}

export interface TipoPagamento {
  id?: number;
  nome: string;
  conto: string;
  giorniScadenza: number;
  fineMese: boolean;
  immediato: boolean;
  attivo: boolean;
}

export interface Acquisto {
  id?: number;
  numero: string;
  dataEmissione: string;
  fornitoreId?: number | null;
  fornitoreNome?: string;
  tipoPagamentoId?: number | null;
  tipoPagamentoNome?: string;
  note?: string;
  stato: string;
  totale?: number;
  imponibile?: number;
  righe?: RigaDocumento[];
}

export interface CategoriaProdotto {
  id?: number;
  nome: string;
}

export interface UnitaMisura {
  id?: number;
  nome: string;
  simbolo: string;
}

export interface AliquotaIva {
  id?: number;
  nome: string;
  valore: number;
  attiva: boolean;
}

export interface Pagamento {
  id?: number;
  fatturaId?: number | null;
  fatturaNumero?: string;
  acquistoId?: number | null;
  acquistoNumero?: string;
  dataPagamento: string;
  importo: number;
  metodo?: string;
  note?: string;
  tipo?: string;
  conto?: string;
  tipoPagamentoId?: number | null;
  tipoPagamentoNome?: string;
}

export interface ScadenzarioEntry {
  id: number;
  numero: string;
  dataEmissione: string;
  dataScadenza?: string;
  controparte: string;
  tipoPagamentoNome?: string;
  conto?: string;
  importoTotale: number;
  importoPagato: number;
  rimanente: number;
  tipoEntry: 'FATTURA' | 'ACQUISTO';
}

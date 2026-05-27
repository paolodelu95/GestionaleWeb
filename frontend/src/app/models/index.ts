export interface TemplateConfig {
  stile: 'classico' | 'moderno' | 'minimal';
  accentColor?: string;
  blocks?: { [key: string]: boolean };
}

export interface NotificheConfig {
  avvisoInsolutiDdt?: boolean;
  avvisoInsolutiFattura?: boolean;
}

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
  logo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpSecure?: boolean;
  emailCorpoDocumento?: string;
  emailMode?: 'SMTP' | 'MAILTO' | 'WEBMAIL_GMAIL' | 'WEBMAIL_OUTLOOK';
  sdiApiUrl?: string;
  sdiApiKey?: string;
  riordinoAutomatico?: boolean;
  multiUtenteAttivo?: boolean;
  numerazioneAnnuale?: boolean;
  numeroPrefissi?: { [key: string]: string };
  templateConfig?: TemplateConfig;
  notificheConfig?: NotificheConfig;
}

export interface Prodotto {
  id?: number;
  nome: string;
  categoria: string;
  descrizione?: string;
  prezzo: number;
  prezzoAcquisto?: number;
  quantita?: number;
  sogliaMinima?: number;
  unitaMisura?: string;
  codice?: string;
  codiceFornitore?: string;
  iva: number;
  barcode?: string;
  haVarianti?: boolean;
  varianti?: ProdottoVariante[];
  fornitoreIdPreferito?: number | null;
  riordinoQuantita?: number;
}

export interface ProdottoVariante {
  id?: number;
  prodottoId?: number;
  taglia: string;
  colore: string;
  quantita: number;
  barcode: string;
}

export interface ClienteIndirizzo {
  id?: number;
  clienteId?: number;
  nome: string;
  via?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  stato?: string;
}

export interface Cliente {
  id?: number;
  ragioneSociale: string;
  email?: string;
  telefono?: string;
  cellulare?: string;
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
  listinoId?: number | null;
  tipoSoggetto?: string;
  cig?: string;
  cup?: string;
  aliquotaIvaId?: number | null;
  ultimoAcquisto?: string | null;
  fatturatoAnno?: number;
  fattureInsolute?: number;
}

export interface Listino {
  id?: number;
  nome: string;
  descrizione?: string;
  scontoDefault?: number;
  attivo?: boolean;
  prezziCount?: number;
  createdAt?: string;
}

export interface ListinoPrezzo {
  id?: number;
  listinoId: number;
  prodottoId: number;
  prezzo?: number | null;
  sconto?: number | null;
  prodottoNome?: string;
  prodottoCodice?: string;
  prodottoPrezzoBase?: number;
  prodottoIva?: number;
}

export interface PrezzoRisolto {
  prezzo: number;
  sconto: number;
  iva: number;
  sorgente: 'BASE' | 'LISTINO_OVERRIDE' | 'LISTINO_SCONTO';
  listinoId?: number;
  listinoNome?: string;
}

export interface Fornitore {
  id?: number;
  ragioneSociale: string;
  email?: string;
  telefono?: string;
  cellulare?: string;
  via?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  stato?: string;
  pIva?: string;
  sdi?: string;
  pec?: string;
  /** Soggetto estero — usato per esterometro e autofatture TD17/18/19. */
  estero?: boolean;
}

export interface RigaDocumento {
  id?: number;
  prodottoId?: number | null;
  prodottoNome?: string;
  codiceProdotto?: string;
  descrizione: string;
  quantita: number;
  unitaMisura?: string;
  prezzo: number;
  sconto?: number;
  iva: number;
  codiceIva?: string;
  varianteId?: number | null;
  varianteTaglia?: string;
  varianteColore?: string;
  tipo?: 'PRODOTTO' | 'NOTA';
  codiceFornitore?: string;
}

export interface NotaRapida {
  id?: number;
  testo: string;
  ordine?: number;
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
  destinazioneId?: number | null;
}

export interface FatturaRiferimento {
  id?: number;
  fatturaId?: number;
  tipo: string;
  numero: string;
  data?: string;
  cig?: string;
  cup?: string;
  commessa?: string;
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
  riferimenti?: FatturaRiferimento[];
  statoSdi?: string;
  dataInvioSdi?: string;
  idTrasmissioneSdi?: string;
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
  aliquotaIvaId?: number | null;
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
  codice?: string;
  categoria?: string;
  descrizione?: string;
  natura?: string | null;
  note?: string;
  predefinito?: boolean;
  attiva: boolean;
}

export interface Pagamento {
  id?: number;
  fatturaId?: number | null;
  fatturaNumero?: string;
  acquistoId?: number | null;
  acquistoNumero?: string;
  venditaBancoId?: number | null;
  venditaBancoNumero?: string;
  clienteNome?: string;
  fornitoreNome?: string;
  dataPagamento: string;
  importo: number;
  metodo?: string;
  note?: string;
  tipo?: string;
  conto?: string;
  tipoPagamentoId?: number | null;
  tipoPagamentoNome?: string;
}

export interface VenditaBanco {
  id?: number;
  numero: string;
  data: string;
  clienteNome?: string;
  metodoPagamento: string;
  note?: string;
  stato?: string;
  totale?: number;
  righe?: RigaDocumento[];
}

export interface MovimentoMagazzino {
  id: number;
  data: string;
  prodottoId: number;
  prodottoNome: string;
  tipo: 'CARICO' | 'SCARICO';
  quantita: number;
  causale: string;
  documentoTipo: string;
  documentoId?: number;
  documentoNumero: string;
  clienteId?: number;
  clienteNome?: string;
  fornitoreId?: number;
  fornitoreNome?: string;
  note?: string;
  varianteTaglia?: string;
  varianteColore?: string;
}

export interface GiacenzaStorica {
  id: number;
  nome: string;
  categoria: string;
  unitaMisura?: string;
  sogliaMinima?: number;
  quantita: number;
}

export interface RigaArrivoMerce {
  id?: number;
  prodottoId?: number | null;
  prodottoNome?: string;
  varianteId?: number | null;
  descrizione: string;
  codiceFornitore?: string;
  quantita: number;
  unitaMisura?: string;
  prezzoAcquisto?: number;
  varianteTaglia?: string;
  varianteColore?: string;
}

export interface ArrivoMerce {
  id?: number;
  numero: string;
  data: string;
  fornitoreId?: number | null;
  fornitoreNome?: string;
  acquistoId?: number | null;
  numeroDocumentoFornitore?: string;
  note?: string;
  stato: string;
  totale?: number;
  righe?: RigaArrivoMerce[];
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

export interface Utente {
  id?: number;
  username: string;
  password?: string;
  nome?: string;
  email?: string;
  ruolo: 'SUPERADMIN' | 'ADMIN' | 'COMMERCIALE' | 'MAGAZZINIERE' | 'CONTABILE' | 'OPERATORE';
  tenant?: string;
  attivo?: boolean;
}

export interface Tenant {
  slug: string;
  nome: string;
  attivo: boolean;
  created_at?: string;
}

export interface Gruppo {
  id: number;
  nome: string;
  descrizione?: string;
  num_membri?: number;
  membri?: { id: number; username: string; nome: string; email: string; ruolo: string; attivo: number }[];
  created_at?: string;
}

export interface ModuloDto {
  slug: string;
  nome: string;
  descrizione: string;
  categoria: string;
  icona: string;
  core: boolean;
  defaultAttivo: boolean;
  attivo: boolean;
  updatedAt?: string;
}

export interface StatsVenditeMensili {
  mese: string;
  imponibile: number;
  totale: number;
}

export interface StatsAcquistiMensili {
  mese: string;
  imponibile: number;
}

export interface StatsTopProdotto {
  nome: string;
  fatturato: number;
  quantitaVenduta: number;
}

export interface StatsTopCliente {
  nome: string;
  fatturato: number;
}

export interface StatsCashflow {
  daIncassare: number;
  daPagare: number;
}

export interface StatsKpiAnno {
  fatturato: number;
  costi: number;
  margine: number;
}

export interface Sollecito {
  id: number;
  documentoTipo: string;
  documentoId: number;
  emailDestinatario: string;
  dataInvio: string;
  esito: string;
}

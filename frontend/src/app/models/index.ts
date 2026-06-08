// ── Grafica documenti (stampa/PDF) ───────────────────────────────────────────
// Modello ADDITIVO e retrocompatibile: ogni campo nuovo è opzionale e, se assente,
// produce un output IDENTICO a oggi. Persistito come JSON in azienda.template_config
// (nessuna modifica backend/DB). I valori di fallback sono le costanti attuali di
// print.service.ts.
export type DocStile = 'classico' | 'moderno' | 'minimal';

// Tipi documento (1:1 coi metodi pubblici di PrintService; ordine cliente/fornitore separati)
export type DocType =
  | 'fattura' | 'ddt' | 'notaCredito'
  | 'ordineCliente' | 'ordineFornitore'
  | 'preventivo' | 'documentoCommerciale' | 'acquisto';

// Sezioni riordinabili del corpo (header sempre primo e footer sempre ultimo: fuori dall'ordine)
export type SectionKey =
  | 'parti' | 'trasporto' | 'tabella' | 'totali'
  | 'pagamento' | 'riferimenti' | 'note' | 'firme';

// Colonne tabella righe (set standard a 8 colonne)
export type ColumnKey =
  | 'num' | 'codiceDescrizione' | 'quantita' | 'um'
  | 'prezzo' | 'sconto' | 'iva' | 'importo';

export type HexColor = string; // validato /^#[0-9a-fA-F]{6}$/

export interface ColorConfig {
  accent?: HexColor;        // intestazioni, tabella, barre
  text?: HexColor;          // testo principale
  muted?: HexColor;         // testo secondario/etichette
  lightBg?: HexColor;       // sfondi tenui (box parti, head riepilogo IVA)
  rowAlt?: HexColor;        // righe alternate tabella
  headText?: HexColor;      // testo intestazione tabella
  totalBarText?: HexColor;  // testo barra totale
  divider?: HexColor;       // linee divisorie
  noteFill?: HexColor;      // sfondo box note
  noteBorder?: HexColor;    // bordo box note
}

export interface TypographyConfig {
  fontFamily?: 'helvetica' | 'times' | 'courier'; // solo font built-in jsPDF
  fontScale?: number;                              // 0.85–1.20, moltiplicatore dimensioni
  uppercaseSectionTitles?: boolean;                // titoli sezione in MAIUSCOLO
}

export interface LogoConfig {
  show?: boolean;                       // mostra il logo (se presente in azienda)
  align?: 'left' | 'center' | 'right';  // allineamento orizzontale
  size?: 'S' | 'M' | 'L';               // S=30x12, M=44x18 (attuale), L=60x24 mm
}

export interface FooterConfig {
  show?: boolean;
  showRagioneSociale?: boolean;
  showPiva?: boolean;
  showCodFiscale?: boolean;
  showPec?: boolean;
  showSdi?: boolean;
  showPageNumber?: boolean;
  customText?: string;
}

export interface VisibilityConfig {
  showIban?: boolean;        // mostra IBAN nel blocco pagamento
  showRiferimenti?: boolean; // mostra il blocco riferimenti
}

export interface TableColumnConfig {
  key: ColumnKey;
  visible?: boolean;            // num/codiceDescrizione/importo sono sempre forzate visibili
  width?: number | 'auto';      // mm
  align?: 'left' | 'center' | 'right';
  label?: string;               // override intestazione
}

export interface MarginsConfig {
  left?: number; right?: number; // mm (esposti in UI)
  top?: number; bottom?: number; // predisposti, non esposti in v1
}

// Riusabile come override per-tipo-documento (merge shallow dei sotto-oggetti)
export interface DocTemplateOverride {
  stile?: DocStile;
  colors?: ColorConfig;
  typography?: TypographyConfig;
  logo?: LogoConfig;
  footer?: FooterConfig;
  visibility?: VisibilityConfig;
  blocks?: { [key: string]: boolean };
  columns?: TableColumnConfig[];
  sectionsOrder?: SectionKey[];
  tableTheme?: 'striped' | 'grid' | 'plain';
  margins?: MarginsConfig;
}

// Root salvato in azienda.template_config (JSON).
export interface TemplateConfig extends DocTemplateOverride {
  schemaVersion?: number;
  stile: DocStile;            // RESTA OBBLIGATORIO (retrocompat: default {stile:'classico'})
  accentColor?: string;       // LEGACY: se colors.accent assente, usato come fallback. Mai rimuovere.
  format?: 'a4';
  orientation?: 'p';
  perDoc?: { [k in DocType]?: DocTemplateOverride };
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
  /**
   * Quando true, i documenti già salvati si aprono in modalità readonly
   * (lucchetto chiuso). Per modificarli serve cliccare il lucchetto.
   * Default: true.
   */
  lockDocumentiDefault?: boolean;
  // Regime fiscale (RF01..RF19; RF19 = forfettario) + default fiscali precompilati
  regimeFiscale?: string;
  ritenutaAliquotaDefault?: number;
  ritenutaCausaleDefault?: string;
  ritenutaTipoDefault?: string;
  cassaTipoDefault?: string;
  cassaAliquotaDefault?: number;
  cassaIvaDefault?: number;
}

export interface Prodotto {
  id?: number;
  nome: string;
  categoria: string;
  descrizione?: string;
  prezzo: number;
  prezzoAcquisto?: number;
  quantita?: number;
  sogliaMinima?: number | null;   // null/0 = nessun avviso di scorta (es. su ordinazione)
  unitaMisura?: string;
  codice?: string;
  codiceFornitore?: string;
  iva: number;
  barcode?: string;
  haVarianti?: boolean;
  varianti?: ProdottoVariante[];
  fornitoreIdPreferito?: number | null;
  riordinoQuantita?: number;
  fornitori?: ProdottoFornitore[];
}

export interface ProdottoFornitore {
  id?: number;
  fornitoreId: number | null;
  fornitoreNome?: string;
  codiceFornitore?: string;
  prezzoAcquisto?: number | null;
  predefinito?: boolean;
}

export interface ProdottoVariante {
  id?: number;
  prodottoId?: number;
  taglia: string;
  colore: string;
  quantita: number;
  barcode: string;
}

// ── Import listino: abbinamento codice fornitore -> prodotto ──────────────────
/** Riga del listino non abbinata a un codice fornitore esistente. */
export interface ListinoRigaNonTrovata {
  codice: string;
  prezzo?: any;
  descrizione?: string;
  marca?: string;
}

/** Candidato proposto per una riga non abbinata. `score` e interno (non mostrato). */
export interface ListinoCandidato {
  prodottoId: number;
  nome: string;
  codice: string;
  categoria: string;
  prezzoAcquistoAttuale: number | null;
  quantita: number | null;
  score: number;
  fascia: 'alta' | 'media' | 'bassa';
  perche: string;
  giaAssociatoAFornitore?: boolean;
}

/** Risultato del match per una riga: la riga di listino + i candidati ordinati. */
export interface ListinoMatchRisultato {
  codice: string;
  descrizione: string;
  prezzo?: any;
  candidati: ListinoCandidato[];
}

/** Variazione di prezzo d'acquisto rilevata durante un import listino. */
export interface VariazionePrezzo {
  codice: string;
  prodottoNome: string;
  prezzoVecchio: number | null;
  prezzoNuovo: number;
  deltaPct: number | null;
}

/** Codice fornitore memorizzato per un prodotto (memoria degli import listino). */
export interface CodiceAlias {
  id: number;
  codice: string;
  fornitoreId: number;
  fornitoreNome: string;
  createdAt?: string;
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
  /** Se true (default per le righe prodotto) la riga scarica il prodotto dal magazzino. */
  scaricaMagazzino?: boolean;
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
  // Dati fiscali (ritenuta d'acconto / cassa previdenziale / bollo)
  ritenutaAliquota?: number;
  ritenutaCausale?: string;
  ritenutaTipo?: string;
  ritenutaSuCassa?: boolean;
  cassaTipo?: string;
  cassaAliquota?: number;
  cassaIva?: number;
  bollo?: boolean;
  cassaImporto?: number;
  iva?: number;
  ritenutaImporto?: number;
  bolloImporto?: number;
  nettoAPagare?: number;
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
  // Dati fiscali (ritenuta d'acconto / cassa previdenziale / bollo)
  ritenutaAliquota?: number;
  ritenutaCausale?: string;
  ritenutaTipo?: string;
  cassaTipo?: string;
  cassaAliquota?: number;
  cassaIva?: number;
  bollo?: boolean;
  cassaImporto?: number;
  iva?: number;
  ritenutaImporto?: number;
  bolloImporto?: number;
  nettoAPagare?: number;
}

export interface Magazzino {
  id?: number;
  codice?: string;
  nome: string;
  indirizzo?: string;
  predefinito?: boolean;
  attivo?: boolean;
}

export interface Giacenza {
  id?: number;
  prodottoId: number;
  prodottoNome?: string;
  prodottoCodice?: string;
  unitaMisura?: string;
  varianteId?: number | null;
  varianteTaglia?: string;
  varianteColore?: string;
  magazzinoId: number;
  magazzinoNome?: string;
  lotto?: string;
  scadenza?: string;
  quantita: number;
}

export interface ScadenzaLotto {
  prodottoId: number;
  prodottoNome: string;
  unitaMisura?: string;
  magazzinoId: number;
  magazzinoNome: string;
  lotto?: string;
  scadenza: string;
  quantita: number;
}

export interface Ordine {
  id?: number;
  numero: string;
  dataOrdine: string;
  clienteId?: number | null;
  clienteNome?: string;
  fornitoreId?: number | null;
  fornitoreNome?: string;
  acquistoId?: number | null;
  acquistoNumero?: string | null;
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
  causale?: string;
  tipoPagamentoId?: number | null;
  tipoPagamentoNome?: string;
}

export interface CausalePagamento {
  id?: number;
  nome: string;
  ordine?: number;
  attivo?: boolean;
}

export interface PropostaRiordino {
  prodottoId: number;
  nome: string;
  codice: string;
  quantita: number;
  sogliaMinima: number;
  quantitaSuggerita: number;
  prezzoAcquisto: number;
  iva: number;
  unitaMisura: string;
  fornitoreId: number | null;
  fornitoreNome: string | null;
  // stato UI (non dal backend)
  selected?: boolean;
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
  pagamenti?: { metodo: string; importo: number }[];
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

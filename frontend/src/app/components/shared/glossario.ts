/**
 * Glossario unico dei termini fiscali/tecnici dell'app, spiegati in italiano semplice.
 * Usato da <app-field-help term="..."> per dare aiuto in-context (niente più sigle oscure).
 *
 * Regole di scrittura:
 *  - descrizione: 1-2 frasi, linguaggio da persona comune, niente gergo non spiegato.
 *  - esempio: opzionale, un valore plausibile che chiarisce il formato.
 */
export interface GlossarioVoce {
  titolo: string;
  descrizione: string;
  esempio?: string;
}

export const GLOSSARIO: Record<string, GlossarioVoce> = {
  piva: {
    titolo: 'Partita IVA',
    descrizione: 'Numero di 11 cifre che identifica un\'azienda o un professionista ai fini fiscali.',
    esempio: '01234567890',
  },
  codiceFiscale: {
    titolo: 'Codice Fiscale',
    descrizione: 'Identifica una persona (16 caratteri) o un\'azienda (11 cifre, spesso uguale alla Partita IVA).',
    esempio: 'RSSMRA80A01H501U',
  },
  sdi: {
    titolo: 'Codice SDI (Codice Destinatario)',
    descrizione: 'Codice di 7 caratteri dove l\'Agenzia delle Entrate recapita le fatture elettroniche. Se il cliente non ce l\'ha, lascia vuoto e usa la sua PEC.',
    esempio: 'ABC1234',
  },
  pec: {
    titolo: 'PEC (Posta Elettronica Certificata)',
    descrizione: 'Email con valore legale. Si usa per recapitare le fatture elettroniche quando manca il Codice SDI.',
    esempio: 'azienda@pec.it',
  },
  tipoSoggetto: {
    titolo: 'Tipo soggetto',
    descrizione: 'Indica se il cliente è un privato/azienda, un professionista o una Pubblica Amministrazione. Cambia i dati richiesti per la fattura elettronica.',
  },
  cig: {
    titolo: 'CIG (Codice Identificativo Gara)',
    descrizione: 'Codice richiesto nelle fatture verso la Pubblica Amministrazione, legato a una gara d\'appalto.',
    esempio: 'Z123456789',
  },
  cup: {
    titolo: 'CUP (Codice Unico di Progetto)',
    descrizione: 'Codice che identifica un progetto di investimento pubblico. Richiesto in alcune fatture verso la PA.',
    esempio: 'C57I18000050006',
  },
  aliquotaIva: {
    titolo: 'Aliquota IVA',
    descrizione: 'La percentuale di IVA applicata. In Italia di solito 22%, con casi ridotti (10%, 5%, 4%) o esenti.',
    esempio: '22%',
  },
  ritenuta: {
    titolo: 'Ritenuta d\'acconto',
    descrizione: 'Quota che il cliente trattiene dal compenso del professionista e versa allo Stato per suo conto (di norma 20%).',
  },
  iban: {
    titolo: 'IBAN',
    descrizione: 'Coordinate del conto corrente su cui ricevere i pagamenti. In Italia ha 27 caratteri.',
    esempio: 'IT60X0542811101000000123456',
  },
  splitPayment: {
    titolo: 'Split payment (scissione dei pagamenti)',
    descrizione: 'Per le fatture alla Pubblica Amministrazione: l\'IVA la versa direttamente l\'ente, non tu.',
  },
  reverseCharge: {
    titolo: 'Reverse charge (inversione contabile)',
    descrizione: 'In alcuni settori l\'IVA è assolta dal cliente invece che dal fornitore. La fattura va emessa senza IVA.',
  },
  esterometro: {
    titolo: 'Esterometro',
    descrizione: 'Comunicazione all\'Agenzia delle Entrate delle operazioni con clienti/fornitori esteri.',
  },
  lipe: {
    titolo: 'LIPE (Liquidazione Periodica IVA)',
    descrizione: 'Comunicazione trimestrale del calcolo dell\'IVA a debito o a credito.',
  },
  ddt: {
    titolo: 'DDT (Documento Di Trasporto)',
    descrizione: 'Accompagna la merce durante il trasporto. Da qui puoi poi generare la fattura.',
  },
  listino: {
    titolo: 'Listino prezzi',
    descrizione: 'Un insieme di prezzi personalizzati da assegnare a un cliente al posto dei prezzi base.',
  },
};

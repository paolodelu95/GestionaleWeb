// Dati di esempio per l'anteprima live dell'editor grafiche.
// Una fattura "ricca" che attiva tutti i blocchi: 2 aliquote IVA (riepilogo IVA),
// una riga NOTA (colSpan), note, pagamenti registrati, cliente completo, riferimenti.
import { Azienda } from '../models';

export const SAMPLE_AZIENDA: Partial<Azienda> = {
  ragioneSociale: 'La Tua Azienda S.r.l.',
  indirizzo: 'Via Roma 12',
  cap: '20100',
  citta: 'Milano',
  provincia: 'MI',
  pIva: '01234567890',
  codFiscale: '01234567890',
  email: 'info@tuaazienda.it',
  telefono: '02 1234567',
  pec: 'tuaazienda@pec.it',
  sdi: 'ABCDEFG',
  iban: 'IT60 X054 2811 1010 0000 0123 456',
  banca: 'Banca Esempio',
};

export const SAMPLE_FATTURA: any = {
  numero: '2026/0042',
  dataEmissione: '2026-05-30',
  tipoPagamentoNome: 'Bonifico bancario 30 gg',
  cliente: {
    ragioneSociale: 'Cliente Esempio S.p.A.',
    via: 'Corso Italia 88',
    cap: '00100',
    citta: 'Roma',
    provincia: 'RM',
    pIva: '09876543210',
    codFiscale: '09876543210',
    email: 'ordini@clienteesempio.it',
    telefono: '06 7654321',
  },
  righe: [
    { tipo: 'PRODOTTO', codiceProdotto: 'ART-001', descrizione: 'Prodotto dimostrativo di esempio', quantita: 10, unitaMisura: 'pz', prezzo: 25.0, sconto: 0, iva: 22 },
    { tipo: 'PRODOTTO', codiceProdotto: 'ART-002', descrizione: 'Servizio di consulenza tecnica', quantita: 4, unitaMisura: 'h', prezzo: 60.0, sconto: 10, iva: 22 },
    { tipo: 'NOTA', descrizione: 'Nota di riga: gli articoli sopra sono soggetti a garanzia 24 mesi.' },
    { tipo: 'PRODOTTO', codiceProdotto: 'ART-003', descrizione: 'Materiale di consumo agevolato', quantita: 5, unitaMisura: 'pz', prezzo: 12.5, sconto: 0, iva: 10 },
  ],
  pagamenti: [
    { dataPagamento: '2026-05-30', metodo: 'Bonifico', importo: 200.0, note: 'Acconto' },
  ],
  riferimenti: [
    { tipo: 'ORDINE_ACQUISTO', numero: 'ODA-2026-117', data: '2026-05-20' },
  ],
  note: 'Grazie per averci scelto. Il pagamento è dovuto entro la scadenza indicata.',
};

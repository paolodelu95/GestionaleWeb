// Preset di default per la grafica dei documenti (stampa/PDF).
// Selezionare un preset imposta una TemplateConfig di partenza; l'utente può poi
// rifinire ogni campo dall'editor. Nessun preset "blocca" la personalizzazione.
import { TemplateConfig } from '../models';

export interface TemplatePreset {
  id: string;
  label: string;
  descr: string;
  config: TemplateConfig;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'classico',
    label: 'Classico',
    descr: 'Intestazione con divider colorato, riquadri per le parti, tabella con head colorata.',
    config: { stile: 'classico' },
  },
  {
    id: 'moderno',
    label: 'Moderno',
    descr: 'Banda colorata piena in alto, parti senza box, design pulito.',
    config: { stile: 'moderno' },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    descr: 'Nessuno sfondo, titolo watermark, linea sottile — massima leggibilità.',
    config: { stile: 'minimal' },
  },
  {
    id: 'ordeva',
    label: 'Ordeva (brand)',
    descr: 'Il preset di casa: banda teal del brand, testi navy. Consigliato.',
    config: {
      stile: 'moderno',
      colors: { accent: '#11769b', text: '#0e2a38', muted: '#5a7886', rowAlt: '#eef5f7' },
      typography: { fontFamily: 'helvetica', fontScale: 1 },
      logo: { show: true, align: 'left', size: 'M' },
      footer: { show: true, showPageNumber: true },
    },
  },
  {
    id: 'elegante',
    label: 'Elegante',
    descr: 'Serif sobrio per studi e professionisti (commercialisti, consulenza).',
    config: {
      stile: 'minimal',
      colors: { accent: '#1f2937', text: '#1f2937', muted: '#6b7280', rowAlt: '#f7f7f8' },
      typography: { fontFamily: 'times', fontScale: 1 },
      margins: { left: 18, right: 18 },
      logo: { show: true, align: 'left', size: 'S' },
      footer: { show: true, showPageNumber: true },
    },
  },
  {
    id: 'compatto',
    label: 'Compatto',
    descr: 'Molte righe per pagina, risparmio carta. Per listini lunghi (negozio, magazzino, B2B).',
    config: {
      stile: 'minimal',
      colors: { accent: '#0e6480', text: '#111827', muted: '#6b7280', rowAlt: '#f1f5f9' },
      typography: { fontFamily: 'helvetica', fontScale: 0.88 },
      margins: { left: 10, right: 10 },
      logo: { show: true, align: 'left', size: 'S' },
      footer: { show: true, showPageNumber: true },
    },
  },
  {
    id: 'professionale',
    label: 'Professionale',
    descr: 'B2B strutturato, header forte, colonne ben separate. Per aziende medie e fornitori.',
    config: {
      stile: 'classico',
      colors: { accent: '#1e3a8a', text: '#0f172a', muted: '#475569', rowAlt: '#eef2f7' },
      typography: { fontFamily: 'helvetica', fontScale: 1 },
      logo: { show: true, align: 'left', size: 'M' },
      footer: { show: true, showPageNumber: true },
    },
  },
  {
    id: 'colorato',
    label: 'Colorato',
    descr: 'Impatto visivo, header pieno colore. Per retail, food, attività creative.',
    config: {
      stile: 'moderno',
      colors: { accent: '#0d9488', text: '#0f172a', muted: '#64748b', rowAlt: '#ecfdf5' },
      typography: { fontFamily: 'helvetica', fontScale: 1 },
      logo: { show: true, align: 'left', size: 'L' },
      footer: { show: true, showPageNumber: true },
    },
  },
  {
    id: 'bn-essenziale',
    label: 'B/N essenziale',
    descr: 'Monocromatico per fotocopie e stampanti b/n: nessun toner colore sprecato.',
    config: {
      stile: 'minimal',
      colors: { accent: '#000000', text: '#000000', muted: '#4b5563', rowAlt: '#f2f2f2' },
      typography: { fontFamily: 'helvetica', fontScale: 0.95 },
      logo: { show: true, align: 'left', size: 'M' },
      footer: { show: true, showPageNumber: true },
    },
  },
];

import { Component } from '@angular/core';
import { WipPlaceholderComponent, WipEndpoint } from '../shared/wip-placeholder';

@Component({
  selector: 'app-ocr-fatture',
  standalone: true,
  imports: [WipPlaceholderComponent],
  template: `
    <app-wip-placeholder
      title="OCR fatture passive — Mindee"
      subtitle="Backend pronto. Manca la UI di upload + preview + conferma."
      description="Carichi il PDF di una fattura passiva ricevuta via email/cartacea, Mindee estrae fornitore / numero / data / totali / IVA / righe, vedi un'anteprima editabile e confermi: il sistema crea l'acquisto in BOZZA col fornitore (creato se nuovo)."
      docsUrl="https://developers.mindee.com/docs/invoices-ocr"
      [envVars]="['MINDEE_API_KEY']"
      [endpoints]="endpoints">
    </app-wip-placeholder>
  `,
})
export class OcrFattureComponent {
  endpoints: WipEndpoint[] = [
    { method: 'GET',  path: '/api/ocr/status',           description: 'Mostra se MINDEE_API_KEY è configurata' },
    { method: 'POST', path: '/api/ocr/fattura',          description: 'multipart/form-data, campo file = PDF. Ritorna { suggerito: { fornitore, pIva, dataDoc, numero, righe[] } }' },
    { method: 'POST', path: '/api/ocr/fattura/conferma', description: 'Body { fornitore, pIva, dataDoc, numero, righe }. Crea acquisto BOZZA' },
  ];
}

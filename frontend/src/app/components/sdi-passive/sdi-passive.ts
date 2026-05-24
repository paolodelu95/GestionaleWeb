import { Component } from '@angular/core';
import { WipPlaceholderComponent, WipEndpoint } from '../shared/wip-placeholder';

@Component({
  selector: 'app-sdi-passive',
  standalone: true,
  imports: [WipPlaceholderComponent],
  template: `
    <app-wip-placeholder
      title="SDI — Fatture passive"
      subtitle="Backend pronto. Manca la UI di polling e cronologia import."
      description="Scarica automaticamente le fatture passive dall'intermediario SDI (Aruba). Per ogni XML scaricato, crea o aggiorna il fornitore e l'acquisto in stato RICEVUTA. Già disponibile anche l'import manuale di un singolo XML."
      docsUrl="https://fatturazioneelettronica.aruba.it/apidoc/v2/docs.html"
      [envVars]="['ARUBA_USER', 'ARUBA_PASS']"
      [endpoints]="endpoints">
    </app-wip-placeholder>
  `,
})
export class SdiPassiveComponent {
  endpoints: WipEndpoint[] = [
    { method: 'GET',  path: '/api/sdi-passive/providers',     description: 'Lista provider supportati' },
    { method: 'POST', path: '/api/sdi-passive/import-xml',    description: 'Body raw = XML FatturaPA. Crea acquisto in BOZZA' },
    { method: 'POST', path: '/api/sdi-passive/poll/aruba',    description: 'Polling Aruba { fromDate, toDate } → importa fatture nuove' },
  ];
}

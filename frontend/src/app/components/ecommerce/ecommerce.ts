import { Component } from '@angular/core';
import { WipPlaceholderComponent, WipEndpoint } from '../shared/wip-placeholder';

@Component({
  selector: 'app-ecommerce',
  standalone: true,
  imports: [WipPlaceholderComponent],
  template: `
    <app-wip-placeholder
      title="E-commerce — WooCommerce / Shopify"
      subtitle="Backend pronto. La UI per gestire la configurazione e i sync è da costruire."
      description="Sincronizza prodotti dal gestionale al sito (push) e importa gli ordini dal sito al gestionale come 'Ordini cliente' in BOZZA (pull). Mapping persistente per non duplicare. Le credenziali API si configurano per-config dentro l'app (non via env)."
      docsUrl="https://woocommerce.github.io/woocommerce-rest-api-docs/"
      [endpoints]="endpoints">
    </app-wip-placeholder>
  `,
})
export class EcommerceComponent {
  endpoints: WipEndpoint[] = [
    { method: 'GET',  path: '/api/ecommerce/configs',                description: 'Lista configurazioni' },
    { method: 'POST', path: '/api/ecommerce/configs',                description: 'Crea config { provider, nome, baseUrl, apiKey, apiSecret }' },
    { method: 'PUT',  path: '/api/ecommerce/configs/:id',            description: 'Aggiorna config' },
    { method: 'DELETE', path: '/api/ecommerce/configs/:id',          description: 'Rimuovi config' },
    { method: 'POST', path: '/api/ecommerce/configs/:id/sync-prodotti', description: 'Push prodotti locali → remoto (opt. body { ids: [..] })' },
    { method: 'POST', path: '/api/ecommerce/configs/:id/pull-ordini',   description: 'Pull nuovi ordini → ordini cliente BOZZA (opt. body { since: ISO })' },
  ];
}

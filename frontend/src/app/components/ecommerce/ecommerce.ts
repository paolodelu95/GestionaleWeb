import { Component, inject } from '@angular/core';
import { WipPlaceholderComponent, WipEndpoint } from '../shared/wip-placeholder';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-ecommerce',
  standalone: true,
  imports: [WipPlaceholderComponent],
  template: `
    <app-wip-placeholder
      [title]="i18n.t('ecommerce.title')"
      [subtitle]="i18n.t('ecommerce.subtitle')"
      [description]="i18n.t('ecommerce.description')"
      docsUrl="https://woocommerce.github.io/woocommerce-rest-api-docs/"
      [endpoints]="endpoints">
    </app-wip-placeholder>
  `,
})
export class EcommerceComponent {
  i18n = inject(I18nService);
  get endpoints(): WipEndpoint[] {
    return [
      { method: 'GET',  path: '/api/ecommerce/configs',                description: this.i18n.t('ecommerce.endpoint.listaConfig') },
      { method: 'POST', path: '/api/ecommerce/configs',                description: this.i18n.t('ecommerce.endpoint.creaConfig') },
      { method: 'PUT',  path: '/api/ecommerce/configs/:id',            description: this.i18n.t('ecommerce.endpoint.aggiornaConfig') },
      { method: 'DELETE', path: '/api/ecommerce/configs/:id',          description: this.i18n.t('ecommerce.endpoint.rimuoviConfig') },
      { method: 'POST', path: '/api/ecommerce/configs/:id/sync-prodotti', description: this.i18n.t('ecommerce.endpoint.syncProdotti') },
      { method: 'POST', path: '/api/ecommerce/configs/:id/pull-ordini',   description: this.i18n.t('ecommerce.endpoint.pullOrdini') },
    ];
  }
}

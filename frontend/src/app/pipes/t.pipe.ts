import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service';

/**
 * `{{ 'nav.dashboard' | t }}`. Impura: l'input (la chiave) non cambia quando
 * l'utente cambia lingua, quindi una pipe pura non si ri-eseguirebbe — deve
 * ricontrollare I18nService.lang() ad ogni ciclo di change detection.
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

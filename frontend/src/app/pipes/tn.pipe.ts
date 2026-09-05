import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service';

/**
 * `{{ nScadute | tn:'dashboard.alert.fatturaScaduta' }}` → risolve
 * `dashboard.alert.fatturaScaduta.one`/`.other` in base al valore, con `{{n}}`
 * già interpolato nella stringa risultante. Impura come TPipe (dipende dalla
 * lingua corrente, non solo dagli argomenti).
 */
@Pipe({ name: 'tn', standalone: true, pure: false })
export class TnPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(n: number, key: string, params?: Record<string, string | number>): string {
    return this.i18n.tn(key, n, params);
  }
}

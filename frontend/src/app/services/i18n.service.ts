import { Injectable, signal } from '@angular/core';
import { lsGet, lsSet } from '../utils/safe-storage';
import { IT } from '../i18n/it';
import { EN } from '../i18n/en';
import { FR } from '../i18n/fr';
import { DE } from '../i18n/de';
import { ES } from '../i18n/es';

export type Lang = 'it' | 'en' | 'fr' | 'de' | 'es';
export const LANGS: Lang[] = ['it', 'en', 'fr', 'de', 'es'];

const DICTIONARIES: Record<Lang, Record<string, string>> = { it: IT, en: EN, fr: FR, de: DE, es: ES };

/**
 * Traduzioni dell'interfaccia, cambiabili a runtime (niente build separate per
 * lingua, a differenza di @angular/localize — qui serve poter scegliere/
 * cambiare lingua da Impostazioni senza reinstallare l'app).
 *
 * Copertura attuale: guscio app (nav/topbar) + primo avvio + selettore lingua
 * in Impostazioni. Le singole schermate (Fatture, Clienti, ...) sono ancora
 * solo in italiano: si convertono in un secondo momento, una alla volta — il
 * fallback su IT rende sicuro aggiungerle gradualmente senza rotture.
 *
 * Scelta persistita in localStorage; `lang()` è `null` finché l'utente non ha
 * mai scelto (usato dal primo avvio per capire se mostrare il selettore).
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly KEY = 'ui-lang';
  readonly lang = signal<Lang | null>(this.read());

  private read(): Lang | null {
    const saved = lsGet(this.KEY);
    return (LANGS as string[]).includes(saved || '') ? (saved as Lang) : null;
  }

  /** Lingua effettiva per le traduzioni: quella scelta, o italiano finché non si sceglie. */
  private effective(): Lang {
    return this.lang() ?? 'it';
  }

  setLang(v: Lang) {
    lsSet(this.KEY, v);
    this.lang.set(v);
  }

  /**
   * Traduce `key`; interpola eventuali `{{param}}` con `params`. Se la lingua
   * corrente non ha quella chiave, ricade sull'italiano; se manca anche lì,
   * ritorna la chiave stessa (così una stringa non tradotta si nota subito
   * invece di sparire silenziosamente).
   */
  t(key: string, params?: Record<string, string | number>): string {
    const dict = DICTIONARIES[this.effective()];
    let str = dict[key] ?? IT[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
      }
    }
    return str;
  }
}

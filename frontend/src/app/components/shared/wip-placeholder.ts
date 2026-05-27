import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface WipEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
}

/**
 * Pagina segnaposto per feature il cui backend è pronto ma la UI è da fare.
 * Mostra il titolo, una descrizione e la lista degli endpoint REST disponibili
 * (utili come riferimento durante l'implementazione).
 */
@Component({
  selector: 'app-wip-placeholder',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div class="wip-page">
      <div class="wip-card">
        <div class="wip-icon">
          <mat-icon>schedule</mat-icon>
        </div>
        <h1 class="wip-title">{{ title }}</h1>
        <p class="wip-sub">{{ subtitle || 'Stiamo lavorando a questa funzionalità.' }}</p>

        @if (description) {
          <p class="wip-desc">{{ description }}</p>
        }

        <div class="wip-eta">
          <mat-icon>info_outline</mat-icon>
          <div>
            <strong>L'interfaccia è in fase di sviluppo.</strong>
            <br>
            Le API backend sono già pronte e operative: se ti serve usare questa
            funzione subito, contattaci a
            <a href="mailto:supporto@ordeva.it">supporto@ordeva.it</a>
            e ti aiutiamo a integrarla direttamente via API.
          </div>
        </div>

        @if (docsUrl) {
          <a mat-stroked-button [href]="docsUrl" target="_blank" rel="noopener" class="wip-docs">
            <mat-icon>open_in_new</mat-icon> Documentazione provider
          </a>
        }

        @if (endpoints.length || envVars.length) {
          <details class="wip-tech">
            <summary>Dettagli tecnici per sviluppatori</summary>

            @if (endpoints && endpoints.length) {
              <div class="wip-block">
                <div class="wip-block-title">Endpoint backend disponibili</div>
                <table class="wip-table">
                  <thead><tr><th>Metodo</th><th>Path</th><th>Descrizione</th></tr></thead>
                  <tbody>
                    @for (e of endpoints; track e.path) {
                      <tr>
                        <td><span class="method" [class.post]="e.method==='POST'" [class.put]="e.method==='PUT'" [class.del]="e.method==='DELETE'">{{ e.method }}</span></td>
                        <td><code>{{ e.path }}</code></td>
                        <td>{{ e.description }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            @if (envVars && envVars.length) {
              <div class="wip-block">
                <div class="wip-block-title">Variabili d'ambiente da configurare su Fly</div>
                <pre class="wip-code">@for (v of envVars; track v) {<span>fly secrets set {{ v }}=&lt;valore&gt; -a invoxa
</span>}</pre>
              </div>
            }
          </details>
        }
      </div>
    </div>
  `,
  styles: [`
    .wip-page { padding: 32px; max-width: 800px; margin: 0 auto; }
    .wip-card { background: var(--bg-surface, #fff); border-radius: 12px; padding: 32px; border: 1px solid var(--border-subtle, #e2e8f0); text-align: center; }
    .wip-icon { display: inline-flex; padding: 14px; border-radius: 50%; background: #fef3c7; color: #92400e; margin-bottom: 12px; }
    .wip-icon mat-icon { font-size: 32px; width: 32px; height: 32px; }
    .wip-title { font-size: 24px; font-weight: 700; margin: 0 0 4px; color: var(--text-primary, #0f172a); }
    .wip-sub { font-size: 14px; color: var(--text-secondary, #64748b); margin: 0 0 18px; }
    .wip-desc { font-size: 13px; color: var(--text-secondary, #475569); margin: 0 0 18px; line-height: 1.5; text-align: left; }

    .wip-block { text-align: left; margin-top: 18px; }
    .wip-block-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-tertiary, #94a3b8); margin-bottom: 8px; }

    .wip-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .wip-table th { background: var(--bg-surface-2, #f8fafc); padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary, #64748b); }
    .wip-table td { padding: 6px 8px; border-top: 1px solid var(--border-subtle, #f1f5f9); vertical-align: middle; }
    .method { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #dbeafe; color: #1e40af; }
    .method.post { background: #d1fae5; color: #065f46; }
    .method.put { background: #fef3c7; color: #92400e; }
    .method.del { background: #fee2e2; color: #991b1b; }
    code { background: var(--bg-surface-2, #f1f5f9); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
    .wip-code { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; font-family: ui-monospace, monospace; }
    .wip-docs { margin-top: 18px; }
    .wip-eta {
      display: flex; gap: 12px; align-items: flex-start;
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px;
      padding: 14px 16px; margin: 20px 0 4px; text-align: left;
      font-size: 13px; color: #1e3a8a; line-height: 1.55;
    }
    .wip-eta mat-icon { color: #2563eb; flex-shrink: 0; font-size: 22px; width: 22px; height: 22px; margin-top: 1px; }
    .wip-eta a { color: #1d4ed8; text-decoration: underline; }
    .wip-tech {
      margin-top: 20px;
      text-align: left;
      border-top: 1px solid var(--border-subtle, #e2e8f0);
      padding-top: 16px;
    }
    .wip-tech summary {
      cursor: pointer; font-size: 12px; font-weight: 600;
      color: var(--text-tertiary, #94a3b8); text-transform: uppercase;
      letter-spacing: 0.4px; padding: 4px 0;
      -webkit-user-select: none; user-select: none;
    }
    .wip-tech summary:hover { color: var(--text-secondary, #64748b); }
  `],
})
export class WipPlaceholderComponent {
  @Input() title = 'Da implementare';
  @Input() subtitle = 'Il backend è pronto. UI in arrivo.';
  @Input() description = '';
  @Input() endpoints: WipEndpoint[] = [];
  @Input() envVars: string[] = [];
  @Input() docsUrl = '';
}

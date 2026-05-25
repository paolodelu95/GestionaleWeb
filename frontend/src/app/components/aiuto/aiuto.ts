import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

interface Step { titolo: string; descrizione: string; }
interface Sezione {
  id: string;
  titolo: string;
  icona: string;
  colore: string;
  intro: string;
  passi: Step[];
}
interface Faq { domanda: string; risposta: string; }

/**
 * Guida e manuale d'uso interno (loggato).
 *
 * Pagina che spiega come usare Ordeva, organizzata per area funzionale
 * con sezioni espandibili. Pensata per utenti non tecnici.
 */
@Component({
  selector: 'app-aiuto',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    MatIconModule, MatExpansionModule, MatButtonModule,
    MatFormFieldModule, MatInputModule,
  ],
  template: `
    <div class="aiuto-page">
      <!-- Hero -->
      <section class="hero">
        <div class="hero-icon">
          <mat-icon>menu_book</mat-icon>
        </div>
        <h1>Guida di Ordeva</h1>
        <p>Tutto quello che serve sapere per usare Ordeva al meglio. Scegli un argomento qui sotto.</p>
        <mat-form-field appearance="outline" class="search-bar">
          <mat-icon matPrefix>search</mat-icon>
          <input matInput placeholder="Cerca nella guida (es. 'come emetto una fattura')"
                 [(ngModel)]="query" (input)="filter()">
          @if (query) {
            <button mat-icon-button matSuffix (click)="query = ''; filter()">
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>
      </section>

      <!-- Quick start (mostra solo se non c'è ricerca attiva) -->
      @if (!query) {
        <section class="quick-start">
          <h2>Iniziare in 5 minuti</h2>
          <div class="quick-grid">
            <a routerLink="/impostazioni" class="quick-card">
              <div class="qc-num">1</div>
              <b>Configura azienda</b>
              <span>Inserisci ragione sociale, P.IVA, indirizzo, logo</span>
            </a>
            <a routerLink="/clienti" class="quick-card">
              <div class="qc-num">2</div>
              <b>Aggiungi clienti</b>
              <span>Crea l'anagrafica dei tuoi clienti</span>
            </a>
            <a routerLink="/prodotti" class="quick-card">
              <div class="qc-num">3</div>
              <b>Carica prodotti</b>
              <span>Catalogo, prezzi, scorte iniziali</span>
            </a>
            <a routerLink="/fatture" class="quick-card">
              <div class="qc-num">4</div>
              <b>Emetti la prima fattura</b>
              <span>Scegli cliente, righe e invia a SDI</span>
            </a>
          </div>
        </section>
      }

      <!-- Galleria mockup (visibile senza ricerca) -->
      @if (!query) {
        <section class="gallery">
          <h2>Le schermate principali, a colpo d'occhio</h2>
          <p class="gallery-sub">Esempi di interfaccia con dati di fantasia per illustrare il funzionamento. I tuoi dati reali compaiono solo dopo il login.</p>
          <div class="gallery-grid">

            <!-- Mockup 1: Dashboard -->
            <figure class="mockup">
              <div class="mock-frame">
                <div class="mock-titlebar">
                  <span class="mock-dot mock-dot-r"></span>
                  <span class="mock-dot mock-dot-y"></span>
                  <span class="mock-dot mock-dot-g"></span>
                  <span class="mock-url">ordeva.it · Dashboard</span>
                </div>
                <div class="mock-body mock-body-dashboard">
                  <div class="mock-kpis">
                    <div class="mock-kpi">
                      <span class="mock-kpi-label">Fatturato mese</span>
                      <span class="mock-kpi-value">€ 12.450</span>
                      <span class="mock-kpi-trend mock-trend-up">↑ 12% vs mese precedente</span>
                    </div>
                    <div class="mock-kpi">
                      <span class="mock-kpi-label">Da incassare</span>
                      <span class="mock-kpi-value">€ 3.240</span>
                      <span class="mock-kpi-trend mock-trend-warn">3 fatture in scadenza</span>
                    </div>
                    <div class="mock-kpi">
                      <span class="mock-kpi-label">Scorta bassa</span>
                      <span class="mock-kpi-value">2 prodotti</span>
                      <span class="mock-kpi-trend mock-trend-danger">Sotto soglia minima</span>
                    </div>
                  </div>
                  <div class="mock-chart">
                    <div class="mock-bar" style="height:34%"></div>
                    <div class="mock-bar" style="height:52%"></div>
                    <div class="mock-bar" style="height:44%"></div>
                    <div class="mock-bar" style="height:68%"></div>
                    <div class="mock-bar" style="height:58%"></div>
                    <div class="mock-bar mock-bar-current" style="height:76%"></div>
                  </div>
                </div>
              </div>
              <figcaption>Dashboard — panoramica KPI fatturato, incassi, scorte</figcaption>
            </figure>

            <!-- Mockup 2: Nuova fattura -->
            <figure class="mockup">
              <div class="mock-frame">
                <div class="mock-titlebar">
                  <span class="mock-dot mock-dot-r"></span>
                  <span class="mock-dot mock-dot-y"></span>
                  <span class="mock-dot mock-dot-g"></span>
                  <span class="mock-url">ordeva.it · Nuova fattura</span>
                </div>
                <div class="mock-body">
                  <div class="mock-form-row">
                    <div class="mock-field"><span class="mock-label">Cliente *</span><span class="mock-input">Mario Rossi SRL</span></div>
                    <div class="mock-field mock-field-sm"><span class="mock-label">Numero</span><span class="mock-input">2026/0042</span></div>
                    <div class="mock-field mock-field-sm"><span class="mock-label">Data</span><span class="mock-input">25/05/2026</span></div>
                  </div>
                  <table class="mock-table">
                    <thead><tr><th>Descrizione</th><th>Q.tà</th><th>Prezzo</th><th>IVA</th><th>Totale</th></tr></thead>
                    <tbody>
                      <tr><td>Consulenza tecnica</td><td>8 h</td><td>€ 50,00</td><td>22%</td><td>€ 488,00</td></tr>
                      <tr><td>Sopralluogo + report</td><td>1</td><td>€ 80,00</td><td>22%</td><td>€ 97,60</td></tr>
                    </tbody>
                  </table>
                  <div class="mock-totals">
                    <div><span>Imponibile</span><b>€ 480,00</b></div>
                    <div><span>IVA 22%</span><b>€ 105,60</b></div>
                    <div class="mock-total-row"><span>Totale</span><b>€ 585,60</b></div>
                  </div>
                </div>
              </div>
              <figcaption>Nuova fattura — cliente, righe, IVA, totali calcolati automaticamente</figcaption>
            </figure>

            <!-- Mockup 3: Magazzino -->
            <figure class="mockup">
              <div class="mock-frame">
                <div class="mock-titlebar">
                  <span class="mock-dot mock-dot-r"></span>
                  <span class="mock-dot mock-dot-y"></span>
                  <span class="mock-dot mock-dot-g"></span>
                  <span class="mock-url">ordeva.it · Magazzino</span>
                </div>
                <div class="mock-body">
                  <table class="mock-table">
                    <thead><tr><th>Prodotto</th><th>Codice</th><th>Giacenza</th><th>Soglia</th><th>Stato</th></tr></thead>
                    <tbody>
                      <tr><td>Polo cotone L</td><td>POLO-L-01</td><td>24 pz</td><td>10</td><td><span class="mock-badge mock-badge-ok">OK</span></td></tr>
                      <tr><td>T-shirt basic M</td><td>TSH-M-02</td><td>2 pz</td><td>10</td><td><span class="mock-badge mock-badge-warn">Scorta bassa</span></td></tr>
                      <tr><td>Felpa pile XL</td><td>FLP-XL-03</td><td>15 pz</td><td>5</td><td><span class="mock-badge mock-badge-ok">OK</span></td></tr>
                      <tr><td>Cappellino brand</td><td>CAP-01</td><td>0 pz</td><td>20</td><td><span class="mock-badge mock-badge-danger">Esaurito</span></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <figcaption>Magazzino — giacenze in tempo reale con alert su soglia minima</figcaption>
            </figure>

            <!-- Mockup 4: CRM Kanban -->
            <figure class="mockup">
              <div class="mock-frame">
                <div class="mock-titlebar">
                  <span class="mock-dot mock-dot-r"></span>
                  <span class="mock-dot mock-dot-y"></span>
                  <span class="mock-dot mock-dot-g"></span>
                  <span class="mock-url">ordeva.it · CRM</span>
                </div>
                <div class="mock-body mock-body-crm">
                  <div class="mock-kanban">
                    <div class="mock-col">
                      <div class="mock-col-head" style="color:#0284c7">Lead · 3</div>
                      <div class="mock-card"><b>Bianchi &amp; Co.</b><span>€ 4.500</span></div>
                      <div class="mock-card"><b>Verdi Snc</b><span>€ 1.200</span></div>
                      <div class="mock-card"><b>Neri SRL</b><span>€ 8.000</span></div>
                    </div>
                    <div class="mock-col">
                      <div class="mock-col-head" style="color:#7c3aed">Qualificato · 2</div>
                      <div class="mock-card"><b>ACME SpA</b><span>€ 15.000</span></div>
                      <div class="mock-card"><b>Studio Galli</b><span>€ 2.800</span></div>
                    </div>
                    <div class="mock-col">
                      <div class="mock-col-head" style="color:#d97706">Offerta · 1</div>
                      <div class="mock-card"><b>Rossi SRL</b><span>€ 6.200</span></div>
                    </div>
                    <div class="mock-col">
                      <div class="mock-col-head" style="color:#16a34a">Vinto · 1</div>
                      <div class="mock-card mock-card-won"><b>Tech4U SAS</b><span>€ 9.500</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <figcaption>CRM — pipeline opportunità in stile Kanban, drag&amp;drop tra stage</figcaption>
            </figure>

          </div>
        </section>
      }

      <!-- Sezioni del manuale -->
      <section class="manual">
        @if (!query) { <h2>Il manuale per area</h2> }
        @if (query && filtered.length === 0) {
          <p class="no-results">Nessun risultato per "<b>{{ query }}</b>". Prova con un altro termine.</p>
        }

        @for (sez of (query ? filtered : sezioni); track sez.id) {
          <mat-expansion-panel class="section-panel" [id]="sez.id">
            <mat-expansion-panel-header>
              <mat-panel-title>
                <span class="section-icon" [style.background]="sez.colore">
                  <mat-icon>{{ sez.icona }}</mat-icon>
                </span>
                <span class="section-title">{{ sez.titolo }}</span>
              </mat-panel-title>
              <mat-panel-description>{{ sez.intro }}</mat-panel-description>
            </mat-expansion-panel-header>

            <div class="section-content">
              @for (passo of sez.passi; track passo.titolo) {
                <div class="step-item">
                  <div class="step-bullet">
                    <mat-icon>chevron_right</mat-icon>
                  </div>
                  <div class="step-text">
                    <h4>{{ passo.titolo }}</h4>
                    <p>{{ passo.descrizione }}</p>
                  </div>
                </div>
              }
            </div>
          </mat-expansion-panel>
        }
      </section>

      <!-- FAQ rapide -->
      @if (!query) {
        <section class="faq-section">
          <h2>Domande frequenti</h2>
          <mat-accordion class="faq-accordion">
            @for (f of faqs; track f.domanda) {
              <mat-expansion-panel>
                <mat-expansion-panel-header>
                  <mat-panel-title>{{ f.domanda }}</mat-panel-title>
                </mat-expansion-panel-header>
                <p>{{ f.risposta }}</p>
              </mat-expansion-panel>
            }
          </mat-accordion>
        </section>
      }

      <!-- Scorciatoie -->
      @if (!query) {
        <section class="shortcuts">
          <h2>Scorciatoie da tastiera</h2>
          <div class="kbd-grid">
            <div class="kbd-row"><div class="kbd-keys"><kbd>Cmd</kbd>+<kbd>K</kbd></div><span>Cerca ovunque (clienti, fatture, prodotti…)</span></div>
            <div class="kbd-row"><div class="kbd-keys"><kbd>Cmd</kbd>+<kbd>S</kbd></div><span>Salva il documento aperto</span></div>
            <div class="kbd-row"><div class="kbd-keys"><kbd>Cmd</kbd>+<kbd>N</kbd></div><span>Nuovo documento (sulla pagina corrente)</span></div>
            <div class="kbd-row"><div class="kbd-keys"><kbd>Esc</kbd></div><span>Chiudi finestra di dialogo</span></div>
            <div class="kbd-row"><div class="kbd-keys"><kbd>/</kbd></div><span>Apri barra ricerca</span></div>
          </div>
          <p class="shortcut-note">Su Windows e Linux usa <kbd>Ctrl</kbd> al posto di <kbd>Cmd</kbd>.</p>
        </section>
      }

      <!-- Contatti supporto -->
      @if (!query) {
        <section class="support">
          <div class="support-card">
            <mat-icon>support_agent</mat-icon>
            <div>
              <h3>Non hai trovato quello che cercavi?</h3>
              <p>Scrivi a <a href="mailto:contatti@ordeva.it">contatti&#64;ordeva.it</a> e ti rispondiamo entro 24h lavorative. Sul piano Pro la risposta è garantita entro 4h.</p>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .aiuto-page {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px 24px 60px;
      color: var(--text-primary);
    }

    /* Hero */
    .hero {
      text-align: center;
      margin-bottom: 36px;
    }
    .hero-icon {
      width: 64px; height: 64px;
      margin: 0 auto 16px;
      border-radius: 16px;
      background: linear-gradient(135deg, #11769b 0%, #15a4a2 100%);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px -4px rgba(17, 118, 155, 0.45);
    }
    .hero-icon mat-icon {
      color: #fff; font-size: 32px; width: 32px; height: 32px;
    }
    .hero h1 {
      font-size: 32px; font-weight: 800; letter-spacing: -0.025em;
      margin: 0 0 8px;
      color: var(--text-primary);
    }
    .hero p {
      font-size: 15px; color: var(--text-secondary);
      max-width: 540px; margin: 0 auto 24px;
    }
    .search-bar {
      width: 100%; max-width: 540px;
      ::ng-deep .mat-mdc-form-field-subscript-wrapper { display: none; }
    }

    /* Quick start */
    .quick-start { margin-bottom: 40px; }
    .quick-start h2,
    .manual h2,
    .faq-section h2,
    .shortcuts h2 {
      font-size: 18px; font-weight: 700;
      color: var(--text-primary);
      margin: 0 0 16px;
      letter-spacing: -0.01em;
    }
    .quick-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .quick-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 16px;
      text-decoration: none;
      color: var(--text-primary);
      transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
      display: flex; flex-direction: column; gap: 6px;
    }
    .quick-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px -6px rgba(15,23,42,0.10);
      border-color: var(--primary);
    }
    .qc-num {
      width: 26px; height: 26px;
      border-radius: 50%;
      background: linear-gradient(135deg, #11769b 0%, #15a4a2 100%);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 13px;
      margin-bottom: 4px;
    }
    .quick-card b {
      font-size: 14px; color: var(--text-primary);
      font-weight: 700;
    }
    .quick-card span {
      font-size: 12px; color: var(--text-secondary);
    }

    /* Manual sections */
    .manual { margin-bottom: 40px; }
    .section-panel {
      margin-bottom: 10px !important;
      border-radius: 10px !important;
      border: 1px solid var(--border) !important;
      box-shadow: var(--shadow-xs) !important;
      background: var(--bg-surface) !important;
    }
    ::ng-deep .section-panel .mat-expansion-panel-header {
      padding: 0 18px !important;
      height: 64px !important;
    }
    ::ng-deep .section-panel .mat-expansion-panel-header-title {
      align-items: center;
      gap: 12px;
      font-weight: 600 !important;
      flex: 0 0 auto;
      color: var(--text-primary) !important;
    }
    ::ng-deep .section-panel .mat-expansion-panel-header-description {
      color: var(--text-secondary) !important;
      font-size: 13px;
      flex: 1 1 auto;
      margin-right: 16px;
    }
    .section-icon {
      width: 36px; height: 36px;
      border-radius: 9px;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .section-icon mat-icon {
      color: #fff; font-size: 20px; width: 20px; height: 20px;
    }
    .section-title { font-size: 15px; }
    .section-content { padding: 8px 0 6px; }
    .step-item {
      display: flex; gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .step-item:last-child { border-bottom: none; }
    .step-bullet {
      width: 28px; height: 28px;
      flex-shrink: 0;
      border-radius: 50%;
      background: var(--primary-soft);
      color: var(--primary);
      display: flex; align-items: center; justify-content: center;
    }
    .step-bullet mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .step-text { flex: 1; min-width: 0; }
    .step-text h4 {
      font-size: 14px; font-weight: 600;
      margin: 2px 0 4px;
      color: var(--text-primary);
    }
    .step-text p {
      font-size: 13px; color: var(--text-secondary);
      margin: 0; line-height: 1.55;
    }

    .no-results {
      text-align: center; padding: 24px 0;
      color: var(--text-secondary); font-size: 14px;
    }

    /* FAQ */
    .faq-section { margin-bottom: 40px; }
    .faq-accordion { display: block; }
    ::ng-deep .faq-accordion .mat-expansion-panel {
      margin-bottom: 8px !important;
      border-radius: 10px !important;
      border: 1px solid var(--border) !important;
      box-shadow: none !important;
      background: var(--bg-surface) !important;
    }
    ::ng-deep .faq-accordion .mat-expansion-panel-header { height: 52px !important; }
    ::ng-deep .faq-accordion .mat-expansion-panel-header-title {
      font-weight: 500 !important; font-size: 14px !important;
      color: var(--text-primary) !important;
    }
    .faq-accordion p {
      margin: 0; font-size: 13px; color: var(--text-secondary);
      line-height: 1.55;
    }

    /* Shortcuts */
    .shortcuts { margin-bottom: 40px; }
    .kbd-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 8px;
    }
    .kbd-row {
      display: flex; align-items: center; gap: 14px;
      padding: 10px 12px;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .kbd-row:hover { background: var(--bg-subtle); }
    .kbd-keys { display: flex; align-items: center; gap: 4px; }
    kbd {
      display: inline-block;
      padding: 3px 7px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-strong);
      border-radius: 5px;
      font-size: 11px; font-weight: 600;
      color: var(--text-primary);
      font-family: 'SF Mono', Menlo, monospace;
      box-shadow: 0 1px 0 var(--border-strong);
    }
    .kbd-row span { font-size: 13px; color: var(--text-secondary); }
    .shortcut-note {
      font-size: 12px; color: var(--text-tertiary);
      margin-top: 8px;
      kbd { font-size: 10px; padding: 1px 5px; }
    }

    /* Support */
    .support-card {
      display: flex; gap: 18px;
      background: linear-gradient(135deg, rgba(17,118,155,0.06) 0%, rgba(21,164,162,0.06) 100%);
      border: 1px solid rgba(17,118,155,0.18);
      border-radius: 14px;
      padding: 22px 24px;
    }
    .support-card mat-icon {
      color: #11769b; font-size: 36px; width: 36px; height: 36px;
      flex-shrink: 0;
    }
    .support-card h3 {
      margin: 0 0 6px;
      font-size: 16px; font-weight: 700;
      color: var(--text-primary);
    }
    .support-card p {
      margin: 0; font-size: 14px;
      color: var(--text-secondary);
    }
    .support-card a {
      color: #11769b; text-decoration: underline;
      text-underline-offset: 2px;
    }

    /* ── Gallery / mockup ───────────────────────────────────────────── */
    .gallery { margin-bottom: 44px; }
    .gallery-sub {
      font-size: 13px; color: var(--text-tertiary);
      margin: -10px 0 18px;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 18px;
    }
    .mockup { margin: 0; }
    .mockup figcaption {
      font-size: 12px; color: var(--text-tertiary);
      text-align: center; margin-top: 8px;
      line-height: 1.4;
    }
    .mock-frame {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 16px -4px rgba(15,23,42,0.10);
    }
    .mock-titlebar {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px;
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border-subtle);
    }
    .mock-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .mock-dot-r { background: #ef5350; }
    .mock-dot-y { background: #ffb74d; }
    .mock-dot-g { background: #66bb6a; }
    .mock-url {
      font-size: 11px;
      color: var(--text-tertiary);
      margin-left: 8px;
      font-family: 'SF Mono', Menlo, monospace;
    }
    .mock-body {
      padding: 14px 16px;
      min-height: 200px;
      font-size: 12px;
    }
    .mock-body-dashboard { padding: 14px; }

    /* KPIs */
    .mock-kpis {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .mock-kpi {
      background: var(--bg-subtle);
      border-radius: 8px;
      padding: 10px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .mock-kpi-label {
      font-size: 10px;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .mock-kpi-value {
      font-size: 16px;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .mock-kpi-trend { font-size: 10px; font-weight: 500; }
    .mock-trend-up { color: #16a34a; }
    .mock-trend-warn { color: #d97706; }
    .mock-trend-danger { color: #dc2626; }

    /* Chart */
    .mock-chart {
      height: 80px;
      display: flex; align-items: flex-end;
      gap: 10px;
      padding: 0 6px;
    }
    .mock-bar {
      flex: 1;
      background: linear-gradient(180deg, #15a4a2 0%, #11769b 100%);
      border-radius: 4px 4px 0 0;
      opacity: 0.55;
    }
    .mock-bar-current { opacity: 1; }

    /* Form */
    .mock-form-row {
      display: flex; gap: 8px;
      margin-bottom: 12px;
    }
    .mock-field {
      display: flex; flex-direction: column;
      flex: 1; gap: 3px;
    }
    .mock-field-sm { flex: 0 0 auto; min-width: 90px; }
    .mock-label {
      font-size: 10px; color: var(--text-tertiary);
      font-weight: 500;
    }
    .mock-input {
      font-size: 12px;
      padding: 6px 10px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-weight: 500;
    }

    /* Tables */
    .mock-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      background: var(--bg-surface);
    }
    .mock-table thead th {
      text-align: left;
      padding: 7px 9px;
      background: var(--bg-subtle);
      color: var(--text-tertiary);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
    }
    .mock-table tbody td {
      padding: 8px 9px;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
    }
    .mock-table tbody tr:last-child td { border-bottom: none; }
    .mock-table th:not(:first-child),
    .mock-table td:not(:first-child) { text-align: right; }

    .mock-totals {
      margin-top: 10px;
      padding: 8px 9px;
      background: var(--bg-subtle);
      border-radius: 6px;
      font-size: 11px;
    }
    .mock-totals > div {
      display: flex; justify-content: space-between;
      padding: 3px 0;
      color: var(--text-secondary);
    }
    .mock-total-row {
      border-top: 1px solid var(--border);
      margin-top: 4px; padding-top: 6px !important;
      color: var(--text-primary) !important;
      font-size: 13px;
    }
    .mock-total-row b { color: #11769b; font-size: 14px; }

    /* Badges */
    .mock-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px; font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .mock-badge-ok {
      background: rgba(22, 163, 74, 0.12);
      color: #15803d;
    }
    .mock-badge-warn {
      background: rgba(217, 119, 6, 0.14);
      color: #b45309;
    }
    .mock-badge-danger {
      background: rgba(220, 38, 38, 0.14);
      color: #b91c1c;
    }

    /* CRM Kanban */
    .mock-body-crm { padding: 12px; }
    .mock-kanban {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .mock-col {
      background: var(--bg-subtle);
      border-radius: 8px;
      padding: 8px;
      display: flex; flex-direction: column; gap: 6px;
      min-height: 180px;
    }
    .mock-col-head {
      font-size: 10px; font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .mock-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 7px 9px;
      font-size: 11px;
      display: flex; flex-direction: column; gap: 2px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.04);
    }
    .mock-card b {
      font-size: 11px;
      color: var(--text-primary);
      font-weight: 600;
    }
    .mock-card span { color: var(--text-secondary); font-size: 10px; }
    .mock-card-won {
      border-color: #16a34a;
      background: rgba(22, 163, 74, 0.06);
    }
    .mock-card-won b { color: #15803d; }

    @media (max-width: 800px) {
      .gallery-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 600px) {
      .aiuto-page { padding: 20px 14px 40px; }
      .hero h1 { font-size: 24px; }
      .hero-icon { width: 56px; height: 56px; }
      .hero-icon mat-icon { font-size: 28px; width: 28px; height: 28px; }
      ::ng-deep .section-panel .mat-expansion-panel-header-description { display: none; }
      .section-icon { width: 32px; height: 32px; }
      .support-card { flex-direction: column; align-items: flex-start; gap: 10px; }
    }
  `]
})
export class AiutoComponent {
  query = '';
  filtered: Sezione[] = [];

  readonly sezioni: Sezione[] = [
    {
      id: 'azienda',
      titolo: 'Configurare i dati dell\'azienda',
      icona: 'business',
      colore: 'linear-gradient(135deg,#0284c7,#0369a1)',
      intro: 'Prima cosa da fare al primo accesso',
      passi: [
        { titolo: 'Inserisci ragione sociale e P.IVA', descrizione: 'Vai in Impostazioni → Dati azienda. Compila ragione sociale, P.IVA (11 cifre), codice fiscale (se diverso), indirizzo completo, telefono e PEC. Tutti i documenti emessi (fatture, DDT, ecc.) useranno questi dati.' },
        { titolo: 'Carica il logo', descrizione: 'Nella stessa sezione carica il logo dell\'azienda (PNG o JPG, max 2MB). Comparirà su fatture, preventivi, DDT, email automatiche.' },
        { titolo: 'Imposta numerazione documenti', descrizione: 'Decide se la numerazione fatture/DDT/ecc. è annuale (es. 2026/0001) o continua (1, 2, 3…). Puoi anche aggiungere prefissi personalizzati come "FATT-" o "DDT-".' },
        { titolo: 'Configura email per inviare ai clienti', descrizione: 'In Impostazioni → Email puoi configurare il tuo SMTP personale (Gmail, Outlook, Aruba, ecc.) per inviare fatture e solleciti direttamente dai tuoi indirizzi.' },
      ],
    },
    {
      id: 'clienti',
      titolo: 'Gestire i clienti',
      icona: 'people',
      colore: 'linear-gradient(135deg,#0284c7,#0369a1)',
      intro: 'Anagrafica clienti, sedi, condizioni di pagamento',
      passi: [
        { titolo: 'Aggiungere un cliente nuovo', descrizione: 'Click su "Clienti" nel menu, poi "Nuovo". Compila ragione sociale (obbligatoria) e P.IVA o C.F. Tutto il resto è opzionale ma utile per la fatturazione elettronica.' },
        { titolo: 'Importare clienti da Excel', descrizione: 'Click su "Importa CSV" in alto a destra. Scarica il template di esempio, compilalo con i tuoi dati e ricaricalo. Tutti i clienti vengono importati in un click.' },
        { titolo: 'Lookup veloce P.IVA', descrizione: 'Quando inserisci una P.IVA italiana, click sull\'icona cerca a destra: Ordeva recupera automaticamente ragione sociale, sede e dati ufficiali dal Registro Imprese.' },
        { titolo: 'Condizioni di pagamento personalizzate', descrizione: 'Per ogni cliente puoi impostare il "Tipo di pagamento" predefinito (es. Bonifico 30 giorni). Quando emetti una fattura per quel cliente, viene pre-compilato.' },
      ],
    },
    {
      id: 'fornitori',
      titolo: 'Gestire i fornitori',
      icona: 'local_shipping',
      colore: 'linear-gradient(135deg,#0891b2,#0e7490)',
      intro: 'Anagrafica fornitori per acquisti e arrivi merce',
      passi: [
        { titolo: 'Creare un fornitore', descrizione: 'In "Fornitori" → "Nuovo". Stesso pattern del cliente. Utile per registrare acquisti, ricevere arrivi merce e tracciare scadenze passive.' },
        { titolo: 'Fornitore estero', descrizione: 'Spunta "Fornitore estero" per fatture in reverse charge / esterometro: Ordeva applica automaticamente il regime fiscale corretto.' },
      ],
    },
    {
      id: 'prodotti',
      titolo: 'Catalogo prodotti e listini',
      icona: 'inventory_2',
      colore: 'linear-gradient(135deg,#22d3ee,#06b6d4)',
      intro: 'Prodotti, varianti per taglia/colore, listini differenziati',
      passi: [
        { titolo: 'Aggiungere un prodotto', descrizione: '"Prodotti" → "Nuovo". Nome, prezzo, IVA, unità di misura, codice interno. Per articoli con codice a barre, scansionalo con la fotocamera (icona barcode).' },
        { titolo: 'Varianti taglia/colore', descrizione: 'Nella scheda prodotto attiva "Gestione varianti" e aggiungi le combinazioni (es. "S/Rosso", "M/Blu"). Ogni variante ha la sua quantità in magazzino.' },
        { titolo: 'Listini differenziati', descrizione: 'In Impostazioni → Listini puoi creare listini diversi (es. "Privati", "Aziende", "Rivenditori") con sconti per categoria di prodotto. Assegna un listino al cliente e applica i prezzi giusti automaticamente.' },
        { titolo: 'Soglia minima scorta', descrizione: 'Imposta una "Soglia minima" per ogni prodotto. Quando la giacenza scende sotto, vedi una notifica nella dashboard.' },
      ],
    },
    {
      id: 'fatture',
      titolo: 'Emettere fatture elettroniche (SDI)',
      icona: 'receipt',
      colore: 'linear-gradient(135deg,#0e7490,#155e75)',
      intro: 'Fatturazione elettronica conforme SDI, invio e ricevute',
      passi: [
        { titolo: 'Creare una fattura', descrizione: '"Fatture" → "Nuova fattura". Scegli il cliente (autocompletamento), aggiungi righe (prodotti dal catalogo o testo libero). Ordeva calcola automaticamente imponibile, IVA, totale.' },
        { titolo: 'Generare l\'XML SDI', descrizione: 'Una volta salvata, click su "Genera XML". Ordeva produce il file conforme alle specifiche dell\'Agenzia delle Entrate. Lo scarichi e lo carichi sul tuo provider SDI (commercialista, Aruba, Fattura24, ecc.).' },
        { titolo: 'Invio diretto via API', descrizione: 'Se il tuo provider SDI ha un\'API (es. Fattura24), configurala in Impostazioni → SDI. Da quel momento "Invia a SDI" parte direttamente dall\'app, ricevute incluse.' },
        { titolo: 'Inviare la fattura al cliente via email', descrizione: 'Dopo aver emesso, click "Invia email". Ordeva genera un PDF e lo manda all\'email del cliente con un testo personalizzabile.' },
        { titolo: 'Note di credito', descrizione: 'Per annullare/stornare una fattura, vai in "Note di credito" → "Nuova". Collega alla fattura originale: l\'XML sarà generato di conseguenza.' },
        { titolo: 'Fatture ricorrenti', descrizione: 'Per canoni mensili/annuali (manutenzioni, abbonamenti), crea un template in "Ricorrenti". Imposta frequenza, giorno del mese. Ordeva genera e invia le fatture automaticamente alle date previste.' },
      ],
    },
    {
      id: 'ddt',
      titolo: 'DDT (Documenti di Trasporto)',
      icona: 'receipt_long',
      colore: 'linear-gradient(135deg,#38bdf8,#0ea5e9)',
      intro: 'Bolle di accompagnamento merce + conversione in fattura',
      passi: [
        { titolo: 'Emettere un DDT', descrizione: '"DDT" → "Nuovo". Cliente, righe, vettore, peso, colli. Stampa direttamente o esporta PDF.' },
        { titolo: 'Convertire un DDT in fattura', descrizione: 'Dalla lista DDT, spunta uno o più DDT dello stesso cliente e click "Crea fattura". Ordeva genera una fattura riepilogativa con tutte le righe.' },
      ],
    },
    {
      id: 'preventivi',
      titolo: 'Preventivi e ordini',
      icona: 'request_quote',
      colore: 'linear-gradient(135deg,#4f46e5,#4338ca)',
      intro: 'Offerte commerciali, accettazione, conversione',
      passi: [
        { titolo: 'Creare un preventivo', descrizione: '"Preventivi" → "Nuovo". Imposta validità in giorni, righe, sconti. Stampi o invii via email al cliente.' },
        { titolo: 'Convertire in ordine o fattura', descrizione: 'Dalla scheda del preventivo accettato, click "Converti in ordine" o "Converti in fattura". Le righe sono pre-compilate.' },
      ],
    },
    {
      id: 'acquisti',
      titolo: 'Acquisti e OCR fatture passive',
      icona: 'shopping_bag',
      colore: 'linear-gradient(135deg,#d97706,#b45309)',
      intro: 'Registrare fatture dai fornitori, OCR automatico',
      passi: [
        { titolo: 'Registrare un acquisto manuale', descrizione: '"Acquisti" → "Nuovo". Fornitore, numero documento, righe, totali. Utile se ricevi le fatture passive via email.' },
        { titolo: 'OCR fattura PDF', descrizione: 'Trascina una fattura PDF nell\'area "Importa OCR". Ordeva legge automaticamente fornitore, numero, data, righe e totali. Verifica e salva. Risparmia 10 minuti per fattura.' },
        { titolo: 'Conto contabile', descrizione: 'Per ogni acquisto puoi assegnare un "Conto" (es. Materie prime, Servizi, Energia). Questo facilita la prima nota e il commercialista.' },
      ],
    },
    {
      id: 'magazzino',
      titolo: 'Magazzino e movimenti',
      icona: 'warehouse',
      colore: 'linear-gradient(135deg,#65a30d,#4d7c0f)',
      intro: 'Carichi, scarichi, giacenze, soglie minime',
      passi: [
        { titolo: 'Carico manuale', descrizione: '"Magazzino" → "Nuovo movimento" → "Carico". Scegli prodotto e quantità. Aumenta la giacenza.' },
        { titolo: 'Carico automatico da DDT/Acquisto', descrizione: 'Ogni DDT in entrata o Arrivo Merce confermato carica automaticamente il magazzino. Non devi fare nulla manualmente.' },
        { titolo: 'Inventario fisico', descrizione: 'Per la rettifica annuale, vai in "Magazzino" → "Inventario" e imposta le quantità contate. Ordeva genera i movimenti di rettifica e l\'export per il commercialista.' },
      ],
    },
    {
      id: 'pagamenti',
      titolo: 'Pagamenti e scadenzario',
      icona: 'payments',
      colore: 'linear-gradient(135deg,#16a34a,#15803d)',
      intro: 'Incassi, pagamenti, scadenze attive e passive',
      passi: [
        { titolo: 'Registrare un incasso', descrizione: '"Pagamenti" → "Nuovo". Collega alla fattura o all\'acquisto, importo, data, metodo. La fattura passa automaticamente in stato "Pagata" se l\'importo copre il totale.' },
        { titolo: 'Scadenzario', descrizione: '"Scadenzario" mostra tutte le scadenze ordinate per data. Rosso = scaduto, arancio = in scadenza, verde = saldato. Filtri per cliente, periodo, importo.' },
        { titolo: 'Solleciti automatici via email', descrizione: 'Fatture in scadenza/scadute possono mandare un sollecito automatico al cliente. Configurazione in Impostazioni → Solleciti.' },
      ],
    },
    {
      id: 'riconciliazione',
      titolo: 'Riconciliazione bancaria',
      icona: 'account_balance',
      colore: 'linear-gradient(135deg,#155e75,#134e6c)',
      intro: 'Import estratto conto + match automatico scadenze',
      passi: [
        { titolo: 'Scarica l\'estratto conto', descrizione: 'Dal sito della tua banca scarica il movimento (formato CSV o OFX). Funziona con tutte le banche italiane.' },
        { titolo: 'Importa in Ordeva', descrizione: '"Riconciliazione" → "Importa CSV/OFX". Carica il file. Ordeva legge tutti i movimenti e cerca le corrispondenze con le tue scadenze attive/passive.' },
        { titolo: 'Confermare i match', descrizione: 'Vai al tab "Match & conferma". Vedi i suggerimenti (es. "Bonifico da Cliente X il 15/03 € 1.220 ↔ Fattura 2026/0042 € 1.220,00"). Click conferma e i pagamenti vengono registrati in blocco.' },
      ],
    },
    {
      id: 'agenda',
      titolo: 'Agenda, todo e calendario',
      icona: 'event_note',
      colore: 'linear-gradient(135deg,#4f46e5,#4338ca)',
      intro: 'Appuntamenti, task, sync con Google/Outlook',
      passi: [
        { titolo: 'Creare un appuntamento', descrizione: 'In "Agenda" click su un giorno o usa "+". Titolo, data/ora, cliente collegato, promemoria. Vista mese/settimana/giorno.' },
        { titolo: 'Todo list', descrizione: 'Nel tab "Todo" gestisci attività personali con priorità (Bassa/Media/Alta) e stato (Da fare/In corso/Fatta).' },
        { titolo: 'Sync con Google Calendar / Outlook', descrizione: '"Agenda" → "Sync calendar" → "Genera URL". Copia l\'URL https. Su Google Calendar: "Altri calendari" → "Da URL" e incolla. Ogni 2-6 ore Google si aggiorna automaticamente. Stesso pattern per Outlook e Apple Calendar.' },
        { titolo: 'Multi-utente', descrizione: 'Se hai più utenti nel team, ogni utente vede i propri appuntamenti. Gli appuntamenti "Condivisi" sono visibili anche ai colleghi dello stesso gruppo.' },
      ],
    },
    {
      id: 'crm',
      titolo: 'CRM e pipeline commerciale',
      icona: 'group_work',
      colore: 'linear-gradient(135deg,#9333ea,#7e22ce)',
      intro: 'Trattative commerciali in stile Kanban',
      passi: [
        { titolo: 'Configurare gli stage', descrizione: 'In "CRM" → "Gestione stage" definisci le fasi (es. "Lead", "Qualificato", "Offerta", "Negoziazione", "Vinto", "Perso"). Personalizza colori e ordine.' },
        { titolo: 'Creare un\'opportunità', descrizione: 'Drag&drop tra colonne. Per ogni opportunità: cliente, valore stimato, probabilità %, data prevista chiusura, note, attività di follow-up.' },
        { titolo: 'Convertire in preventivo', descrizione: 'Dall\'opportunità "Vinto", click "Crea preventivo" → trasforma direttamente in offerta da inviare al cliente.' },
      ],
    },
    {
      id: 'vendita-banco',
      titolo: 'Vendita al banco (cassa veloce)',
      icona: 'point_of_sale',
      colore: 'linear-gradient(135deg,#38bdf8,#0284c7)',
      intro: 'Per negozi e bar: cassa rapida con barcode',
      passi: [
        { titolo: 'Modalità vendita banco', descrizione: '"Vendita al banco" è una cassa ottimizzata per touchscreen. Scansiona codici a barre o cerca i prodotti, aggiungi al carrello, incassa.' },
        { titolo: 'Pagamenti misti', descrizione: 'Puoi spezzare un importo: es. parte contanti + parte carta. Resto calcolato automaticamente.' },
        { titolo: 'Emissione documento', descrizione: 'A fine vendita scegli: scontrino, fattura immediata (con dati cliente), fattura differita. Il magazzino viene scaricato all\'istante.' },
      ],
    },
    {
      id: 'utenti',
      titolo: 'Gestire utenti e ruoli',
      icona: 'people_outline',
      colore: 'linear-gradient(135deg,#0d9488,#0f766e)',
      intro: 'Invitare il team con permessi differenziati',
      passi: [
        { titolo: 'Creare un utente nuovo', descrizione: 'Solo Owner e Admin possono. "Utenti" → "Nuovo". Username (email), password temporanea, ruolo, nome.' },
        { titolo: 'Ruoli disponibili', descrizione: 'OWNER (full access), ADMIN (full access escluse modifiche fatturazione/piano), COMMERCIALE (clienti, vendite, CRM), CONTABILE (fatture, pagamenti, contabilità), MAGAZZINIERE (prodotti, magazzino, DDT), OPERATORE (solo lettura più aree base).' },
        { titolo: 'Gruppi per agenda condivisa', descrizione: 'In Impostazioni → Gruppi crea team (es. "Commerciali", "Amministrazione"). Gli appuntamenti condivisi sono visibili solo ai membri dello stesso gruppo.' },
      ],
    },
    {
      id: 'sicurezza',
      titolo: 'Sicurezza dei dati',
      icona: 'shield',
      colore: 'linear-gradient(135deg,#0e2a38,#1e293b)',
      intro: 'Cosa fa Ordeva per proteggere i tuoi dati',
      passi: [
        { titolo: 'Database isolato per azienda', descrizione: 'I dati della tua azienda sono fisicamente separati da quelli di tutti gli altri clienti Ordeva. Nessuna possibilità di leak tra aziende.' },
        { titolo: 'Backup giornalieri automatici', descrizione: 'Ogni notte alle 2:00 viene fatta una copia completa dei tuoi dati. Niente da configurare.' },
        { titolo: 'Connessioni cifrate HTTPS', descrizione: 'Tutti i dati in transito tra il tuo browser e il server sono cifrati TLS. I server sono in Germania (Francoforte), GDPR-compliant.' },
        { titolo: 'Esportazione dati', descrizione: 'In qualsiasi momento, dalla sezione "Impostazioni → Esporta dati" scarichi l\'intero archivio (clienti, fatture, prodotti, contabilità) in formato CSV/JSON. I tuoi dati restano sempre tuoi.' },
      ],
    },
  ];

  readonly faqs: Faq[] = [
    { domanda: 'Posso usare Ordeva da telefono?', risposta: 'Sì. Apri ordeva.it dal browser del telefono. Per averla come app, click sul menu condivisione di Safari (iPhone) o Chrome (Android) e scegli "Aggiungi alla schermata Home". Diventa una PWA identica a un\'app nativa.' },
    { domanda: 'Cosa succede se mi disconnetto da Internet?', risposta: 'La sola lettura funziona offline (puoi consultare dati già caricati). Per scrivere/salvare serve connessione. Quando torni online le modifiche vengono sincronizzate.' },
    { domanda: 'Posso esportare i miei dati e cambiare gestionale?', risposta: 'Sì. "Impostazioni → Esporta dati" scarica tutto in CSV/JSON. Nessun vincolo, nessun "lock-in". Anche se cancelli l\'account, puoi scaricare prima un export completo.' },
    { domanda: 'Cosa succede se cancello una fattura per errore?', risposta: 'Tutte le operazioni di cancellazione sono tracciate in "Storico" (sezione Sistema). Da lì può essere ripristinata. Solo gli Admin possono accedere allo storico.' },
    { domanda: 'Come faccio a connettere il mio commercialista?', risposta: 'Crea un utente con ruolo CONTABILE: vedrà solo fatturazione, contabilità e compliance. Oppure usa "Compliance → Esporta per commercialista" che genera tutto il pacchetto fiscale del trimestre in un click.' },
    { domanda: 'Le fatture XML sono valide per l\'Agenzia delle Entrate?', risposta: 'Sì, sono generate secondo le specifiche tecniche ufficiali (Fatturazione Elettronica B2B/B2C v1.7+). L\'invio al SDI passa attraverso il tuo provider intermediario configurato in Impostazioni.' },
    { domanda: 'Posso disdire l\'abbonamento in qualsiasi momento?', risposta: 'Sì, senza penali. Da "Impostazioni → Account" un click. Il servizio resta attivo fino alla fine del periodo già pagato, poi viene sospeso. Hai 30 giorni per riattivare o esportare prima della cancellazione definitiva.' },
    { domanda: 'Come funziona la prova gratuita di 14 giorni?', risposta: 'Tutte le funzioni sono attive durante la prova. Niente carta richiesta. Al 14° giorno o sottoscrivi un piano oppure l\'accesso viene sospeso (e i dati conservati 30 giorni per eventuale riattivazione).' },
    { domanda: 'Quanto tempo ci vuole per imparare ad usarlo?', risposta: 'Per emettere la prima fattura: 10-15 minuti se hai già dati cliente. Per padroneggiare tutti i moduli (magazzino, CRM, agenda, ecc.): circa una settimana di uso quotidiano. Questa guida ti accompagna step-by-step.' },
  ];

  filter() {
    const q = this.query.trim().toLowerCase();
    if (!q) { this.filtered = []; return; }
    this.filtered = this.sezioni.filter(s => {
      if (s.titolo.toLowerCase().includes(q)) return true;
      if (s.intro.toLowerCase().includes(q)) return true;
      return s.passi.some(p =>
        p.titolo.toLowerCase().includes(q) || p.descrizione.toLowerCase().includes(q));
    });
  }
}

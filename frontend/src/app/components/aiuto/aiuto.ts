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
interface Screenshot { file: string; titolo: string; descrizione: string; }

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

      <!-- Galleria screenshot reali (visibile senza ricerca) -->
      @if (!query) {
        <section class="gallery">
          <h2>Le schermate principali, a colpo d'occhio</h2>
          <p class="gallery-sub">Anteprime reali dell'app con dati interamente inventati ("Mario Rossi SRL", "ACME SpA", ecc.) creati appositamente in un tenant demo dedicato. I tuoi dati reali compaiono solo dopo il login.</p>
          <div class="gallery-grid">
            @for (s of screenshots; track s.file) {
              <figure class="mockup">
                <a [href]="'help-shots/' + s.file" target="_blank" rel="noopener" [title]="'Apri ' + s.titolo + ' a grandezza naturale'">
                  <img [src]="'help-shots/' + s.file" [alt]="s.titolo" loading="lazy" />
                </a>
                <figcaption><b>{{ s.titolo }}</b> — {{ s.descrizione }}</figcaption>
              </figure>
            }
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

    /* ── Gallery: screenshot reali (cliccabili a tutta pagina) ───────── */
    .gallery { margin-bottom: 44px; }
    .gallery-sub {
      font-size: 13px; color: var(--text-tertiary);
      margin: -10px 0 18px;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 22px;
    }
    .mockup { margin: 0; }
    .mockup a {
      display: block;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      box-shadow: 0 4px 14px -4px rgba(15,23,42,0.10);
      transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
    }
    .mockup a:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 28px -8px rgba(15,23,42,0.18);
      border-color: var(--primary);
    }
    .mockup img {
      display: block;
      width: 100%;
      height: auto;
      object-fit: contain;
    }
    .mockup figcaption {
      font-size: 12px; color: var(--text-secondary);
      text-align: center; margin-top: 10px;
      line-height: 1.5;
    }
    .mockup figcaption b {
      color: var(--text-primary);
      font-weight: 700;
    }

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

  readonly screenshots: Screenshot[] = [
    { file: 'home.png',        titolo: 'Home',        descrizione: 'tile per categoria con accesso rapido a tutte le aree' },
    { file: 'dashboard.png',   titolo: 'Dashboard',   descrizione: 'KPI fatturato, incassi, magazzino, cashflow' },
    { file: 'prodotti.png',    titolo: 'Prodotti',    descrizione: 'catalogo con prezzo, giacenza, soglia minima, filtri stato' },
    { file: 'fatture.png',     titolo: 'Fatture',     descrizione: 'elenco fatture emesse con stato e importi' },
    { file: 'agenda.png',      titolo: 'Agenda',      descrizione: 'calendario mensile, lista appuntamenti, sync ICS' },
    { file: 'scadenzario.png', titolo: 'Scadenzario', descrizione: 'scadenze attive e passive con stato semaforico' },
  ];

  readonly sezioni: Sezione[] = [
    {
      id: 'azienda',
      titolo: 'Configurare i dati dell\'azienda',
      icona: 'business',
      colore: 'linear-gradient(135deg,#0284c7,#0369a1)',
      intro: 'Prima cosa da fare al primo accesso',
      passi: [
        { titolo: 'Inserisci ragione sociale e P.IVA', descrizione: 'Vai in Impostazioni → Dati azienda. Compila ragione sociale, P.IVA (11 cifre), codice fiscale (se diverso), indirizzo completo, telefono e PEC. Tutti i documenti emessi (fatture, documenti di trasporto, ecc.) useranno questi dati.' },
        { titolo: 'Carica il logo', descrizione: 'Nella stessa sezione carica il logo dell\'azienda (PNG o JPG, max 2MB). Comparirà su fatture, preventivi, documenti di trasporto, email automatiche.' },
        { titolo: 'Imposta numerazione documenti', descrizione: 'Decide se la numerazione fatture/documenti di trasporto/ecc. è annuale (es. 2026/0001) o continua (1, 2, 3…). Puoi anche aggiungere prefissi personalizzati come "FATT-" o "DDT-".' },
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
      titolo: 'Documenti di trasporto (DDT)',
      icona: 'receipt_long',
      colore: 'linear-gradient(135deg,#38bdf8,#0ea5e9)',
      intro: 'Bolle di accompagnamento merce + conversione in fattura',
      passi: [
        { titolo: 'Emettere un documento di trasporto', descrizione: '"Documenti di trasporto" → "Nuovo". Cliente, righe, vettore, peso, colli. Stampa direttamente o esporta PDF.' },
        { titolo: 'Convertire un documento di trasporto in fattura', descrizione: 'Dalla lista documenti di trasporto, spunta uno o più documenti dello stesso cliente e click "Crea fattura". Ordeva genera una fattura riepilogativa con tutte le righe.' },
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
        { titolo: 'Carico automatico da documento di trasporto/Acquisto', descrizione: 'Ogni documento di trasporto in entrata o Arrivo Merce confermato carica automaticamente il magazzino. Non devi fare nulla manualmente.' },
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
        { titolo: 'Ruoli disponibili', descrizione: 'OWNER (full access), ADMIN (full access escluse modifiche fatturazione/piano), COMMERCIALE (clienti, vendite), CONTABILE (fatture, pagamenti, contabilità), MAGAZZINIERE (prodotti, magazzino, documenti di trasporto), OPERATORE (solo lettura più aree base).' },
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
    { domanda: 'Quanto tempo ci vuole per imparare ad usarlo?', risposta: 'Per emettere la prima fattura: 10-15 minuti se hai già dati cliente. Per padroneggiare tutti i moduli (magazzino, agenda, ecc.): circa una settimana di uso quotidiano. Questa guida ti accompagna step-by-step.' },
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

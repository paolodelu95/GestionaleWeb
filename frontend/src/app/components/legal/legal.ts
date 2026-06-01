import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/**
 * Pagine legali pubbliche: /termini, /privacy, /cookie
 *
 * Sicurezza: componente puramente statico, zero chiamate a /api/*.
 * Anche se accessibile senza login, NON espone dati né bypassa
 * l'autenticazione del backend.
 *
 * IMPORTANTE: i testi sono BOZZE di base conformi a GDPR + norme
 * italiane (D.Lgs 70/2003, D.Lgs 21/2014) ma VANNO REVISIONATI da
 * un legale prima della pubblicazione operativa. I segnaposto
 * [DA COMPILARE: ...] vanno integrati con i dati reali del fornitore.
 */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="legal-page">
      <header class="legal-header">
        <div class="legal-header-inner">
          <a routerLink="/" class="brand">
            <img src="icons/ordeva-icon.png" alt="Ordeva" width="32" height="32">
            <span>Ordeva</span>
          </a>
          <nav class="legal-nav">
            <a routerLink="/faq">FAQ</a>
            <a routerLink="/termini" [class.active]="mode === 'terms'">Termini</a>
            <a routerLink="/privacy" [class.active]="mode === 'privacy'">Privacy</a>
            <a routerLink="/cookie" [class.active]="mode === 'cookies'">Cookie</a>
            <a routerLink="/" class="login-btn">Accedi</a>
          </nav>
        </div>
      </header>

      <main class="legal-main">
        <div class="legal-container">
          <div class="legal-meta">
            Ultimo aggiornamento: {{ updatedAt }}
          </div>

          <!-- ── TERMINI DI SERVIZIO ──────────────────────────────────── -->
          @if (mode === 'terms') {
            <h1>Termini e Condizioni di Servizio</h1>

            <div class="legal-callout">
              <mat-icon>info</mat-icon>
              <p>I presenti Termini regolano l'utilizzo della piattaforma SaaS <b>Ordeva</b>. La registrazione al Servizio comporta l'accettazione integrale delle presenti condizioni. Si invita l'Utente a leggere attentamente prima di registrarsi.</p>
            </div>

            <section>
              <h2>1. Definizioni</h2>
              <p>Ai fini dei presenti Termini:</p>
              <ul>
                <li><b>"Servizio"</b>: la piattaforma software-as-a-service "Ordeva", accessibile via <code>https://ordeva.it</code>, comprensiva di tutti i moduli e funzionalità.</li>
                <li><b>"Fornitore"</b>: <code>[DA COMPILARE: Ragione Sociale]</code>, con sede legale in <code>[DA COMPILARE: indirizzo completo]</code>, P.IVA <code>[DA COMPILARE]</code>, C.F. <code>[DA COMPILARE]</code>, PEC <code>[DA COMPILARE]</code>, email <code>contatti&#64;ordeva.it</code>.</li>
                <li><b>"Cliente"</b> o <b>"Utente"</b>: la persona fisica o giuridica che si registra e utilizza il Servizio.</li>
                <li><b>"Account"</b>: l'insieme di credenziali (email + password) che permettono l'accesso al Servizio.</li>
                <li><b>"Dati del Cliente"</b>: tutti i dati caricati dal Cliente nel Servizio (anagrafica clienti finali, fornitori, prodotti, fatture, documenti, ecc.).</li>
              </ul>
            </section>

            <section>
              <h2>2. Oggetto e descrizione del Servizio</h2>
              <p>Il Fornitore mette a disposizione del Cliente una piattaforma cloud per la gestione aziendale comprendente, a titolo non esaustivo: anagrafiche, fatturazione elettronica conforme SDI, magazzino, contabilità, agenda, vendita al banco, riconciliazione bancaria, OCR fatture passive.</p>
              <p>Il Servizio è offerto in modalità "as a service": il Cliente non installa né mantiene software in proprio, ma accede via browser o app mobile (PWA).</p>
            </section>

            <section>
              <h2>3. Registrazione e Account</h2>
              <p>Per utilizzare il Servizio il Cliente deve registrarsi fornendo dati veritieri, completi e aggiornati (ragione sociale, P.IVA, email, password). Il Cliente è responsabile della riservatezza delle proprie credenziali e di ogni attività svolta tramite il proprio Account.</p>
              <p>Il Cliente si impegna a notificare tempestivamente al Fornitore ogni uso non autorizzato dell'Account.</p>
            </section>

            <section>
              <h2>4. Periodo di prova gratuita</h2>
              <p>Il Servizio è fruibile gratuitamente per <b>14 (quattordici) giorni</b> dalla registrazione, senza necessità di inserire dati di pagamento. Al termine del periodo di prova:</p>
              <ul>
                <li>se il Cliente sottoscrive un piano a pagamento, il Servizio prosegue ininterrottamente;</li>
                <li>se il Cliente non sottoscrive, l'accesso al Servizio viene sospeso ma i Dati restano conservati per <b>30 giorni</b>, durante i quali è possibile esportarli o riattivare l'Account sottoscrivendo un piano.</li>
              </ul>
            </section>

            <section>
              <h2>5. Piani, prezzi e fatturazione</h2>
              <p>I piani disponibili e i relativi prezzi sono pubblicati alla pagina <code>https://ordeva.it/faq#prezzi</code>. Il Fornitore si riserva di modificare i prezzi previo preavviso di almeno 30 giorni; in tal caso il Cliente ha diritto di disdire senza penali.</p>
              <p>Il pagamento avviene anticipatamente, su base mensile o annuale, tramite carta di credito o SEPA Direct Debit, gestiti dal provider <b>Stripe Payments Europe Ltd.</b> Il Fornitore emette regolare fattura elettronica conforme alle disposizioni dell'Agenzia delle Entrate.</p>
              <p>In caso di mancato pagamento, il Fornitore ha facoltà di sospendere il Servizio decorsi 7 giorni dal sollecito e di disattivare definitivamente l'Account decorsi ulteriori 30 giorni.</p>
            </section>

            <section>
              <h2>6. Diritto di recesso (solo consumatori)</h2>
              <p>Ai sensi degli artt. 52-58 del D.Lgs. 21/2014 (Codice del Consumo), il Cliente persona fisica che agisce per scopi estranei all'attività imprenditoriale, commerciale o professionale ha diritto di recedere senza fornire motivazione entro 14 giorni dalla sottoscrizione, comunicandolo all'indirizzo <code>contatti&#64;ordeva.it</code>.</p>
              <p>Tale diritto <b>NON si applica</b> ai Clienti che agiscono in qualità di professionista o impresa (P.IVA), che sono soggetti unicamente alle condizioni di disdetta di cui al successivo art. 11.</p>
            </section>

            <section>
              <h2>7. Obblighi del Cliente</h2>
              <p>Il Cliente si impegna a:</p>
              <ul>
                <li>utilizzare il Servizio in conformità alla legge e ai presenti Termini;</li>
                <li>non utilizzare il Servizio per fini illeciti, fraudolenti o ingannevoli;</li>
                <li>non caricare contenuti che violino diritti di terzi (proprietà intellettuale, privacy, ecc.);</li>
                <li>non tentare di accedere a dati di altri Clienti né di compromettere la sicurezza del Servizio;</li>
                <li>mantenere aggiornati i dati di contatto e fatturazione;</li>
                <li>conservare con cura le proprie credenziali.</li>
              </ul>
            </section>

            <section>
              <h2>8. Proprietà intellettuale e Dati del Cliente</h2>
              <p>Il software, il codice sorgente, il design, i marchi e i loghi del Servizio restano di proprietà esclusiva del Fornitore. Il Cliente acquisisce solamente una licenza d'uso non esclusiva, non trasferibile e revocabile per la durata del contratto.</p>
              <p>I <b>Dati del Cliente</b> caricati sul Servizio restano di esclusiva proprietà del Cliente, che ne è il titolare ai sensi del GDPR. Il Fornitore opera come "responsabile del trattamento" ai sensi dell'art. 28 GDPR e tratta tali dati esclusivamente nei limiti necessari all'erogazione del Servizio.</p>
              <p>In qualsiasi momento il Cliente può esportare integralmente i propri Dati in formato standard tramite l'apposita funzione dell'applicazione o richiedendolo a <code>contatti&#64;ordeva.it</code>.</p>
            </section>

            <section>
              <h2>9. Disponibilità del Servizio e limiti di responsabilità</h2>
              <p>Il Fornitore si impegna a garantire una disponibilità del Servizio pari ad almeno il <b>99% su base mensile</b>, calcolata escludendo le finestre di manutenzione programmata, comunicate con preavviso di almeno 24 ore.</p>
              <p>Il Fornitore non risponde di:</p>
              <ul>
                <li>danni indiretti, mancato profitto, perdita di opportunità commerciali;</li>
                <li>interruzioni dovute a forza maggiore, attacchi informatici di terzi, malfunzionamenti dell'infrastruttura cloud del provider sottostante (Fly.io);</li>
                <li>errori, omissioni o uso improprio dei dati imputabili al Cliente;</li>
                <li>conformità del Servizio a normative diverse da quelle italiane ed europee senza specifica pattuizione.</li>
              </ul>
              <p>In ogni caso, la responsabilità complessiva del Fornitore è limitata all'importo pagato dal Cliente nei 12 mesi precedenti l'evento dannoso.</p>
            </section>

            <section>
              <h2>10. Sicurezza dei dati e backup</h2>
              <p>Il Fornitore adotta misure tecniche e organizzative adeguate ai sensi dell'art. 32 GDPR:</p>
              <ul>
                <li>connessioni HTTPS con TLS 1.2+;</li>
                <li>password cifrate con bcrypt (10 rounds);</li>
                <li>isolamento fisico dei database per Cliente;</li>
                <li>backup automatici giornalieri;</li>
                <li>server localizzati in Unione Europea (Francoforte, Germania).</li>
              </ul>
              <p>In caso di violazione dei dati che comporti rischio per i diritti degli interessati, il Fornitore notificherà l'evento al Garante entro 72 ore e ai Clienti coinvolti senza ingiustificato ritardo.</p>
            </section>

            <section>
              <h2>11. Durata, sospensione e disdetta</h2>
              <p>Il contratto ha durata pari al periodo di pagamento scelto (mensile o annuale) e si rinnova automaticamente alla scadenza salvo disdetta. Il Cliente può disdire in qualsiasi momento dall'area riservata; la disdetta diventa effettiva al termine del periodo già pagato.</p>
              <p>Il Fornitore può sospendere immediatamente il Servizio in caso di:</p>
              <ul>
                <li>violazione dei presenti Termini;</li>
                <li>mancato pagamento;</li>
                <li>uso del Servizio in modo da compromettere la sicurezza di altri Clienti o del Fornitore;</li>
                <li>obbligo di legge.</li>
              </ul>
              <p>Alla cessazione del contratto, i Dati del Cliente vengono conservati per 30 giorni (per consentire eventuale riattivazione/export) e poi cancellati definitivamente, salvi obblighi di legge di conservazione (es. fatture: 10 anni ai sensi dell'art. 2220 c.c.).</p>
            </section>

            <section>
              <h2>12. Modifiche ai Termini</h2>
              <p>Il Fornitore si riserva di modificare i presenti Termini, comunicando le modifiche via email e tramite avviso in piattaforma con preavviso di almeno 30 giorni. La prosecuzione dell'uso del Servizio oltre tale termine costituisce accettazione delle nuove condizioni; in caso di disaccordo, il Cliente può disdire senza penali.</p>
            </section>

            <section>
              <h2>13. Legge applicabile e foro competente</h2>
              <p>I presenti Termini sono regolati dalla legge italiana. Per ogni controversia è competente in via esclusiva il <b>Foro di <code>[DA COMPILARE: città sede legale]</code></b>, salvo il foro inderogabile del consumatore qualora applicabile.</p>
              <p>Ai sensi degli artt. 1341 e 1342 c.c. il Cliente dichiara di approvare espressamente le clausole di cui agli articoli: 4 (Trial), 5 (Pagamenti e modifiche prezzo), 9 (Limiti di responsabilità), 11 (Sospensione), 12 (Modifiche), 13 (Foro competente).</p>
            </section>

            <section>
              <h2>14. Contatti</h2>
              <p>Per qualsiasi comunicazione relativa ai presenti Termini:</p>
              <ul>
                <li>Email: <code>contatti&#64;ordeva.it</code></li>
                <li>PEC: <code>[DA COMPILARE]</code></li>
                <li>Sede: <code>[DA COMPILARE: indirizzo]</code></li>
              </ul>
            </section>
          }

          <!-- ── PRIVACY POLICY ────────────────────────────────────────── -->
          @if (mode === 'privacy') {
            <h1>Informativa sulla Privacy</h1>

            <div class="legal-callout">
              <mat-icon>shield</mat-icon>
              <p>La presente informativa è resa ai sensi degli articoli 13 e 14 del Regolamento UE 2016/679 ("GDPR") e descrive come Ordeva tratta i dati personali degli utenti.</p>
            </div>

            <section>
              <h2>1. Titolare del trattamento</h2>
              <p>Il Titolare del trattamento dei dati personali è:</p>
              <ul>
                <li><b><code>[DA COMPILARE: Ragione Sociale]</code></b></li>
                <li>Sede legale: <code>[DA COMPILARE: indirizzo completo]</code></li>
                <li>P.IVA / C.F.: <code>[DA COMPILARE]</code></li>
                <li>Email: <code>contatti&#64;ordeva.it</code></li>
                <li>PEC: <code>[DA COMPILARE]</code></li>
              </ul>
              <p>Per esercitare i diritti previsti dal GDPR è possibile scrivere a <code>privacy&#64;ordeva.it</code>.</p>
            </section>

            <section>
              <h2>2. Categorie di dati trattati</h2>
              <p>Il Titolare tratta le seguenti categorie di dati personali:</p>
              <h3>2.1 Dati di registrazione e account</h3>
              <ul>
                <li>Ragione sociale, partita IVA, email, password (in forma cifrata bcrypt)</li>
                <li>Nome e cognome del referente, ruolo, eventuali altri utenti del team</li>
              </ul>
              <h3>2.2 Dati di utilizzo</h3>
              <ul>
                <li>Indirizzo IP, user agent, log di accesso e di sicurezza</li>
                <li>Eventi di sistema (login, logout, errori), per finalità di sicurezza</li>
              </ul>
              <h3>2.3 Dati di fatturazione</h3>
              <ul>
                <li>Dati anagrafici di fatturazione, modalità di pagamento (gestita da Stripe; il Titolare non conserva i dati di carta)</li>
              </ul>
              <h3>2.4 Dati caricati dal Cliente ("Dati del Cliente")</h3>
              <p>I Clienti possono caricare nella piattaforma anagrafiche dei propri clienti/fornitori, fatture, documenti contabili e simili. Tali dati sono di titolarità del Cliente, che agisce come Titolare del trattamento autonomo verso i propri interessati. Ordeva agisce come <b>Responsabile del trattamento</b> ai sensi dell'art. 28 GDPR (vedi sez. 8).</p>
            </section>

            <section>
              <h2>3. Finalità e basi giuridiche</h2>
              <table class="data-table">
                <thead>
                  <tr><th>Finalità</th><th>Base giuridica</th></tr>
                </thead>
                <tbody>
                  <tr><td>Erogazione del servizio, gestione dell'account</td><td>Esecuzione del contratto (art. 6.1.b)</td></tr>
                  <tr><td>Fatturazione e adempimenti contabili/fiscali</td><td>Obbligo legale (art. 6.1.c)</td></tr>
                  <tr><td>Sicurezza del servizio, prevenzione frodi</td><td>Legittimo interesse (art. 6.1.f)</td></tr>
                  <tr><td>Comunicazioni di servizio (manutenzioni, aggiornamenti policy)</td><td>Esecuzione del contratto</td></tr>
                  <tr><td>Marketing diretto su prodotti analoghi (newsletter)</td><td>Legittimo interesse / Consenso (revocabile in qualsiasi momento)</td></tr>
                  <tr><td>Statistiche aggregate anonime di utilizzo</td><td>Legittimo interesse</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h2>4. Periodo di conservazione</h2>
              <ul>
                <li><b>Dati di account</b>: per tutta la durata del contratto + 30 giorni post-cessazione (per consentire reattivazione o export).</li>
                <li><b>Dati di fatturazione</b>: 10 anni dalla data di emissione, ai sensi dell'art. 2220 c.c. e art. 39 D.P.R. 633/1972.</li>
                <li><b>Log di sicurezza</b>: massimo 12 mesi.</li>
                <li><b>Dati per finalità di marketing</b>: fino a revoca del consenso, e comunque non oltre 24 mesi dall'ultimo contatto attivo.</li>
                <li><b>Dati del Cliente</b>: gestiti secondo le istruzioni del Cliente (Titolare), e comunque cancellati entro 30 giorni dalla cessazione del contratto salvo richiesta diversa.</li>
              </ul>
            </section>

            <section>
              <h2>5. Destinatari dei dati</h2>
              <p>I dati possono essere comunicati ai seguenti soggetti, in qualità di responsabili del trattamento o autonomi titolari:</p>
              <ul>
                <li><b>Fly.io (USA)</b> — provider infrastruttura cloud (server in Francoforte, DE). Coperto da Standard Contractual Clauses UE.</li>
                <li><b>Stripe Payments Europe Ltd. (Irlanda)</b> — gestore pagamenti.</li>
                <li><b>[DA COMPILARE: provider SMTP es. Resend / Postmark / Mailgun]</b> — invio email transazionali.</li>
                <li><b>[Eventuali altri sub-processor, da elencare]</b></li>
                <li>Commercialista, consulenti legali e fiscali del Titolare, per adempimenti di legge.</li>
                <li>Autorità pubbliche, su richiesta motivata e nei casi previsti dalla legge.</li>
              </ul>
              <p>Una lista aggiornata dei sub-processor è disponibile su richiesta a <code>privacy&#64;ordeva.it</code>.</p>
            </section>

            <section>
              <h2>6. Trasferimenti extra-UE</h2>
              <p>I dati sono ospitati su server fisicamente localizzati in Unione Europea (Francoforte, Germania). Eventuali trasferimenti verso paesi terzi (USA) avvengono unicamente verso soggetti che adottano garanzie adeguate ai sensi del Capo V del GDPR (Standard Contractual Clauses approvate dalla Commissione UE).</p>
            </section>

            <section>
              <h2>7. Diritti dell'interessato</h2>
              <p>Ai sensi degli artt. 15-22 GDPR, ogni interessato ha diritto a:</p>
              <ul>
                <li><b>Accesso</b>: ottenere conferma del trattamento e copia dei dati.</li>
                <li><b>Rettifica</b>: chiedere la correzione di dati inesatti o incompleti.</li>
                <li><b>Cancellazione</b> ("diritto all'oblio"): chiedere la cancellazione, nei limiti delle finalità di legge.</li>
                <li><b>Limitazione</b>: chiedere la limitazione del trattamento in determinate ipotesi.</li>
                <li><b>Portabilità</b>: ricevere i dati in formato strutturato e leggibile (Ordeva offre una funzione di export integrata).</li>
                <li><b>Opposizione</b>: opporsi al trattamento per finalità di legittimo interesse o marketing.</li>
                <li><b>Reclamo</b>: presentare reclamo al Garante per la Protezione dei Dati Personali (<code>garanteprivacy.it</code>).</li>
              </ul>
              <p>Per esercitare tali diritti scrivere a <code>privacy&#64;ordeva.it</code>; risposta entro 30 giorni.</p>
            </section>

            <section>
              <h2>8. Ordeva come Responsabile del trattamento (art. 28 GDPR)</h2>
              <p>Relativamente ai Dati del Cliente caricati nella piattaforma (anagrafiche, fatture, ecc.), Ordeva agisce come Responsabile del trattamento per conto del Cliente, che resta Titolare. I termini di tale rapporto sono regolati nel Data Processing Agreement (DPA) parte integrante dei Termini di Servizio, contenente: oggetto, durata, natura e finalità del trattamento, tipologia di dati, obblighi del Responsabile, misure di sicurezza, sub-responsabili, assistenza agli interessati, audit, ritorno o cancellazione dei dati al termine del contratto.</p>
              <p>Il DPA è disponibile su richiesta a <code>privacy&#64;ordeva.it</code> o scaricabile dall'area riservata.</p>
            </section>

            <section>
              <h2>9. Sicurezza</h2>
              <p>Il Titolare adotta misure tecniche e organizzative appropriate ai sensi dell'art. 32 GDPR, tra cui: cifratura in transito (HTTPS/TLS), hashing password con bcrypt, isolamento fisico dei database per Cliente, backup automatici, controlli di accesso basati su ruoli, log di sicurezza, formazione periodica del personale.</p>
            </section>

            <section>
              <h2>10. Modifiche all'informativa</h2>
              <p>La presente informativa può essere aggiornata. Le modifiche significative saranno comunicate via email e tramite avviso in piattaforma con almeno 15 giorni di anticipo.</p>
            </section>
          }

          <!-- ── COOKIE POLICY ─────────────────────────────────────────── -->
          @if (mode === 'cookies') {
            <h1>Cookie Policy</h1>

            <div class="legal-callout">
              <mat-icon>cookie</mat-icon>
              <p>Ordeva utilizza esclusivamente cookie e tecnologie simili strettamente necessari al funzionamento del servizio. Nessun cookie di profilazione o di marketing viene installato senza consenso esplicito.</p>
            </div>

            <section>
              <h2>1. Cosa sono i cookie</h2>
              <p>I cookie sono piccoli file di testo che i siti web visitati salvano sul dispositivo dell'utente. Vengono utilizzati per fare funzionare il sito, per renderlo più efficiente, o per fornire informazioni al proprietario del sito.</p>
              <p>Tecnologie analoghe (es. <code>localStorage</code>, <code>sessionStorage</code>) hanno funzionamento simile e sono trattate dalla presente policy negli stessi termini.</p>
            </section>

            <section>
              <h2>2. Tipologie di cookie utilizzati da Ordeva</h2>

              <h3>2.1 Cookie tecnici / strettamente necessari</h3>
              <p>Sono indispensabili per il funzionamento del Servizio. Non richiedono consenso preventivo ai sensi del provvedimento del Garante del 10 giugno 2021.</p>
              <table class="data-table">
                <thead>
                  <tr><th>Nome</th><th>Tipo</th><th>Finalità</th><th>Durata</th></tr>
                </thead>
                <tbody>
                  <tr><td><code>ordeva_token</code></td><td>localStorage</td><td>Token di autenticazione sessione</td><td>12 ore o fino al logout</td></tr>
                  <tr><td><code>ordeva_user</code></td><td>localStorage</td><td>Profilo utente loggato (id, ruolo, tenant)</td><td>Fino al logout</td></tr>
                  <tr><td><code>dark-mode</code></td><td>localStorage</td><td>Preferenza tema chiaro/scuro</td><td>Persistente</td></tr>
                  <tr><td><code>pwa-install-dismissed</code></td><td>localStorage</td><td>Memorizza se l'utente ha chiuso il banner di installazione PWA</td><td>Persistente</td></tr>
                </tbody>
              </table>

              <h3>2.2 Cookie analitici</h3>
              <p>Allo stato attuale Ordeva <b>non utilizza alcun cookie analitico</b> (Google Analytics, Plausible, ecc.). Qualora venissero introdotti in futuro, verranno aggiornati questa policy e il banner di consenso.</p>

              <h3>2.3 Cookie di profilazione / marketing</h3>
              <p>Ordeva <b>non utilizza alcun cookie di profilazione o marketing</b>.</p>

              <h3>2.4 Cookie di terze parti</h3>
              <p>Il Servizio non incorpora widget social, video YouTube embedded o altre risorse che impostino cookie di terze parti, ad eccezione di Stripe nella fase di pagamento (cookie tecnici per la sicurezza della transazione, vedi <a href="https://stripe.com/it/privacy" target="_blank" rel="noopener">policy Stripe</a>).</p>
            </section>

            <section>
              <h2>3. Come gestire i cookie</h2>
              <p>L'utente può configurare il proprio browser per accettare, rifiutare o cancellare i cookie:</p>
              <ul>
                <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener">Google Chrome</a></li>
                <li><a href="https://support.mozilla.org/it/kb/Gestione%20dei%20cookie" target="_blank" rel="noopener">Mozilla Firefox</a></li>
                <li><a href="https://support.apple.com/it-it/guide/safari/sfri11471/mac" target="_blank" rel="noopener">Safari</a></li>
                <li><a href="https://support.microsoft.com/it-it/microsoft-edge/eliminare-i-cookie-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener">Microsoft Edge</a></li>
              </ul>
              <p>Si segnala che disabilitando i cookie tecnici / il <code>localStorage</code> potrebbe non essere possibile autenticarsi al Servizio.</p>
            </section>

            <section>
              <h2>4. Aggiornamenti</h2>
              <p>La presente Cookie Policy può essere aggiornata in caso di modifiche al Servizio. La data dell'ultimo aggiornamento è indicata in alto.</p>
            </section>

            <section>
              <h2>5. Contatti</h2>
              <p>Per domande sui cookie: <code>privacy&#64;ordeva.it</code></p>
            </section>
          }

          <!-- Disclaimer revisione legale -->
          <div class="legal-disclaimer">
            <mat-icon>verified_user</mat-icon>
            <div>
              <b>Nota</b>
              <p>Questo documento è una bozza tipo conforme a GDPR (Reg. UE 679/2016) e al D.Lgs 70/2003 sul commercio elettronico. Prima della pubblicazione operativa è opportuno farla revisionare da un consulente legale o commercialista per adattarla al caso specifico.</p>
            </div>
          </div>
        </div>
      </main>

      <footer class="legal-footer">
        <div class="legal-footer-inner">
          <div class="footer-brand">
            <img src="icons/ordeva-icon.png" alt="Ordeva" width="24" height="24">
            <span>Ordeva</span>
          </div>
          <nav>
            <a routerLink="/faq">FAQ</a>
            <a routerLink="/termini">Termini</a>
            <a routerLink="/privacy">Privacy</a>
            <a routerLink="/cookie">Cookie</a>
            <a routerLink="/">Accedi</a>
          </nav>
          <p>© {{ year }} Ordeva · <code>[DA COMPILARE: P.IVA]</code></p>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    .legal-page {
      background: #f6f7fb;
      min-height: 100vh;
      color: #0f172a;
      font-family: 'Inter', 'Roboto', system-ui, -apple-system, sans-serif;
      line-height: 1.65;
    }

    .legal-header {
      position: sticky; top: 0; z-index: 50;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid #e6e8ee;
    }
    .legal-header-inner {
      max-width: 920px; margin: 0 auto;
      padding: 14px 24px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex; align-items: center; gap: 10px;
      text-decoration: none; color: #0e2a38;
      font-weight: 800; font-size: 17px; letter-spacing: -0.01em;
    }
    .legal-nav { display: flex; align-items: center; gap: 20px; }
    .legal-nav a {
      color: #475569; text-decoration: none;
      font-weight: 500; font-size: 14px;
      padding-bottom: 2px;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .legal-nav a:hover { color: #11769b; }
    .legal-nav a.active {
      color: #11769b;
      border-bottom-color: #11769b;
    }
    .login-btn {
      background: linear-gradient(135deg, #11769b 0%, #15a4a2 100%);
      color: #fff !important;
      padding: 7px 16px; border-radius: 8px;
      font-weight: 600;
      border-bottom: none !important;
    }
    .login-btn:hover { color: #fff !important; }
    @media (max-width: 700px) {
      .legal-nav { gap: 12px; }
      .legal-nav a:not(.login-btn) { font-size: 13px; }
    }

    .legal-main { padding: 56px 0 80px; }
    .legal-container {
      max-width: 760px; margin: 0 auto;
      padding: 0 24px;
    }
    .legal-meta {
      color: #94a3b8;
      font-size: 13px; margin-bottom: 16px;
    }
    .legal-container h1 {
      font-size: clamp(28px, 4vw, 40px);
      font-weight: 800; letter-spacing: -0.02em;
      margin: 0 0 24px;
      color: #0e2a38;
    }
    .legal-callout {
      display: flex; gap: 12px;
      background: #e6f1f6;
      border-left: 4px solid #11769b;
      border-radius: 8px;
      padding: 14px 18px;
      margin: 0 0 32px;
    }
    .legal-callout mat-icon {
      color: #11769b; flex-shrink: 0;
    }
    .legal-callout p { margin: 0; font-size: 14px; color: #155e75; }

    section { margin-bottom: 32px; }
    section h2 {
      font-size: 20px; font-weight: 700;
      color: #0e2a38;
      margin: 0 0 12px;
      letter-spacing: -0.01em;
    }
    section h3 {
      font-size: 16px; font-weight: 600;
      color: #11769b;
      margin: 18px 0 8px;
    }
    section p { margin: 0 0 10px; font-size: 15px; color: #334155; }
    section ul {
      margin: 0 0 12px; padding-left: 22px;
    }
    section ul li {
      font-size: 15px; color: #334155;
      margin: 4px 0;
    }
    section code {
      background: #e2e8f0;
      padding: 1px 6px; border-radius: 4px;
      font-size: 13px; color: #0e2a38;
      font-family: 'SF Mono', Menlo, monospace;
    }
    section a {
      color: #11769b;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 16px;
      font-size: 14px;
    }
    .data-table th, .data-table td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid #e6e8ee;
    }
    .data-table th {
      background: #f3f4f8;
      font-weight: 600; font-size: 13px;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .data-table td { color: #334155; }
    .data-table tr:last-child td { border-bottom: none; }

    .legal-disclaimer {
      display: flex; gap: 14px;
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 10px;
      padding: 16px 18px;
      margin-top: 40px;
    }
    .legal-disclaimer mat-icon { color: #b45309; flex-shrink: 0; }
    .legal-disclaimer b { color: #92400e; }
    .legal-disclaimer p {
      margin: 4px 0 0; font-size: 14px; color: #78350f;
    }

    .legal-footer {
      background: #0e2a38;
      color: #cbd5e1;
      padding: 40px 0;
    }
    .legal-footer-inner {
      max-width: 920px; margin: 0 auto;
      padding: 0 24px;
      display: flex; flex-direction: column; align-items: center; gap: 18px;
      text-align: center;
    }
    .footer-brand {
      display: flex; align-items: center; gap: 10px;
      font-weight: 800; font-size: 16px; color: #fff;
    }
    .legal-footer nav { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; }
    .legal-footer nav a {
      color: #94a3b8; text-decoration: none;
      font-size: 14px; font-weight: 500;
    }
    .legal-footer nav a:hover { color: #5eead4; }
    .legal-footer p { margin: 0; font-size: 12px; color: #64748b; }
    .legal-footer code {
      background: rgba(255,255,255,0.05);
      padding: 1px 5px; border-radius: 4px;
      font-family: 'SF Mono', Menlo, monospace;
    }
  `]
})
export class LegalDocComponent implements OnInit {
  mode: 'terms' | 'privacy' | 'cookies' = 'terms';
  readonly year = new Date().getFullYear();
  readonly updatedAt: string;

  constructor(private route: ActivatedRoute) {
    const d = new Date();
    this.updatedAt = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  ngOnInit() {
    this.mode = this.route.snapshot.data?.['mode'] || 'terms';
  }
}

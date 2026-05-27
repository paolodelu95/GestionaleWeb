require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

const { runWithContext } = require('./utils/tenantContext');
const {
  getAuthDb, dataDir, tenantsDir, tenantDbPath,
  listTenants, getTenant, createTenant,
  getUserByUsername, getUserById, countUsers, createUser, updateUser,
  ensureTenantModuli, findUserByEmail,
  createPasswordResetToken, getPasswordResetToken,
  markPasswordResetTokenUsed, invalidateOtherResetTokens,
  countRecentResetRequests, purgeExpiredResetTokens,
  createEmailVerificationToken, getEmailVerificationToken,
  markEmailVerificationTokenUsed, markUserEmailVerified,
  invalidateOtherEmailVerificationTokens,
  countRecentEmailVerificationRequests, purgeExpiredEmailVerificationTokens,
} = require('./utils/authDb');
const { sign } = require('./utils/authToken');
const { authMiddleware, trialEnforcement } = require('./middleware/auth');
const { runBackup } = require('./utils/backup');
const { inviaSOllecitiAutomatici } = require('./utils/solleciti');
const { getNextNumero } = require('./utils/nextNumero');
const crypto = require('crypto');
const { sendPasswordResetEmail, sendEmailVerification, appBaseUrl } = require('./utils/systemMailer');

const VERIFY_TOKEN_TTL_H = 24;             // validità link conferma email

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'public');

if (!process.env.AUTH_SECRET) {
  console.error('FATAL: AUTH_SECRET è obbligatorio. Configura il file .env / i secrets su Fly.');
  process.exit(1);
}

// ── Bootstrap: migra DB legacy e crea tenant/utente di default se assenti ─────
function bootstrap() {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.mkdirSync(tenantsDir(), { recursive: true });

  // Migra il vecchio gestionale.db → tenants/default.db (una sola volta)
  const legacyPath = process.env.DB_PATH || path.join(dataDir(), 'gestionale.db');
  const defaultTenantPath = tenantDbPath('default');
  if (fs.existsSync(legacyPath) && !fs.existsSync(defaultTenantPath)) {
    try {
      fs.renameSync(legacyPath, defaultTenantPath);
      for (const ext of ['-wal', '-shm']) {
        const from = legacyPath + ext;
        const to   = defaultTenantPath + ext;
        if (fs.existsSync(from)) try { fs.renameSync(from, to); } catch(_) {}
      }
      console.log(`[bootstrap] Migrato ${legacyPath} → ${defaultTenantPath}`);
    } catch (err) {
      console.error('[bootstrap] Errore migrazione DB legacy:', err.message);
    }
  }

  getAuthDb();

  if (!getTenant('default')) {
    createTenant({ slug: 'default', nome: 'Default' });
    console.log('[bootstrap] Tenant "default" creato');
  }

  // Garantisce le righe tenant_moduli per ogni tenant esistente (idempotente)
  for (const t of listTenants()) {
    try { ensureTenantModuli(t.slug); } catch(_) {}
  }

  if (countUsers() === 0) {
    const u = process.env.AUTH_USER;
    const p = process.env.AUTH_PASS;
    if (u && p) {
      const hash = bcrypt.hashSync(p, 10);
      createUser({
        username: u, password_hash: hash, nome: 'Amministratore',
        email: '', ruolo: 'SUPERADMIN', tenant_slug: 'default',
      });
      console.log(`[bootstrap] Utente iniziale "${u}" creato (SUPERADMIN, tenant=default)`);
    } else {
      console.warn('[bootstrap] auth.db senza utenti: imposta AUTH_USER e AUTH_PASS o crea un utente manualmente');
    }
  }
}

bootstrap();

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));

// Su Fly siamo sempre dietro al proxy: 1 hop di X-Forwarded-For.
// Configura express per fidarsi così req.ip mostra l'IP reale del client e
// express-rate-limit smette di emettere ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

// ── Stripe webhook (DEVE ricevere body raw, prima di express.json()) ─────────
const { stripeWebhookHandler } = require('./routes/payLink');
app.post('/api/pay-link/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler);

// Webhook billing (subscription Pro). Pubblico, validato via firma Stripe.
const { handleStripeWebhook: billingWebhook } = require('./routes/billing');
app.post('/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  billingWebhook);

// ── Feed ICS pubblico (signed via HMAC nel query, pre-auth) ──────────────────
// Permette a Google Calendar / Outlook / Apple Calendar di sottoscriversi al
// calendario del tenant senza Bearer token. La protezione è il token HMAC.
const { publicFeedHandler } = require('./routes/agenda');
app.get('/api/agenda/feed.ics', publicFeedHandler);

app.use(express.json({ limit: '10mb' }));

// ── Login (pubblico) ─────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppi tentativi di login, riprova tra 15 minuti.' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppi tentativi di registrazione, riprova tra un\'ora.' }
});

// Honeypot anti-bot: i form pubblici hanno un campo nascosto "website" che gli
// utenti reali NON compilano mai (è invisibile). Se arriva valorizzato è un bot.
// Rispondiamo "ok" finto per non rivelare il meccanismo: il bot pensa di aver
// avuto successo ma il backend non fa nulla.
function isBotHoneypot(body) {
  return Boolean(body?.website && String(body.website).trim().length > 0);
}

// ── Registrazione self-service nuova azienda (pubblico) ──────────────────────
app.post('/api/auth/register', registerLimiter, async (req, res) => {
  if (isBotHoneypot(req.body)) {
    console.log('[register] honeypot triggered ip=', req.ip);
    // Risposta finta plausibile: niente token, niente tenant. Il bot non si
    // accorge che è stato bloccato, ma il sistema non ha creato nulla.
    return res.status(201).json({ ok: true });
  }
  const { ragioneSociale, piva, email, password, nome } = req.body || {};
  if (!ragioneSociale || !email || !password) {
    return res.status(400).json({ error: 'ragioneSociale, email e password sono obbligatori' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La password deve essere di almeno 8 caratteri' });
  }

  const { openTenantDb } = require('./utils/tenantDb');

  // Verifica email non già usata come username
  const existing = getAuthDb().prepare('SELECT id FROM users WHERE username=?').get(email);
  if (existing) return res.status(400).json({ error: 'Email già registrata' });

  // Genera uno slug unico da ragioneSociale
  const baseSlug = ragioneSociale
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 28) || 'azienda';
  let slug = baseSlug;
  let attempt = 0;
  while (getTenant(slug)) {
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  try {
    const tenant = createTenant({
      slug,
      nome: ragioneSociale,
      ragioneSociale,
      piva: piva || '',
      piano: 'trial',
      stato: 'attiva',
    });

    // Inizializza subito il DB del tenant (crea lo schema)
    openTenantDb(slug);

    const hash = await bcrypt.hash(password, 10);
    createUser({
      username: email,
      password_hash: hash,
      nome: nome || '',
      email,
      ruolo: 'OWNER',
      tenant_slug: slug,
    });

    const user = getUserByUsername(email);
    const token = sign({ uid: user.id, username: user.username, ruolo: user.ruolo, tenant: slug });

    // Genera token di verifica email + invia (fire-and-forget: la registrazione
    // resta valida anche se l'invio email fallisce; l'utente potrà reinviare).
    try {
      const vt = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_H * 3600000).toISOString();
      const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
      createEmailVerificationToken({ userId: user.id, token: vt, expiresAt, ip: clientIp });
      const verifyUrl = `${appBaseUrl()}/verify-email?token=${vt}`;
      sendEmailVerification({ to: email, nome: user.nome, verifyUrl, expiresInHours: VERIFY_TOKEN_TTL_H })
        .catch(err => console.error('[register] invio verifica email fallito:', err.message));
    } catch (err) {
      console.error('[register] token verifica email:', err.message);
    }

    res.status(201).json({
      token,
      user: {
        id: user.id, username: user.username, nome: user.nome,
        email: user.email, ruolo: user.ruolo, tenant: slug,
        emailVerified: false,
      },
      tenant: { slug: tenant.slug, nome: tenant.nome, piano: tenant.piano, trialScadeIl: tenant.trialScadeIl },
    });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email già registrata' });
    console.error('[register]', e.message);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Credenziali mancanti' });
  const user = getUserByUsername(username);
  if (!user || !user.attivo) return res.status(401).json({ error: 'Credenziali non valide' });
  const tenant = getTenant(user.tenant_slug);
  if (!tenant || !tenant.attivo) return res.status(403).json({ error: 'Tenant non attivo' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

  const token = sign({ uid: user.id, username: user.username, ruolo: user.ruolo, tenant: user.tenant_slug });
  res.json({
    token,
    user: {
      id: user.id, username: user.username, nome: user.nome,
      email: user.email, ruolo: user.ruolo, tenant: user.tenant_slug,
      emailVerified: user.email_verified === 1,
    },
  });
});

// ── Email verification (pubblico) ────────────────────────────────────────────
const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste — riprova tra un\'ora.' }
});

app.get('/api/auth/verify-email/:token', verifyLimiter, (req, res) => {
  try { purgeExpiredEmailVerificationTokens(); } catch(_) {}
  const t = getEmailVerificationToken(req.params.token);
  if (!t || t.used) return res.status(400).json({ verified: false, reason: 'Link non valido o già usato.' });
  if (new Date(t.expires_at) < new Date()) {
    return res.status(400).json({ verified: false, reason: 'Link scaduto. Richiedi un nuovo invio.' });
  }
  try {
    markUserEmailVerified(t.user_id);
    markEmailVerificationTokenUsed(req.params.token);
    invalidateOtherEmailVerificationTokens(t.user_id, req.params.token);
    res.json({ verified: true, message: 'Email confermata. Ora puoi accedere a tutte le funzioni.' });
  } catch (e) {
    console.error('[verify-email]', e.message);
    res.status(500).json({ verified: false, reason: 'Errore durante la conferma.' });
  }
});

// ── Forgot password (pubblico) ───────────────────────────────────────────────
const RESET_TOKEN_TTL_MIN = 60;             // validità link reset
const RESET_MAX_PER_HOUR  = 3;              // max richieste/ora per utente

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste di reset, riprova tra un\'ora.' }
});

app.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
  // Risposta generica usata sia per email inesistenti sia per honeypot:
  // gli stessi messaggio + status code rendono impossibile distinguere bot vs
  // utente reale via timing/contenuto.
  const genericOk = { ok: true, message: 'Se l\'email è registrata, riceverai un\'email con le istruzioni.' };

  // Delay fisso applicato a TUTTI i path (honeypot, email assente, email
  // non trovata, rate limit interno, tenant sospeso, email inviata): rende il
  // tempo di risposta sostanzialmente costante e impedisce l'enumeration
  // tramite misurazione del tempo. 350ms è una soglia ragionevole: maschera
  // sia bcrypt (~70ms) sia query DB (<10ms) sia I/O verso SMTP (async, già
  // fire-and-forget). 1ms di jitter random per evitare risposta a sub-ms.
  const FIXED_DELAY_MS = 350;
  const delayPromise = new Promise(r => setTimeout(r, FIXED_DELAY_MS + Math.random()));

  if (isBotHoneypot(req.body)) {
    console.log('[forgot-password] honeypot triggered ip=', req.ip);
    await delayPromise;
    return res.json(genericOk);
  }
  const email = String(req.body?.email || '').trim();
  if (!email) { await delayPromise; return res.status(400).json({ error: 'Email obbligatoria' }); }

  // Cleanup tokens scaduti (lazy)
  try { purgeExpiredResetTokens(); } catch(_) {}

  const user = findUserByEmail(email);
  if (!user || !user.attivo) {
    await delayPromise;
    return res.json(genericOk);
  }

  // Rate limit per utente (max RESET_MAX_PER_HOUR richieste/ora)
  if (countRecentResetRequests(user.id, 60) >= RESET_MAX_PER_HOUR) {
    await delayPromise;
    return res.json(genericOk);
  }

  // Verifica che il tenant sia attivo (no reset per account sospesi)
  const tenant = getTenant(user.tenant_slug);
  if (!tenant || !tenant.attivo) { await delayPromise; return res.json(genericOk); }

  // Genera token random (256 bit di entropia)
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60000).toISOString();
  const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

  try {
    createPasswordResetToken({ userId: user.id, token, expiresAt, ip: clientIp });
    const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
    const destinations = new Set();
    if (user.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) destinations.add(user.email);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.username)) destinations.add(user.username);

    // Fire-and-forget: l'invio email può richiedere secondi e farebbe
    // diventare misurabile il "happy path" rispetto agli errori. Lo
    // schediamo in background e logghiamo eventuali errori.
    for (const to of destinations) {
      sendPasswordResetEmail({
        to, nome: user.nome, resetUrl,
        expiresInMin: RESET_TOKEN_TTL_MIN,
      }).catch(mailErr => {
        console.error('[forgot-password] invio email fallito a', to, ':', mailErr.message);
      });
    }
  } catch (e) {
    console.error('[forgot-password]', e.message);
  }
  await delayPromise;
  res.json(genericOk);
});

// ── Verifica validità di un token (per il frontend) ─────────────────────────
app.get('/api/auth/reset-password/:token', (req, res) => {
  const t = getPasswordResetToken(req.params.token);
  if (!t || t.used) return res.status(400).json({ valid: false, reason: 'Link non valido o già usato.' });
  if (new Date(t.expires_at) < new Date()) {
    return res.status(400).json({ valid: false, reason: 'Link scaduto.' });
  }
  res.json({ valid: true });
});

// ── Reset password (pubblico, richiede token valido) ─────────────────────────
app.post('/api/auth/reset-password', forgotLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token e password obbligatori' });
  if (String(password).length < 8) return res.status(400).json({ error: 'La password deve essere di almeno 8 caratteri.' });

  const t = getPasswordResetToken(token);
  if (!t || t.used) return res.status(400).json({ error: 'Link non valido o già usato.' });
  if (new Date(t.expires_at) < new Date()) return res.status(400).json({ error: 'Link scaduto. Richiedi un nuovo reset.' });

  try {
    const hash = await bcrypt.hash(password, 10);
    updateUser(t.user_id, { password_hash: hash });
    markPasswordResetTokenUsed(token);
    invalidateOtherResetTokens(t.user_id, token);
    res.json({ ok: true, message: 'Password aggiornata. Ora puoi accedere.' });
  } catch (e) {
    console.error('[reset-password]', e.message);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento password.' });
  }
});

// ── Da qui in poi tutte le rotte richiedono autenticazione e contesto tenant ──
app.use('/api', authMiddleware);
// Dopo l'auth, blocca le richieste WRITE se il trial del tenant è scaduto.
// I SUPERADMIN e le GET su whitelist (vedi middleware/auth.js) passano sempre.
app.use('/api', trialEnforcement);

const db = require('./database');

app.get('/api/me', (req, res) => {
  const fresh = getUserById(req.user.id);
  const tenant = getTenant(req.user.tenant);
  res.json({
    ...req.user,
    emailVerified: fresh?.email_verified === 1,
    piano: tenant?.piano || null,
    trialScadeIl: tenant?.trialScadeIl || null,
    tenantAttivo: tenant?.attivo !== false,
  });
});

// ── Resend email verifica (utente loggato) ──────────────────────────────────
app.post('/api/auth/resend-verification', verifyLimiter, async (req, res) => {
  const userId = req.user.id;
  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });
  if (user.email_verified === 1) return res.status(400).json({ error: 'Email già verificata.' });
  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
    return res.status(400).json({ error: 'Email account non valida.' });
  }
  // Rate limit per utente: max 3/ora
  if (countRecentEmailVerificationRequests(userId, 60) >= 3) {
    return res.status(429).json({ error: 'Hai richiesto troppe email recentemente. Riprova tra un\'ora.' });
  }
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_H * 3600000).toISOString();
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    createEmailVerificationToken({ userId, token, expiresAt, ip: clientIp });
    const verifyUrl = `${appBaseUrl()}/verify-email?token=${token}`;
    await sendEmailVerification({ to: user.email, nome: user.nome, verifyUrl, expiresInHours: VERIFY_TOKEN_TTL_H });
    res.json({ ok: true, message: 'Email di verifica inviata. Controlla la tua casella.' });
  } catch (e) {
    console.error('[resend-verification]', e.message);
    res.status(500).json({ error: 'Errore durante l\'invio. Riprova più tardi.' });
  }
});

// Diagnostico SMTP (solo SUPERADMIN): invia una mail di prova e ritorna
// l'esito SMTP grezzo. Utile per capire perché la mail "non arriva".
app.post('/api/auth/smtp-test', async (req, res) => {
  if (req.user?.ruolo !== 'SUPERADMIN') return res.status(403).json({ error: 'Solo SUPERADMIN' });
  const to = req.body?.to;
  if (!to) return res.status(400).json({ error: 'Manca "to"' });
  try {
    const info = await require('./utils/systemMailer').sendSystemEmail({
      to,
      subject: 'Test SMTP Ordeva',
      html: '<p>Se vedi questa mail, l\'SMTP di sistema funziona.</p>',
    });
    res.json({
      ok: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
      code: e.code,
      response: e.response,
      responseCode: e.responseCode,
      command: e.command,
    });
  }
});

app.get('/api/prezzi-recenti', (req, res) => {
  const pid = parseInt(req.query.prodottoId);
  const cid = req.query.clienteId ? parseInt(req.query.clienteId) : null;
  if (!pid) return res.json([]);
  const limit = cid ? 5 : 10;

  const results = [];
  try {
    const fRows = cid
      ? db.prepare(`SELECT fr.prezzo,fr.sconto,fr.quantita,f.numero,f.data_emissione,'Fattura' as tipo,f.cliente_id as clienteId,c.ragione_sociale as clienteNome FROM fatture_righe fr JOIN fatture f ON fr.fattura_id=f.id LEFT JOIN clienti c ON c.id=f.cliente_id WHERE fr.prodotto_id=? AND f.cliente_id=? ORDER BY f.data_emissione DESC LIMIT ?`).all(pid, cid, limit)
      : db.prepare(`SELECT fr.prezzo,fr.sconto,fr.quantita,f.numero,f.data_emissione,'Fattura' as tipo,f.cliente_id as clienteId,c.ragione_sociale as clienteNome FROM fatture_righe fr JOIN fatture f ON fr.fattura_id=f.id LEFT JOIN clienti c ON c.id=f.cliente_id WHERE fr.prodotto_id=? ORDER BY f.data_emissione DESC LIMIT ?`).all(pid, limit);
    results.push(...fRows);

    const dRows = cid
      ? db.prepare(`SELECT dr.prezzo,dr.sconto,dr.quantita,d.numero,d.data_emissione,'DDT' as tipo,d.cliente_id as clienteId,c.ragione_sociale as clienteNome FROM ddt_righe dr JOIN ddt d ON dr.ddt_id=d.id LEFT JOIN clienti c ON c.id=d.cliente_id WHERE dr.prodotto_id=? AND d.cliente_id=? ORDER BY d.data_emissione DESC LIMIT ?`).all(pid, cid, limit)
      : db.prepare(`SELECT dr.prezzo,dr.sconto,dr.quantita,d.numero,d.data_emissione,'DDT' as tipo,d.cliente_id as clienteId,c.ragione_sociale as clienteNome FROM ddt_righe dr JOIN ddt d ON dr.ddt_id=d.id LEFT JOIN clienti c ON c.id=d.cliente_id WHERE dr.prodotto_id=? ORDER BY d.data_emissione DESC LIMIT ?`).all(pid, limit);
    results.push(...dRows);

    const pRows = cid
      ? db.prepare(`SELECT pr.prezzo,pr.sconto,pr.quantita,p.numero,p.data_emissione,'Preventivo' as tipo,p.cliente_id as clienteId,c.ragione_sociale as clienteNome FROM preventivi_righe pr JOIN preventivi p ON pr.preventivo_id=p.id LEFT JOIN clienti c ON c.id=p.cliente_id WHERE pr.prodotto_id=? AND p.cliente_id=? ORDER BY p.data_emissione DESC LIMIT ?`).all(pid, cid, limit)
      : db.prepare(`SELECT pr.prezzo,pr.sconto,pr.quantita,p.numero,p.data_emissione,'Preventivo' as tipo,p.cliente_id as clienteId,c.ragione_sociale as clienteNome FROM preventivi_righe pr JOIN preventivi p ON pr.preventivo_id=p.id LEFT JOIN clienti c ON c.id=p.cliente_id WHERE pr.prodotto_id=? ORDER BY p.data_emissione DESC LIMIT ?`).all(pid, limit);
    results.push(...pRows);
  } catch (_) { return res.json([]); }

  results.sort((a, b) => (b.data_emissione || '').localeCompare(a.data_emissione || ''));
  const sliceSize = cid ? 5 : 15;
  res.json(results.slice(0, sliceSize).map(r => ({
    prezzo: r.prezzo,
    sconto: r.sconto ?? 0,
    prezzoEffettivo: +(r.prezzo * (1 - (r.sconto ?? 0) / 100)).toFixed(4),
    quantita: r.quantita,
    numero: r.numero,
    dataEmissione: r.data_emissione,
    tipo: r.tipo,
    clienteId: r.clienteId ?? null,
    clienteNome: r.clienteNome ?? null,
  })));
});

app.get('/api/next-number/:tipo', (req, res) => {
  const tableMap = {
    ddt:            { table: 'ddt',          tipo: 'ddt' },
    fatture:        { table: 'fatture',       tipo: 'fatture' },
    ordini:         { table: 'ordini',        tipo: 'ordini' },
    preventivi:     { table: 'preventivi',    tipo: 'preventivi' },
    'note-credito': { table: 'note_credito',  tipo: 'note_credito' },
    acquisti:       { table: 'acquisti',      tipo: 'acquisti' },
    'vendite-banco':{ table: 'vendite_banco', tipo: 'vendite_banco' },
    'arrivi-merce': { table: 'arrivi_merce',  tipo: 'arrivi_merce' },
  };
  const entry = tableMap[req.params.tipo];
  if (!entry) return res.status(400).json({ error: 'tipo non valido' });
  const numero = getNextNumero(entry.tipo, entry.table);
  res.json({ numero });
});

app.use('/api/billing',          require('./routes/billing').router);
app.use('/api/azienda',          require('./routes/azienda'));
app.use('/api/prodotti',         require('./routes/prodotti'));
app.use('/api/clienti',          require('./routes/clienti'));
app.use('/api/fornitori',        require('./routes/fornitori'));
app.use('/api/ddt',              require('./routes/ddt'));
app.use('/api/fatture',          require('./routes/fatture'));
app.use('/api/note-credito',     require('./routes/noteCredito'));
app.use('/api/ordini',           require('./routes/ordini'));
app.use('/api/preventivi',       require('./routes/preventivi'));
app.use('/api/pagamenti',        require('./routes/pagamenti'));
app.use('/api/acquisti',         require('./routes/acquisti'));
app.use('/api/movimenti-magazzino', require('./routes/movimentiMagazzino'));
app.use('/api/vendite-banco',      require('./routes/venditeBanco'));
app.use('/api/prodotto-varianti',  require('./routes/prodottoVarianti'));
app.use('/api/tipi-pagamento',   require('./routes/tipiPagamento'));
app.use('/api/categorie-prodotto', require('./routes/categorieProdotto'));
app.use('/api/unita-misura',     require('./routes/unitaMisura'));
app.use('/api/aliquote-iva',     require('./routes/aliquoteIva'));
app.use('/api/conti-acquisto',  require('./routes/contiAcquisto'));
app.use('/api/listini',          require('./routes/listini'));
app.use('/api/fattura-xml',      require('./routes/fatturaXml'));
app.use('/api/arrivi-merce',     require('./routes/arriviMerce'));
app.use('/api/email',            require('./routes/email'));
app.use('/api/stats',            require('./routes/stats'));
app.use('/api/utenti',           require('./routes/utenti'));
app.use('/api/tenants',          require('./routes/tenants'));
app.use('/api/admin',            require('./routes/admin'));
app.use('/api/moduli',           require('./routes/moduli'));
app.use('/api/reports',          require('./routes/reports'));
app.use('/api/ocr',              require('./routes/ocr'));
app.use('/api/agenda',           require('./routes/agenda'));
app.use('/api/gruppi',           require('./routes/gruppi'));
app.use('/api/pay-link',         require('./routes/payLink'));
app.use('/api/sdi-passive',      require('./routes/sdiPassive'));
app.use('/api/riconciliazione',  require('./routes/riconciliazione'));
app.use('/api/crm',              require('./routes/crm'));
app.use('/api/timesheet',        require('./routes/timesheet'));
app.use('/api/ecommerce',        require('./routes/ecommerce'));
app.use('/api/piva',             require('./routes/piva'));
app.use('/api/notifications',    require('./routes/notifications'));
app.use('/api/prima-nota',       require('./routes/primaNota'));
app.use('/api/scadenzario',      require('./routes/scadenzario'));
app.use('/api/fatture-ricorrenti', require('./routes/fattureRicorrenti').router);
app.use('/api/allegati',          require('./routes/allegati'));
app.use('/api/note-rapide',       require('./routes/noteRapide'));
app.use('/api/bug-reports',       require('./routes/bugReports'));
app.use('/api/audit',             require('./routes/audit'));

// ── Ricerca globale ──────────────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ clienti: [], fornitori: [], prodotti: [], fatture: [], ddt: [], ordini: [], preventivi: [] });
  const like = `%${q}%`;
  const clienti = db.prepare(
    `SELECT id, ragione_sociale as label, 'cliente' as tipo, '/clienti' as route FROM clienti WHERE ragione_sociale LIKE ? OR p_iva LIKE ? OR codice_fiscale LIKE ? LIMIT 5`
  ).all(like, like, like);
  const fornitori = db.prepare(
    `SELECT id, ragione_sociale as label, 'fornitore' as tipo, '/fornitori' as route FROM fornitori WHERE ragione_sociale LIKE ? OR p_iva LIKE ? LIMIT 5`
  ).all(like, like);
  const prodotti = db.prepare(
    `SELECT id, nome as label, 'prodotto' as tipo, '/prodotti' as route FROM prodotti WHERE nome LIKE ? OR codice LIKE ? OR barcode LIKE ? LIMIT 5`
  ).all(like, like, like);
  const fatture = db.prepare(
    `SELECT f.id, f.numero || COALESCE(' – ' || c.ragione_sociale, '') as label, 'fattura' as tipo, '/fatture' as route FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.numero LIKE ? OR c.ragione_sociale LIKE ? LIMIT 5`
  ).all(like, like);
  const ddt = db.prepare(
    `SELECT d.id, d.numero || COALESCE(' – ' || c.ragione_sociale, '') as label, 'ddt' as tipo, '/ddt' as route FROM ddt d LEFT JOIN clienti c ON d.cliente_id=c.id WHERE d.numero LIKE ? OR c.ragione_sociale LIKE ? LIMIT 5`
  ).all(like, like);
  const ordini = db.prepare(
    `SELECT o.id, o.numero || COALESCE(' – ' || c.ragione_sociale, '') as label, 'ordine' as tipo, '/ordini' as route FROM ordini o LEFT JOIN clienti c ON o.cliente_id=c.id WHERE o.numero LIKE ? OR c.ragione_sociale LIKE ? LIMIT 5`
  ).all(like, like);
  const preventivi = db.prepare(
    `SELECT p.id, p.numero || COALESCE(' – ' || c.ragione_sociale, '') as label, 'preventivo' as tipo, '/preventivi' as route FROM preventivi p LEFT JOIN clienti c ON p.cliente_id=c.id WHERE p.numero LIKE ? OR c.ragione_sociale LIKE ? LIMIT 5`
  ).all(like, like);
  res.json({ clienti, fornitori, prodotti, fatture, ddt, ordini, preventivi });
});

// ── Cron jobs (per-tenant) ───────────────────────────────────────────────────
function forEachActiveTenant(taskName, fn) {
  const tenants = listTenants({ activeOnly: true });
  for (const t of tenants) {
    runWithContext({ tenant: t.slug, user: null }, async () => {
      try { await fn(t); }
      catch (err) { console.error(`[Cron:${taskName}] tenant=${t.slug}:`, err.message); }
    });
  }
}

cron.schedule('0 2 * * *', () => {
  console.log('[Cron] Avvio backup giornaliero');
  for (const t of listTenants({ activeOnly: true })) {
    try { runBackup(t.slug); }
    catch (err) { console.error(`[Cron:backup] tenant=${t.slug}:`, err.message); }
  }
});
setTimeout(() => {
  for (const t of listTenants({ activeOnly: true })) {
    try { runBackup(t.slug); }
    catch (err) { console.error(`[Boot:backup] tenant=${t.slug}:`, err.message); }
  }
}, 5000);

cron.schedule('0 8 * * *', () => {
  console.log('[Cron] Avvio invio solleciti automatici (tutti i tenant)');
  forEachActiveTenant('solleciti', () => inviaSOllecitiAutomatici());
});

cron.schedule('0 7 * * *', () => {
  const today = new Date().toISOString().substring(0, 10);
  console.log('[Cron] Fatturazione ricorrente — controllo per', today);
  forEachActiveTenant('fatture-ricorrenti', () => {
    const { emettiFattura } = require('./routes/fattureRicorrenti');
    const dovute = db.prepare(
      'SELECT * FROM fatture_ricorrenti WHERE attiva=1 AND prossima_emissione <= ?'
    ).all(today);
    for (const r of dovute) {
      try {
        const { numero } = emettiFattura(r);
        console.log(`[Cron] Fattura ricorrente emessa: ${numero} (template id=${r.id})`);
      } catch (err) {
        console.error(`[Cron] Errore emissione fattura ricorrente id=${r.id}:`, err.message);
      }
    }
  });
});

app.use((err, req, res, next) => {
  // Body parser errors (JSON malformato, body troppo grande, ecc.)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON non valido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Body troppo grande' });
  }
  // SqliteError: violazione constraint UNIQUE → 400
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint/.test(err.message || '')) {
    return res.status(400).json({ error: 'Valore duplicato' });
  }
  // Default: log e 500. In produzione non rivelo lo stack ma il messaggio.
  console.error('[error]', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  res.status(500).json({ error: err.message || 'Errore interno' });
});

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/(.*)/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));

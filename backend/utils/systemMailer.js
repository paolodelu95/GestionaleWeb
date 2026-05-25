/**
 * Mailer di sistema Ordeva (distinto dall'SMTP dei singoli tenant).
 *
 * Usa le variabili d'ambiente:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   SMTP_FROM       — es. "Ordeva <noreply@ordeva.it>"
 *   SMTP_REPLY_TO   — opzionale, es. contatti@ordeva.it
 *   APP_BASE_URL    — es. https://ordeva.it (per i link nelle email)
 *
 * Usato per email che parte dal sistema (reset password, verifica
 * registrazione, notifiche piattaforma) — NON per le fatture/solleciti
 * che il singolo tenant invia ai suoi clienti.
 */
const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('SMTP di sistema non configurato (manca SMTP_HOST/USER/PASS nei secret).');
  }
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // STARTTLS su 587, TLS implicito su 465
    auth: { user, pass },
  });
  return cachedTransporter;
}

function getFrom() {
  return process.env.SMTP_FROM || `Ordeva <${process.env.SMTP_USER}>`;
}

function getReplyTo() {
  return process.env.SMTP_REPLY_TO || undefined;
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || 'https://ordeva.it').replace(/\/+$/, '');
}

/**
 * Invia un'email di sistema.
 * Throwa se SMTP non configurato o l'invio fallisce.
 */
async function sendSystemEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  const opts = {
    from: getFrom(),
    to,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, ''),
  };
  const replyTo = getReplyTo();
  if (replyTo) opts.replyTo = replyTo;
  return transporter.sendMail(opts);
}

// ── Templates ───────────────────────────────────────────────────────────────

function htmlShell(title, body) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7fb;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06)">
        <tr><td style="background:#0e2a38;padding:24px 32px;text-align:center">
          <span style="display:inline-block;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.01em">Ordeva</span>
        </td></tr>
        <tr><td style="padding:36px 32px 12px;color:#0f172a;line-height:1.6;font-size:15px">
          ${body}
        </td></tr>
        <tr><td style="padding:24px 32px 32px;color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e6e8ee">
          Hai ricevuto questa email perché qualcuno (probabilmente tu) ha richiesto un'operazione sul tuo account Ordeva.<br>
          Se non sei stato tu, puoi ignorare in sicurezza questo messaggio.<br><br>
          © ${new Date().getFullYear()} Ordeva — <a href="${appBaseUrl()}" style="color:#11769b;text-decoration:none">${appBaseUrl().replace(/^https?:\/\//, '')}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function sendPasswordResetEmail({ to, nome, resetUrl, expiresInMin }) {
  const greeting = nome ? `Ciao ${escapeHtml(nome)},` : 'Ciao,';
  const body = `
    <p style="margin:0 0 14px;font-size:18px;font-weight:600;color:#0e2a38">Reimposta la tua password</p>
    <p style="margin:0 0 18px">${greeting}<br>
    abbiamo ricevuto una richiesta di reset della password per il tuo account Ordeva. Clicca il pulsante qui sotto per impostarne una nuova:</p>
    <p style="margin:24px 0 28px;text-align:center">
      <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#11769b 0%,#15a4a2 100%);color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:600;font-size:15px">
        Imposta nuova password
      </a>
    </p>
    <p style="margin:0 0 14px;font-size:13px;color:#64748b">Il link è valido per <b>${expiresInMin} minuti</b> ed è utilizzabile una sola volta.</p>
    <p style="margin:0 0 6px;font-size:13px;color:#64748b">Se il pulsante non funziona, copia e incolla questo indirizzo nel tuo browser:</p>
    <p style="margin:0;font-size:12px;color:#11769b;word-break:break-all"><a href="${resetUrl}" style="color:#11769b;text-decoration:none">${resetUrl}</a></p>`;
  return sendSystemEmail({
    to,
    subject: 'Reimposta la tua password Ordeva',
    html: htmlShell('Reimposta la tua password Ordeva', body),
  });
}

module.exports = {
  sendSystemEmail,
  sendPasswordResetEmail,
  appBaseUrl,
};

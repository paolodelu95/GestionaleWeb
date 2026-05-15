require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const db = require('./database');

// ── Auth ─────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const AUTH_USER   = process.env.AUTH_USER   || 'invoxa-admin';
const AUTH_PASS   = process.env.AUTH_PASS   || 'invoxa-passowrd';
const AUTH_SECRET = process.env.AUTH_SECRET || 'invoxa-jwt-secret-changeme';
const VALID_TOKEN = crypto.createHmac('sha256', AUTH_SECRET)
  .update(`${AUTH_USER}:${AUTH_PASS}`).digest('hex');

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USER && password === AUTH_PASS)
    return res.json({ token: VALID_TOKEN });
  res.status(401).json({ error: 'Credenziali non valide' });
});

app.use('/api', (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth === `Bearer ${VALID_TOKEN}`) return next();
  res.status(401).json({ error: 'Non autorizzato' });
});

app.get('/api/prezzi-recenti', (req, res) => {
  const pid = parseInt(req.query.prodottoId);
  const cid = req.query.clienteId ? parseInt(req.query.clienteId) : null;
  if (!pid) return res.json([]);

  const results = [];
  try {
    const fRows = cid
      ? db.prepare(`SELECT fr.prezzo,fr.sconto,fr.quantita,f.numero,f.data_emissione,'Fattura' as tipo FROM fatture_righe fr JOIN fatture f ON fr.fattura_id=f.id WHERE fr.prodotto_id=? AND f.cliente_id=? ORDER BY f.data_emissione DESC LIMIT 5`).all(pid, cid)
      : db.prepare(`SELECT fr.prezzo,fr.sconto,fr.quantita,f.numero,f.data_emissione,'Fattura' as tipo FROM fatture_righe fr JOIN fatture f ON fr.fattura_id=f.id WHERE fr.prodotto_id=? ORDER BY f.data_emissione DESC LIMIT 5`).all(pid);
    results.push(...fRows);

    const dRows = cid
      ? db.prepare(`SELECT dr.prezzo,dr.sconto,dr.quantita,d.numero,d.data_emissione,'DDT' as tipo FROM ddt_righe dr JOIN ddt d ON dr.ddt_id=d.id WHERE dr.prodotto_id=? AND d.cliente_id=? ORDER BY d.data_emissione DESC LIMIT 5`).all(pid, cid)
      : db.prepare(`SELECT dr.prezzo,dr.sconto,dr.quantita,d.numero,d.data_emissione,'DDT' as tipo FROM ddt_righe dr JOIN ddt d ON dr.ddt_id=d.id WHERE dr.prodotto_id=? ORDER BY d.data_emissione DESC LIMIT 5`).all(pid);
    results.push(...dRows);

    const pRows = cid
      ? db.prepare(`SELECT pr.prezzo,pr.sconto,pr.quantita,p.numero,p.data_emissione,'Preventivo' as tipo FROM preventivi_righe pr JOIN preventivi p ON pr.preventivo_id=p.id WHERE pr.prodotto_id=? AND p.cliente_id=? ORDER BY p.data_emissione DESC LIMIT 5`).all(pid, cid)
      : db.prepare(`SELECT pr.prezzo,pr.sconto,pr.quantita,p.numero,p.data_emissione,'Preventivo' as tipo FROM preventivi_righe pr JOIN preventivi p ON pr.preventivo_id=p.id WHERE pr.prodotto_id=? ORDER BY p.data_emissione DESC LIMIT 5`).all(pid);
    results.push(...pRows);
  } catch (_) { return res.json([]); }

  results.sort((a, b) => (b.data_emissione || '').localeCompare(a.data_emissione || ''));
  res.json(results.slice(0, 5).map(r => ({
    prezzo: r.prezzo,
    sconto: r.sconto ?? 0,
    prezzoEffettivo: +(r.prezzo * (1 - (r.sconto ?? 0) / 100)).toFixed(4),
    quantita: r.quantita,
    numero: r.numero,
    dataEmissione: r.data_emissione,
    tipo: r.tipo,
  })));
});

app.get('/api/next-number/:tipo', (req, res) => {
  const map = { ddt: 'ddt', fatture: 'fatture', ordini: 'ordini', preventivi: 'preventivi', 'note-credito': 'note_credito', acquisti: 'acquisti', 'vendite-banco': 'vendite_banco' };
  const table = map[req.params.tipo];
  if (!table) return res.status(400).json({ error: 'tipo non valido' });
  const row = db.prepare(`SELECT COUNT(*) as n FROM "${table}"`).get();
  res.json({ numero: row.n + 1 });
});

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
app.use('/api/fattura-xml',      require('./routes/fatturaXml'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

// Serve Angular in production
const fs = require('fs');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/(.*)/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));

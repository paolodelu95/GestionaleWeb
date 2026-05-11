const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const db = require('./database');

app.get('/api/next-number/:tipo', (req, res) => {
  const map = { ddt: 'ddt', fatture: 'fatture', ordini: 'ordini', preventivi: 'preventivi', 'note-credito': 'note_credito', acquisti: 'acquisti' };
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
app.use('/api/tipi-pagamento',   require('./routes/tipiPagamento'));
app.use('/api/categorie-prodotto', require('./routes/categorieProdotto'));
app.use('/api/unita-misura',     require('./routes/unitaMisura'));
app.use('/api/aliquote-iva',     require('./routes/aliquoteIva'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`Backend avviato su http://localhost:${PORT}`));

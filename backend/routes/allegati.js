const express = require('express');
const router = express.Router();
const db = require('../database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain', 'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml', 'text/xml',
  'application/zip',
]);
const ALLOWED_EXT = new Set(['.pdf','.jpg','.jpeg','.png','.gif','.webp','.txt','.csv','.xls','.xlsx','.doc','.docx','.xml','.zip']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E6);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, unique + (ALLOWED_EXT.has(ext) ? ext : ''));
  }
});
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) return cb(null, true);
  cb(new Error('Tipo di file non consentito'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// GET /api/allegati?tipo=fattura&id=123
router.get('/', (req, res) => {
  const { tipo, id } = req.query;
  if (!tipo || !id) return res.json([]);
  const rows = db.prepare('SELECT * FROM allegati WHERE documento_tipo=? AND documento_id=? ORDER BY created_at DESC').all(tipo, id);
  res.json(rows.map(r => ({
    id: r.id,
    nomeFile: r.nome_file,
    percorso: r.percorso,
    dimensione: r.dimensione,
    mimeType: r.mime_type,
    createdAt: r.created_at
  })));
});

// POST /api/allegati?tipo=fattura&id=123
router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err.message });
    }
    next();
  });
}, (req, res) => {
  const { tipo, id } = req.query;
  if (!tipo || !id || !req.file) return res.status(400).json({ error: 'Parametri mancanti' });
  const result = db.prepare(
    'INSERT INTO allegati (documento_tipo, documento_id, nome_file, percorso, dimensione, mime_type) VALUES (?,?,?,?,?,?)'
  ).run(tipo, id, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype);
  res.json({
    id: result.lastInsertRowid,
    nomeFile: req.file.originalname,
    percorso: req.file.filename,
    dimensione: req.file.size,
    mimeType: req.file.mimetype,
    createdAt: new Date().toISOString()
  });
});

// Validates that the percorso column points to a file actually inside uploadDir.
// Prevents path traversal if a malicious value sneaks into the DB.
function safeFilePath(percorso) {
  if (!percorso || typeof percorso !== 'string') return null;
  const candidate = path.resolve(uploadDir, percorso);
  const base = path.resolve(uploadDir);
  if (!candidate.startsWith(base + path.sep) && candidate !== base) return null;
  return candidate;
}

// DELETE /api/allegati/:id  (ADMIN/SUPERADMIN only)
router.delete('/:id', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), (req, res) => {
  const row = db.prepare('SELECT percorso FROM allegati WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Allegato non trovato' });
  const filePath = safeFilePath(row.percorso);
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) { /* ignora errore filesystem, prosegui con DELETE record */ }
  db.prepare('DELETE FROM allegati WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/allegati/:id/download
router.get('/:id/download', (req, res) => {
  const row = db.prepare('SELECT * FROM allegati WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Non trovato' });
  const filePath = safeFilePath(row.percorso);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File non trovato sul disco' });
  res.download(filePath, row.nome_file);
});

module.exports = router;

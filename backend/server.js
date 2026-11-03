const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const { testConnection, pingDatabase, getDatabaseDiagnostics, pool } = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');
const masterRoutes = require('./routes/masterRoutes');
const batchRoutes = require('./routes/batchRoutes');
const userRoutes = require('./routes/userRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Parsing Middlewares
app.use(cors({
  origin: (origin, callback) => {
    // Izinkan requests tanpa origin (seperti Postman, curl, aplikasi native, direct file://)
    if (!origin) return callback(null, true);
    
    // Izinkan localhost dan 127.0.0.1 pada port apapun (misal Vite 5173, 5174, Live Server 5500, dll)
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin);
    const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (
      isLocalhost ||
      process.env.CLIENT_ORIGIN === '*' ||
      configuredOrigins.includes(origin) ||
      !process.env.NODE_ENV ||
      process.env.NODE_ENV === 'development'
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in development
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// API Routes
app.use('/api/masters', masterRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint (memverifikasi server API & koneksi aktif ke MySQL)
app.get('/api/health', async (req, res) => {
  const dbStatus = await pingDatabase();
  const isHealthy = dbStatus.connected;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'OK' : 'DEGRADED',
    database: isHealthy ? 'connected' : 'disconnected',
    dbLatencyMs: dbStatus.latencyMs,
    dbError: dbStatus.error || null,
    service: 'BI-ERP Batch Management API',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Test DB endpoint lengkap dengan diagnostik
app.get('/api/test-db', async (req, res) => {
  try {
    const diag = await getDatabaseDiagnostics();
    if (!diag.connected) {
      return res.status(503).json({
        success: false,
        message: 'Gagal terhubung ke database form_batch_erp',
        diagnostics: diag
      });
    }

    let rekanan = [];
    try {
      const [rows] = await pool.query('SELECT id, nama_rekanan, nik_npwp, bank_default FROM master_rekanan LIMIT 5');
      rekanan = rows;
    } catch (e1) {
      try {
        const [rows2] = await pool.query('SELECT * FROM rekanan LIMIT 5');
        rekanan = rows2;
      } catch (e2) {}
    }

    let batches = [];
    try {
      const [rows3] = await pool.query('SELECT id, no_batch, no_dokumen, perihal, nama_rekanan, status FROM batches WHERE is_deleted = 0 LIMIT 5');
      batches = rows3;
    } catch (e3) {}

    res.json({
      success: true,
      message: `Koneksi ke database '${diag.database}' (${diag.version}) berhasil dan optimal!`,
      diagnostics: diag,
      rekananSample: rekanan,
      batchesSample: batches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Gagal membaca database form_batch_erp: ' + error.message,
      error: error.message
    });
  }
});

// Debug Batches endpoint
app.get('/api/debug-batches', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM batches WHERE is_deleted = 0');
    
    // Test exact query
    const querySql = `
      SELECT 
        b.id,
        b.no_batch AS noBatch,
        b.no_dokumen AS noDokumen,
        COALESCE(SUM(bi.nominal), 0) AS totalNominal
      FROM batches b
      LEFT JOIN batch_invoices bi ON b.id = bi.batch_id
      WHERE b.is_deleted = 0
      GROUP BY b.id
      ORDER BY b.id DESC
      LIMIT 20 OFFSET 0
    `;
    const [batchRows] = await pool.query(querySql);
    
    let coaError = null;
    let coaColumns = [];
    try {
      const [cols] = await pool.query('SHOW COLUMNS FROM batch_coas');
      coaColumns = cols.map(c => c.Field);
    } catch (eCoa) {
      coaError = eCoa.message;
    }

    res.json({
      success: true,
      totalBatches: countRows[0]?.total,
      sampleBatches: batchRows,
      batchCoaColumns: coaColumns,
      coaError
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Debug Batches Error: ' + error.message,
      stack: error.stack
    });
  }
});


// Centralized error handling
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(` BI-ERP REST API Server running on http://localhost:${PORT}`);
  console.log(` Modul: Form Batch ERP Keuangan, Invoice & Anggaran`);
  console.log(`=======================================================`);
  await testConnection();
});

module.exports = app;

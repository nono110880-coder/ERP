const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const net = require('net');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Normalisasi Host: cegah masalah resolusi IPv6 '::1' pada MariaDB/MySQL Windows
const rawHost = process.env.DB_HOST || '127.0.0.1';
const normalizedHost = (rawHost === 'localhost' || rawHost === '::1') ? '127.0.0.1' : rawHost;

const DB_CONFIG = {
  host: normalizedHost,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_NAME || 'form_batch_erp',
  charset: process.env.DB_CHARSET || 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '+07:00'
};

// Konfigurasi Enterprise Connection Pool
const POOL_CONFIG = {
  ...DB_CONFIG,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true
};

// Inisialisasi Pool
const pool = mysql.createPool(POOL_CONFIG);

// Monitor error pada pool
pool.on('error', (err) => {
  console.error('[Database Pool Error]:', err.message);
});

// Helper memeriksa ketersediaan port TCP secara cepat
function checkPortOpen(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isOpened = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      isOpened = true;
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

// Helper: Ping cepat untuk healthcheck
async function pingDatabase() {
  const start = Date.now();
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return {
      connected: true,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error.message
    };
  }
}

// Helper: Diagnostik Database Lengkap
async function getDatabaseDiagnostics() {
  const status = await pingDatabase();
  if (!status.connected) {
    return {
      connected: false,
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      database: DB_CONFIG.database,
      user: DB_CONFIG.user,
      error: status.error
    };
  }

  try {
    const [verRows] = await pool.query('SELECT VERSION() AS version');
    const [tables] = await pool.query('SHOW TABLES');
    const tableCounts = {};

    const requiredTables = [
      'batches', 'batch_invoices', 'batch_coas',
      'master_uker', 'master_rekanan', 'master_pejabat',
      'master_dha', 'master_coa', 'app_users', 'app_rbac_matrix'
    ];

    for (const t of tables) {
      const tblName = Object.values(t)[0];
      if (requiredTables.includes(tblName) || tblName.startsWith('master_') || tblName.startsWith('batch')) {
        try {
          const [cnt] = await pool.query(`SELECT COUNT(*) AS total FROM \`${tblName}\``);
          tableCounts[tblName] = cnt[0]?.total ?? 0;
        } catch (e) {
          tableCounts[tblName] = -1;
        }
      }
    }

    return {
      connected: true,
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      database: DB_CONFIG.database,
      user: DB_CONFIG.user,
      version: verRows[0]?.version || 'Unknown',
      latencyMs: status.latencyMs,
      totalTables: tables.length,
      sampleTableCounts: tableCounts
    };
  } catch (err) {
    return {
      connected: true,
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      database: DB_CONFIG.database,
      error: err.message
    };
  }
}

// Helper: Eksekusi transaksi aman (Atomic Transaction Runner)
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Inisialisasi & Pengujian Koneksi saat Server Start
async function testConnection() {
  const dbName = DB_CONFIG.database;
  console.log(`[Database] Memeriksa koneksi MySQL/MariaDB pada ${DB_CONFIG.host}:${DB_CONFIG.port}...`);

  try {
    // 1. Uji koneksi tingkat server (tanpa database tertentu dulu)
    let serverConn;
    try {
      serverConn = await mysql.createConnection({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        connectTimeout: POOL_CONFIG.connectTimeout,
        multipleStatements: true
      });
    } catch (connErr) {
      // Jika port 3306 gagal, cek apakah port 3307 aktif (sering terjadi pada konfigurasi XAMPP alternatif)
      if (connErr.code === 'ECONNREFUSED' && DB_CONFIG.port === 3306) {
        const is3307Open = await checkPortOpen(DB_CONFIG.host, 3307, 1000);
        if (is3307Open) {
          console.warn(`\n[Database Warning] Port 3306 ditolak, namun layanan MySQL terdeteksi pada PORT 3307!`);
          console.warn(`[Solusi] Silakan ubah 'DB_PORT=3307' di file 'backend/.env' lalu restart backend.\n`);
        }
      }
      throw connErr;
    }

    // 2. Periksa keberadaan Database
    const [dbs] = await serverConn.query(`SHOW DATABASES LIKE '${dbName}'`);
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');

    if (dbs.length === 0) {
      console.log(`[Database Notice] Database '${dbName}' belum ada. Menginisialisasi skema lengkap...`);
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await serverConn.query(sql);
        console.log(`[Database Sukses] Database '${dbName}' dan tabel-tabelnya berhasil di-setup otomatis!`);
      } else {
        await serverConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.warn(`[Database Warning] File schema.sql tidak ditemukan di ${schemaPath}, database kosong dibuat.`);
      }
    } else {
      // Database sudah ada: periksa kelengkapan tabel inti
      try {
        await serverConn.query(`USE \`${dbName}\``);
        const [tables] = await serverConn.query(`SHOW TABLES`);
        const existingTableNames = tables.map(t => Object.values(t)[0]);

        const coreTables = ['batches', 'batch_invoices', 'batch_coas', 'master_uker', 'master_rekanan', 'master_pejabat', 'master_dha', 'master_coa'];
        const missingTables = coreTables.filter(tbl => !existingTableNames.includes(tbl));

        if (missingTables.length > 0) {
          console.log(`[Database Notice] Tabel berikut belum lengkap: [${missingTables.join(', ')}]. Menjalankan schema.sql...`);
          if (fs.existsSync(schemaPath)) {
            const sql = fs.readFileSync(schemaPath, 'utf8');
            await serverConn.query(sql);
            console.log(`[Database Sukses] Skema database berhasil diperbarui!`);
          }
        }
      } catch (errCheck) {
        console.warn('[Database Notice] Verifikasi tabel:', errCheck.message);
      }
    }

    await serverConn.end();

    // 3. Verifikasi koneksi pool aktif
    const poolConn = await pool.getConnection();
    const [verRow] = await poolConn.query('SELECT VERSION() AS ver');
    const version = verRow[0]?.ver || 'MySQL/MariaDB';

    // Auto-fix soft-delete nomor batch
    try {
      await poolConn.query("UPDATE batches SET no_batch = CONCAT(no_batch, '_DEL_', id) WHERE is_deleted = 1 AND no_batch NOT LIKE '%_DEL_%'");
    } catch (eFixDel) {}

    poolConn.release();

    console.log(`[Database] Terhubung sempurna ke '${dbName}' di ${DB_CONFIG.host}:${DB_CONFIG.port} (${version})`);
    return true;
  } catch (error) {
    console.error(`[Database Error] Koneksi gagal: ${error.message} (Code: ${error.code || 'UNKNOWN'})`);
    if (error.message.includes('not allowed to connect') || error.code === 'ER_HOST_NOT_PRIVILEGED') {
      console.warn(`[Solusi Host MariaDB] MariaDB menolak host '${DB_CONFIG.host}'.`);
      console.warn(`[Solusi] Pastikan di backend/.env tertulis 'DB_HOST=127.0.0.1'.`);
      console.warn(`[Solusi Alternatif] Jika masih ditolak, buka XAMPP Shell lalu jalankan:`);
      console.warn(`  mysql -u root`);
      console.warn(`  GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;`);
      console.warn(`  FLUSH PRIVILEGES;`);
    } else if (error.code === 'ECONNREFUSED') {
      console.warn(`[Solusi Koneksi] MySQL/XAMPP belum aktif di ${DB_CONFIG.host}:${DB_CONFIG.port}.`);
      console.warn(`[Langkah] 1. Buka XAMPP Control Panel`);
      console.warn(`[Langkah] 2. Klik tombol 'Start' pada modul MySQL`);
      console.warn(`[Langkah] 3. Pastikan port sesuai (${DB_CONFIG.port})`);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.warn(`[Solusi Kredensial] User/Password MySQL salah. Silakan sesuaikan DB_USER dan DB_PASSWORD di backend/.env.`);
    } else {
      console.warn(`[Panduan] Pastikan MySQL/XAMPP aktif dan konfigurasi backend/.env sudah sesuai.`);
    }
    return false;
  }
}

module.exports = {
  pool,
  koneksi: pool,
  DB_CONFIG,
  testConnection,
  pingDatabase,
  getDatabaseDiagnostics,
  withTransaction
};

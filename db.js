// config/db.js — MySQL connection pool for VayuSetu
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'FlightReservation_DbMs',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+05:30',          // IST — matches departure/arrival times
  multipleStatements: false              // security: no stacked queries
});

// Verify connectivity on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log(`✅  MySQL connected → ${process.env.DB_NAME || 'FlightReservation_DbMs'}`);
    conn.release();
  } catch (err) {
    console.error('❌  MySQL connection failed:', err.message);
    process.exit(1);
  }
})();

module.exports = pool;

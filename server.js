// server.js — VayuSetu Flight Reservation System — Main Entry Point
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

// Route modules
const { router: authRoutes } = require('./auth');
const flightRoutes   = require('./flights');
const bookingRoutes  = require('./bookings');
const userRoutes     = require('./users');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── MIDDLEWARE ────────────────────────────────────────────────

// Allow the frontend HTML file to call the API
// (works for both file:// opened HTML and a local dev server)
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse incoming JSON bodies
app.use(express.json());

// Rate limiting — prevent brute-force on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max:      20,                // max 20 requests per window per IP
  message:  { success: false, message: 'Too many requests. Please try again later.' }
});

// ─── ROUTES ───────────────────────────────────────────────────

app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/flights',  flightRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users',    userRoutes);

// Health check — useful for verifying the server is running
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'VayuSetu API is running', timestamp: new Date().toISOString() });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
});

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  VayuSetu API running on http://localhost:${PORT}`);
  console.log(`📋  API Base URL : http://localhost:${PORT}/api`);
  console.log(`💊  Health check : http://localhost:${PORT}/api/health\n`);
});

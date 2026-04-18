// routes/users.js — /api/users/*
const express     = require('express');
const pool        = require('./db');
const { requireAuth } = require('./auth');
const router      = express.Router();

// ─── GET /api/users/me ────────────────────────────────────────
// Returns the logged-in user's profile (used after page refresh to
// rehydrate the frontend state without re-login)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT
          u.user_id, u.full_name, u.email, u.phone, u.dob, u.gender,
          u.created_at,
          pc.category_id, pc.category_name, pc.discount_pct
       FROM users u
       JOIN passenger_categories pc ON u.category_id = pc.category_id
       WHERE u.user_id = ? AND u.is_active = TRUE`,
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch profile.' });
  }
});

module.exports = router;

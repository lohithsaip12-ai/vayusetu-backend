const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('./db');
const router   = express.Router();

// Helper: issue JWT
function signToken(user) {
  return jwt.sign(
    { userId: user.user_id, email: user.email, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Auth middleware
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { full_name, email, phone, password, dob, gender, category_id } = req.body;

  if (!full_name || !email || !phone || !password || !dob || !gender) {
    return res.status(400).json({ success: false, message: 'Please fill all required fields.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: 'Phone must be exactly 10 digits.' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, phone, password_hash, dob, gender, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        password_hash,
        dob,
        gender,
        category_id || 1
      ]
    );

    const [[newUser]] = await pool.execute(
      'SELECT user_id, full_name, email, phone, dob, gender, category_id FROM users WHERE user_id = ?',
      [result.insertId]
    );

    const token = signToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: newUser
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'This email is already registered.' });
    }

    if (err.code === 'ER_SIGNAL_EXCEPTION') {
      return res.status(400).json({ success: false, message: err.sqlMessage });
    }

    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const [[user]] = await pool.execute(
      `SELECT user_id, full_name, email, phone, dob, gender, category_id, password_hash, is_active
       FROM users WHERE email = ?`,
      [email.trim().toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'No account found with this email.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    const token = signToken(user);
    delete user.password_hash;
    delete user.is_active;

    return res.json({ success: true, message: 'Login successful!', token, user });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = {
  router,
  requireAuth
};
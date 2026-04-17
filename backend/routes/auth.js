const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./store');

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'CF';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function getUniqueReferralCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generateReferralCode();
    const { rows } = await pool.query('SELECT id FROM users WHERE referral_code = $1', [code]);
    exists = rows.length > 0;
  }
  return code;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, referralCode } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Username must be 3-50 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or username already in use' });
    }

    let referredBy = null;
    if (referralCode) {
      const refUser = await pool.query('SELECT id FROM users WHERE referral_code = $1', [referralCode.toUpperCase()]);
      if (refUser.rows.length > 0) {
        referredBy = referralCode.toUpperCase();
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const myReferralCode = await getUniqueReferralCode();

    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, wallet, total_earned,
       referral_code, referred_by, referral_earnings, first_deposit_done, subscription, created_at`,
      [username.toLowerCase(), email.toLowerCase(), passwordHash, myReferralCode, referredBy]
    );

    const user = rows[0];
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET || 'changeme',
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash, is_admin, wallet, total_earned,
       referral_code, referred_by, referral_earnings, first_deposit_done, subscription, created_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { password_hash, ...userProfile } = user;
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET || 'changeme',
      { expiresIn: '7d' }
    );

    res.json({ token, user: userProfile });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;

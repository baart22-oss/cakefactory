const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('./store');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'changeme');
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// GET /api/user/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, is_admin, wallet, total_earned, referral_code,
       referred_by, referral_earnings, first_deposit_done, subscription, created_at
       FROM users WHERE id = $1`,
      [req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// GET /api/user/banking
router.get('/banking', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM banking_details WHERE user_id = $1',
      [req.user.userId]
    );
    res.json({ banking: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load banking details' });
  }
});

// POST /api/user/banking
router.post('/banking', authMiddleware, async (req, res) => {
  try {
    const { accountHolder, bankName, accountNumber, branchCode, accountType } = req.body;
    if (!accountHolder || !bankName || !accountNumber || !branchCode || !accountType) {
      return res.status(400).json({ error: 'All banking fields are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO banking_details (user_id, account_holder, bank_name, account_number, branch_code, account_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         account_holder = EXCLUDED.account_holder,
         bank_name = EXCLUDED.bank_name,
         account_number = EXCLUDED.account_number,
         branch_code = EXCLUDED.branch_code,
         account_type = EXCLUDED.account_type,
         updated_at = NOW()
       RETURNING *`,
      [req.user.userId, accountHolder, bankName, accountNumber, branchCode, accountType]
    );
    res.json({ banking: rows[0], message: 'Banking details saved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save banking details' });
  }
});

// GET /api/user/transactions
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, tier, tier_name, amount, status, method, note, created_at, processed_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json({ transactions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// GET /api/user/referrals
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      'SELECT referral_code FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

    const { rows: referrals } = await pool.query(
      'SELECT username, created_at FROM users WHERE referred_by = $1',
      [userRows[0].referral_code]
    );
    res.json({ referrals, count: referrals.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load referrals' });
  }
});

module.exports = router;

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

// POST /api/deposit/initiate
router.post('/initiate', authMiddleware, async (req, res) => {
  try {
    const { tier, tierName, amount, proofData, proofName, proofType } = req.body;
    if (!tier || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Tier and valid amount are required' });
    }

    const { rows: userRows } = await pool.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRows[0];

    const { rows } = await pool.query(
      `INSERT INTO transactions
         (user_id, username, email, type, tier, tier_name, amount, status, method, proof_data, proof_name, proof_type)
       VALUES ($1, $2, $3, 'deposit', $4, $5, $6, 'pending', 'EFT', $7, $8, $9)
       RETURNING id, type, tier, tier_name, amount, status, created_at`,
      [
        user.id, user.username, user.email,
        tier, tierName || tier, parseFloat(amount),
        proofData || null, proofName || null, proofType || null
      ]
    );

    res.status(201).json({ transaction: rows[0], message: 'Deposit submitted. Awaiting admin verification.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit deposit' });
  }
});

module.exports = router;

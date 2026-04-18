const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('./store');

const WITHDRAWAL_FEE_RATE = 0.10;

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

// POST /api/withdrawal/request
router.post('/request', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Valid withdrawal amount is required' });
    }

    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      'SELECT id, username, email, wallet FROM users WHERE id = $1 FOR UPDATE',
      [req.user.userId]
    );
    if (userRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRows[0];
    if (parseFloat(user.wallet) < withdrawAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    const { rows: bankRows } = await client.query(
      'SELECT * FROM banking_details WHERE user_id = $1',
      [user.id]
    );
    if (bankRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Please save your banking details before withdrawing' });
    }

    const bank = bankRows[0];
    const accountSummary = `${bank.bank_name} | ${bank.account_holder} | ${bank.account_number}`;

    const fee = parseFloat((withdrawAmount * WITHDRAWAL_FEE_RATE).toFixed(2));
    const net = parseFloat((withdrawAmount - fee).toFixed(2));

    // Deduct from wallet immediately (hold)
    await client.query(
      'UPDATE users SET wallet = wallet - $1 WHERE id = $2',
      [withdrawAmount, user.id]
    );

    const { rows } = await client.query(
      `INSERT INTO withdrawals (user_id, username, email, amount, fee, net, method, account, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'EFT', $7, 'pending')
       RETURNING *`,
      [user.id, user.username, user.email, withdrawAmount, fee, net, accountSummary]
    );

    await client.query('COMMIT');
    res.status(201).json({
      withdrawal: rows[0],
      fee,
      net,
      message: `Withdrawal request submitted. A ${WITHDRAWAL_FEE_RATE * 100}% fee of ${fee.toFixed(2)} applies. You will receive R${net.toFixed(2)}. Processing within 1-3 business days.`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to submit withdrawal' });
  } finally {
    client.release();
  }
});

module.exports = router;

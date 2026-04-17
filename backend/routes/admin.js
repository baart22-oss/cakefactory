const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('./store');

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'changeme');
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign(
      { isAdmin: true, username },
      process.env.JWT_SECRET || 'changeme',
      { expiresIn: '8h' }
    );
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid admin credentials' });
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [users, pendingTx, pendingWd, totalDep] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query("SELECT COUNT(*) FROM transactions WHERE status = 'pending' AND type = 'deposit'"),
      pool.query("SELECT COUNT(*) FROM withdrawals WHERE status = 'pending'"),
      pool.query("SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE status = 'approved' AND type = 'deposit'")
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      pendingDeposits: parseInt(pendingTx.rows[0].count),
      pendingWithdrawals: parseInt(pendingWd.rows[0].count),
      totalDeposits: parseFloat(totalDep.rows[0].total)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/admin/transactions
router.get('/transactions', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT * FROM transactions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM transactions');
    res.json({ transactions: rows, total: parseInt(countRows[0].count), page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// POST /api/admin/verify-transaction
router.post('/verify-transaction', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { transactionId, action, note } = req.body;
    if (!transactionId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM transactions WHERE id = $1', [transactionId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = rows[0];
    if (tx.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transaction already processed' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await client.query(
      `UPDATE transactions SET status = $1, processed_at = NOW(), processed_by = $2, note = COALESCE($3, note)
       WHERE id = $4`,
      [newStatus, req.admin.username, note || null, transactionId]
    );

    if (action === 'approve' && tx.type === 'deposit') {
      // Credit wallet
      await client.query(
        'UPDATE users SET wallet = wallet + $1 WHERE id = $2',
        [tx.amount, tx.user_id]
      );

      // Referral bonuses on first deposit
      const { rows: userRows } = await client.query(
        'SELECT first_deposit_done, referred_by FROM users WHERE id = $1',
        [tx.user_id]
      );
      const user = userRows[0];

      if (user && !user.first_deposit_done) {
        const levels = [
          { pct: 0.10, level: 1 },
          { pct: 0.05, level: 2 },
          { pct: 0.02, level: 3 }
        ];
        let currentCode = user.referred_by;

        for (const { pct, level } of levels) {
          if (!currentCode) break;
          const { rows: refRows } = await client.query(
            'SELECT id, username, email, referred_by FROM users WHERE referral_code = $1',
            [currentCode]
          );
          if (refRows.length === 0) break;
          const refUser = refRows[0];
          const bonus = parseFloat((tx.amount * pct).toFixed(2));

          await client.query(
            'UPDATE users SET wallet = wallet + $1, referral_earnings = referral_earnings + $1 WHERE id = $2',
            [bonus, refUser.id]
          );

          await client.query(
            `INSERT INTO transactions (user_id, username, email, type, amount, status, note, source_tx_id, referral_level, referral_bonus_paid)
             VALUES ($1, $2, $3, 'referral_bonus', $4, 'approved', $5, $6, $7, true)`,
            [
              refUser.id, refUser.username, refUser.email,
              bonus,
              `Level ${level} referral bonus from ${tx.username}`,
              transactionId, level
            ]
          );

          currentCode = refUser.referred_by;
        }

        await client.query(
          'UPDATE users SET first_deposit_done = true WHERE id = $1',
          [tx.user_id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to process transaction' });
  } finally {
    client.release();
  }
});

// GET /api/admin/withdrawals
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT w.*, bd.bank_name, bd.account_number, bd.branch_code, bd.account_type, bd.account_holder
       FROM withdrawals w
       LEFT JOIN banking_details bd ON bd.user_id = w.user_id
       ORDER BY w.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM withdrawals');
    res.json({ withdrawals: rows, total: parseInt(countRows[0].count), page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load withdrawals' });
  }
});

// POST /api/admin/process-withdrawal
router.post('/process-withdrawal', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { withdrawalId, action, note } = req.body;
    if (!withdrawalId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM withdrawals WHERE id = $1', [withdrawalId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    const wd = rows[0];
    if (wd.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Withdrawal already processed' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await client.query(
      `UPDATE withdrawals SET status = $1, processed_at = NOW(), processed_by = $2
       WHERE id = $3`,
      [newStatus, req.admin.username, withdrawalId]
    );

    if (action === 'reject') {
      // Refund the held amount back to wallet
      await client.query(
        'UPDATE users SET wallet = wallet + $1 WHERE id = $2',
        [wd.amount, wd.user_id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  } finally {
    client.release();
  }
});

// GET /api/admin/users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, is_admin, wallet, total_earned, referral_code,
       referred_by, referral_earnings, first_deposit_done, subscription, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

module.exports = router;

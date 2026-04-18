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

// GET /api/game/items
router.get('/items', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM game_items ORDER BY category, price');
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load game items' });
  }
});

// POST /api/game/purchase-item
router.post('/purchase-item', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'Item ID required' });

    await client.query('BEGIN');

    const { rows: itemRows } = await client.query(
      'SELECT * FROM game_items WHERE id = $1',
      [itemId]
    );
    if (itemRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }
    const item = itemRows[0];

    const { rows: userRows } = await client.query(
      'SELECT wallet FROM users WHERE id = $1 FOR UPDATE',
      [req.user.userId]
    );
    const user = userRows[0];

    if (parseFloat(user.wallet) < parseFloat(item.price)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    await client.query(
      'UPDATE users SET wallet = wallet - $1 WHERE id = $2',
      [item.price, req.user.userId]
    );

    const { rows } = await client.query(
      'INSERT INTO cake_purchases (user_id, item_id, item_name, price) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.userId, item.id, item.name, item.price]
    );

    // Get updated wallet
    const { rows: updatedUser } = await client.query(
      'SELECT wallet FROM users WHERE id = $1',
      [req.user.userId]
    );

    await client.query('COMMIT');
    res.json({ purchase: rows[0], wallet: parseFloat(updatedUser[0].wallet) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to purchase item' });
  } finally {
    client.release();
  }
});

// POST /api/game/complete-cake
router.post('/complete-cake', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, cakeName } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item required to complete a cake' });
    }

    // Validate all item IDs exist
    const itemIds = items.map(i => i.id);
    const { rows: dbItems } = await client.query(
      'SELECT * FROM game_items WHERE id = ANY($1::int[])',
      [itemIds]
    );
    if (dbItems.length !== new Set(itemIds).size) {
      return res.status(400).json({ error: 'One or more items not found' });
    }

    const itemMap = {};
    dbItems.forEach(i => { itemMap[i.id] = i; });

    let totalCost = 0;
    const itemDetails = [];

    for (const reqItem of items) {
      const dbItem = itemMap[reqItem.id];
      if (!dbItem) continue;
      const qty = reqItem.quantity || 1;
      totalCost += parseFloat(dbItem.price) * qty;
      itemDetails.push({ id: dbItem.id, name: dbItem.name, emoji: dbItem.emoji, price: dbItem.price, quantity: qty });
    }

    await client.query('BEGIN');

    // Check if user has already earned today
    const { rows: todayCakes } = await client.query(
      `SELECT id FROM completed_cakes
       WHERE user_id = $1 AND earnings > 0 AND created_at >= CURRENT_DATE`,
      [req.user.userId]
    );
    const alreadyEarnedToday = todayCakes.length > 0;

    // Calculate earnings: 5% of total approved deposits (non-compounding), once per day
    let earnings = 0;
    if (!alreadyEarnedToday) {
      const { rows: depositRows } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_deposits
         FROM transactions WHERE user_id = $1 AND type = 'deposit' AND status = 'approved'`,
        [req.user.userId]
      );
      const totalDeposits = parseFloat(depositRows[0].total_deposits);
      earnings = parseFloat((totalDeposits * 0.05).toFixed(2));
    }

    const profit = parseFloat((earnings - totalCost).toFixed(2));

    const { rows: userRows } = await client.query(
      'SELECT wallet FROM users WHERE id = $1 FOR UPDATE',
      [req.user.userId]
    );
    if (parseFloat(userRows[0].wallet) < totalCost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient wallet balance for this cake' });
    }

    await client.query(
      'UPDATE users SET wallet = wallet - $1 + $2, total_earned = total_earned + $2 WHERE id = $3',
      [totalCost, earnings, req.user.userId]
    );

    const { rows } = await client.query(
      `INSERT INTO completed_cakes (user_id, cake_name, items, cost, earnings)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.userId, cakeName || 'My Cake', JSON.stringify(itemDetails), totalCost, earnings]
    );

    const { rows: updatedUser } = await client.query(
      'SELECT wallet, total_earned FROM users WHERE id = $1',
      [req.user.userId]
    );

    await client.query('COMMIT');
    res.json({
      cake: rows[0],
      totalCost,
      earnings,
      profit,
      wallet: parseFloat(updatedUser[0].wallet),
      totalEarned: parseFloat(updatedUser[0].total_earned),
      alreadyEarnedToday
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to complete cake' });
  } finally {
    client.release();
  }
});

// GET /api/game/history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM completed_cakes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.userId]
    );
    res.json({ cakes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load game history' });
  }
});

module.exports = router;

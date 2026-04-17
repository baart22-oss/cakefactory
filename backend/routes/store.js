const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.RENDER ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_admin BOOLEAN DEFAULT false,
      wallet DECIMAL(15,2) DEFAULT 0,
      total_earned DECIMAL(15,2) DEFAULT 0,
      referral_code VARCHAR(20) UNIQUE NOT NULL,
      referred_by VARCHAR(20),
      referral_earnings DECIMAL(15,2) DEFAULT 0,
      first_deposit_done BOOLEAN DEFAULT false,
      subscription JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username VARCHAR(50),
      email VARCHAR(255),
      type VARCHAR(20),
      tier VARCHAR(50),
      tier_name VARCHAR(100),
      amount DECIMAL(15,2),
      status VARCHAR(20) DEFAULT 'pending',
      method VARCHAR(50),
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      processed_by VARCHAR(50),
      proof_data TEXT,
      proof_name VARCHAR(255),
      proof_type VARCHAR(100),
      referral_bonus_paid BOOLEAN DEFAULT false,
      source_tx_id INTEGER,
      referral_level INTEGER
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username VARCHAR(50),
      email VARCHAR(255),
      amount DECIMAL(15,2),
      fee DECIMAL(15,2) DEFAULT 0,
      net DECIMAL(15,2),
      method VARCHAR(50),
      account TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      processed_by VARCHAR(50)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS banking_details (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) UNIQUE,
      account_holder VARCHAR(255),
      bank_name VARCHAR(100),
      account_number VARCHAR(50),
      branch_code VARCHAR(20),
      account_type VARCHAR(30),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      description TEXT,
      emoji VARCHAR(10),
      roi_multiplier DECIMAL(5,2) DEFAULT 1.0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cake_purchases (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      item_id INTEGER REFERENCES game_items(id),
      item_name VARCHAR(100),
      price DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS completed_cakes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      cake_name VARCHAR(100),
      items JSONB,
      cost DECIMAL(10,2),
      earnings DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM game_items');
  if (parseInt(rows[0].count) === 0) {
    const items = [
      ['Vanilla Sponge', 'layer', 5.00, 'Classic vanilla cake layer', '🍰', 1.2],
      ['Chocolate Fudge', 'layer', 8.00, 'Rich chocolate layer', '🍫', 1.3],
      ['Red Velvet', 'layer', 10.00, 'Luxurious red velvet layer', '❤️', 1.4],
      ['Lemon Drizzle', 'layer', 7.00, 'Zesty lemon layer', '🍋', 1.25],
      ['Carrot Cake', 'layer', 9.00, 'Spiced carrot cake layer', '🥕', 1.35],
      ['Vanilla Buttercream', 'frosting', 3.00, 'Smooth vanilla frosting', '🤍', 1.1],
      ['Chocolate Ganache', 'frosting', 5.00, 'Rich chocolate ganache', '🍫', 1.2],
      ['Cream Cheese', 'frosting', 4.00, 'Tangy cream cheese frosting', '🧀', 1.15],
      ['Strawberry Buttercream', 'frosting', 4.00, 'Sweet strawberry frosting', '🍓', 1.15],
      ['Fresh Strawberries', 'topping', 3.00, 'Fresh strawberry garnish', '🍓', 1.1],
      ['Chocolate Shavings', 'topping', 2.00, 'Dark chocolate shavings', '🍫', 1.05],
      ['Rainbow Sprinkles', 'topping', 1.50, 'Colorful sprinkles', '🌈', 1.05],
      ['Macarons', 'topping', 6.00, 'French macarons on top', '🍬', 1.25],
      ['Fresh Flowers', 'topping', 4.00, 'Edible flowers', '🌸', 1.2],
      ['Gold Leaf', 'decoration', 15.00, 'Luxury gold leaf decoration', '✨', 1.5],
      ['Fondant Figurines', 'decoration', 12.00, 'Custom fondant decorations', '🎭', 1.45],
      ['Candles', 'decoration', 2.00, 'Birthday candles', '🕯️', 1.05],
      ['Edible Glitter', 'decoration', 5.00, 'Sparkling edible glitter', '💫', 1.2],
      ['Tiered Stand', 'special', 20.00, 'Multi-tier presentation stand', '🎂', 1.6],
      ['Custom Message', 'special', 8.00, 'Personalized cake message', '💌', 1.3],
    ];
    for (const [name, category, price, description, emoji, roi] of items) {
      await pool.query(
        'INSERT INTO game_items (name, category, price, description, emoji, roi_multiplier) VALUES ($1,$2,$3,$4,$5,$6)',
        [name, category, price, description, emoji, roi]
      );
    }
    console.log('Game items seeded');
  }

  console.log('Database initialized');
}

module.exports = { pool, initDB };

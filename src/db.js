const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'marketplace',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'marketplace',
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  close: () => pool.end(),
};

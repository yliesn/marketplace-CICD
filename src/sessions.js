const crypto = require('crypto');
const db = require('./db');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Seul le hash du jeton est stocké : une fuite de la base ne permet pas de voler une session.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function create(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS)]
  );
  return token;
}

async function findUser(token) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function destroy(token) {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

async function purgeExpired() {
  await db.query('DELETE FROM sessions WHERE expires_at <= NOW()');
}

module.exports = { SESSION_TTL_MS, create, findUser, destroy, purgeExpired };

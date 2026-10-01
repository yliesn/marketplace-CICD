const db = require('./db');
const { hashPassword } = require('./auth');

// init.sql ne s'exécute que sur un volume vide : cette migration idempotente met à jour
// les bases existantes. Le verrou évite que deux replicas la jouent en même temps
// (les instructions d'une même requête s'exécutent dans une seule transaction).
const SCHEMA = `
  SELECT pg_advisory_xact_lock(727001);

  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64)    PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  );

  ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS categories (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(40) NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS badges (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(40) NOT NULL UNIQUE,
    style VARCHAR(10) NOT NULL DEFAULT 'accent' CHECK (style IN ('accent', 'cream'))
  );

  ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS article_badges (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    badge_id   INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, badge_id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id INTEGER     NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, article_id)
  );

  -- Valeurs de départ, uniquement si la table est vide : les administrateurs gèrent la suite.
  INSERT INTO categories (name)
    SELECT name FROM (VALUES ('Figurines'), ('Jeux vidéo'), ('Cartes'), ('Affiches')) AS seed(name)
    WHERE NOT EXISTS (SELECT 1 FROM categories);

  INSERT INTO badges (name, style)
    SELECT name, style FROM (VALUES ('Rare', 'accent'), ('Vintage', 'cream')) AS seed(name, style)
    WHERE NOT EXISTS (SELECT 1 FROM badges);
`;

// Crée le compte administrateur (ou le met à jour) à partir de l'environnement.
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  await db.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
    [email, await hashPassword(password)]
  );
}

async function migrate() {
  await db.query(SCHEMA);
  await ensureAdmin();
}

module.exports = migrate;

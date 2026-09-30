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

CREATE TABLE IF NOT EXISTS articles (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255)   NOT NULL,
  description TEXT           NOT NULL DEFAULT '',
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  user_id     INTEGER        REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS article_images (
  article_id   INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL,
  data         BYTEA       NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO articles (title, description, price) VALUES
  ('Clavier mécanique', 'Clavier en très bon état', 45.00),
  ('Écran 24 pouces', 'Écran Full HD', 90.00);

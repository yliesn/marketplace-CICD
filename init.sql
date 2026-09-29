CREATE TABLE IF NOT EXISTS articles (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255)   NOT NULL,
  description TEXT           NOT NULL DEFAULT '',
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

INSERT INTO articles (title, description, price) VALUES
  ('Clavier mécanique', 'Clavier en très bon état', 45.00),
  ('Écran 24 pouces', 'Écran Full HD', 90.00);

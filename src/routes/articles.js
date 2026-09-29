const express = require('express');
const db = require('../db');

const router = express.Router();

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateArticle(body) {
  const errors = [];
  const { title, description, price } = body || {};

  if (typeof title !== 'string' || title.trim() === '') {
    errors.push('title est obligatoire');
  } else if (title.trim().length > 255) {
    errors.push('title ne doit pas dépasser 255 caractères');
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description doit être une chaîne de caractères');
  }

  const priceNumber = typeof price === 'string' && price.trim() !== '' ? Number(price) : price;
  if (typeof priceNumber !== 'number' || !Number.isFinite(priceNumber) || priceNumber < 0) {
    errors.push('price doit être un nombre positif');
  } else if (priceNumber >= 1e8) {
    errors.push('price est trop élevé');
  }

  return {
    errors,
    article: {
      title: typeof title === 'string' ? title.trim() : title,
      description: typeof description === 'string' ? description.trim() : '',
      price: priceNumber,
    },
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, title, description, price, created_at FROM articles ORDER BY created_at DESC, id DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  try {
    const { rows } = await db.query(
      'SELECT id, title, description, price, created_at FROM articles WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { errors, article } = validateArticle(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  try {
    const { rows } = await db.query(
      'INSERT INTO articles (title, description, price) VALUES ($1, $2, $3) RETURNING id, title, description, price, created_at',
      [article.title, article.description, article.price]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  try {
    const { rowCount } = await db.query('DELETE FROM articles WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Article introuvable' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

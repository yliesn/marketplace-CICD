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

const SORTS = {
  recent: 'created_at DESC, id DESC',
  'price-asc': 'price ASC, id DESC',
  'price-desc': 'price DESC, id DESC',
};
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseListQuery(query) {
  const errors = [];
  const filters = {};

  const optionalNumber = (name) => {
    const raw = query[name];
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${name} doit être un nombre positif`);
      return undefined;
    }
    return value;
  };

  const optionalInt = (name, min, max, fallback) => {
    const raw = query[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push(`${name} doit être un entier entre ${min} et ${max}`);
      return fallback;
    }
    return value;
  };

  if (query.q !== undefined && typeof query.q !== 'string') {
    errors.push('q doit être une chaîne de caractères');
  } else if (typeof query.q === 'string' && query.q.trim() !== '') {
    filters.q = query.q.trim().slice(0, 100);
  }

  filters.minPrice = optionalNumber('min_price');
  filters.maxPrice = optionalNumber('max_price');
  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    errors.push('min_price doit être inférieur ou égal à max_price');
  }

  const sort = query.sort === undefined || query.sort === '' ? 'recent' : query.sort;
  if (!Object.hasOwn(SORTS, sort)) {
    errors.push(`sort doit valoir ${Object.keys(SORTS).join(', ')}`);
  }
  filters.sort = Object.hasOwn(SORTS, sort) ? sort : 'recent';

  filters.page = optionalInt('page', 1, 100000, 1);
  filters.limit = optionalInt('limit', 1, MAX_LIMIT, DEFAULT_LIMIT);

  return { errors, filters };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

router.get('/', async (req, res, next) => {
  const { errors, filters } = parseListQuery(req.query);
  if (errors.length > 0) return res.status(400).json({ errors });

  const where = [];
  const params = [];

  if (filters.q) {
    params.push(`%${escapeLike(filters.q)}%`);
    where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }
  if (filters.minPrice !== undefined) {
    params.push(filters.minPrice);
    where.push(`price >= $${params.length}`);
  }
  if (filters.maxPrice !== undefined) {
    params.push(filters.maxPrice);
    where.push(`price <= $${params.length}`);
  }

  params.push(filters.limit, (filters.page - 1) * filters.limit);

  const sql = `
    SELECT id, title, description, price, created_at, COUNT(*) OVER() AS total_count
    FROM articles
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${SORTS[filters.sort]}
    LIMIT $${params.length - 1} OFFSET $${params.length}`;

  try {
    const { rows } = await db.query(sql, params);

    let total = rows.length ? Number(rows[0].total_count) : 0;
    if (!rows.length && filters.page > 1) {
      // Page hors limites : on récupère quand même le total pour la pagination.
      const countSql = `SELECT COUNT(*) AS total FROM articles ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
      const count = await db.query(countSql, params.slice(0, -2));
      total = Number(count.rows[0].total);
    }

    res.set({
      'X-Total-Count': String(total),
      'X-Page': String(filters.page),
      'X-Per-Page': String(filters.limit),
      'X-Total-Pages': String(Math.max(1, Math.ceil(total / filters.limit))),
      'Access-Control-Expose-Headers': 'X-Total-Count, X-Page, X-Per-Page, X-Total-Pages',
    });
    res.json(rows.map(({ total_count, ...article }) => article));
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

router.put('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  const { errors, article } = validateArticle(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  try {
    const { rows } = await db.query(
      'UPDATE articles SET title = $1, description = $2, price = $3 WHERE id = $4 RETURNING id, title, description, price, created_at',
      [article.title, article.description, article.price, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });
    res.json(rows[0]);
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

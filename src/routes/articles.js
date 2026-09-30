const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Vérifie que l'article existe et que l'utilisateur peut le modifier (son auteur ou un admin).
// Répond 404 ou 403 et retourne false sinon.
async function checkOwner(id, user, res) {
  const { rows } = await db.query('SELECT user_id FROM articles WHERE id = $1', [id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Article introuvable' });
    return false;
  }
  if (user.role !== 'admin' && rows[0].user_id !== user.id) {
    res.status(403).json({ error: 'Action non autorisée' });
    return false;
  }
  return true;
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

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const imageBody = express.raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_SIZE });

// Vérifie que le contenu correspond bien au type annoncé (signature du fichier).
function matchesImageType(buffer, type) {
  const startsWith = (bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);
  switch (type) {
    case 'image/jpeg': return startsWith([0xff, 0xd8, 0xff]);
    case 'image/png': return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp': return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
    default: return false;
  }
}

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

  // Annonces d'un vendeur donné (page profil, « du même vendeur »).
  filters.userId = optionalInt('user_id', 1, 2147483647, undefined);

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
  if (filters.userId !== undefined) {
    params.push(filters.userId);
    where.push(`user_id = $${params.length}`);
  }

  params.push(filters.limit, (filters.page - 1) * filters.limit);

  const sql = `
    SELECT id, title, description, price, created_at, user_id, i.updated_at AS image_updated_at,
           COUNT(*) OVER() AS total_count
    FROM articles
    LEFT JOIN article_images i ON i.article_id = articles.id
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
      // Le vendeur reste anonyme : on n'expose que son ancienneté et son nombre d'annonces.
      `SELECT id, title, description, price, created_at, user_id, i.updated_at AS image_updated_at,
              (SELECT users.created_at FROM users WHERE users.id = articles.user_id) AS seller_since,
              (SELECT COUNT(*)::int FROM articles others WHERE others.user_id = articles.user_id) AS seller_count
       FROM articles
       LEFT JOIN article_images i ON i.article_id = articles.id
       WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/image', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  try {
    const { rows } = await db.query(
      'SELECT content_type, data FROM article_images WHERE article_id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Image introuvable' });
    res.set({
      'Content-Type': rows[0].content_type,
      // L'interface ajoute ?v=<date de modification> : l'URL change quand l'image change.
      'Cache-Control': req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(rows[0].data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/image', requireAuth, imageBody, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  const type = req.is(IMAGE_TYPES);
  if (!type || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(415).json({ error: 'Image attendue (JPEG, PNG ou WebP)' });
  }
  if (!matchesImageType(req.body, type)) {
    return res.status(400).json({ error: `Le fichier n'est pas une image ${type} valide` });
  }

  try {
    if (!(await checkOwner(id, req.user, res))) return;

    const { rows } = await db.query(
      `INSERT INTO article_images (article_id, content_type, data) VALUES ($1, $2, $3)
       ON CONFLICT (article_id) DO UPDATE
         SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = NOW()
       RETURNING updated_at AS image_updated_at`,
      [id, type, req.body]
    );
    res.json(rows[0]);
  } catch (err) {
    // Violation de clé étrangère : l'article a été supprimé entre-temps.
    if (err.code === '23503') return res.status(404).json({ error: 'Article introuvable' });
    next(err);
  }
});

router.delete('/:id/image', requireAuth, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  try {
    if (!(await checkOwner(id, req.user, res))) return;

    const { rowCount } = await db.query('DELETE FROM article_images WHERE article_id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Image introuvable' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  const { errors, article } = validateArticle(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  try {
    const { rows } = await db.query(
      'INSERT INTO articles (title, description, price, user_id) VALUES ($1, $2, $3, $4) RETURNING id, title, description, price, created_at, user_id',
      [article.title, article.description, article.price, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  const { errors, article } = validateArticle(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  try {
    if (!(await checkOwner(id, req.user, res))) return;

    const { rows } = await db.query(
      'UPDATE articles SET title = $1, description = $2, price = $3 WHERE id = $4 RETURNING id, title, description, price, created_at, user_id',
      [article.title, article.description, article.price, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  try {
    if (!(await checkOwner(id, req.user, res))) return;

    const { rowCount } = await db.query('DELETE FROM articles WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Article introuvable' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

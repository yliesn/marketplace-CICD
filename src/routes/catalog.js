const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');
const { parseId } = require('../params');

const MAX_NAME = 40;
const BADGE_STYLES = ['accent', 'cream'];

function validateName(body, errors) {
  const { name } = body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    errors.push('name est obligatoire');
  } else if (name.trim().length > MAX_NAME) {
    errors.push(`name ne doit pas dépasser ${MAX_NAME} caractères`);
  }
  return typeof name === 'string' ? name.trim() : name;
}

function validateCategory(body) {
  const errors = [];
  return { errors, values: { name: validateName(body, errors) } };
}

function validateBadge(body) {
  const errors = [];
  const name = validateName(body, errors);
  const style = (body || {}).style === undefined ? 'accent' : body.style;
  if (!BADGE_STYLES.includes(style)) errors.push(`style doit valoir ${BADGE_STYLES.join(' ou ')}`);
  return { errors, values: { name, style } };
}

// Catégories et badges se gèrent de la même façon : la liste est publique,
// la création et la suppression sont réservées aux administrateurs.
function catalogRouter({ table, validate, duplicate, missing }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY name`);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAdmin, async (req, res, next) => {
    const { errors, values } = validate(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const columns = Object.keys(values);
    try {
      const { rows } = await db.query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        Object.values(values)
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      // Violation de contrainte d'unicité : le nom est déjà pris.
      if (err.code === '23505') return res.status(409).json({ error: duplicate });
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, async (req, res, next) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalide' });

    try {
      const { rowCount } = await db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      if (rowCount === 0) return res.status(404).json({ error: missing });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = {
  categories: catalogRouter({
    table: 'categories',
    validate: validateCategory,
    duplicate: 'Cette catégorie existe déjà',
    missing: 'Catégorie introuvable',
  }),
  badges: catalogRouter({
    table: 'badges',
    validate: validateBadge,
    duplicate: 'Ce badge existe déjà',
    missing: 'Badge introuvable',
  }),
};

const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');
const { parseId } = require('../params');

const router = express.Router();

const ROLES = ['user', 'admin'];

router.use(requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, email, role, created_at FROM users ORDER BY created_at, id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Un administrateur peut en nommer d'autres (ou leur retirer ce rôle), mais pas changer le sien :
// il reste ainsi toujours au moins un administrateur.
router.put('/users/:id/role', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ errors: [`role doit valoir ${ROLES.join(' ou ')}`] });
  if (id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });

  try {
    const { rows } = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at',
      [role, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

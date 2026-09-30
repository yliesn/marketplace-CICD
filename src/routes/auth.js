const express = require('express');
const db = require('../db');
const sessions = require('../sessions');
const { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie, requireAuth } = require('../auth');

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateCredentials(body) {
  const errors = [];
  const { password } = body || {};
  const email = normalizeEmail((body || {}).email);

  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    errors.push('email doit être une adresse valide');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    errors.push(`password doit contenir entre ${MIN_PASSWORD} et ${MAX_PASSWORD} caractères`);
  }

  return { errors, email, password };
}

// Hash factice : la vérification prend le même temps que l'email existe ou non.
const dummyHash = hashPassword('mot-de-passe-factice');

async function openSession(req, res, user) {
  const token = await sessions.create(user.id);
  setSessionCookie(req, res, token);
}

router.post('/register', async (req, res, next) => {
  const { errors, email, password } = validateCredentials(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  try {
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role, created_at',
      [email, await hashPassword(password)]
    );
    await openSession(req, res, rows[0]);
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    // Violation de contrainte d'unicité : l'email est déjà utilisé.
    if (err.code === '23505') return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  const email = normalizeEmail((req.body || {}).email);
  const { password } = req.body || {};
  if (!email || typeof password !== 'string' || password === '' || password.length > MAX_PASSWORD) {
    return res.status(400).json({ errors: ['email et password sont obligatoires'] });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, email, role, created_at, password_hash FROM users WHERE email = $1',
      [email]
    );
    const valid = await verifyPassword(password, rows.length ? rows[0].password_hash : await dummyHash);
    if (rows.length === 0 || !valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const { password_hash, ...user } = rows[0];
    await openSession(req, res, user);
    sessions.purgeExpired().catch(() => {});
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    if (req.sessionToken) await sessions.destroy(req.sessionToken);
    clearSessionCookie(req, res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Changement de mot de passe : l'ancien est exigé, et les autres sessions sont fermées.
router.post('/password', requireAuth, async (req, res, next) => {
  const { current_password: currentPassword, new_password: newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || currentPassword === '' || currentPassword.length > MAX_PASSWORD) {
    return res.status(400).json({ errors: ['current_password est obligatoire'] });
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
    return res.status(400).json({ errors: [`new_password doit contenir entre ${MIN_PASSWORD} et ${MAX_PASSWORD} caractères`] });
  }

  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0 || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
    }

    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), req.user.id]);
    await sessions.destroyOthers(req.user.id, req.sessionToken);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ user: req.user || null });
});

module.exports = router;

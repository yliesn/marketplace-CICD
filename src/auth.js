const crypto = require('crypto');
const { promisify } = require('util');
const sessions = require('./sessions');

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = 'sid';
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function cookieOptions(req) {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' };
}

function setSessionCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: sessions.SESSION_TTL_MS });
}

function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions(req));
}

// Renseigne req.user si la requête porte une session valide. Sans cookie, la base n'est pas interrogée.
async function loadUser(req, res, next) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return next();

  try {
    req.sessionToken = token;
    req.user = await sessions.findUser(token);
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  loadUser,
  requireAuth,
};

const request = require('supertest');

jest.mock('../src/db', () => ({
  query: jest.fn(),
  close: jest.fn(),
}));

const db = require('../src/db');
const app = require('../src/server');
const sessions = require('../src/sessions');
const { hashPassword, verifyPassword } = require('../src/auth');

const account = { id: 7, email: 'vendeur@example.com', role: 'user' };
const credentials = { email: 'vendeur@example.com', password: 'motdepasse123' };

// Retrouve le cookie de session posé par la réponse.
function sessionCookie(res) {
  return (res.headers['set-cookie'] || []).find((cookie) => cookie.startsWith('sid='));
}

beforeEach(() => {
  db.query.mockReset();
});

describe('mots de passe', () => {
  it('vérifie un mot de passe haché', async () => {
    const hash = await hashPassword('motdepasse123');
    expect(hash).not.toContain('motdepasse123');
    expect(await verifyPassword('motdepasse123', hash)).toBe(true);
    expect(await verifyPassword('autre-mot-de-passe', hash)).toBe(false);
  });

  it('utilise un sel différent à chaque hachage', async () => {
    expect(await hashPassword('motdepasse123')).not.toBe(await hashPassword('motdepasse123'));
  });

  it('refuse un hash mal formé', async () => {
    expect(await verifyPassword('motdepasse123', 'pas-un-hash')).toBe(false);
  });
});

describe('sessions', () => {
  it('ne stocke que le hash du jeton', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const token = await sessions.create(7);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO sessions/);
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(params[0]).not.toBe(token);
    expect(params[1]).toBe(7);
  });

  it("ignore les sessions expirées lors de la recherche de l'utilisateur", async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await sessions.findUser('jeton')).toBeNull();
    expect(db.query.mock.calls[0][0]).toMatch(/expires_at > NOW\(\)/);
  });
});

describe('POST /api/auth/register', () => {
  it('crée un compte et ouvre une session', async () => {
    db.query.mockResolvedValueOnce({ rows: [account] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: '  Vendeur@Example.com ', password: 'motdepasse123' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ user: account });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO users/);
    expect(params[0]).toBe('vendeur@example.com');
    expect(await verifyPassword('motdepasse123', params[1])).toBe(true);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('refuse un email déjà utilisé', async () => {
    db.query.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(409);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it.each([
    ['sans email', { password: 'motdepasse123' }],
    ['email invalide', { email: 'pas-un-email', password: 'motdepasse123' }],
    ['sans mot de passe', { email: 'vendeur@example.com' }],
    ['mot de passe trop court', { email: 'vendeur@example.com', password: 'court' }],
    ['mot de passe non textuel', { email: 'vendeur@example.com', password: 12345678 }],
  ])('refuse une inscription invalide (%s)', async (_, body) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("ne permet pas de choisir son rôle à l'inscription", async () => {
    db.query.mockResolvedValueOnce({ rows: [account] }).mockResolvedValueOnce({ rows: [] });
    await request(app).post('/api/auth/register').send({ ...credentials, role: 'admin' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/role\s*[,)]\s*VALUES/);
    expect(params).toHaveLength(2);
  });
});

describe('POST /api/auth/login', () => {
  it('connecte un utilisateur', async () => {
    const password_hash = await hashPassword(credentials.password);
    db.query
      .mockResolvedValueOnce({ rows: [{ ...account, password_hash }] })
      .mockResolvedValue({ rows: [] });

    const res = await request(app).post('/api/auth/login').send(credentials);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: account });
    expect(sessionCookie(res)).toMatch(/HttpOnly/);
  });

  it('refuse un mauvais mot de passe', async () => {
    const password_hash = await hashPassword('un-autre-mot-de-passe');
    db.query.mockResolvedValue({ rows: [{ ...account, password_hash }] });

    const res = await request(app).post('/api/auth/login').send(credentials);

    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('répond de la même façon pour un email inconnu', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/auth/login').send(credentials);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email ou mot de passe incorrect' });
  });

  it('refuse une requête incomplète', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'vendeur@example.com' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/me', () => {
  it("retourne l'utilisateur connecté", async () => {
    db.query.mockResolvedValue({ rows: [account] });
    const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=jeton');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: account });
  });

  it('retourne null sans session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('retourne null pour une session inconnue', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/auth/me').set('Cookie', 'autre=1; sid=jeton-inconnu');
    expect(res.body).toEqual({ user: null });
  });
});

describe('POST /api/auth/logout', () => {
  it('supprime la session et le cookie', async () => {
    db.query.mockResolvedValue({ rows: [account] });
    const res = await request(app).post('/api/auth/logout').set('Cookie', 'sid=jeton');

    expect(res.status).toBe(204);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM sessions'), expect.any(Array));
    expect(sessionCookie(res)).toMatch(/^sid=;/);
  });

  it('répond 204 même sans session', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/password', () => {
  const change = (body) => request(app).post('/api/auth/password').set('Cookie', 'sid=jeton').send(body);

  it('change le mot de passe et ferme les autres sessions', async () => {
    const password_hash = await hashPassword('ancien-mot-de-passe');
    db.query
      .mockResolvedValueOnce({ rows: [account] }) // session
      .mockResolvedValueOnce({ rows: [{ password_hash }] })
      .mockResolvedValue({ rows: [] });

    const res = await change({ current_password: 'ancien-mot-de-passe', new_password: 'nouveau-mot-de-passe' });

    expect(res.status).toBe(204);
    const [updateSql, updateParams] = db.query.mock.calls[2];
    expect(updateSql).toMatch(/UPDATE users SET password_hash/);
    expect(await verifyPassword('nouveau-mot-de-passe', updateParams[0])).toBe(true);
    expect(updateParams[1]).toBe(account.id);

    const [deleteSql, deleteParams] = db.query.mock.calls[3];
    expect(deleteSql).toMatch(/DELETE FROM sessions WHERE user_id = \$1 AND token_hash <> \$2/);
    expect(deleteParams[0]).toBe(account.id);
  });

  it("refuse si l'ancien mot de passe est incorrect", async () => {
    const password_hash = await hashPassword('ancien-mot-de-passe');
    db.query.mockResolvedValueOnce({ rows: [account] }).mockResolvedValueOnce({ rows: [{ password_hash }] });

    const res = await change({ current_password: 'mauvais', new_password: 'nouveau-mot-de-passe' });

    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['sans ancien mot de passe', { new_password: 'nouveau-mot-de-passe' }],
    ['nouveau mot de passe trop court', { current_password: 'ancien-mot-de-passe', new_password: 'court' }],
  ])('refuse une demande invalide (%s)', async (_, body) => {
    db.query.mockResolvedValueOnce({ rows: [account] });
    const res = await change(body);
    expect(res.status).toBe(400);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await request(app).post('/api/auth/password').send({ current_password: 'a', new_password: 'nouveau-mot-de-passe' });
    expect(res.status).toBe(401);
  });
});

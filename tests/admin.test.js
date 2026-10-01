const request = require('supertest');

jest.mock('../src/db', () => ({
  query: jest.fn(),
  close: jest.fn(),
}));

jest.mock('../src/sessions', () => ({
  SESSION_TTL_MS: 1000,
  create: jest.fn(),
  findUser: jest.fn(),
  destroy: jest.fn(),
  destroyOthers: jest.fn(),
  purgeExpired: jest.fn(),
}));

const db = require('../src/db');
const sessions = require('../src/sessions');
const app = require('../src/server');

const COOKIE = 'sid=jeton-de-test';
const admin = { id: 1, email: 'admin@example.com', role: 'admin' };
const member = { id: 7, email: 'vendeur@example.com', role: 'user' };

beforeEach(() => {
  db.query.mockReset();
  sessions.findUser.mockReset().mockResolvedValue(admin);
});

describe.each([
  ['categories', { name: '  Jeux vidéo ' }, ['Jeux vidéo']],
  ['badges', { name: 'Rare', style: 'accent' }, ['Rare', 'accent']],
])('/api/%s', (resource, body, insertParams) => {
  it('liste les éléments sans être connecté', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, name: 'A' }] });
    const res = await request(app).get(`/api/${resource}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'A' }]);
  });

  it('crée un élément (administrateur)', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 5 }] });
    const res = await request(app).post(`/api/${resource}`).set('Cookie', COOKIE).send(body);
    expect(res.status).toBe(201);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining(`INSERT INTO ${resource}`), insertParams);
  });

  it('refuse un nom déjà utilisé', async () => {
    db.query.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const res = await request(app).post(`/api/${resource}`).set('Cookie', COOKIE).send(body);
    expect(res.status).toBe(409);
  });

  it('refuse un nom vide', async () => {
    const res = await request(app).post(`/api/${resource}`).set('Cookie', COOKIE).send({ ...body, name: ' ' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse la création à un utilisateur non administrateur', async () => {
    sessions.findUser.mockResolvedValue(member);
    const res = await request(app).post(`/api/${resource}`).set('Cookie', COOKIE).send(body);
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse la création sans être connecté', async () => {
    const res = await request(app).post(`/api/${resource}`).send(body);
    expect(res.status).toBe(401);
  });

  it('supprime un élément (administrateur)', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).delete(`/api/${resource}/5`).set('Cookie', COOKIE);
    expect(res.status).toBe(204);
  });

  it("retourne 404 si l'élément n'existe pas", async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).delete(`/api/${resource}/5`).set('Cookie', COOKIE);
    expect(res.status).toBe(404);
  });

  it('refuse la suppression à un utilisateur non administrateur', async () => {
    sessions.findUser.mockResolvedValue(member);
    const res = await request(app).delete(`/api/${resource}/5`).set('Cookie', COOKIE);
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

it('refuse un style de badge inconnu', async () => {
  const res = await request(app).post('/api/badges').set('Cookie', COOKIE).send({ name: 'Neuf', style: 'rose' });
  expect(res.status).toBe(400);
});

describe('/api/admin/users', () => {
  it('liste les utilisateurs', async () => {
    db.query.mockResolvedValue({ rows: [admin, member] });
    const res = await request(app).get('/api/admin/users').set('Cookie', COOKIE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([admin, member]);
  });

  it('nomme un autre administrateur', async () => {
    db.query.mockResolvedValue({ rows: [{ ...member, role: 'admin' }] });
    const res = await request(app).put('/api/admin/users/7/role').set('Cookie', COOKIE).send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET role'), ['admin', 7]);
  });

  it('refuse de modifier son propre rôle', async () => {
    const res = await request(app).put('/api/admin/users/1/role').set('Cookie', COOKIE).send({ role: 'user' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse un rôle inconnu', async () => {
    const res = await request(app).put('/api/admin/users/7/role').set('Cookie', COOKIE).send({ role: 'root' });
    expect(res.status).toBe(400);
  });

  it("retourne 404 si l'utilisateur n'existe pas", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).put('/api/admin/users/99/role').set('Cookie', COOKIE).send({ role: 'admin' });
    expect(res.status).toBe(404);
  });

  it('est réservé aux administrateurs', async () => {
    sessions.findUser.mockResolvedValue(member);
    const list = await request(app).get('/api/admin/users').set('Cookie', COOKIE);
    const promote = await request(app).put('/api/admin/users/7/role').set('Cookie', COOKIE).send({ role: 'admin' });
    expect(list.status).toBe(403);
    expect(promote.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

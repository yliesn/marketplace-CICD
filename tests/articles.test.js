const request = require('supertest');

jest.mock('../src/db', () => ({
  query: jest.fn(),
  close: jest.fn(),
}));

const db = require('../src/db');
const app = require('../src/server');

const sample = {
  id: 1,
  title: 'Clavier mécanique',
  description: 'Clavier en très bon état',
  price: '45.00',
  created_at: '2026-09-29T10:00:00.000Z',
};

beforeEach(() => {
  db.query.mockReset();
});

describe('GET /health', () => {
  it('retourne status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /', () => {
  it("sert l'interface web", async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /api/articles', () => {
  it('retourne la liste des articles', async () => {
    db.query.mockResolvedValue({ rows: [sample] });
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sample]);
  });

  it('retourne 500 si la base est indisponible', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('GET /api/articles/:id', () => {
  it('retourne un article', async () => {
    db.query.mockResolvedValue({ rows: [sample] });
    const res = await request(app).get('/api/articles/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sample);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [1]);
  });

  it("retourne 404 si l'article n'existe pas", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/articles/999');
    expect(res.status).toBe(404);
  });

  it('retourne 400 pour un id invalide', async () => {
    const res = await request(app).get('/api/articles/abc');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/articles', () => {
  it('crée un article', async () => {
    const created = { ...sample, id: 3, title: 'Souris sans fil', description: 'Souris Logitech', price: '25.00' };
    db.query.mockResolvedValue({ rows: [created] });

    const res = await request(app)
      .post('/api/articles')
      .send({ title: '  Souris sans fil ', description: 'Souris Logitech', price: 25 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      ['Souris sans fil', 'Souris Logitech', 25]
    );
  });

  it.each([
    ['sans titre', { price: 10 }],
    ['titre vide', { title: '   ', price: 10 }],
    ['sans prix', { title: 'Objet' }],
    ['prix négatif', { title: 'Objet', price: -5 }],
    ['prix non numérique', { title: 'Objet', price: 'abc' }],
  ])('refuse un article invalide (%s)', async (_, body) => {
    const res = await request(app).post('/api/articles').send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse un JSON mal formé', async () => {
    const res = await request(app)
      .post('/api/articles')
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/articles/:id', () => {
  it('supprime un article', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).delete('/api/articles/3');
    expect(res.status).toBe(204);
  });

  it("retourne 404 si l'article n'existe pas", async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).delete('/api/articles/999');
    expect(res.status).toBe(404);
  });
});

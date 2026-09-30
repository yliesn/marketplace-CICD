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
    db.query.mockResolvedValue({ rows: [{ ...sample, total_count: '1' }] });
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sample]);
    expect(res.headers['x-total-count']).toBe('1');
    expect(res.headers['x-total-pages']).toBe('1');
  });

  it('applique les valeurs par défaut (tri récent, page 1, 20 par page)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/articles');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(sql).not.toMatch(/WHERE/);
    expect(params).toEqual([20, 0]);
  });

  it('filtre par recherche et fourchette de prix', async () => {
    db.query.mockResolvedValue({ rows: [{ ...sample, total_count: '1' }] });
    const res = await request(app)
      .get('/api/articles')
      .query({ q: ' clavier ', min_price: '10', max_price: '50', sort: 'price-asc' });

    expect(res.status).toBe(200);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/title ILIKE \$1 OR description ILIKE \$1/);
    expect(sql).toMatch(/price >= \$2/);
    expect(sql).toMatch(/price <= \$3/);
    expect(sql).toMatch(/ORDER BY price ASC/);
    expect(params).toEqual(['%clavier%', 10, 50, 20, 0]);
  });

  it('échappe les caractères spéciaux de LIKE', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/articles').query({ q: '100%_off' });
    expect(db.query.mock.calls[0][1][0]).toBe('%100\\%\\_off%');
  });

  it('pagine les résultats', async () => {
    db.query.mockResolvedValue({ rows: [{ ...sample, total_count: '45' }] });
    const res = await request(app).get('/api/articles').query({ page: 3, limit: 10 });
    expect(db.query.mock.calls[0][1]).toEqual([10, 20]);
    expect(res.headers['x-total-count']).toBe('45');
    expect(res.headers['x-page']).toBe('3');
    expect(res.headers['x-per-page']).toBe('10');
    expect(res.headers['x-total-pages']).toBe('5');
  });

  it('renvoie le total même pour une page hors limites', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '3' }] });
    const res = await request(app).get('/api/articles').query({ page: 9 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(res.headers['x-total-count']).toBe('3');
  });

  it.each([
    ['min_price négatif', { min_price: -1 }],
    ['max_price non numérique', { max_price: 'abc' }],
    ['min > max', { min_price: 50, max_price: 10 }],
    ['tri inconnu', { sort: 'title' }],
    ['page à 0', { page: 0 }],
    ['limit trop grand', { limit: 500 }],
    ['limit décimal', { limit: 2.5 }],
  ])('refuse des paramètres invalides (%s)', async (_, query) => {
    const res = await request(app).get('/api/articles').query(query);
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse un paramètre q multiple', async () => {
    const res = await request(app).get('/api/articles?q=a&q=b');
    expect(res.status).toBe(400);
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

describe('PUT /api/articles/:id', () => {
  it('modifie un article', async () => {
    const updated = { ...sample, title: 'Clavier RGB', price: '39.90' };
    db.query.mockResolvedValue({ rows: [updated] });

    const res = await request(app)
      .put('/api/articles/1')
      .send({ title: ' Clavier RGB ', description: 'Clavier en très bon état', price: '39.90' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      ['Clavier RGB', 'Clavier en très bon état', 39.9, 1]
    );
  });

  it("retourne 404 si l'article n'existe pas", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).put('/api/articles/999').send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(404);
  });

  it('retourne 400 pour un id invalide', async () => {
    const res = await request(app).put('/api/articles/abc').send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([
    ['titre vide', { title: '', price: 10 }],
    ['prix négatif', { title: 'Objet', price: -1 }],
    ['prix manquant', { title: 'Objet' }],
  ])('refuse une modification invalide (%s)', async (_, body) => {
    const res = await request(app).put('/api/articles/1').send(body);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
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

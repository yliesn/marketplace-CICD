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
  purgeExpired: jest.fn(),
}));

const db = require('../src/db');
const sessions = require('../src/sessions');
const app = require('../src/server');

const COOKIE = 'sid=jeton-de-test';
const user = { id: 7, email: 'vendeur@example.com', role: 'user' };
const owned = { rows: [{ user_id: user.id }] }; // réponse de la vérification du propriétaire

const sample = {
  id: 1,
  title: 'Clavier mécanique',
  description: 'Clavier en très bon état',
  price: '45.00',
  created_at: '2026-09-29T10:00:00.000Z',
};

beforeEach(() => {
  db.query.mockReset();
  sessions.findUser.mockReset().mockResolvedValue(user);
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
    expect(sql).not.toMatch(/ILIKE|price [<>]=|category_id =/);
    expect(sql).toMatch(/FALSE AS is_favorite/);
    expect(params).toEqual([20, 0]);
  });

  it('filtre par catégorie', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/articles').query({ category_id: 2 });
    expect(res.status).toBe(200);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/category_id = \$1/);
    expect(params).toEqual([2, 20, 0]);
  });

  it("indique les favoris de l'utilisateur connecté", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/articles').set('Cookie', COOKIE);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/f\.user_id = \$1\) AS is_favorite/);
    expect(params).toEqual([user.id, 20, 0]);
  });

  it("liste les favoris de l'utilisateur connecté", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/articles').set('Cookie', COOKIE).query({ favorites: 1, q: 'figurine' });
    expect(res.status).toBe(200);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/WHERE \(title ILIKE \$1 OR description ILIKE \$1\) AND EXISTS \(.*f\.user_id = \$2\)/s);
    expect(params).toEqual(['%figurine%', user.id, user.id, 20, 0]);
  });

  it('refuse la liste des favoris sans être connecté', async () => {
    const res = await request(app).get('/api/articles').query({ favorites: 1 });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('compte les favoris sans le paramètre de sélection pour une page hors limites', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });
    const res = await request(app).get('/api/articles').set('Cookie', COOKIE).query({ favorites: 1, page: 5 });
    expect(res.headers['x-total-count']).toBe('1');
    expect(db.query.mock.calls[1][1]).toEqual([user.id]);
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
      .set('Cookie', COOKIE)
      .send({ title: '  Souris sans fil ', description: 'Souris Logitech', price: 25 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      ['Souris sans fil', 'Souris Logitech', 25, user.id, null]
    );
  });

  it('crée un article avec une catégorie et des badges', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...sample, id: 3 }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/articles')
      .set('Cookie', COOKIE)
      .send({ title: 'Figurine', price: 25, category_id: '2', badge_ids: [1, 2] });

    expect(res.status).toBe(201);
    expect(db.query.mock.calls[0][1]).toEqual(['Figurine', '', 25, user.id, 2]);
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO article_badges/);
    expect(params).toEqual([3, [1, 2]]);
  });

  it('refuse une catégorie inconnue', async () => {
    db.query.mockRejectedValue(Object.assign(new Error('foreign key violation'), { code: '23503' }));
    const res = await request(app).post('/api/articles').set('Cookie', COOKIE).send({ title: 'Objet', price: 10, category_id: 99 });
    expect(res.status).toBe(400);
  });

  it.each([
    ['catégorie invalide', { category_id: 'abc' }],
    ['badges non listés', { badge_ids: 3 }],
    ['badge invalide', { badge_ids: [1, -2] }],
    ['trop de badges', { badge_ids: Array.from({ length: 11 }, (_, i) => i + 1) }],
  ])('refuse une catégorie ou des badges invalides (%s)', async (_, extra) => {
    const res = await request(app).post('/api/articles').set('Cookie', COOKIE).send({ title: 'Objet', price: 10, ...extra });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await request(app).post('/api/articles').send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse une session expirée ou inconnue', async () => {
    sessions.findUser.mockResolvedValue(null);
    const res = await request(app).post('/api/articles').set('Cookie', COOKIE).send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([
    ['sans titre', { price: 10 }],
    ['titre vide', { title: '   ', price: 10 }],
    ['sans prix', { title: 'Objet' }],
    ['prix négatif', { title: 'Objet', price: -5 }],
    ['prix non numérique', { title: 'Objet', price: 'abc' }],
  ])('refuse un article invalide (%s)', async (_, body) => {
    const res = await request(app).post('/api/articles').set('Cookie', COOKIE).send(body);
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
    db.query.mockResolvedValueOnce(owned).mockResolvedValueOnce({ rows: [updated] });

    const res = await request(app)
      .put('/api/articles/1')
      .set('Cookie', COOKIE)
      .send({ title: ' Clavier RGB ', description: 'Clavier en très bon état', price: '39.90' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      ['Clavier RGB', 'Clavier en très bon état', 39.9, null, 1]
    );
    expect(db.query).toHaveBeenCalledTimes(2); // badge_ids absent : badges inchangés
  });

  it('remplace les badges', async () => {
    db.query.mockResolvedValueOnce(owned).mockResolvedValueOnce({ rows: [sample] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/api/articles/1').set('Cookie', COOKIE).send({ title: 'Objet', price: 10, badge_ids: [] });
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[2]).toEqual([expect.stringContaining('DELETE FROM article_badges'), [1, []]]);
  });

  it("retourne 404 si l'article n'existe pas", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).put('/api/articles/999').set('Cookie', COOKIE).send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(404);
  });

  it('retourne 400 pour un id invalide', async () => {
    const res = await request(app).put('/api/articles/abc').set('Cookie', COOKIE).send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await request(app).put('/api/articles/1').send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("refuse la modification de l'annonce d'un autre utilisateur", async () => {
    db.query.mockResolvedValue({ rows: [{ user_id: 99 }] });
    const res = await request(app).put('/api/articles/1').set('Cookie', COOKIE).send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("refuse la modification d'une annonce sans propriétaire", async () => {
    db.query.mockResolvedValue({ rows: [{ user_id: null }] });
    const res = await request(app).put('/api/articles/1').set('Cookie', COOKIE).send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(403);
  });

  it("autorise un administrateur à modifier l'annonce d'un autre utilisateur", async () => {
    sessions.findUser.mockResolvedValue({ id: 1, email: 'admin@example.com', role: 'admin' });
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] }).mockResolvedValueOnce({ rows: [sample] });
    const res = await request(app).put('/api/articles/1').set('Cookie', COOKIE).send({ title: 'Objet', price: 10 });
    expect(res.status).toBe(200);
  });

  it.each([
    ['titre vide', { title: '', price: 10 }],
    ['prix négatif', { title: 'Objet', price: -1 }],
    ['prix manquant', { title: 'Objet' }],
  ])('refuse une modification invalide (%s)', async (_, body) => {
    const res = await request(app).put('/api/articles/1').set('Cookie', COOKIE).send(body);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('images des articles', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

  const putImage = (id, type, body) => request(app)
    .put(`/api/articles/${id}/image`)
    .set('Cookie', COOKIE)
    .set('Content-Type', type)
    .send(body);

  it('enregistre une image', async () => {
    db.query
      .mockResolvedValueOnce(owned)
      .mockResolvedValueOnce({ rows: [{ image_updated_at: '2026-09-30T10:00:00.000Z' }] });
    const res = await putImage(1, 'image/png', png);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ image_updated_at: '2026-09-30T10:00:00.000Z' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO article_images'), [1, 'image/png', png]);
  });

  it('refuse un type de fichier non pris en charge', async () => {
    const res = await putImage(1, 'application/pdf', png);
    expect(res.status).toBe(415);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse un contenu qui ne correspond pas au type annoncé', async () => {
    const res = await putImage(1, 'image/jpeg', png);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuse une image de plus de 2 Mo', async () => {
    const big = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)]);
    const res = await putImage(1, 'image/png', big);
    expect(res.status).toBe(413);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("retourne 404 si l'article n'existe pas", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await putImage(999, 'image/png', png);
    expect(res.status).toBe(404);
  });

  it("retourne 404 si l'article est supprimé pendant l'envoi", async () => {
    db.query
      .mockResolvedValueOnce(owned)
      .mockRejectedValueOnce(Object.assign(new Error('foreign key violation'), { code: '23503' }));
    const res = await putImage(1, 'image/png', png);
    expect(res.status).toBe(404);
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await request(app).put('/api/articles/1/image').set('Content-Type', 'image/png').send(png);
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("refuse l'image pour l'annonce d'un autre utilisateur", async () => {
    db.query.mockResolvedValue({ rows: [{ user_id: 99 }] });
    const res = await putImage(1, 'image/png', png);
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("sert l'image d'un article", async () => {
    db.query.mockResolvedValue({ rows: [{ content_type: 'image/png', data: png }] });
    const res = await request(app).get('/api/articles/1/image');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body, png)).toBe(0);
  });

  it("retourne 404 si l'article n'a pas d'image", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/articles/1/image');
    expect(res.status).toBe(404);
  });

  it("supprime l'image d'un article", async () => {
    db.query.mockResolvedValueOnce(owned).mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/api/articles/1/image').set('Cookie', COOKIE);
    expect(res.status).toBe(204);
  });

  it("refuse la suppression de l'image sans être connecté", async () => {
    const res = await request(app).delete('/api/articles/1/image');
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/articles/:id', () => {
  it('supprime un article', async () => {
    db.query.mockResolvedValueOnce(owned).mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/api/articles/3').set('Cookie', COOKIE);
    expect(res.status).toBe(204);
  });

  it("retourne 404 si l'article n'existe pas", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).delete('/api/articles/999').set('Cookie', COOKIE);
    expect(res.status).toBe(404);
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await request(app).delete('/api/articles/3');
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("refuse la suppression de l'annonce d'un autre utilisateur", async () => {
    db.query.mockResolvedValue({ rows: [{ user_id: 99 }] });
    const res = await request(app).delete('/api/articles/3').set('Cookie', COOKIE);
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("autorise un administrateur à supprimer l'annonce d'un autre utilisateur", async () => {
    sessions.findUser.mockResolvedValue({ id: 1, email: 'admin@example.com', role: 'admin' });
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] }).mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/api/articles/3').set('Cookie', COOKIE);
    expect(res.status).toBe(204);
  });
});

describe('favoris', () => {
  it('ajoute un favori', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).put('/api/articles/3/favorite').set('Cookie', COOKIE);
    expect(res.status).toBe(204);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO favorites'), [user.id, 3]);
  });

  it("retourne 404 si l'article n'existe pas", async () => {
    db.query.mockRejectedValue(Object.assign(new Error('foreign key violation'), { code: '23503' }));
    const res = await request(app).put('/api/articles/999/favorite').set('Cookie', COOKIE);
    expect(res.status).toBe(404);
  });

  it('retire un favori', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).delete('/api/articles/3/favorite').set('Cookie', COOKIE);
    expect(res.status).toBe(204);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM favorites'), [user.id, 3]);
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await request(app).put('/api/articles/3/favorite');
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });
});

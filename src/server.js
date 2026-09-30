const path = require('path');
const express = require('express');
const articlesRouter = require('./routes/articles');
const authRouter = require('./routes/auth');
const { loadUser } = require('./auth');

const app = express();

// Derrière le proxy (Traefik), req.secure reflète le protocole d'origine.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dist')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', loadUser);
app.use('/api/auth', authRouter);
app.use('/api/articles', articlesRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Contenu trop volumineux' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;

  require('./migrate')()
    .then(() => {
      const server = app.listen(port, () => {
        console.log(`Marketplace démarrée sur http://localhost:${port}`);
      });

      const shutdown = () => {
        server.close(() => {
          require('./db').close().finally(() => process.exit(0));
        });
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    })
    .catch((err) => {
      console.error('Échec de la migration de la base', err);
      process.exit(1);
    });
}

module.exports = app;

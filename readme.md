# Marketplace — Projet CI/CD

Mini application web permettant de publier et de consulter des articles à vendre.

L'objectif principal du projet n'est pas de créer une marketplace complète, mais de disposer d'une application suffisamment simple pour mettre en pratique :

* développement web
* API REST
* PostgreSQL
* tests automatisés
* Docker
* Docker Compose
* registre d'images Docker
* Kubernetes
* CI/CD avec GitHub Actions

---

# 📋 Sommaire

1. [Objectif](#-objectif)
2. [Stack technique](#-stack-technique)
3. [Fonctionnalités](#-fonctionnalités)
4. [Architecture](#-architecture)
5. [Structure du projet](#-structure-du-projet)
6. [Installation locale](#-installation-locale)
7. [Lancer avec Docker Compose](#-lancer-avec-docker-compose)
8. [API](#-api)
9. [Tests](#-tests)
10. [Docker](#-docker)
11. [Registry Docker](#-registry-docker)
12. [Kubernetes](#-kubernetes)
13. [CI/CD](#-cicd)
14. [Étapes du pipeline](#-étapes-du-pipeline)
15. [Évolutions possibles](#-évolutions-possibles)

---

# 🎯 Objectif

Créer une petite application web permettant aux utilisateurs de publier des articles à vendre.

Exemple :

```text
┌───────────────────────────────────────┐
│          🛒 Mini Marketplace          │
├───────────────────────────────────────┤
│                                       │
│  Clavier mécanique           45.00 €  │
│  Clavier en très bon état             │
│                                       │
│  Écran 24 pouces             90.00 €  │
│  Écran Full HD                       │
│                                       │
├───────────────────────────────────────┤
│       Publier un article              │
│                                       │
│  Titre       [....................]   │
│  Description [....................]   │
│  Prix        [....................]   │
│                                       │
│             [ Publier ]               │
└───────────────────────────────────────┘
```

L'application doit être conteneurisée et pouvoir être déployée sur Kubernetes.

---

# 🧰 Stack technique

## Application

* Node.js
* Express
* HTML
* CSS
* JavaScript

## Base de données

* PostgreSQL

## Tests

* Jest
* Supertest

## Conteneurisation

* Docker
* Docker Compose

## CI/CD

* GitHub Actions

## Déploiement

* Kubernetes

---

# ⚙️ Fonctionnalités

## Articles

L'application doit permettre de :

* afficher tous les articles (recherche, filtre de prix, tri, pagination)
* afficher un article
* publier un article
* modifier un article
* supprimer un article

Un article possède :

```text
id
title
description
price
created_at
```

---

# 🏗️ Architecture

## Développement local

```text
                Docker Compose
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
   ┌──────────────┐        ┌──────────────┐
   │ Marketplace  │        │ PostgreSQL   │
   │   Node.js    │───────▶│     BDD      │
   │    :3000     │        │    :5432     │
   └──────────────┘        └──────────────┘
```

L'application et la base de données tournent dans deux conteneurs différents.

---

## Architecture cible Kubernetes

```text
                    Kubernetes
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
   ┌──────────────┐            ┌──────────────┐
   │ Marketplace  │            │ PostgreSQL   │
   │     Pod      │───────────▶│     Pod      │
   └──────────────┘            └──────────────┘
          │                           │
          ▼                           ▼
       Service                    Service
                                      │
                                      ▼
                                Persistent
                                  Volume
```

---

# 📁 Structure du projet

```text
marketplace/
│
├── src/
│   ├── server.js
│   ├── db.js
│   │
│   ├── routes/
│   │   └── articles.js
│   │
│   └── public/
│       ├── index.html
│       ├── app.js
│       └── style.css
│
├── tests/
│   └── articles.test.js
│
├── Dockerfile
├── docker-compose.yml
├── init.sql
├── package.json
├── .dockerignore
├── .gitignore
└── README.md
```

---

# 💻 Installation locale

## Prérequis

Installer :

* Git
* Node.js
* npm
* Docker
* Docker Compose

Vérifier les installations :

```bash
git --version
node --version
npm --version
docker --version
docker compose version
```

---

# 🚀 Lancer avec Docker Compose

Construire les images et démarrer les conteneurs :

```bash
docker compose up --build
```

L'application est ensuite disponible sur :

```text
http://localhost:3000
```

---

# 🛑 Arrêter l'application

```bash
docker compose down
```

---

# 🗑️ Supprimer également les données PostgreSQL

```bash
docker compose down -v
```

⚠️ Cette commande supprime le volume PostgreSQL.

---

# 🔍 Vérifier les conteneurs

```bash
docker compose ps
```

Voir les logs :

```bash
docker compose logs
```

Logs uniquement de l'application :

```bash
docker compose logs app
```

Logs PostgreSQL :

```bash
docker compose logs db
```

---

# 🌐 API

## Health check

```http
GET /health
```

Réponse :

```json
{
  "status": "ok"
}
```

---

## Récupérer tous les articles

```http
GET /api/articles
GET /api/articles?q=clavier&min_price=10&max_price=100&sort=price-asc&page=1&limit=20
```

Paramètres (tous optionnels) :

| Paramètre   | Description                                             | Défaut   |
|-------------|---------------------------------------------------------|----------|
| `q`         | recherche dans le titre et la description (insensible à la casse) | —        |
| `min_price` | prix minimum (inclus)                                   | —        |
| `max_price` | prix maximum (inclus)                                   | —        |
| `sort`      | `recent`, `price-asc` ou `price-desc`                   | `recent` |
| `page`      | numéro de page (≥ 1)                                    | `1`      |
| `limit`     | articles par page (1 à 100)                             | `20`     |

Un paramètre invalide renvoie `400` avec la liste des erreurs.

La réponse reste un tableau d'articles ; les informations de pagination sont dans les en-têtes :

```http
X-Total-Count: 29
X-Page: 1
X-Per-Page: 20
X-Total-Pages: 2
```

Exemple :

```json
[
  {
    "id": 1,
    "title": "Clavier mécanique",
    "description": "Clavier en très bon état",
    "price": "45.00",
    "created_at": "2026-09-29T10:00:00.000Z"
  }
]
```

---

## Récupérer un article

```http
GET /api/articles/1
```

---

## Publier un article

```http
POST /api/articles
```

Body :

```json
{
  "title": "Souris sans fil",
  "description": "Souris Logitech en très bon état",
  "price": 25
}
```

Réponse :

```json
{
  "id": 3,
  "title": "Souris sans fil",
  "description": "Souris Logitech en très bon état",
  "price": "25.00"
}
```

---

## Modifier un article

```http
PUT /api/articles/3
```

Body (mêmes règles de validation que la création) :

```json
{
  "title": "Souris sans fil",
  "description": "Souris Logitech, pile neuve",
  "price": 20
}
```

Réponse : l'article modifié (`200`), `404` s'il n'existe pas, `400` si les données sont invalides.

---

## Supprimer un article

```http
DELETE /api/articles/3
```

---

## Photo d'un article

```http
PUT /api/articles/3/image
Content-Type: image/png
```

Body : le fichier brut (JPEG, PNG ou WebP, 2 Mo max). Remplace la photo existante.

Réponse : `200` avec `image_updated_at`, `404` si l'article n'existe pas, `415` si le type n'est pas pris en charge, `413` si le fichier est trop volumineux.

```http
GET /api/articles/3/image
DELETE /api/articles/3/image
```

Les articles renvoyés par `GET /api/articles` contiennent `image_updated_at` (`null` sans photo).

---

# 🧪 Tests

Installer les dépendances :

```bash
npm install
```

Lancer les tests :

```bash
npm test
```

Les tests doivent notamment vérifier :

* que l'API répond
* que le health check fonctionne
* que les articles peuvent être récupérés
* qu'un article peut être créé
* qu'un article invalide est refusé
* qu'un article peut être modifié
* que la recherche, les filtres de prix et la pagination fonctionnent

---

# 🐳 Docker

## Dockerfile

L'application doit être construite à partir d'un Dockerfile.

Construire l'image :

```bash
docker build -t marketplace .
```

Vérifier l'image :

```bash
docker images
```

Lancer uniquement l'application :

```bash
docker run -p 3000:3000 marketplace
```

---

# 📦 Registry Docker

L'objectif suivant est de publier l'image dans un registry.

Exemple avec GitHub Container Registry :

```text
ghcr.io/yliesn/marketplace
```

Le pipeline devra :

1. construire l'image
2. donner un tag à l'image
3. se connecter au registry
4. pousser l'image

Exemple de tags :

```text
marketplace:latest
marketplace:1.0.0
marketplace:<commit-sha>
```

Il est recommandé de conserver au minimum un tag correspondant au commit ou à la version.

---

# ☸️ Kubernetes

Créer les manifests Kubernetes.

Prévoir au minimum :

```text
kubernetes/
├── namespace.yaml
├── app-deployment.yaml
├── app-service.yaml
├── postgres-deployment.yaml
├── postgres-service.yaml
└── postgres-pvc.yaml
```

---

## Namespace

Créer un namespace dédié :

```text
marketplace
```

---

## Application

Créer un `Deployment` pour l'application Node.js.

Le Deployment doit utiliser l'image Docker publiée dans le registry.

Exemple :

```text
ghcr.io/yliesn/marketplace:1.0.0
```

---

## Service

Créer un Service Kubernetes permettant d'accéder à l'application.

L'application écoute sur :

```text
3000
```

---

## PostgreSQL

Créer :

* un Deployment PostgreSQL
* un Service PostgreSQL
* un PersistentVolumeClaim

Les données PostgreSQL doivent être stockées dans un volume persistant.

---

# 🔐 Configuration

Les informations sensibles ne doivent pas être écrites directement dans le dépôt.

Exemples :

```text
DB_PASSWORD
DB_USER
DB_NAME
```

Utiliser les mécanismes adaptés :

* variables d'environnement
* Kubernetes Secrets
* GitHub Secrets pour le pipeline

Ne jamais committer :

```text
.env
mots de passe
tokens
clés privées
credentials
```

---

# 🔄 CI/CD

Le pipeline GitHub Actions doit automatiser le cycle suivant :

```text
                    git push
                       │
                       ▼
                ┌─────────────┐
                │   Checkout  │
                └──────┬──────┘
                       ▼
                ┌─────────────┐
                │ npm install │
                └──────┬──────┘
                       ▼
                ┌─────────────┐
                │    Tests    │
                └──────┬──────┘
                       ▼
                ┌─────────────┐
                │ Docker Build│
                └──────┬──────┘
                       ▼
                ┌─────────────┐
                │ Docker Push │
                └──────┬──────┘
                       ▼
                ┌─────────────┐
                │ Kubernetes  │
                │   Deploy    │
                └─────────────┘
```

---

# 🔨 Étapes du pipeline

## 1. Checkout

Récupérer le code du repository.

---

## 2. Installation

Installer les dépendances :

```bash
npm ci
```

---

## 3. Tests

Exécuter :

```bash
npm test
```

Si les tests échouent, le pipeline doit s'arrêter.

---

## 4. Build Docker

Construire l'image :

```bash
docker build -t marketplace:<version> .
```

---

## 5. Login Registry

Se connecter au registry avec des secrets GitHub.

Ne jamais mettre directement le token dans le workflow.

---

## 6. Push

Publier l'image :

```text
Registry
   │
   └── marketplace:<version>
```

---

## 7. Déploiement Kubernetes

Mettre à jour le Deployment Kubernetes avec la nouvelle image.

Exemple :

```bash
kubectl set image deployment/marketplace \
  marketplace=ghcr.io/yliesn/marketplace:<version>
```

Puis vérifier le déploiement :

```bash
kubectl rollout status deployment/marketplace
```

---

# 🔎 Vérifications après déploiement

Vérifier les Pods :

```bash
kubectl get pods
```

Vérifier les Services :

```bash
kubectl get services
```

Vérifier les Deployments :

```bash
kubectl get deployments
```

Voir les logs :

```bash
kubectl logs <pod>
```

Vérifier le rollout :

```bash
kubectl rollout status deployment/marketplace
```

---

# 🧪 Tests d'intégration

Une fois l'application déployée, le pipeline pourra effectuer un test HTTP.

Exemple :

```text
GET /health
```

Le pipeline vérifie que l'application retourne :

```json
{
  "status": "ok"
}
```

Ainsi, une image peut être :

```text
✅ construite
✅ poussée dans le registry
❌ mais refusée au déploiement si l'application ne répond pas correctement
```

---

# 📈 Évolution du pipeline

Le projet peut être réalisé progressivement.

## Niveau 1 — Application

* [ ] Créer l'application Express
* [ ] Créer l'interface web
* [ ] Créer l'API
* [ ] Connecter PostgreSQL
* [ ] Tester l'application

## Niveau 2 — Docker

* [ ] Créer le Dockerfile
* [ ] Construire l'image
* [ ] Lancer l'application avec Docker
* [ ] Créer le Docker Compose
* [ ] Ajouter PostgreSQL
* [ ] Tester l'ensemble

## Niveau 3 — Tests

* [ ] Ajouter Jest
* [ ] Ajouter Supertest
* [ ] Tester l'API
* [ ] Faire échouer volontairement un test
* [ ] Vérifier que le pipeline s'arrête

## Niveau 4 — Registry

* [ ] Créer un repository d'image
* [ ] Se connecter au registry
* [ ] Push de l'image
* [ ] Utiliser des tags
* [ ] Utiliser les Secrets GitHub

## Niveau 5 — Kubernetes

* [ ] Créer le Namespace
* [ ] Créer le Deployment de l'application
* [ ] Créer le Service
* [ ] Déployer PostgreSQL
* [ ] Créer le PVC
* [ ] Créer les Secrets Kubernetes
* [ ] Tester l'application

## Niveau 6 — CI/CD

* [ ] Déclencher le workflow avec `push`
* [ ] Exécuter les tests
* [ ] Construire l'image Docker
* [ ] Pousser l'image dans le registry
* [ ] Déployer sur Kubernetes
* [ ] Vérifier le rollout
* [ ] Effectuer un health check

---

# 🚀 Objectif final

À la fin, un simple :

```bash
git push
```

doit pouvoir déclencher :

```text
Git Push
   │
   ▼
GitHub Actions
   │
   ├── Tests
   │
   ├── Docker Build
   │
   ├── Docker Push
   │
   └── Kubernetes Deploy
          │
          ▼
      Application
          │
          ▼
      PostgreSQL
```

Le développeur n'a donc plus besoin de construire manuellement l'image ou de déployer manuellement l'application.

---

# 🔮 Évolutions possibles

Une fois le projet fonctionnel, possibilité d'ajouter :

* authentification
* utilisateurs
* catégories
* images des articles
* statut vendu/disponible
* tests d'intégration
* tests end-to-end
* SonarQube
* analyse de sécurité
* scan de l'image Docker
* gestion des versions
* rollback Kubernetes
* Helm
* Ingress
* HTTPS
* monitoring
* logs centralisés
* Prometheus
* Grafana

---

# 🎓 Compétences travaillées

À travers ce projet :

```text
Développement web
       ↓
API REST
       ↓
PostgreSQL
       ↓
Tests automatisés
       ↓
Docker
       ↓
Docker Compose
       ↓
Docker Registry
       ↓
Kubernetes
       ↓
GitHub Actions
       ↓
CI/CD
```

L'application reste volontairement simple afin de consacrer l'essentiel du travail à la **conteneurisation, l'automatisation et le déploiement**.

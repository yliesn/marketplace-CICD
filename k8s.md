# K3s + Traefik + Let's Encrypt

Installation d'un cluster K3s mono-nœud avec Traefik comme Ingress Controller et Let's Encrypt pour les certificats HTTPS.

## Architecture

```text
Internet
   │
   │ HTTPS :443
   │ HTTP  :80
   ▼
┌──────────────────────────┐
│          VPS             │
│                          │
│         K3s              │
│          │               │
│       Traefik            │
│          │               │
│       Ingress            │
│          │               │
│     ┌────┴─────┐         │
│     │          │         │
│   Service    Service     │
│     │          │         │
│    App       App #2      │
└──────────────────────────┘
```

## 1. Prérequis

* Un VPS Linux
* Une adresse IP publique
* Un nom de domaine
* Les ports `80` et `443` ouverts
* DNS configurable
* Accès SSH avec `sudo`

Exemple :

```text
VPS
147.93.95.146

Domaine
nejara.fr

Application
marketplace.nejara.fr
```

---

# 2. Installation de K3s

Installation du serveur K3s :

```bash
curl -sfL https://get.k3s.io | sh -
```

K3s est installé comme service et démarre automatiquement après un redémarrage.

Vérifier le service :

```bash
sudo systemctl status k3s
```

Vérifier le nœud :

```bash
sudo k3s kubectl get nodes
```

Résultat attendu :

```text
NAME        STATUS   ROLES
server      Ready    control-plane,master
```

---

# 3. Vérifier les composants K3s

K3s installe notamment Traefik par défaut lorsqu'il est utilisé comme serveur.

Vérifier les Pods :

```bash
sudo k3s kubectl get pods -A
```

Vérifier Traefik :

```bash
sudo k3s kubectl -n kube-system get pods
```

Vérifier son Service :

```bash
sudo k3s kubectl -n kube-system get svc traefik
```

Traefik doit exposer :

```text
80/TCP
443/TCP
```

---

# 4. Vérifier Traefik

Afficher la configuration Helm :

```bash
sudo k3s kubectl -n kube-system get helmchart traefik -o yaml
```

Ne pas modifier directement le fichier :

```text
/var/lib/rancher/k3s/server/manifests/traefik.yaml
```

K3s peut remplacer ce fichier.

Pour personnaliser Traefik, utiliser un `HelmChartConfig`.

---

# 5. Configuration de Traefik + Let's Encrypt

Créer :

```text
/var/lib/rancher/k3s/server/manifests/traefik-config.yaml
```

Contenu :

```yaml
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    additionalArguments:
      - "--certificatesresolvers.le.acme.email=yliesnejara@gmail.com"
      - "--certificatesresolvers.le.acme.storage=/data/acme.json"
      - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"

    persistence:
      enabled: true
      name: data
      size: 1Gi
      storageClass: local-path
```

Cette configuration :

* crée le resolver Let's Encrypt `le`
* utilise le challenge HTTP-01
* utilise le port 80 pour la validation
* stocke les certificats dans `/data/acme.json`
* rend le stockage persistant

Le challenge HTTP-01 doit être accessible publiquement sur le port 80.

---

# 6. Vérifier le stockage Traefik

Après quelques secondes :

```bash
sudo k3s kubectl -n kube-system get pvc
```

Puis :

```bash
sudo k3s kubectl -n kube-system get pods -l app.kubernetes.io/name=traefik
```

Le Pod doit être :

```text
1/1   Running
```

---

# 7. Configuration DNS

Créer un enregistrement DNS :

```text
Type : A
Nom  : marketplace
Valeur : IP_DU_VPS
```

Exemple :

```text
marketplace.nejara.fr → 147.93.95.146
```

Vérifier depuis le VPS :

```bash
getent hosts marketplace.nejara.fr
```

Le domaine doit retourner l'adresse IP publique du VPS.

---

# 8. Kubernetes Namespace

Créer un namespace :

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: marketplace
```

Appliquer :

```bash
sudo k3s kubectl apply -f namespace.yaml
```

---

# 9. Application Kubernetes

L'application doit être déployée avec un `Deployment`.

Exemple :

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marketplace
  namespace: marketplace
spec:
  replicas: 2
  selector:
    matchLabels:
      app: marketplace
  template:
    metadata:
      labels:
        app: marketplace
    spec:
      containers:
        - name: marketplace
          image: ghcr.io/yliesn/marketplace:1.0.0
          ports:
            - containerPort: 3000
```

Vérifier :

```bash
sudo k3s kubectl get pods -n marketplace
```

---

# 10. Service Kubernetes

Le Service reste interne au cluster :

```yaml
apiVersion: v1
kind: Service
metadata:
  name: marketplace
  namespace: marketplace
spec:
  type: ClusterIP
  selector:
    app: marketplace
  ports:
    - port: 3000
      targetPort: 3000
```

Appliquer :

```bash
sudo k3s kubectl apply -f app-service.yaml
```

---

# 11. Ingress HTTPS

Créer :

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: marketplace
  namespace: marketplace
  annotations:
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.tls.certresolver: "le"
spec:
  ingressClassName: traefik

  rules:
    - host: marketplace.nejara.fr
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: marketplace
                port:
                  number: 3000

  tls:
    - hosts:
        - marketplace.nejara.fr
```

Appliquer :

```bash
sudo k3s kubectl apply -f app-ingress.yaml
```

Traefik associe alors le routeur au resolver Let's Encrypt `le`. Un resolver ACME doit être explicitement utilisé par le routeur.

---

# 12. Vérification

Vérifier l'Ingress :

```bash
sudo k3s kubectl get ingress -n marketplace
```

Vérifier Traefik :

```bash
sudo k3s kubectl -n kube-system logs deployment/traefik
```

Vérifier les Pods :

```bash
sudo k3s kubectl get pods -n marketplace
```

Puis tester :

```text
https://marketplace.nejara.fr
```

Le navigateur doit afficher un certificat valide délivré par Let's Encrypt.

---

# 13. Architecture finale

```text
                         Internet
                            │
                            │
                    marketplace.nejara.fr
                            │
                            ▼
                    ┌───────────────┐
                    │    Traefik    │
                    │               │
                    │ HTTP :80      │
                    │ HTTPS :443    │
                    └───────┬───────┘
                            │
                         Ingress
                            │
                            ▼
                  ┌─────────────────┐
                  │ Service         │
                  │ marketplace     │
                  │ ClusterIP       │
                  └────────┬────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
          ┌──────────────┐  ┌──────────────┐
          │ Marketplace  │  │ Marketplace  │
          │    Pod #1    │  │    Pod #2    │
          └───────┬──────┘  └───────┬──────┘
                  │                  │
                  └────────┬─────────┘
                           ▼
                    PostgreSQL
```

## 14. Ajouter une nouvelle application

Traefik et Let's Encrypt sont configurés **une seule fois au niveau du cluster**.

Pour une nouvelle application, il suffit généralement de créer :

```text
Deployment
Service
Ingress
```

Exemple :

```text
app1.nejara.fr
app2.nejara.fr
app3.nejara.fr
```

Chaque Ingress peut utiliser le même resolver :

```yaml
annotations:
  traefik.ingress.kubernetes.io/router.tls: "true"
  traefik.ingress.kubernetes.io/router.tls.certresolver: "le"
```

Traefik gère alors les certificats correspondants.

## 15. Désinstallation complète de K3s

⚠️ Cette opération supprime le cluster local et les données des volumes de stockage local.

```bash
sudo /usr/local/bin/k3s-uninstall.sh
```

K3s fournit officiellement ce script pour désinstaller un serveur installé avec le script d'installation.

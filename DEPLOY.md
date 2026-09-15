# Déploiement sur le VPS

Ce document explique comment mettre `bordereau-app` en ligne sur un VPS qui
fait déjà tourner d'autres projets avec nginx en direct (pas de Docker).
**On ne touche à rien de ce qui existe déjà** : seul le backend (+ DB/Redis/
Celery) tourne dans Docker, sur un port local (`127.0.0.1`), et on ajoute
un bloc de config nginx séparé qui pointe dessus. Le frontend est buildé en
fichiers statiques et servi directement par nginx, comme tes autres sites.

## 0. Prérequis sur le VPS

- **Docker** (Engine + plugin Compose) — si pas encore installé :
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER   # puis se reconnecter (logout/login)
  docker compose version          # vérifie que le plugin est bien là
  ```
- **Node.js 20+** (pour builder le frontend — pas besoin de Docker pour ça) :
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt-get install -y nodejs
  ```
- nginx déjà installé (c'est le cas d'après toi)
- git

## 1. Récupérer le code

```bash
cd ~   # ou l'endroit où tu ranges tes projets habituellement
git clone git@github.com:AbdelFadel06/Bordereau_app.git bordereau-app
cd bordereau-app
```

Pour les mises à jour futures, `git pull` dans ce dossier suffira (voir
section 6).

## 2. Configurer les secrets

```bash
cp .env.prod.example .env.prod
```

Édite `.env.prod` et remplace **toutes** les valeurs `change-me` :

- `DJANGO_SECRET_KEY` — génère une vraie valeur :
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(50))"
  ```
- `DJANGO_ALLOWED_HOSTS` — l'IP du VPS pour commencer (ex: `203.0.113.5`),
  ou un nom de domaine si tu en as déjà un
- `DJANGO_CSRF_TRUSTED_ORIGINS` — pareil mais avec le schéma, ex:
  `http://203.0.113.5`
- `POSTGRES_PASSWORD` — un mot de passe fort, propre à cette app

**Ne commite jamais ce fichier** (déjà dans `.gitignore`).

Le port local sur lequel gunicorn écoute (`127.0.0.1:8000` par défaut) est
défini directement dans `docker-compose.prod.yml`, pas dans `.env.prod` —
vérifie qu'il est libre (`sudo ss -tlnp | grep 8000`) ; si un autre projet
l'utilise déjà, lance plutôt la commande de la section 3 comme ceci :

```bash
BACKEND_PORT=8001 docker compose -f docker-compose.prod.yml up -d --build
```

(et utilise ce même port dans les `proxy_pass` du bloc nginx à l'étape 5).

## 3. Lancer les services Docker (backend, DB, Redis, Celery)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Ça build l'image backend, lance Postgres/Redis, applique les migrations et
démarre gunicorn + Celery automatiquement (c'est dans la commande du
service `backend`). Vérifie que tout tourne :

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail 50
```

Tu dois voir `Listening at: http://0.0.0.0:8000` dans les logs, sans
erreur de migration au-dessus.

Crée-toi un compte admin Django (pratique pour déboguer via `/admin/`) :

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

## 4. Builder le frontend

```bash
cd frontend
npm ci
npm run build
cd ..
```

Ça produit `frontend/dist/` — un dossier de fichiers statiques, rien à
lancer, nginx va les servir directement.

## 5. Configurer nginx

```bash
cp deploy/nginx-bordereau.conf.example /tmp/bordereau-app.conf
```

Édite `/tmp/bordereau-app.conf` :
- remplace `change-me` (server_name) par l'IP ou le domaine du VPS
- remplace les deux `/path/to/bordereau-app` par le chemin réel où tu as
  cloné le dépôt (ex: `/home/ton_user/bordereau-app`)
- si tu as changé `BACKEND_PORT`, adapte le `8000` dans les `proxy_pass`

Puis :

```bash
sudo cp /tmp/bordereau-app.conf /etc/nginx/sites-available/bordereau-app
sudo ln -s /etc/nginx/sites-available/bordereau-app /etc/nginx/sites-enabled/
sudo nginx -t              # doit dire "syntax is ok" / "test is successful"
sudo systemctl reload nginx
```

**Si `nginx -t` échoue à cause d'un conflit de `server_name` ou de port**
avec un autre site déjà configuré, dis-le-moi — la config de tes projets
existants n'a pas besoin de changer, juste ce nouveau bloc.

## 6. Vérifier

Ouvre `http://<IP-ou-domaine-du-VPS>/` dans un navigateur — tu dois voir la
page d'accueil de l'app. Teste l'inscription → création de société → upload
du papier entête → création d'un document → génération du PDF, pour
confirmer que le backend, Celery et le stockage des fichiers fonctionnent
bien ensemble sur le VPS (pas juste que la page se charge).

## 7. HTTPS (plus tard, quand tu as un domaine)

Une fois un nom de domaine pointé sur le VPS :

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ton-domaine.com
```

Certbot édite automatiquement le bloc nginx pour ajouter le HTTPS et le
renouvellement auto. Pense aussi à mettre à jour `DJANGO_ALLOWED_HOSTS` et
`DJANGO_CSRF_TRUSTED_ORIGINS` dans `.env.prod` (le second avec `https://`),
puis `docker compose -f docker-compose.prod.yml up -d` pour recharger.

## 8. Mettre à jour après un nouveau `git push`

```bash
cd bordereau-app
git pull
docker compose -f docker-compose.prod.yml up -d --build   # backend/celery
cd frontend && npm ci && npm run build && cd ..            # frontend
```

Pas besoin de toucher à nginx sauf si tu changes des chemins.

## Points d'attention

- **Le dossier `./media/`** (créé à la racine du projet au premier lancement
  de Docker) contient les papiers entête et PDF réels — sauvegarde-le
  régulièrement (`rsync`/`tar`), ce n'est pas dans git
- **Postgres/Redis ne sont pas exposés sur Internet** (pas de port publié
  dans `docker-compose.prod.yml`) — seul nginx, en local sur le VPS, parle
  au backend via `127.0.0.1`
- Si `docker compose` (avec espace) ne fonctionne pas, essaie `docker-compose`
  (ancienne syntaxe avec tiret) — dépend de la version installée

# Déploiement sur le VPS

Ce document explique comment mettre `bordereau-app` en ligne sur le VPS
Hetzner (`ubuntu-4gb-hel1-5`) qui fait déjà tourner `shopm` et
`abdelsaliou.dev` avec nginx en direct (pas de Docker). **On ne touche à
rien de ce qui existe déjà** : seul le backend (+ DB/Redis/Celery) tourne
dans Docker, sur un port local (`127.0.0.1`), et on ajoute un bloc de
config nginx séparé qui pointe dessus — même pattern que `shopm`. Le
frontend est buildé en fichiers statiques et servi directement par nginx.

Avant de commencer : `bash deploy/vps-audit.sh` (lecture seule) a déjà
tourné une fois sur ce VPS — voir "Constats de l'audit" en bas de ce
document pour ce qui a été découvert et pourquoi certains choix ci-dessous
sont ce qu'ils sont (notamment le port 8001, pas 8000).

## 0. Prérequis sur le VPS

- **Docker** (Engine + plugin Compose) — pas encore installé d'après
  l'audit :
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
- nginx et git déjà présents

**Recommandé avant d'aller plus loin — ajouter un peu de swap.** L'audit
montre 3.7Gi de RAM, ~900Mi déjà utilisés par les projets existants, et
**aucun swap configuré**. Postgres+Redis+backend+Celery+LibreOffice (pour
la conversion des papiers entête) vont ajouter de la charge — sans swap,
si la RAM vient à manquer, le noyau tue des processus au hasard (potentiellement
ceux de `shopm`/`abdelsaliou.dev`, pas juste bordereau-app). 2 Go de swap
en filet de sécurité :
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # doit maintenant montrer Swap: 2.0Gi
```

## 1. Placer le code au bon endroit

Tes projets existants vivent dans `/var/www/<nom>` (pas dans le home) —
on suit la même convention. Si tu as déjà cloné dans `~/bordereau-app`,
déplace-le :

```bash
sudo mkdir -p /var/www/bordereau-app
sudo chown $USER:$USER /var/www/bordereau-app
mv ~/bordereau-app/* ~/bordereau-app/.[!.]* /var/www/bordereau-app/ 2>/dev/null
rmdir ~/bordereau-app
cd /var/www/bordereau-app
```

(Ou directement `git clone git@github.com:AbdelFadel06/Bordereau_app.git /var/www/bordereau-app` si tu repars de zéro.)

Pour les mises à jour futures, `git pull` dans ce dossier suffira (voir
section 9) — ou plus du tout une fois le CI/CD en place (section 10).

## 2. DNS du sous-domaine

Décidé : **`bordereau.abdelsaliou.dev`**, comme `shopm.abdelsaliou.dev`.
Dans le panneau DNS qui gère `abdelsaliou.dev`, ajoute un enregistrement
**A** :

```
bordereau.abdelsaliou.dev.   A   <IP du VPS>
```

Ça peut prendre de quelques minutes à quelques heures à se propager —
lance cette étape maintenant, tu peux continuer les sections suivantes en
attendant (le certificat HTTPS à la section 8 attendra que ce soit propagé,
pas le reste).

## 3. Configurer les secrets

```bash
cp .env.prod.example .env.prod
```

Édite `.env.prod` et remplace **toutes** les valeurs `change-me` :

- `DJANGO_SECRET_KEY` — génère une vraie valeur :
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(50))"
  ```
- `DJANGO_ALLOWED_HOSTS=bordereau.abdelsaliou.dev`
- `DJANGO_CSRF_TRUSTED_ORIGINS=https://bordereau.abdelsaliou.dev` (avec
  `https://` dès maintenant même si le certificat arrive à la section 7 —
  ça évite de devoir y revenir)
- `POSTGRES_PASSWORD` — un mot de passe fort, propre à cette app (le
  Postgres 14 déjà installé nativement sur le VPS n'est pas concerné, celui
  de bordereau-app tourne dans Docker, isolé, sans port publié)

**Ne commite jamais ce fichier** (déjà dans `.gitignore`).

## 4. Lancer les services Docker (backend, DB, Redis, Celery)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Le port local du backend est déjà fixé à **8001** dans
`docker-compose.prod.yml` (pas 8000 — déjà pris par `shopm` sur ce VPS,
vérifié via l'audit). Si besoin d'un autre port :
```bash
BACKEND_PORT=8002 docker compose -f docker-compose.prod.yml up -d --build
```

(et adapter le même numéro dans le bloc nginx à l'étape 6).

Ça build l'image backend, lance Postgres/Redis, applique les migrations et
démarre gunicorn + Celery automatiquement. Vérifie que tout tourne :

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail 50
```

Tu dois voir `Listening at: http://0.0.0.0:8000` dans les logs (c'est le
port interne au conteneur, normal qu'il soit différent du 8001 externe),
sans erreur de migration au-dessus.

Crée-toi un compte admin Django (pratique pour déboguer via `/admin/`) :

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

## 5. Builder le frontend

```bash
cd frontend
npm ci
npm run build
cd ..
```

Ça produit `frontend/dist/` — un dossier de fichiers statiques, rien à
lancer, nginx va les servir directement.

## 6. Configurer nginx

```bash
cp deploy/nginx-bordereau.conf.example /tmp/bordereau-app.conf
```

Rien à éditer si tu as suivi les étapes précédentes telles quelles
(`server_name` et le chemin `/var/www/bordereau-app` sont déjà corrects
dans le fichier) — sauf si tu as changé `BACKEND_PORT` à l'étape 4, auquel
cas adapte le `8001` dans les 3 `proxy_pass`.

Puis :

```bash
sudo cp /tmp/bordereau-app.conf /etc/nginx/sites-available/bordereau-app
sudo ln -s /etc/nginx/sites-available/bordereau-app /etc/nginx/sites-enabled/
sudo nginx -t              # doit dire "syntax is ok" / "test is successful"
sudo systemctl reload nginx
```

**Si `nginx -t` échoue à cause d'un conflit de `server_name` ou de port**
avec `shopm`/`abdelsaliou.dev`, dis-le-moi — leur config n'a pas besoin de
changer, juste ce nouveau bloc.

## 7. Vérifier

Ouvre `http://bordereau.abdelsaliou.dev/` dans un navigateur (si le DNS de
la section 2 n'a pas encore propagé, `http://<IP-du-VPS>/` fonctionne
aussi en attendant, tant que `DJANGO_ALLOWED_HOSTS` contient bien l'IP —
sinon ajoute-la temporairement, séparée par une virgule). Teste
l'inscription → création de société → upload du papier entête → création
d'un document → génération du PDF, pour confirmer que le backend, Celery
et le stockage des fichiers fonctionnent bien ensemble sur le VPS.

## 8. HTTPS

Comme pour `shopm.abdelsaliou.dev`, une fois le DNS du sous-domaine propagé :

```bash
sudo apt-get install -y certbot python3-certbot-nginx   # si pas déjà fait pour les autres sites
sudo certbot --nginx -d bordereau.abdelsaliou.dev
```

Certbot édite automatiquement le bloc nginx pour ajouter le HTTPS et le
renouvellement auto. Mets ensuite à jour `.env.prod` :
`DJANGO_CSRF_TRUSTED_ORIGINS=https://bordereau.abdelsaliou.dev`, puis :
```bash
docker compose -f docker-compose.prod.yml up -d
```

## 9. Mettre à jour après un nouveau `git push` (manuellement)

```bash
cd /var/www/bordereau-app
git pull
docker compose -f docker-compose.prod.yml up -d --build   # backend/celery
cd frontend && npm ci && npm run build && cd ..            # frontend
```

Pas besoin de toucher à nginx sauf si tu changes des chemins. **Une fois la
section 10 en place, cette étape se fait automatiquement à chaque push.**

## 10. CI/CD — déploiement automatique à chaque push

Le workflow `.github/workflows/deploy.yml` existe déjà dans le repo : à
chaque push sur `main`, GitHub Actions se connecte en SSH au VPS et relance
exactement la séquence de la section 9. Il ne manque que la connexion —
à faire une seule fois.

**a. Génère une clé SSH dédiée, sur le VPS** (différente de celle qui sert
à cloner depuis GitHub — celle-ci sert dans l'autre sens : GitHub → VPS) :

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gh_actions_deploy -N ""
cat ~/.ssh/gh_actions_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gh_actions_deploy
```

Copie **toute** la sortie de cette dernière commande (de `-----BEGIN
OPENSSH PRIVATE KEY-----` à `-----END OPENSSH PRIVATE KEY-----` inclus).

**b. Ajoute 3 secrets sur GitHub** — sur la page du repo :
**Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
|---|---|
| `VPS_HOST` | l'IP du VPS |
| `VPS_USER` | `fadel` |
| `VPS_SSH_KEY` | la clé privée copiée à l'étape a (le texte complet) |

**c. Teste** : va dans l'onglet **Actions** du repo sur GitHub, ouvre le
workflow "Déploiement VPS", clique **Run workflow** (bouton manuel, grâce à
`workflow_dispatch` dans le fichier) pour le tester sans attendre un vrai
push. Regarde les logs — si tout est vert, chaque `git push` sur `main`
redéploiera désormais automatiquement.

**À savoir** : cette clé SSH a les mêmes droits que ton utilisateur `fadel`
sur le VPS (pas seulement sur `bordereau-app`) — normal pour une clé de
déploiement personnelle sur ton propre serveur, mais si tu veux la limiter
strictement à ce projet plus tard, on peut restreindre la commande
autorisée dans `~/.ssh/authorized_keys` (préfixe `command="..."`), pas fait
par défaut ici pour rester simple.

## Points d'attention

- **Le dossier `./media/`** (créé à la racine du projet au premier lancement
  de Docker, donc `/var/www/bordereau-app/media/`) contient les papiers
  entête et PDF réels — sauvegarde-le régulièrement (`rsync`/`tar`), ce
  n'est pas dans git
- **Postgres/Redis ne sont pas exposés sur Internet** (pas de port publié
  dans `docker-compose.prod.yml`) — seul nginx, en local sur le VPS, parle
  au backend via `127.0.0.1:8001`. Le Postgres 14 natif déjà présent sur le
  VPS (pour `shopm`/`abdelsaliou.dev` probablement) n'est pas touché
- Si `docker compose` (avec espace) ne fonctionne pas, essaie `docker-compose`
  (ancienne syntaxe avec tiret) — dépend de la version installée

## Constats de l'audit (`deploy/vps-audit.sh`, 2026-09-15)

- Ubuntu 22.04, 2 vCPU, 3.7Gi RAM (~900Mi utilisés), **0 swap** → voir la
  recommandation section 0
- **Port 8000 déjà utilisé par `shopm`** (gunicorn) → bordereau-app utilise
  **8001**
- Postgres 14 natif déjà actif sur `127.0.0.1:5432` → pas de conflit,
  bordereau-app a son propre Postgres 16 dans Docker, sans port publié
- Pas de Redis natif → pas de conflit
- Sites nginx existants : `/etc/nginx/sites-available/{abdelsaliou.dev,shopm,default}`,
  un fichier par site, projets dans `/var/www/<nom>` — convention reprise
  ici (`/var/www/bordereau-app`)
- Domaine `abdelsaliou.dev` déjà géré, avec sous-domaine par projet
  (`shopm.abdelsaliou.dev`) — `bordereau.abdelsaliou.dev` suit le même
  pattern (à créer côté DNS si pas déjà fait)
- ufw actif, ports 22/80/443/8000 ouverts — 8001 n'a pas besoin d'être
  ajouté à ufw puisque le backend n'écoute qu'en loopback (127.0.0.1),
  jamais exposé sur l'interface publique

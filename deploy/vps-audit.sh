#!/bin/bash
# Lecture seule — ne modifie rien. À lancer sur le VPS et coller le
# résultat pour adapter DEPLOY.md / le bloc nginx à la vraie structure
# du serveur avant de déployer bordereau-app.

echo "=== OS ==="
cat /etc/os-release 2>/dev/null | head -3

echo -e "\n=== Espace disque ==="
df -h /

echo -e "\n=== RAM ==="
free -h

echo -e "\n=== CPU ==="
nproc

echo -e "\n=== Utilisateur courant / sudo ==="
whoami
groups

echo -e "\n=== Docker déjà présent ? ==="
docker --version 2>&1
docker compose version 2>&1

echo -e "\n=== Ports déjà occupés (pour repérer un conflit avec 8000/5432/6379) ==="
sudo ss -tlnp

echo -e "\n=== Sites nginx déjà configurés ==="
ls -la /etc/nginx/sites-available/ 2>/dev/null
echo "--- enabled ---"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null

echo -e "\n=== server_name / root / proxy_pass de chaque site (pour voir le pattern utilisé) ==="
sudo grep -H -E "server_name|root|proxy_pass|listen" /etc/nginx/sites-available/* 2>/dev/null

echo -e "\n=== Où vivent les projets existants ? ==="
ls -la /var/www/ 2>/dev/null
echo "--- home ---"
ls -la ~/ 2>/dev/null

echo -e "\n=== Pare-feu ==="
sudo ufw status 2>/dev/null

echo -e "\n=== Services actifs pertinents (postgres/redis déjà installés en direct ?) ==="
systemctl list-units --type=service --state=running 2>/dev/null | grep -iE "postgres|redis|nginx|docker"

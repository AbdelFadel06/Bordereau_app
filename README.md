# Bordereaux & Factures — PWA

App PWA pour créer des bordereaux de livraison, bordereaux provisoires et
factures proforma directement sur le papier entête existant de l'entreprise.

## Démarrer

```bash
cp .env.example .env
docker compose up --build
```

- Frontend : http://localhost:5173
- API backend : http://localhost:8000/api/
- Admin Django : http://localhost:8000/admin/

Au premier lancement, initialiser la base :

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

## Structure

- `backend/` — Django + DRF (companies, documents, catalog, ingestion)
- `frontend/` — React + TypeScript + Vite, PWA
- `docker-compose.yml` — postgres, redis, backend, celery (OCR/conversion), frontend

## Flux principal

1. L'utilisateur upload son papier entête une seule fois (`ingestion` app)
   → conversion automatique en image + détection de la zone d'écriture
   (`ingestion/services/zone_detection.py`)
2. Chaque document créé réutilise ce papier entête comme fond de page
   (`documents/services/pdf_render.py`, rendu via WeasyPrint)

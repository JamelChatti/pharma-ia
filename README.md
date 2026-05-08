# Pharma IA Backend

Backend NestJS + Prisma pour le flux ventes/retours pharmacie.

## Prerequis

- Node.js 22+
- Docker (pour PostgreSQL)

## Setup local

```bash
npm install
cp .env.example .env
docker compose up -d db
npx prisma db push
npm run seed:e2e
npm run start:dev
```

API locale: `http://localhost:3000/api`

## Variables .env

Le projet utilise au minimum:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`

Un fichier `.env.example` est versionne pour le mode local.
Sous Windows PowerShell, utilise plutot: `Copy-Item .env.example .env`.

## Scripts utiles

```bash
# qualite
npm run lint
npm run build
npm run test
npm run test:e2e

# seed
npm run seed:e2e

# smoke API via Postman/Newman
npm run smoke:postman
```

## Demo rapide (Postman)

Collection minimale: `postman/pharma-ia-minimal-flow.postman_collection.json`

Ordre des requetes:

1. `1) Auth Login`
2. `2) Create Sale`
3. `3) Create Return`

En local, relancer `npm run seed:e2e` remet un jeu de donnees propre.

## CI Smoke

Workflow GitHub Actions: `.github/workflows/ci-smoke.yml`

Ce job:

1. demarre PostgreSQL,
2. prepare le schema (`prisma db push`),
3. seed la base (`npm run seed:e2e`),
4. lance l'API,
5. execute le flow Postman via Newman.

Le but est de detecter rapidement les regressions du flux Auth/Vente/Retour sur chaque push/PR.

## Runbooks

- Release checklist: `docs/release-checklist.md`

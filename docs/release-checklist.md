# Release Checklist

Checklist simple pour publier une version backend avec un risque minimal.

## 1) Pre-release (technique)

- [ ] Branche `main` a jour et propre (`git status` sans changements).
- [ ] CI verte sur le dernier commit (`CI Smoke` + tests).
- [ ] Dependances installees proprement (`npm ci`).
- [ ] Variables d'environnement verifiees (pas de secrets hardcodes).
- [ ] Migration/schema valide (`npx prisma db push` ou migration adaptee).

## 2) Validation qualite

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test -- --runInBand`
- [ ] `npm run test:e2e`
- [ ] `npm run smoke:postman`

## 3) Validation metier minimale

- [ ] `Auth Login` repond en `200/201`.
- [ ] `Create Sale` repond en `201`.
- [ ] `Create Return` repond en `201`.
- [ ] Messages d'erreur critiques valides (401, 403, 404, 400).

## 4) Release operationnelle

- [ ] Version/tag defini (ex: `v0.1.0`).
- [ ] Notes de release redigees (changements majeurs + impacts).
- [ ] Fenetre de deploiement confirmee.
- [ ] Point de contact incident designe.

## 5) Rollback plan

- [ ] Strategie rollback validee (image precedente/commit precedent).
- [ ] Procedure de restoration DB connue si necessaire.
- [ ] Commandes rollback pretes et testees sur un environnement de test.

## 6) Post-release

- [ ] Smoke test execute en prod/staging juste apres deploiement.
- [ ] Monitoring/logs observes pendant 15-30 min.
- [ ] Incident review rapide si anomalies.
- [ ] Checklist archivee avec date + SHA publie.

---

## Quick Run (copier/coller)

```bash
npm ci
npx prisma db push
npm run seed:e2e
npm run lint
npm run build
npm run test -- --runInBand
npm run test:e2e
npm run smoke:postman
```

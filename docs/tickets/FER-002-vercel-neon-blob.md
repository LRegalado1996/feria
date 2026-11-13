# FER-002 Vercel project, Neon database and Blob storage

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-001

## Goal

The app runs on Vercel at its auto-generated URL, backed by a real Postgres database and a file store.

## Scope

- Create and link the Vercel project; connect the GitHub repo.
- Two environments: production deploys from `main`; QA deploys from `qa` at a stable URL of its own, with its own environment variables.
- Provision Neon Postgres through the Vercel Marketplace, with one database for production and one for QA, plus the per-PR branches the template's Neon workflows create.
- Provision a Vercel Blob store for article, banner and logo images.
- Connect Vercel AI Gateway for the Claude calls in FER-018, with a monthly spend limit.
- Set the environment variables per environment (`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, Blob and gateway credentials) and extend `src/env.js` and `.env.example` to match.
- Run migrations on deploy the way the template documents; confirm `/api/health` answers on the deployed URL.

## Out of scope

The custom domain (FER-032). Sentry and CI secrets (FER-003).

## Acceptance criteria

- A merge into `qa` updates the QA URL and a merge into `main` updates production; each passes its health check against its own database.
- Data written in QA never appears in production.
- `vercel env pull` gives a working local `.env` for someone new to the project.
- No secret is committed; `.env.example` lists every variable with a comment.

## Notes

Needs Lucas for the interactive steps: Vercel login, Marketplace terms, billing confirmation.

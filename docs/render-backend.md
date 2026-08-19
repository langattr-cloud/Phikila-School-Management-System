# Render backend deployment

This deployment keeps the existing frontend and application modules intact while moving the FastAPI backend to a persistent Render Web Service. OR-Tools is installed in the same backend image, so timetable generation runs locally in the API process instead of through a separate solver service.

## Render service

- Repository: `langattr-cloud/Phikila-School-Management-System`
- Branch: `agent/render-backend`
- Runtime: Docker
- Dockerfile: `Dockerfile.render`
- Health check: `/health`
- Port: Render-provided `PORT` (the image defaults to 8000 locally)

`render.yaml` can also be used as the service blueprint.

## Required environment variables

Set these in Render. Secret values must not be committed to GitHub.

- `ENVIRONMENT=production`
- `DATABASE_URL` — the Supabase PostgreSQL connection string used by the backend
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_JWT_AUDIENCE=authenticated`
- `SUPABASE_JWT_SECRET` — if used by the current Supabase authentication configuration
- `APP_JWT_SECRET` — if used by the current application authentication configuration
- `CORS_ORIGINS` — exact frontend origin(s), comma-separated, without a trailing slash
- `RESEND_API_KEY` — if email features are enabled
- `RESEND_FROM_EMAIL` — if email features are enabled

## Verification

After deployment:

1. `GET /health` should return `status: ok` and `solver_available: true`.
2. `GET /ready` should return `status: ready` and `database: connected`.
3. Open `/docs` and verify the API is reachable.
4. Point the frontend API base URL at the Render service and verify authentication.
5. Generate a timetable and verify the solver job reaches `completed` and a timetable version/lessons are persisted in Supabase.

## Scope protection

The Render branch is intentionally separate from `main`. The frontend remains on its existing deployment until the Render backend has been verified. Do not remove or change the existing Vercel deployment until the Render service and frontend integration have passed verification.

# Phikila School Management System

A Vite/React frontend and FastAPI backend configured for **Vercel**, **Supabase Auth**, and **Supabase Postgres**.

## Repository layout

- `/frontend` — React + Vite browser application
- `/app` and `/api/index.py` — FastAPI application and Vercel entrypoint
- `/alembic` — database migrations

## Local setup

### Backend

```bash
cp .env.example .env
# Fill in the Supabase values
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs are available at `http://localhost:8000/docs` and health status at `http://localhost:8000/health`.

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in the public Supabase URL/key and API URL
npm install
npm run dev
```

Only the Supabase **publishable/anon key** belongs in `VITE_SUPABASE_ANON_KEY`. Never put the service-role key, database password, JWT secret, or other backend secrets in a `VITE_*` variable.

## Supabase setup

1. In **Authentication > Providers**, enable Email authentication.
2. Create staff accounts in **Authentication > Users**, or add an approved sign-up flow later.
3. In **Authentication > URL Configuration**, set:
   - Site URL: the production frontend Vercel URL
   - Redirect URLs: the production URL and any frontend preview patterns you permit
4. Obtain the database **transaction pooler** URI from **Project Settings > Database**. Use port `6543` and append `?sslmode=require`.
5. Run migrations against Supabase from a trusted local/CI environment:

```bash
DATABASE_URL='your-pooler-uri' alembic upgrade head
```

Do not run migrations automatically inside a Vercel function.

## Deploying to Vercel

Create **two Vercel projects from this same repository**.

### Backend project

- Root Directory: repository root
- Framework preset: Other
- Environment variables (Production and Preview):
  - `DATABASE_URL` — Supabase transaction-pooler URI
  - `ENVIRONMENT=production`
  - `SUPABASE_URL=https://PROJECT_REF.supabase.co`
  - `SUPABASE_JWT_AUDIENCE=authenticated`
  - `CORS_ORIGINS=https://your-frontend.vercel.app`
  - `CORS_ORIGIN_REGEX` — optional, only for controlled preview domains
  - `SUPABASE_JWT_SECRET` — only for projects still issuing legacy HS256 tokens

The backend URL should respond at `/health`, `/docs`, and `/api/v1/auth/me`.

### Frontend project

- Root Directory: `frontend`
- Framework preset: Vite
- Environment variables (Production and Preview):
  - `VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key`
  - `VITE_API_URL=https://your-backend.vercel.app`

After the first frontend deployment, copy its final origin into the backend project's `CORS_ORIGINS`, then redeploy the backend. After the first backend deployment, copy its origin into `VITE_API_URL`, then redeploy the frontend.

## Authentication flow

1. The frontend signs in directly through Supabase Auth.
2. Supabase stores and refreshes the browser session.
3. `frontend/src/lib/api.ts` attaches the access token as a Bearer token.
4. FastAPI verifies the signature, issuer, audience, and expiry using Supabase's JWKS endpoint.
5. Protected backend routes can add `Depends(get_supabase_claims)` from `app.modules.authentication.supabase`.

The existing `/api/v1/auth/login` endpoint is retained for backward compatibility but is not used by the new frontend. In production it requires `APP_JWT_SECRET`; otherwise use Supabase Auth.

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

## Deploying to Vercel (single domain — recommended)

The FastAPI app serves the built frontend, so **one Vercel project and one domain
serve both the web app and the API** (no CORS needed). Root `/` is the React app;
`/health`, `/docs`, and `/api/*` are the API.

1. Create **one Vercel project** with **Root Directory: repository root**, Framework
   preset **Other**.
2. Set the **Install Command** to `npm install` and the **Build Command** to:
   ```
   cd frontend && npm run build
   ```
   This builds the Vite app into `frontend/dist`, which FastAPI serves at `/`.
   (Omit the `cd frontend &&` if Vercel runs from the frontend directory.)
3. Set the environment variables (Production and Preview):
   - `DATABASE_URL` — Supabase **transaction-pooler** URI (required — the app fails
     to boot without it)
   - `ENVIRONMENT=production`
   - `SUPABASE_URL=https://PROJECT_REF.supabase.co`
   - `SUPABASE_JWT_AUDIENCE=authenticated`
   - `CORS_ORIGINS=https://your-app.vercel.app` (same origin as the frontend)
   - `CORS_ORIGIN_REGEX` — optional, for preview domains
   - `SUPABASE_JWT_SECRET` — only for projects still issuing legacy HS256 tokens
   - `VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co` (public anon value)
   - `VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key` (public anon value)
   - `VITE_API_URL` — optional; omit for same-origin (recommended). Set only if the
     frontend is ever served from a different origin.

   The `VITE_*` variables are read at build time; the rest are read at runtime by
   the serverless function.

4. Redeploy. The site should respond at `/` (frontend) and `/health` (API).

### Alternative: two separate projects

If you prefer the frontend and API as separate Vercel projects, use:

- Backend project — Root: repository root. Env: `DATABASE_URL`, `ENVIRONMENT`,
  `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE`, `CORS_ORIGINS` (the frontend origin).
- Frontend project — Root: `frontend`, preset Vite. Env: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=https://your-backend.vercel.app`.

After the first frontend deployment, copy its final origin into the backend's
`CORS_ORIGINS` and redeploy the backend. After the first backend deployment, copy
its origin into `VITE_API_URL` and redeploy the frontend.

## Authentication flow

1. The frontend signs in directly through Supabase Auth.
2. Supabase stores and refreshes the browser session.
3. `frontend/src/lib/api.ts` attaches the access token as a Bearer token.
4. FastAPI verifies the signature, issuer, audience, and expiry using Supabase's JWKS endpoint.
5. Protected backend routes can add `Depends(get_supabase_claims)` from `app.modules.authentication.supabase`.

The existing `/api/v1/auth/login` endpoint is retained for backward compatibility but is not used by the new frontend. In production it requires `APP_JWT_SECRET`; otherwise use Supabase Auth.

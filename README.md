# Phikila School Management System

A React/Vite frontend and FastAPI backend deployed together on Vercel with
Supabase Auth and Supabase Postgres.

## Repository layout

- `/frontend` — React + Vite browser application
- `/app` — FastAPI application
- `/api/index.py` — compatibility entrypoint that exports the FastAPI app
- `/alembic` — database migrations (run manually from trusted local/CI tooling)
- `/vercel.json` — the only production Vercel project configuration

## Local setup

### Backend

```bash
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs are at `http://localhost:8000/docs`; health is at
`http://localhost:8000/health`.

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

The frontend requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Every
`VITE_*` value is public browser configuration: only the Supabase
publishable/anon key belongs in `VITE_SUPABASE_ANON_KEY`. Never use a Supabase
service-role key, database URL/password, JWT secret, or other backend secret in
a `VITE_*` variable.

For local same-origin production testing:

```bash
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co \
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key \
npm --prefix frontend run build
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Vercel architecture

Use **one Vercel project**, with its Root Directory set to the repository root.
The checked-in `vercel.json` selects Vercel's FastAPI framework preset and
explicitly runs:

- install: `python -m pip install -r requirements.txt`, then
  `npm --prefix frontend ci --include=dev`
- build: `npm --prefix frontend run build`, followed by an existence check for
  `frontend/dist/index.html`

Vercel packages the FastAPI application after the build. FastAPI mounts
`frontend/dist` last, so `/health`, `/docs`, `/redoc`, `/openapi.json`, and
`/api/v1/*` remain backend routes while `/` and frontend routes serve React.
Vercel's FastAPI integration can promote mounted static files such as
`/assets/*` and `/favicon.svg` to its CDN.

There is intentionally no catch-all rewrite to `/api/index`. SPA fallback is
implemented by the FastAPI static mount: real files are served first, missing
browser routes receive `index.html`, and missing asset/API paths remain 404s.

Python is pinned to 3.12 in `.python-version`.

## Vercel Production environment

Configure these in **Project Settings > Environment Variables**, scoped to
**Production**, then redeploy:

| Variable | Required | Purpose |
| --- | --- | --- |
| `ENVIRONMENT=production` | Yes | Production health/config label. Vercel's system `VERCEL_ENV=production` is also treated as authoritative to prevent a stale value from reporting development. |
| `DATABASE_URL` | Yes | Supabase **transaction pooler** URI on port 6543 with `sslmode=require`. |
| `SUPABASE_URL` | Yes | `https://PROJECT_REF.supabase.co`; used to derive the JWT issuer and JWKS URL. |
| `SUPABASE_JWT_AUDIENCE=authenticated` | Yes | Expected access-token audience. |
| `VITE_SUPABASE_URL` | Yes | Public Supabase project URL embedded at build time. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public publishable/anon key embedded at build time. |
| `SUPABASE_JWT_SECRET` | Legacy only | Server-side verification for projects still issuing HS256 tokens. Omit for asymmetric JWKS tokens. |
| `APP_JWT_SECRET` | Legacy only | Enables the old local username/password token endpoint. Omit when using only Supabase Auth. |

For the intended same-origin deployment, remove/omit:

- `VITE_API_URL` — relative requests already reach the same Vercel origin.
- `CORS_ORIGINS` and `CORS_ORIGIN_REGEX` — same-origin requests do not use CORS.
- any `VITE_*` variable containing a database URL/password, service-role key,
  JWT secret, private key, or other backend credential.

If a genuinely separate trusted origin is added later, configure exact
`CORS_ORIGINS` values for that environment. Wildcard origins are rejected and
must never be combined with credentials.

## Supabase and authentication

1. Enable the intended sign-in provider in **Authentication > Providers**.
2. Set the production site URL and only the required redirect URLs in
   **Authentication > URL Configuration**.
3. The browser signs in directly with the public anon key and Supabase stores
   and refreshes its session.
4. `frontend/src/lib/api.ts` sends the access token as
   `Authorization: Bearer <token>` to same-origin FastAPI routes.
5. FastAPI accepts only HS256 (with the server-side legacy secret), RS256, or
   ES256 signatures and validates token expiry, subject, issuer, and audience.
6. Users, school, and academics routers have the Supabase verification
   dependency; `/api/v1/auth/me` verifies it directly.

## Database and serverless operation

Use the Supabase transaction-pooler connection URI. The application uses
SQLAlchemy `NullPool` for non-SQLite databases, opens one session per request,
and closes it in the dependency finalizer. It has no persistent workers,
startup schedulers, or runtime filesystem writes.

Run migrations only from a trusted local or CI environment:

```bash
DATABASE_URL='your-pooler-uri' alembic upgrade head
```

Do **not** run migrations during a Vercel build or function startup.

## Deployment smoke checks

After each production deployment, verify:

```text
GET /                     -> text/html React application
GET /health               -> {"status":"ok","environment":"production"}
GET /docs                 -> FastAPI Swagger UI
GET /redoc                -> FastAPI ReDoc
GET /openapi.json         -> FastAPI OpenAPI JSON
GET /api/v1/auth/me       -> 401 without a Bearer token
GET /assets/<built-file>  -> JavaScript/CSS static asset
GET /favicon.svg          -> image/svg+xml
GET /<frontend-route>     -> React index.html
```

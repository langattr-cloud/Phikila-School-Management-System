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
pip install -r requirements.txt -r requirements-solver.txt  # solver is optional
uvicorn app.main:app --reload
```

API docs are at `http://localhost:8000/docs`; health is at
`http://localhost:8000/health`.

### Two-minute demo (no Supabase needed)

With `DATABASE_URL` and `SUPABASE_URL` unset, the app runs in **local
mode**: SQLite stores the data and the backend's own
`POST /api/v1/auth/login` endpoint issues the access tokens (signed with
`APP_JWT_SECRET`). Seed a complete school — calendar, 12 teachers, 11 rooms,
14 subjects, 7 classes, weekly lesson requirements — and generate a real
timetable with the CP-SAT engine:

```bash
PYTHONPATH=. python scripts/seed_demo.py   # idempotent; also runs the solver
uvicorn app.main:app                       # then open http://localhost:8000
```

Demo logins (password `demo2026`):

| Account | Role | Lands on |
| --- | --- | --- |
| `admin@phikila.com` | school + platform admin | whole-school timetable editor |
| `teacher@phikila.com` | teacher | Mr. Kamau's timetable |
| `student@phikila.com` | student | Form 3A timetable |

Production is unchanged: PostgreSQL (Supabase) via `alembic upgrade head`,
Supabase Auth in the browser. The local mode is only active when no Supabase
project is configured.

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

## Timetable scheduling

A CP-SAT timetable engine lives in `app/modules/scheduling/`. Hard constraints
(no teacher/class/room double-booking, availability, weekly quotas, daily
limits, special-room-type capacity for labs and computer rooms) are
guaranteed by construction; soft preferences (teacher gaps, subject spread,
morning lessons, workload balance) become weighted penalties in a single
objective. A deterministic post-solve pass houses every lesson in a concrete
room, honouring room type, capacity, availability and double-booking.

The timetable workspace (`/timetable`) supports drag-and-drop moves with
conflict rejection and suggested alternatives, a drag-down resize handle to
change lesson duration, an unassigned-lessons panel whose chips drag straight
onto the grid, lock / duplicate / delete, day filters, zoom and compact
density, a live "now" highlight, undo/redo (Ctrl/Cmd+Z), a command palette
(Ctrl/Cmd+K), CSV / ICS / PNG export and a print stylesheet. Teachers and
students get a dedicated mobile-first "My timetable" view with today / week
tabs and offline caching.

The AI copilot (`/scheduling/copilot`) is an assistant around the engine,
never the engine itself. Question commands are answered directly from the
stored timetable — e.g. *"Find a free period for Form 3A and Mr. Kamau"* or
*"Why can't I put Physics in Lab 2 on Tuesday?"* — while rule commands
persist inspectable constraints that the CP-SAT solver honours on the next
generation run.

### The scheduling engine is optional at runtime

`ortools` pulls in numpy and pandas — roughly 200 MB unpacked, which exceeds
Vercel's 250 MB Python lambda limit. It is therefore **not** in
`requirements.txt`. The application detects this at import time and degrades
cleanly: every screen works, and generation returns a clear "scheduling engine
unavailable" message instead of failing.

To run generation, install the engine on a host without that limit:

```bash
pip install -r requirements.txt -r requirements-solver.txt
uvicorn app.main:app
```

Suitable hosts include Railway, Fly.io, Render, or any container/VM. Point
`DATABASE_URL` at the same Supabase database as the Vercel deployment; the
worker picks jobs up from the `tt_solver_jobs` table, so no extra queue
infrastructure is needed. The job interface is deliberately storage-backed so
Redis/Celery can be dropped in later without changing a single API route.

### Database

```bash
alembic upgrade head          # creates the tt_* tables (additive only)
psql "$DATABASE_URL" -f docs/rls.sql   # optional: PostgreSQL RLS policies
```

The schema is multi-tenant from the start: every school-owned row carries
`school_id`, and `school_id` is resolved server-side from the verified Supabase
token — never accepted from the client.

### Roles

`viewer < student < teacher < scheduler < admin < super_admin`. Reads require
membership in the school; writes require `scheduler` or above; publishing
requires `admin`. The first authenticated user of a fresh deployment bootstraps
the school as its admin; everyone after that must be invited, so public sign-up
can never self-grant privileges.

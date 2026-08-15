# AGENTS.md

FastAPI backend for the Phikila School Management System (React frontend lives in the sibling `frontend/` dir). Modular architecture under `app/modules/<name>/` — each module has `models.py`, `schemas.py`, `router.py`, plus optional `services.py`/`repository.py`.

## Commands

```bash
pip install -r requirements.txt
alembic upgrade head          # runs against the .env DATABASE_URL, not alembic.ini
python seed_admin.py          # creates admin@phikila.com / 2026phikila (idempotent)
uvicorn app.main:app --reload # server on :8000, docs at /docs
```

There is **no test framework** (no pytest config, no tests/). `test_timetable_route.py` is an ad-hoc ASGI scope script; don't treat it as a suite.

## Database gotchas

- The real DB is the **Supabase cloud instance** in `.env` `DATABASE_URL`. `alembic/env.py` overrides `alembic.ini`'s `sqlalchemy.url` from that env var, and `app/core/database.py` does `load_dotenv(override=True)`. So migrations hit the **live database** — be careful with destructive changes. `app/config.py` is dead code, ignore it.
- `.env` holds live credentials; never expose, commit, or log them.
- `alembic/versions/` contains stale `*.bak` files — not applied migrations, ignore them. `repair_alembic.py` is a one-off script that hand-stamps the version table (OLD `0f66f2465814` → NEW `cfc36a84b06f`); not part of normal flow.

## Router prefix gotcha

Two mounting styles in `app/main.py` — check a module's router before adding routes:

- Routers that **declare their own prefix** (`/users`, `/school`, `/departments`, `/subjects`, `/students`, `/class_register`, `/timetable`, `/finance`): mounted with only `/api/v1` in `main.py`.
- Routers with **no prefix** (`auth`, `academics`, `teachers`, `examinations`, `reports`): the full path segment is added in `main.py` (`/api/v1/auth`, `/api/v1/teachers`, etc.).

Never add a prefix to a no-prefix router, and never mount a prefixed router with a duplicate segment (this double-prefix bug already happened to `teachers`).

## Auth & hashing

- JWT login: `POST /api/v1/auth/login` (OAuth2 form). `create_access_token` encodes the user's **email** as `sub`.
- The only correct password hashing is `app/modules/authentication/security.py` (bcrypt). `app/core/security.py` uses `sha256_crypt` and is **dead/inconsistent — never import it**. `seed_admin.py` also uses bcrypt.
- Use `from app.modules.authentication.dependencies import get_current_user` for protected routes (re-exports the working impl from `tokens.py`).

## Adding a module or model

- New modules: create under `app/modules/<name>/`, mount the router in `app/main.py`, and **import the models in `alembic/env.py`** or autogenerate won't see them.
- `static/` is auto-created and served at `/static` (school logo uploads).

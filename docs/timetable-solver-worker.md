# Timetable solver worker deployment

Phikila's timetable optimiser uses Google OR-Tools CP-SAT. OR-Tools is intentionally kept out of the Vercel API bundle. The API creates a `tt_solver_jobs` row and dispatches the job to this dedicated Python worker.

## Worker

Build the repository with `Dockerfile.solver-worker` or run:

```bash
pip install -r requirements.txt -r requirements-solver.txt
uvicorn app.modules.scheduling.worker:app --host 0.0.0.0 --port 8000
```

The worker requires:

- `DATABASE_URL` — the same Supabase PostgreSQL connection used by the API.
- `SOLVER_WORKER_TOKEN` — a long random shared secret.

Check:

```text
GET /health
```

Expected response includes `"solver_available": true`.

## Vercel API

Configure these server-side environment variables:

- `SOLVER_WORKER_URL` — public HTTPS URL of the worker, without a trailing slash.
- `SOLVER_WORKER_TOKEN` — exactly the same secret as the worker.

Do not expose either variable as a `VITE_*` client-side variable.

## Request flow

1. `/api/v1/scheduling/solver/generate` creates a queued `tt_solver_jobs` record.
2. The API POSTs the job ID to the worker's `/run` endpoint.
3. The worker schedules the CP-SAT run in a background task.
4. The worker updates job progress and persists the generated `tt_versions` and `tt_lessons` using the shared database.
5. The existing job-status endpoint reads the final state from Supabase.

The worker should be deployed as a persistent service, not a Vercel serverless function.

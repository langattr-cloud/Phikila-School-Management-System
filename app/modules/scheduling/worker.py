"""Standalone HTTP entrypoint for the timetable CP-SAT worker."""
from __future__ import annotations

import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .jobs import _run_job
from .solver import ORTOOLS_AVAILABLE

app = FastAPI(title="Phikila Timetable Solver Worker")


class SolverJob(BaseModel):
    job_id: int
    school_id: int
    max_seconds: float = 30.0


@app.get("/health")
def health():
    return {"ok": True, "solver_available": ORTOOLS_AVAILABLE}


@app.post("/run", status_code=202)
def run(job: SolverJob, authorization: str | None = Header(default=None)):
    expected = os.getenv("SOLVER_WORKER_TOKEN", "")
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(401, "Invalid worker token")
    if not ORTOOLS_AVAILABLE:
        raise HTTPException(503, "OR-Tools is not installed on the worker")
    _run_job(job.job_id, job.school_id, job.max_seconds)
    return {"accepted": True, "job_id": job.job_id}

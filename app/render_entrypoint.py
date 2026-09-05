"""Render process supervisor for the API and durable timetable worker."""
from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import time

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s [render-supervisor] %(message)s", force=True)
logger = logging.getLogger("render-supervisor")


def start_worker() -> subprocess.Popen:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    return subprocess.Popen(
        [sys.executable, "-u", "-m", "app.modules.scheduling.worker"],
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=None,
        stderr=None,
        start_new_session=True,
    )


def run_migrations() -> None:
    logger.info("Running database migrations")
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=False)
    if result.returncode != 0:
        logger.error("Database migrations failed with code %s; API will remain available", result.returncode)
    else:
        logger.info("Database migrations completed")


def main() -> int:
    port = os.getenv("PORT", "10000")
    stopping = False
    api: subprocess.Popen | None = None
    worker: subprocess.Popen | None = None

    def stop(_signum, _frame):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        logger.info("Shutdown requested; stopping API and solver worker")
        for child in (worker, api):
            if child is not None and child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    logger.info("Starting FastAPI on port %s", port)
    api = subprocess.Popen([
        sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port,
    ], env={**os.environ, "PYTHONUNBUFFERED": "1"})

    # Start the web server first. Render must see the configured port quickly;
    # migrations must never prevent the service from binding its port.
    time.sleep(1)
    if stopping:
        if api.poll() is None:
            api.terminate()
        return 0

    run_migrations()
    if stopping:
        if api.poll() is None:
            api.terminate()
        return 0

    logger.info("Starting dedicated timetable solver worker")
    worker = start_worker()
    logger.info("Solver worker process started pid=%s", worker.pid)

    while not stopping:
        worker_code = worker.poll()
        api_code = api.poll()
        if worker_code is not None:
            logger.error("Solver worker exited with code %s; restarting it", worker_code)
            worker = start_worker()
            logger.info("Solver worker restarted pid=%s", worker.pid)
        if api_code is not None:
            logger.error("FastAPI exited with code %s", api_code)
            stopping = True
            break
        time.sleep(1)

    for child in (worker, api):
        if child is not None and child.poll() is None:
            child.terminate()
    return api.poll() if api is not None and api.poll() is not None else 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Render process supervisor for the FastAPI service."""
from __future__ import annotations
import logging
import os
import signal
import subprocess
import sys
import time

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s [render-supervisor] %(message)s", force=True)
logger = logging.getLogger("render-supervisor")

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
    def stop(_signum, _frame):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        logger.info("Shutdown requested; stopping API")
        if api is not None and api.poll() is None:
            api.terminate()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    logger.info("Starting FastAPI on port %s", port)
    api = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port],
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    time.sleep(1)
    if not stopping:
        run_migrations()
    while not stopping:
        code = api.poll()
        if code is not None:
            logger.error("FastAPI exited with code %s", code)
            return code
        time.sleep(1)
    if api.poll() is None:
        api.terminate()
        try:
            return api.wait(timeout=10)
        except subprocess.TimeoutExpired:
            api.kill()
            return api.wait()
    return api.returncode or 0

if __name__ == "__main__":
    raise SystemExit(main())

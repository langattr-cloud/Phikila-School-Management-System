"""Render process supervisor for the API and durable timetable worker."""
from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import time

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [render-supervisor] %(message)s",
    force=True,
)
logger = logging.getLogger("render-supervisor")


def main() -> int:
    port = os.getenv("PORT", "10000")
    children: list[subprocess.Popen] = []
    stopping = False

    def stop(_signum, _frame):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        logger.info("Shutdown requested; stopping API and solver worker")
        for child in children:
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    logger.info("Starting dedicated timetable solver worker")
    worker = subprocess.Popen([sys.executable, "-m", "app.modules.scheduling.worker"])
    children.append(worker)

    logger.info("Starting FastAPI on port %s", port)
    api = subprocess.Popen([
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        port,
    ])
    children.append(api)

    while not stopping:
        worker_code = worker.poll()
        api_code = api.poll()

        if worker_code is not None:
            logger.error("Solver worker exited with code %s; restarting it", worker_code)
            worker = subprocess.Popen([sys.executable, "-m", "app.modules.scheduling.worker"])
            children[0] = worker

        if api_code is not None:
            logger.error("FastAPI exited with code %s", api_code)
            stopping = True
            break

        time.sleep(1)

    for child in children:
        if child.poll() is None:
            child.terminate()

    deadline = time.time() + 10
    for child in children:
        remaining = max(0, deadline - time.time())
        try:
            child.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            child.kill()

    return api.poll() if api.poll() is not None else 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Server-side Upstash Redis client.

Redis is an infrastructure dependency for backend-only concerns such as
rate limiting. Credentials are read exclusively from the process environment.
"""

from __future__ import annotations

import os
from functools import lru_cache

from upstash_redis import Redis


class RedisConfigurationError(RuntimeError):
    """Raised when Redis is required but its Render environment is incomplete."""


@lru_cache(maxsize=1)
def get_redis() -> Redis | None:
    """Return the shared Redis REST client, or ``None`` when not configured."""
    url = os.getenv("UPSTASH_REDIS_REST_URL", "").strip()
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()

    if not url and not token:
        return None
    if not url or not token:
        raise RedisConfigurationError(
            "Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured."
        )

    # Explicitly pass environment values so this module never searches the
    # frontend build environment or exposes credentials through application data.
    return Redis(url=url, token=token)


def redis_configured() -> bool:
    return bool(
        os.getenv("UPSTASH_REDIS_REST_URL", "").strip()
        and os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()
    )


def check_redis_connectivity() -> bool:
    """Perform a backend-only Redis health check without returning credentials."""
    client = get_redis()
    if client is None:
        return False
    return bool(client.ping())

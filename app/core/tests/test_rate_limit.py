import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from app.core import redis as redis_service
from app.core import rate_limit
from app.modules.platform.authz import Identity
from app.modules.scheduling.tenancy import Principal


class FakeRedis:
    def __init__(self, ping_result=True):
        self.ping_result = ping_result

    def ping(self):
        return self.ping_result


class FakeLimiter:
    def __init__(self, allowed=True):
        self.allowed = allowed
        self.identifiers = []

    def limit(self, identifier):
        self.identifiers.append(identifier)
        return SimpleNamespace(allowed=self.allowed, reset=9_999_999_999)


def request(method="POST", path="/api/v1/test", host="10.0.0.1"):
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "client": (host, 1234),
        "scheme": "https",
        "server": ("testserver", 443),
    }
    return Request(scope)


class RedisRateLimitTests(unittest.TestCase):
    def test_redis_connectivity(self):
        redis_service.get_redis.cache_clear()
        with patch.object(redis_service, "get_redis", return_value=FakeRedis()):
            self.assertTrue(redis_service.check_redis_connectivity())

    def test_allowed_request_passes(self):
        limiter = FakeLimiter(allowed=True)
        with patch.object(rate_limit, "_limiter", return_value=limiter):
            rate_limit._enforce(rate_limit.AUTH_LOGIN, "ip:10.0.0.1")
        self.assertEqual(limiter.identifiers, ["ip:10.0.0.1"])

    def test_exceeded_request_returns_429(self):
        limiter = FakeLimiter(allowed=False)
        with patch.object(rate_limit, "_limiter", return_value=limiter):
            with self.assertRaises(HTTPException) as raised:
                rate_limit._enforce(rate_limit.AUTH_LOGIN, "ip:10.0.0.1")
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.headers["Retry-After"], "1")

    def test_user_isolation_uses_authenticated_user_id(self):
        limiter = FakeLimiter()
        first = Principal("user-a", "a@example.com", 11, "admin")
        second = Principal("user-b", "b@example.com", 11, "admin")
        with patch.object(rate_limit, "_enforce") as enforce:
            rate_limit.rate_limit_scheduling_mutation(request(), first)
            rate_limit.rate_limit_scheduling_mutation(request(), second)
        identifiers = [call.args[1] for call in enforce.call_args_list]
        self.assertEqual(identifiers[0], "school:11:user:user-a")
        self.assertEqual(identifiers[1], "school:11:user:user-b")

    def test_school_isolation_uses_server_derived_school_id(self):
        first = Principal("same-user", "a@example.com", 11, "admin")
        second = Principal("same-user", "a@example.com", 22, "admin")
        with patch.object(rate_limit, "_enforce") as enforce:
            rate_limit.rate_limit_scheduling_mutation(request(), first)
            rate_limit.rate_limit_scheduling_mutation(request(), second)
        identifiers = [call.args[1] for call in enforce.call_args_list]
        self.assertEqual(identifiers[0], "school:11:user:same-user")
        self.assertEqual(identifiers[1], "school:22:user:same-user")

    def test_platform_identity_uses_server_memberships_not_request_school_id(self):
        identity = Identity(
            user_id="admin-1",
            email="admin@example.com",
            is_super_admin=True,
            memberships={7: "admin", 9: "scheduler"},
        )
        with patch.object(rate_limit, "_enforce") as enforce:
            rate_limit.rate_limit_platform_mutation(
                request(path="/api/v1/platform/schools/7"), identity
            )
        self.assertEqual(
            enforce.call_args.args[1],
            "tenant:7,9:user:admin-1",
        )

    def test_frontend_cannot_receive_upstash_credentials(self):
        self.assertFalse(any(name.startswith("VITE_UPSTASH_") for name in os.environ))
        with patch.object(rate_limit, "_enforce") as enforce:
            identity = Identity("admin-1", "admin@example.com", True, {7: "admin"})
            rate_limit.rate_limit_platform_mutation(
                request(path="/api/v1/platform/schools/7"), identity
            )
        for call in enforce.call_args_list:
            self.assertNotIn("UPSTASH_REDIS_REST_TOKEN", repr(call))
            self.assertNotIn("UPSTASH_REDIS_REST_URL", repr(call))


if __name__ == "__main__":
    unittest.main()

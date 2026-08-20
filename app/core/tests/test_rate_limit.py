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
    def __init__(self, allowed=True, reset=9_999_999_999):
        self.allowed = allowed
        self.reset = reset
        self.identifiers = []

    def limit(self, identifier):
        self.identifiers.append(identifier)
        return SimpleNamespace(allowed=self.allowed, reset=self.reset)


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
    def setUp(self):
        os.environ.pop("REDIS_RATE_LIMIT_FAIL_OPEN", None)
        redis_service.get_redis.cache_clear()

    def tearDown(self):
        os.environ.pop("REDIS_RATE_LIMIT_FAIL_OPEN", None)
        redis_service.get_redis.cache_clear()

    def test_redis_connectivity(self):
        with patch.object(redis_service, "get_redis", return_value=FakeRedis()):
            self.assertTrue(redis_service.check_redis_connectivity())

    def test_partial_redis_configuration_raises_configuration_error(self):
        with patch.dict(os.environ, {"UPSTASH_REDIS_REST_URL": "https://example.upstash.io"}, clear=False):
            os.environ.pop("UPSTASH_REDIS_REST_TOKEN", None)
            with self.assertRaises(redis_service.RedisConfigurationError):
                redis_service.get_redis()

    def test_redis_configuration_error_returns_503_by_default(self):
        with patch.object(
            rate_limit,
            "_limiter",
            side_effect=redis_service.RedisConfigurationError("missing token"),
        ):
            with self.assertRaises(HTTPException) as raised:
                rate_limit._enforce(rate_limit.AUTH_LOGIN, "ip:10.0.0.1")
        self.assertEqual(raised.exception.status_code, 503)
        self.assertNotIn("UPSTASH", raised.exception.detail)

    def test_redis_failure_can_explicitly_fail_open(self):
        os.environ["REDIS_RATE_LIMIT_FAIL_OPEN"] = "true"
        with patch.object(rate_limit, "_limiter", side_effect=RuntimeError("redis down")):
            rate_limit._enforce(rate_limit.AUTH_LOGIN, "ip:10.0.0.1")

    def test_allowed_request_passes(self):
        limiter = FakeLimiter(allowed=True)
        with patch.object(rate_limit, "_limiter", return_value=limiter):
            rate_limit._enforce(rate_limit.AUTH_LOGIN, "ip:10.0.0.1")
        self.assertEqual(limiter.identifiers, ["ip:10.0.0.1"])

    def test_exceeded_request_returns_429_with_retry_after(self):
        limiter = FakeLimiter(allowed=False, reset=10**12)
        with patch.object(rate_limit, "_limiter", return_value=limiter), patch.object(
            rate_limit.time, "time", return_value=10**12 - 17
        ):
            with self.assertRaises(HTTPException) as raised:
                rate_limit._enforce(rate_limit.AUTH_LOGIN, "ip:10.0.0.1")
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.headers["Retry-After"], "17")

    def test_user_isolation_uses_authenticated_user_id(self):
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

    def test_scheduling_get_endpoints_are_not_rate_limited(self):
        principal = Principal("user-a", "a@example.com", 11, "scheduler")
        with patch.object(rate_limit, "_enforce") as enforce:
            for path in (
                "/api/v1/scheduling/calendar",
                "/api/v1/scheduling/requirements",
                "/api/v1/scheduling/versions",
                "/api/v1/scheduling/versions/current",
                "/api/v1/scheduling/solver/jobs/1",
            ):
                rate_limit.rate_limit_scheduling_mutation(request(method="GET", path=path), principal)
        enforce.assert_not_called()

    def test_timetable_generation_uses_solver_policy_and_tenant_user_scope(self):
        principal = Principal("user-a", "a@example.com", 11, "scheduler")
        with patch.object(rate_limit, "_enforce") as enforce:
            returned = rate_limit.rate_limit_scheduling_mutation(
                request(path="/api/v1/scheduling/solver/generate"), principal
            )
        self.assertIs(returned, principal)
        enforce.assert_called_once_with(
            rate_limit.TIMETABLE_SOLVER,
            "school:11:user:user-a",
        )

    def test_platform_identity_uses_server_memberships_not_request_school_id(self):
        identity = Identity(
            user_id="admin-1",
            email="admin@example.com",
            is_super_admin=True,
            memberships={7: "admin", 9: "scheduler"},
        )
        with patch.object(rate_limit, "_enforce") as enforce:
            rate_limit.rate_limit_platform_mutation(
                request(path="/api/v1/platform/schools/999"), identity
            )
        self.assertEqual(enforce.call_args.args[1], "tenant:7,9:user:admin-1")

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

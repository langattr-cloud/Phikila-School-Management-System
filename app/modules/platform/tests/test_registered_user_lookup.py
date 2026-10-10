import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.config import settings
from app.modules.platform.router import (
    _find_registered_supabase_user_id,
    _invite_supabase_user,
)


class RegisteredSupabaseUserLookupTests(unittest.TestCase):
    def test_matches_registered_email_case_insensitively(self):
        response = Mock(status_code=200)
        response.json.return_value = {
            "users": [
                {"id": "11111111-1111-4111-8111-111111111111", "email": "School.Admin@example.com"}
            ]
        }
        with patch.object(settings, "supabase_url", "https://example.supabase.co"), \
             patch.object(settings, "supabase_service_role_key", "server-only-test-key"), \
             patch("app.modules.platform.router.requests.get", return_value=response) as get:
            result = _find_registered_supabase_user_id("school.admin@example.com")

        self.assertEqual(result, "11111111-1111-4111-8111-111111111111")
        self.assertEqual(get.call_args.kwargs["headers"]["apikey"], "server-only-test-key")

    def test_does_not_call_auth_admin_api_without_service_key(self):
        with patch.object(settings, "supabase_url", "https://example.supabase.co"), \
             patch.object(settings, "supabase_service_role_key", ""), \
             patch("app.modules.platform.router.requests.get") as get:
            self.assertIsNone(_find_registered_supabase_user_id("school.admin@example.com"))
        get.assert_not_called()

    def test_returns_none_when_email_is_not_registered(self):
        response = Mock(status_code=200)
        response.json.return_value = {"users": [{"id": "user-id", "email": "other@example.com"}]}
        with patch.object(settings, "supabase_url", "https://example.supabase.co"), \
             patch.object(settings, "supabase_service_role_key", "server-only-test-key"), \
             patch("app.modules.platform.router.requests.get", return_value=response):
            self.assertIsNone(_find_registered_supabase_user_id("school.admin@example.com"))

    def test_invites_new_account_and_returns_user_id(self):
        response = Mock(status_code=200)
        response.json.return_value = {"id": "22222222-2222-4222-8222-222222222222"}
        with patch.object(settings, "supabase_url", "https://example.supabase.co"), \
             patch.object(settings, "supabase_service_role_key", "server-only-test-key"), \
             patch("app.modules.platform.router.requests.post", return_value=response) as post:
            user_id = _invite_supabase_user("new.admin@example.com")

        self.assertEqual(user_id, "22222222-2222-4222-8222-222222222222")
        self.assertEqual(post.call_args.args[0], "https://example.supabase.co/auth/v1/invite")
        self.assertEqual(post.call_args.kwargs["json"], {"email": "new.admin@example.com"})
        self.assertEqual(post.call_args.kwargs["headers"]["apikey"], "server-only-test-key")

    def test_invite_fails_clearly_without_server_credentials(self):
        with patch.object(settings, "supabase_url", "https://example.supabase.co"), \
             patch.object(settings, "supabase_service_role_key", ""), \
             patch("app.modules.platform.router.requests.post") as post:
            with self.assertRaises(HTTPException) as raised:
                _invite_supabase_user("new.admin@example.com")
        self.assertEqual(raised.exception.status_code, 503)
        post.assert_not_called()


if __name__ == "__main__":
    unittest.main()

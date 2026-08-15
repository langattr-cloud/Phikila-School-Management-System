"""LLM provider adapters.

All provider-specific HTTP and schema knowledge lives here. Routers deal only
with :class:`LLMProvider`, so adding a provider means adding one subclass and
one registry entry — no route changes.

Endpoints are taken from each provider's published documentation:

* OpenRouter  — ``GET  https://openrouter.ai/api/v1/models``
                ``POST https://openrouter.ai/api/v1/chat/completions``
* OpenCode Zen — ``GET  https://opencode.ai/zen/v1/models``
                 ``POST https://opencode.ai/zen/v1/chat/completions``
  (OpenAI-compatible gateway; base URL ``https://opencode.ai/zen/v1``)
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Normalised shapes
# ---------------------------------------------------------------------------
@dataclass
class NormalisedModel:
    """A provider model mapped onto the application's own schema."""

    model_id: str
    display_name: str
    context_window: int | None = None
    # Price per million tokens. Providers quote per-token; we normalise.
    input_price: float | None = None
    output_price: float | None = None
    supports_tools: bool | None = None
    supports_vision: bool | None = None
    supports_reasoning: bool | None = None


@dataclass
class TestResult:
    ok: bool
    category: str  # see ERROR_CATEGORIES
    message: str
    latency_ms: int | None = None
    models_available: int | None = None
    sample: str | None = None


# User-facing error categories. Raw provider payloads never reach the browser.
ERROR_CATEGORIES = {
    "ok",
    "invalid_api_key",
    "provider_unavailable",
    "rate_limited",
    "model_unavailable",
    "insufficient_credits",
    "request_failed",
    "configuration_error",
}


class ProviderError(Exception):
    """A provider failure already mapped to a safe category and message."""

    def __init__(self, category: str, message: str) -> None:
        super().__init__(message)
        self.category = category if category in ERROR_CATEGORIES else "request_failed"
        self.message = message


# ---------------------------------------------------------------------------
# Base adapter
# ---------------------------------------------------------------------------
class LLMProvider(ABC):
    """Interface every provider adapter implements."""

    slug: str
    label: str
    docs_url: str
    base_url: str
    # Where a user gets a key, shown in the connect dialog.
    key_hint: str = ""

    def __init__(self, timeout: float = 20.0) -> None:
        self._timeout = timeout

    # -- required behaviour ---------------------------------------------
    @abstractmethod
    def list_models(self, api_key: str) -> list[NormalisedModel]:
        """Fetch and normalise the provider's catalogue."""

    @abstractmethod
    def test_completion(self, api_key: str, model_id: str) -> TestResult:
        """Send a minimal, cheap generation request."""

    def test_connection(self, api_key: str) -> TestResult:
        """Validate a key. Default: a successful catalogue fetch proves it."""
        started = time.monotonic()
        try:
            models = self.list_models(api_key)
        except ProviderError as error:
            return TestResult(False, error.category, error.message)
        elapsed = int((time.monotonic() - started) * 1000)
        return TestResult(
            True,
            "ok",
            f"Connected to {self.label}.",
            latency_ms=elapsed,
            models_available=len(models),
        )

    def validate_key_format(self, api_key: str) -> str | None:
        """Cheap client-side-style sanity check. Returns an error or None."""
        stripped = api_key.strip()
        if len(stripped) < 12:
            return "That API key looks too short. Copy the full key and try again."
        if any(ch.isspace() for ch in stripped):
            return "The API key should not contain spaces or line breaks."
        return None

    # -- shared HTTP helpers ---------------------------------------------
    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _request(
        self,
        url: str,
        api_key: str,
        payload: dict[str, Any] | None = None,
        method: str = "GET",
    ) -> Any:
        """Perform a provider call, mapping every failure to a safe category.

        Exception messages here are deliberately generic: a provider body can
        echo back parts of a request, so it is never surfaced verbatim.
        """
        body = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            url, data=body, headers=self._headers(api_key), method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise self._map_http_error(error.code) from None
        except urllib.error.URLError:
            raise ProviderError(
                "provider_unavailable",
                f"{self.label} could not be reached. Check your connection and try again.",
            ) from None
        except (json.JSONDecodeError, ValueError):
            raise ProviderError(
                "request_failed",
                f"{self.label} returned a response this application could not read.",
            ) from None
        except TimeoutError:
            raise ProviderError(
                "provider_unavailable",
                f"{self.label} took too long to respond. Try again shortly.",
            ) from None

    def _map_http_error(self, code: int) -> ProviderError:
        if code in (401, 403):
            return ProviderError(
                "invalid_api_key",
                f"{self.label} rejected the API key. Check the key and try again.",
            )
        if code == 402:
            return ProviderError(
                "insufficient_credits",
                f"Your {self.label} account does not have enough credit for this request.",
            )
        if code == 404:
            return ProviderError(
                "model_unavailable",
                f"{self.label} does not currently offer that model.",
            )
        if code == 429:
            return ProviderError(
                "rate_limited",
                f"{self.label} is temporarily rate limiting requests. Try again shortly.",
            )
        if code >= 500:
            return ProviderError(
                "provider_unavailable",
                f"{self.label} is having problems right now. Try again shortly.",
            )
        return ProviderError(
            "request_failed", f"The request to {self.label} was not accepted."
        )

    # -- shared normalisation --------------------------------------------
    @staticmethod
    def _per_million(value: Any) -> float | None:
        """Providers quote price per token as a string; show per million."""
        try:
            price = float(value)
        except (TypeError, ValueError):
            return None
        if price <= 0:
            return 0.0
        return round(price * 1_000_000, 4)

    def _chat_completion(
        self, url: str, api_key: str, model_id: str
    ) -> TestResult:
        """Minimal OpenAI-compatible generation, used by both adapters."""
        payload = {
            "model": model_id,
            # Deliberately tiny: this is a liveness check, not a real request.
            "messages": [{"role": "user", "content": "Reply with the single word: ok"}],
            "max_tokens": 5,
            "temperature": 0,
        }
        started = time.monotonic()
        try:
            data = self._request(url, api_key, payload, method="POST")
        except ProviderError as error:
            return TestResult(False, error.category, error.message)

        elapsed = int((time.monotonic() - started) * 1000)
        text = ""
        try:
            choice = (data.get("choices") or [{}])[0]
            text = (choice.get("message") or {}).get("content") or ""
        except (AttributeError, IndexError, TypeError):
            text = ""

        if not text.strip():
            return TestResult(
                False,
                "request_failed",
                "The model accepted the request but returned no text.",
                latency_ms=elapsed,
            )
        return TestResult(
            True,
            "ok",
            "Model responded successfully.",
            latency_ms=elapsed,
            sample=text.strip()[:120],
        )


# ---------------------------------------------------------------------------
# OpenRouter
# ---------------------------------------------------------------------------
class OpenRouterProvider(LLMProvider):
    slug = "openrouter"
    label = "OpenRouter"
    docs_url = "https://openrouter.ai/docs"
    base_url = "https://openrouter.ai/api/v1"
    key_hint = "Create a key at openrouter.ai/keys. Keys usually start with sk-or-."

    def _headers(self, api_key: str) -> dict[str, str]:
        headers = super()._headers(api_key)
        # OpenRouter uses these for app attribution in its dashboard.
        headers["HTTP-Referer"] = "https://phikila.school"
        headers["X-Title"] = "Phikila School Management System"
        return headers

    def list_models(self, api_key: str) -> list[NormalisedModel]:
        data = self._request(f"{self.base_url}/models", api_key)
        entries = data.get("data") if isinstance(data, dict) else None
        if not isinstance(entries, list):
            raise ProviderError(
                "request_failed", "OpenRouter returned an unexpected model list."
            )
        return [m for m in (self._normalise(e) for e in entries) if m is not None]

    def _normalise(self, entry: Any) -> NormalisedModel | None:
        if not isinstance(entry, dict):
            return None
        model_id = entry.get("id")
        if not isinstance(model_id, str) or not model_id:
            return None

        pricing = entry.get("pricing") if isinstance(entry.get("pricing"), dict) else {}
        architecture = (
            entry.get("architecture") if isinstance(entry.get("architecture"), dict) else {}
        )
        params = entry.get("supported_parameters")
        params = params if isinstance(params, list) else []
        modalities = architecture.get("input_modalities")
        modalities = modalities if isinstance(modalities, list) else []

        context = entry.get("context_length")
        if not isinstance(context, int):
            top = entry.get("top_provider")
            context = top.get("context_length") if isinstance(top, dict) else None
            context = context if isinstance(context, int) else None

        return NormalisedModel(
            model_id=model_id,
            display_name=entry.get("name") if isinstance(entry.get("name"), str) else model_id,
            context_window=context,
            input_price=self._per_million(pricing.get("prompt")),
            output_price=self._per_million(pricing.get("completion")),
            # Capabilities are only claimed when the provider actually says so.
            supports_tools="tools" in params or "tool_choice" in params,
            supports_vision="image" in modalities,
            supports_reasoning="reasoning" in params or "include_reasoning" in params,
        )

    def test_completion(self, api_key: str, model_id: str) -> TestResult:
        return self._chat_completion(f"{self.base_url}/chat/completions", api_key, model_id)


# ---------------------------------------------------------------------------
# OpenCode Zen
# ---------------------------------------------------------------------------
class OpenCodeZenProvider(LLMProvider):
    """OpenAI-compatible gateway documented at opencode.ai/docs/zen."""

    slug = "opencode_zen"
    label = "OpenCode Zen"
    docs_url = "https://opencode.ai/docs/zen/"
    base_url = "https://opencode.ai/zen/v1"
    key_hint = "Sign in at opencode.ai/auth and create an API key."

    def list_models(self, api_key: str) -> list[NormalisedModel]:
        data = self._request(f"{self.base_url}/models", api_key)
        # The gateway follows the OpenAI convention: {"data": [{"id": ...}]}.
        if isinstance(data, dict):
            entries = data.get("data") or data.get("models")
        elif isinstance(data, list):
            entries = data
        else:
            entries = None
        if not isinstance(entries, list):
            raise ProviderError(
                "request_failed", "OpenCode Zen returned an unexpected model list."
            )
        return [m for m in (self._normalise(e) for e in entries) if m is not None]

    def _normalise(self, entry: Any) -> NormalisedModel | None:
        if isinstance(entry, str):
            # Some OpenAI-compatible gateways return a bare list of ids.
            return NormalisedModel(model_id=entry, display_name=entry)
        if not isinstance(entry, dict):
            return None

        model_id = entry.get("id") or entry.get("model") or entry.get("name")
        if not isinstance(model_id, str) or not model_id:
            return None

        # Context/limit may appear under a few documented shapes.
        context = entry.get("context_length") or entry.get("context_window")
        if not isinstance(context, int):
            limit = entry.get("limit")
            if isinstance(limit, dict) and isinstance(limit.get("context"), int):
                context = limit["context"]
            else:
                context = None

        pricing = entry.get("pricing") if isinstance(entry.get("pricing"), dict) else {}
        cost = entry.get("cost") if isinstance(entry.get("cost"), dict) else {}
        input_price = self._per_million(pricing.get("prompt") or pricing.get("input"))
        output_price = self._per_million(pricing.get("completion") or pricing.get("output"))
        # `cost` is already quoted per million tokens where present.
        if input_price is None and isinstance(cost.get("input"), (int, float)):
            input_price = float(cost["input"])
        if output_price is None and isinstance(cost.get("output"), (int, float)):
            output_price = float(cost["output"])

        display = entry.get("name") if isinstance(entry.get("name"), str) else model_id
        modalities = entry.get("modalities")
        vision = None
        if isinstance(modalities, dict) and isinstance(modalities.get("input"), list):
            vision = "image" in modalities["input"]

        return NormalisedModel(
            model_id=model_id,
            display_name=display,
            context_window=context,
            input_price=input_price,
            output_price=output_price,
            supports_tools=entry.get("tool_call") if isinstance(entry.get("tool_call"), bool) else None,
            supports_vision=vision,
            supports_reasoning=entry.get("reasoning") if isinstance(entry.get("reasoning"), bool) else None,
        )

    def test_completion(self, api_key: str, model_id: str) -> TestResult:
        return self._chat_completion(f"{self.base_url}/chat/completions", api_key, model_id)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
_REGISTRY: dict[str, type[LLMProvider]] = {
    OpenRouterProvider.slug: OpenRouterProvider,
    OpenCodeZenProvider.slug: OpenCodeZenProvider,
}


def register_provider(adapter: type[LLMProvider]) -> None:
    """Extension point: a new provider needs only this call."""
    _REGISTRY[adapter.slug] = adapter


def available_providers() -> list[type[LLMProvider]]:
    return [_REGISTRY[slug] for slug in sorted(_REGISTRY)]


def get_provider(slug: str) -> LLMProvider:
    adapter = _REGISTRY.get(slug)
    if adapter is None:
        raise ProviderError("configuration_error", "That provider is not supported.")
    return adapter()


def is_known_provider(slug: str) -> bool:
    return slug in _REGISTRY

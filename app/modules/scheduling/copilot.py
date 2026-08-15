"""Natural-language scheduling commands.

The assistant never produces a timetable. It only translates a sentence into a
structured command which the deterministic constraint engine and CP-SAT solver
then execute. That keeps every schedule verifiable and reproducible.

Two backends implement the same interface:

* ``RuleBasedParser`` - always available, no network, no API key.
* ``LlmParser``       - used when ``OPENAI_API_KEY`` (or a compatible endpoint)
  is configured server-side. Its output is validated against the same schema,
  so a hallucinated field can never reach the solver.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

# Commands the engine knows how to execute. An LLM cannot invent new ones.
SUPPORTED_ACTIONS = {
    "avoid_lessons",   # keep slots free for a class or teacher
    "set_weight",      # retune a soft-constraint weight
    "explain",         # answer a "why" question
    "rebalance",       # re-run optimisation favouring workload balance
    "improve",         # re-run optimisation with current weights
    "unknown",
}

DAY_WORDS = {
    "monday": 0, "mon": 0,
    "tuesday": 1, "tue": 1, "tues": 1,
    "wednesday": 2, "wed": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3,
    "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5,
    "sunday": 6, "sun": 6,
}

WEIGHT_WORDS = {
    "gap": "teacher_gaps",
    "gaps": "teacher_gaps",
    "distribution": "subject_distribution",
    "spread": "subject_distribution",
    "morning": "morning_preference",
    "consecutive": "consecutive_lessons",
    "workload": "workload_balance",
    "balance": "workload_balance",
    "room": "room_utilisation",
}


@dataclass
class Command:
    action: str
    target: str | None = None        # human-readable name as typed
    target_kind: str | None = None   # "class" | "teacher"
    target_id: int | None = None     # resolved database id
    day: int | None = None
    day_name: str | None = None
    periods: list[int] = field(default_factory=list)
    period_names: list[str] = field(default_factory=list)
    priority: str = "soft"           # soft | hard
    weight: int | None = None
    weight_key: str | None = None
    confidence: float = 0.0
    explanation: str = ""
    source: str = "rules"            # rules | llm
    needs_confirmation: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "target": self.target,
            "target_kind": self.target_kind,
            "target_id": self.target_id,
            "day": self.day,
            "day_name": self.day_name,
            "periods": self.periods,
            "period_names": self.period_names,
            "priority": self.priority,
            "weight": self.weight,
            "weight_key": self.weight_key,
            "confidence": round(self.confidence, 2),
            "explanation": self.explanation,
            "source": self.source,
            "needs_confirmation": self.needs_confirmation,
        }


@dataclass
class SchoolVocabulary:
    """Names the parser can resolve, supplied by the caller from the database."""

    classes: dict[int, str] = field(default_factory=dict)
    teachers: dict[int, str] = field(default_factory=dict)
    periods: list[dict] = field(default_factory=list)  # {index, name, start_time, is_teaching}
    days: list[dict] = field(default_factory=list)     # {index, name}

    def teaching_periods(self) -> list[dict]:
        return [p for p in self.periods if p.get("is_teaching", True)]

    def afternoon_periods(self) -> list[dict]:
        out = []
        for period in self.teaching_periods():
            try:
                hour = int(str(period.get("start_time", "")).split(":")[0])
            except (ValueError, IndexError):
                continue
            if hour >= 12:
                out.append(period)
        return out

    def morning_periods(self) -> list[dict]:
        afternoon = {p["index"] for p in self.afternoon_periods()}
        return [p for p in self.teaching_periods() if p["index"] not in afternoon]


def _match_name(text: str, options: dict[int, str]) -> tuple[int | None, str | None, float]:
    """Find the best name match in free text, tolerating partial references."""
    lowered = text.lower()
    best: tuple[int | None, str | None, float] = (None, None, 0.0)

    for ident, name in options.items():
        needle = name.lower()
        if needle and needle in lowered:
            # Longer matches win: "Form 4A" beats "Form 4".
            confidence = min(0.99, 0.6 + len(needle) / 40)
            if confidence > best[2]:
                best = (ident, name, confidence)

    if best[0] is not None:
        return best

    # Surname-only teacher references: "Mr. Otieno", "Otieno"
    for ident, name in options.items():
        parts = [p for p in re.split(r"[\s.]+", name.lower()) if len(p) > 2]
        for part in parts:
            if re.search(rf"\b{re.escape(part)}\b", lowered):
                return ident, name, 0.72
    return None, None, 0.0


class RuleBasedParser:
    """Deterministic parser. No network, no key, fully predictable."""

    source = "rules"

    def parse(self, text: str, vocab: SchoolVocabulary) -> Command:
        lowered = text.lower().strip()
        if not lowered:
            return Command("unknown", explanation="Type a scheduling instruction.")

        # --- explain -------------------------------------------------------
        if lowered.startswith("why") or " why " in lowered:
            return Command(
                "explain",
                confidence=0.8,
                explanation="I will look up what is blocking that change.",
                needs_confirmation=False,
                source=self.source,
            )

        # --- weights -------------------------------------------------------
        if any(word in lowered for word in ("balance", "rebalance")) and "workload" in lowered:
            return Command(
                "rebalance",
                weight_key="workload_balance",
                weight=30,
                confidence=0.85,
                explanation="Re-run optimisation with teacher workload weighted more heavily.",
                source=self.source,
            )
        if lowered.startswith("improve") or "improve this timetable" in lowered:
            return Command(
                "improve",
                confidence=0.8,
                explanation="Re-run optimisation using the current constraint weights.",
                source=self.source,
            )
        weight_match = re.search(r"(?:prioriti[sz]e|increase|raise|reduce|lower|decrease)\s+(\w+)", lowered)
        if weight_match:
            key = WEIGHT_WORDS.get(weight_match.group(1))
            if key:
                lowering = weight_match.group(0).split()[0] in {"reduce", "lower", "decrease"}
                return Command(
                    "set_weight",
                    weight_key=key,
                    weight=5 if lowering else 35,
                    confidence=0.8,
                    explanation=(
                        f"{'Lower' if lowering else 'Raise'} the weight of "
                        f"{key.replace('_', ' ')} and re-optimise."
                    ),
                    source=self.source,
                )

        # --- keep slots free ------------------------------------------------
        free_intent = any(
            phrase in lowered
            for phrase in ("free", "no lessons", "keep clear", "off", "avoid", "blank")
        )
        if free_intent:
            class_id, class_name, class_conf = _match_name(lowered, vocab.classes)
            teacher_id, teacher_name, teacher_conf = _match_name(lowered, vocab.teachers)

            if teacher_conf > class_conf:
                kind, ident, name, conf = "teacher", teacher_id, teacher_name, teacher_conf
            elif class_id is not None:
                kind, ident, name, conf = "class", class_id, class_name, class_conf
            else:
                return Command(
                    "unknown",
                    confidence=0.2,
                    explanation="I could not tell which class or teacher you meant.",
                    source=self.source,
                )

            day_index, day_name = None, None
            for word, index in DAY_WORDS.items():
                if re.search(rf"\b{word}\b", lowered):
                    day_index = index
                    day_name = next(
                        (d["name"] for d in vocab.days if d["index"] == index),
                        word.title(),
                    )
                    break

            # Which periods?
            if "afternoon" in lowered:
                chosen = vocab.afternoon_periods()
            elif "morning" in lowered:
                chosen = vocab.morning_periods()
            else:
                explicit = re.findall(r"\bp(\d+)\b", lowered)
                if explicit:
                    wanted = {int(n) for n in explicit}
                    chosen = [
                        p for p in vocab.teaching_periods()
                        if _period_number(p) in wanted
                    ]
                else:
                    chosen = vocab.teaching_periods()  # whole day

            if day_index is None:
                return Command(
                    "unknown",
                    confidence=0.3,
                    explanation="Tell me which day, for example 'Friday afternoon'.",
                    source=self.source,
                )
            if not chosen:
                return Command(
                    "unknown",
                    confidence=0.3,
                    explanation="I could not work out which periods you meant.",
                    source=self.source,
                )

            hard = any(word in lowered for word in ("must", "never", "always", "strictly"))
            return Command(
                "avoid_lessons",
                target=name,
                target_kind=kind,
                target_id=ident,
                day=day_index,
                day_name=day_name,
                periods=[p["index"] for p in chosen],
                period_names=[p["name"] for p in chosen],
                priority="hard" if hard else "soft",
                weight=60 if hard else 25,
                confidence=min(0.95, conf + 0.15),
                explanation=(
                    f"Keep {len(chosen)} period(s) on {day_name} free for {name}"
                    f" as a {'required rule' if hard else 'preference'}."
                ),
                source=self.source,
            )

        return Command(
            "unknown",
            confidence=0.1,
            explanation=(
                "I did not understand that. Try: \"Give Form 4A Friday afternoon free\" "
                "or \"Balance teacher workloads\"."
            ),
            source=self.source,
        )


def _period_number(period: dict) -> int | None:
    digits = re.findall(r"\d+", str(period.get("name", "")))
    return int(digits[0]) if digits else None


class LlmParser:
    """Optional LLM backend.

    The model only ever selects from :data:`SUPPORTED_ACTIONS` and its output is
    re-validated locally, so it cannot inject arbitrary behaviour. On any error
    it silently falls back to the rule-based parser.
    """

    source = "llm"

    def __init__(self, api_key: str, model: str, base_url: str) -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._fallback = RuleBasedParser()

    def parse(self, text: str, vocab: SchoolVocabulary) -> Command:
        try:
            payload = self._request(text, vocab)
        except Exception:
            # Never surface provider errors; degrade to deterministic parsing.
            return self._fallback.parse(text, vocab)

        command = self._validate(payload, vocab)
        if command is None:
            return self._fallback.parse(text, vocab)
        return command

    def _request(self, text: str, vocab: SchoolVocabulary) -> dict:
        schema = {
            "action": f"one of {sorted(SUPPORTED_ACTIONS)}",
            "target": "exact class or teacher name from the provided lists, or null",
            "target_kind": "class | teacher | null",
            "day": "day name or null",
            "periods": "list of period names from the provided list, or []",
            "priority": "soft | hard",
            "weight_key": "teacher_gaps | subject_distribution | morning_preference | "
                          "consecutive_lessons | workload_balance | room_utilisation | null",
            "explanation": "one short sentence for the administrator",
        }
        context = {
            "classes": sorted(vocab.classes.values()),
            "teachers": sorted(vocab.teachers.values()),
            "days": [d["name"] for d in vocab.days],
            "periods": [
                {"name": p["name"], "start": p.get("start_time")}
                for p in vocab.teaching_periods()
            ],
        }
        body = json.dumps({
            "model": self._model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You convert a school administrator's instruction into a single "
                        "structured scheduling command. You never create timetables. "
                        "Only use names that appear in the provided context. "
                        "Reply with JSON matching this schema and nothing else: "
                        + json.dumps(schema)
                    ),
                },
                {"role": "user", "content": json.dumps({"instruction": text, "context": context})},
            ],
        }).encode()

        request = urllib.request.Request(
            f"{self._base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=12) as response:
            data = json.loads(response.read())
        return json.loads(data["choices"][0]["message"]["content"])

    def _validate(self, payload: dict, vocab: SchoolVocabulary) -> Command | None:
        """Re-derive every field locally; the model's output is only a hint."""
        action = str(payload.get("action", "unknown"))
        if action not in SUPPORTED_ACTIONS:
            return None

        command = Command(action, source=self.source, confidence=0.9)
        command.explanation = str(payload.get("explanation", ""))[:240]
        command.priority = "hard" if payload.get("priority") == "hard" else "soft"

        target = payload.get("target")
        if target:
            kind = payload.get("target_kind")
            pool = vocab.teachers if kind == "teacher" else vocab.classes
            ident, name, _ = _match_name(str(target), pool)
            if ident is None:  # model named something that does not exist
                other = vocab.classes if kind == "teacher" else vocab.teachers
                ident, name, _ = _match_name(str(target), other)
                kind = "class" if kind == "teacher" else "teacher"
            if ident is None:
                return None
            command.target_id, command.target, command.target_kind = ident, name, kind

        day = payload.get("day")
        if day:
            index = DAY_WORDS.get(str(day).lower())
            if index is None:
                return None
            command.day = index
            command.day_name = next(
                (d["name"] for d in vocab.days if d["index"] == index), str(day)
            )

        wanted = payload.get("periods") or []
        if isinstance(wanted, list) and wanted:
            names = {str(w).lower() for w in wanted}
            chosen = [p for p in vocab.teaching_periods() if str(p["name"]).lower() in names]
            if not chosen:
                return None
            command.periods = [p["index"] for p in chosen]
            command.period_names = [p["name"] for p in chosen]

        key = payload.get("weight_key")
        if key in WEIGHT_WORDS.values():
            command.weight_key = key
            command.weight = 35

        if action == "avoid_lessons" and not (command.target_id and command.day is not None and command.periods):
            return None
        command.weight = command.weight or (60 if command.priority == "hard" else 25)
        return command


def get_parser():
    """Return the LLM parser when configured, otherwise the rule-based one.

    The key is read server-side only and is never sent to the browser.
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if api_key:
        return LlmParser(
            api_key=api_key,
            model=os.getenv("COPILOT_MODEL", "gpt-4o-mini"),
            base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        )
    return RuleBasedParser()

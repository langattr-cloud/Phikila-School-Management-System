"""Validate the imported government capitation reference data."""
import json
from pathlib import Path


def test_primary_capitation_reference_catalogue_has_account_vote_heads():
    path = Path(__file__).resolve().parents[4] / "data" / "kenya_capitation_reference.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["source_circular"] == "MOE. DBE/6/2/3/30"
    templates = data["templates"]
    assert len(templates) == 2
    assert {row["account"] for row in templates} == {"Account 1 — SIMBA", "Account 2 — GPA"}
    assert sum(len(row["vote_heads"]) for row in templates) == 16
    assert all(float(head["per_learner_rate"]) > 0 for row in templates for head in row["vote_heads"])
    assert all(row["per_learner_total"] > 0 for row in templates)

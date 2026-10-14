"""Validate the imported government capitation reference data."""
import json
from pathlib import Path


def test_primary_capitation_reference_catalogue_has_account_vote_heads():
    path = Path(__file__).resolve().parents[4] / "data" / "kenya_capitation_reference.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    templates = [row for row in data["templates"] if row.get("school_type", data.get("school_type")) == "public_primary"]
    assert len(templates) == 2
    assert {row["account"] for row in templates} == {"Account 1 — SIMBA", "Account 2 — GPA"}
    assert sum(len(row["vote_heads"]) for row in templates) == 16
    assert all(float(head["per_learner_rate"]) > 0 for row in templates for head in row["vote_heads"])
    assert all(row["per_learner_total"] > 0 for row in templates)


def test_junior_school_reference_separates_operations_tuition_and_infrastructure():
    path = Path(__file__).resolve().parents[4] / "data" / "kenya_capitation_reference.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    templates = [row for row in data["templates"] if row.get("school_type") == "public_junior_school"]
    assert len(templates) == 3
    assert {row["account"] for row in templates} == {"Operations Account", "Tuition Account", "Infrastructure Account"}
    infrastructure = next(row for row in templates if row["account"] == "Infrastructure Account")
    assert infrastructure["vote_heads"][0]["per_learner_rate"] == 640
    tuition = next(row for row in templates if row["account"] == "Tuition Account")
    centralized = [head for head in tuition["vote_heads"] if "centralized procurement" in head["name"].lower()]
    assert len(centralized) == 2
    assert all("not cash paid to school" in head["description"] for head in centralized)

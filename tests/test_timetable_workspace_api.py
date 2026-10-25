"""Regression tests for authenticated timetable workspace persistence.

Uses the shared in-memory SQLite fixture and overrides authentication; no live
school database or real user credentials are required.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.modules.authentication.supabase as supabase_module
from app.core.database import get_db
from app.main import app


@pytest.fixture()
def workspace_client(db_session):
    principal = {"sub": "classes-workspace-owner", "email": "classes-workspace@example.test"}

    def _get_db():
        yield db_session

    def _claims():
        return principal

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[supabase_module.get_supabase_claims] = _claims
    try:
        with TestClient(app) as client:
            yield client, principal
    finally:
        app.dependency_overrides.clear()


def _workspace():
    return {
        "schoolName": "Regression Test School",
        "academicYear": "2026/2027",
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "periods": [
            {"name": "Period 1", "start": "08:00", "end": "08:40"},
            {"name": "Period 2", "start": "08:40", "end": "09:20"},
        ],
        "lessons": [
            {
                "id": "test-lesson-1",
                "day": "Monday",
                "period": 0,
                "className": "GRADE 4",
                "subject": "Mathematics",
                "teacher": "Test Teacher",
                "room": "Room A",
                "locked": False,
            }
        ],
        "specification": {
            "subjects": ["Mathematics"],
            "classes": ["GRADE 4"],
            "teachers": ["Test Teacher"],
            "classrooms": ["Room A"],
        },
        "classDetails": {
            "GRADE 4": {
                "short": "G4",
                "grade": "4",
                "count": 30,
                "classTeacher": "Test Teacher",
                "color": "#b8e6d0",
                "timeOffGrid": [[0, 1], [2, 0]],
            }
        },
    }


def test_workspace_save_reload_and_owner_isolation(workspace_client):
    client, principal = workspace_client
    path = "/api/v1/timetable/workspace"

    empty = client.get(path)
    assert empty.status_code == 200, empty.text
    assert empty.json()["data"] is None

    payload = _workspace()
    saved = client.put(path, json={"data": payload})
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"] == payload
    assert saved.json()["updated_at"]

    reloaded = client.get(path)
    assert reloaded.status_code == 200, reloaded.text
    assert reloaded.json()["data"] == payload
    assert reloaded.json()["data"]["classDetails"]["GRADE 4"]["timeOffGrid"] == [[0, 1], [2, 0]]
    assert reloaded.json()["data"]["lessons"][0]["className"] == "GRADE 4"

    # The same table must not leak one account's workspace to another account.
    principal["sub"] = "different-classes-workspace-owner"
    other_account = client.get(path)
    assert other_account.status_code == 200, other_account.text
    assert other_account.json()["data"] is None


def test_invalid_workspace_save_does_not_overwrite_existing_data(workspace_client):
    client, _ = workspace_client
    path = "/api/v1/timetable/workspace"
    payload = _workspace()
    saved = client.put(path, json={"data": payload})
    assert saved.status_code == 200, saved.text

    invalid = client.put(path, json={"data": {**payload, "days": []}})
    assert invalid.status_code == 422

    reloaded = client.get(path)
    assert reloaded.status_code == 200, reloaded.text
    assert reloaded.json()["data"] == payload


def test_hidden_day_lessons_survive_day_count_reduction_and_reload(workspace_client):
    client, _ = workspace_client
    path = "/api/v1/timetable/workspace"
    payload = _workspace()
    payload["days"] = ["Monday", "Tuesday", "Wednesday", "Thursday"]
    payload["lessons"].append({
        "id": "test-hidden-friday-lesson",
        "day": "Friday",
        "period": 1,
        "className": "GRADE 4",
        "subject": "English",
        "teacher": "Test Teacher",
        "room": "Room A",
        "locked": False,
    })

    saved = client.put(path, json={"data": payload})
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["days"] == payload["days"]
    assert any(lesson["day"] == "Friday" for lesson in saved.json()["data"]["lessons"])

    reloaded = client.get(path)
    assert reloaded.status_code == 200, reloaded.text
    assert any(
        lesson["id"] == "test-hidden-friday-lesson" and lesson["day"] == "Friday"
        for lesson in reloaded.json()["data"]["lessons"]
    )

from app.modules.scheduling import _create_job_with_project
from app.modules.scheduling.schemas import GenerateIn


class _Project:
    id = 17
    status = "draft"
    updated_at = None


class _Query:
    def __init__(self, project):
        self.project = project

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self.project


class _DB:
    def __init__(self, project):
        self.project = project

    def query(self, model):
        return _Query(self.project)


def test_generate_input_accepts_project_id():
    payload = GenerateIn(project_id=17, timetable_type_id=3)
    assert payload.project_id == 17
    assert payload.timetable_type_id == 3


def test_standard_job_context_gets_latest_project(monkeypatch):
    captured = {}

    def fake_create_job(db, school_id, actor, config=None):
        captured.update(config or {})
        return object()

    monkeypatch.setattr("app.modules.scheduling._original_create_job", fake_create_job)
    _create_job_with_project(_DB(_Project()), 9, "scheduler@example.test", {"label": "Academic timetable"})

    assert captured["project_id"] == 17
    assert captured["label"] == "Academic timetable"


def test_explicit_project_context_is_preserved(monkeypatch):
    captured = {}

    def fake_create_job(db, school_id, actor, config=None):
        captured.update(config or {})
        return object()

    monkeypatch.setattr("app.modules.scheduling._original_create_job", fake_create_job)
    _create_job_with_project(_DB(_Project()), 9, "scheduler@example.test", {"project_id": 22})

    assert captured["project_id"] == 22

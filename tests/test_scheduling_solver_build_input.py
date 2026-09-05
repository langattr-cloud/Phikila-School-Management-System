from app.modules.scheduling.engine import build_input


def test_build_input_accepts_only_supported_filters():
    import inspect

    parameters = inspect.signature(build_input).parameters
    assert "max_seconds" in parameters
    assert "class_ids" not in parameters
    assert "teacher_ids" not in parameters
    assert "period_indexes" not in parameters

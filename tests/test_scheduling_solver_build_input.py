from app.modules.scheduling.engine import build_input


def test_build_input_exposes_generation_scope_filters():
    import inspect

    parameters = inspect.signature(build_input).parameters
    for name in ("max_seconds", "day_indexes", "period_indexes", "class_ids", "teacher_ids"):
        assert name in parameters

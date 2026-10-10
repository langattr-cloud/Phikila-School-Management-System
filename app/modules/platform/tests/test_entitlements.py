from app.modules.platform.entitlements import DEFAULT_ENABLED_MODULES, MODULES


def test_catalog_has_expected_school_modules():
    assert set(MODULES) == {
        "students", "staff", "attendance", "examinations", "finance",
        "timetable", "library", "transport", "parent_portal", "ai_tools",
    }


def test_requested_starter_set_enables_only_four_modules():
    assert DEFAULT_ENABLED_MODULES == {
        "students", "staff", "attendance", "examinations",
    }
    assert DEFAULT_ENABLED_MODULES < set(MODULES)

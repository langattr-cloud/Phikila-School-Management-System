import unittest
from types import SimpleNamespace

from app.modules.platform.entitlements import DEFAULT_ENABLED_MODULES, MODULES
from app.modules.platform.module_access import module_enabled


class EntitlementTests(unittest.TestCase):
    def test_catalog_has_expected_school_modules(self):
        self.assertEqual(set(MODULES), {
            "students", "staff", "attendance", "examinations", "finance",
            "timetable", "library", "transport", "parent_portal", "ai_tools",
        })

    def test_requested_starter_set_enables_only_four_modules(self):
        self.assertEqual(DEFAULT_ENABLED_MODULES, {
            "students", "staff", "attendance", "examinations",
        })
        self.assertTrue(DEFAULT_ENABLED_MODULES < set(MODULES))

    def test_module_enabled_reads_persisted_flag(self):
        self.assertTrue(module_enabled(_DB(SimpleNamespace(enabled=True)), 7, "students"))
        self.assertFalse(module_enabled(_DB(SimpleNamespace(enabled=False)), 7, "students"))

    def test_unconfigured_school_uses_requested_starter_defaults(self):
        self.assertTrue(module_enabled(_DB(), 7, "students"))
        self.assertFalse(module_enabled(_DB(), 7, "finance"))


class _Query:
    def __init__(self, result):
        self.result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.result


class _DB:
    def __init__(self, result=None):
        self.result = result

    def query(self, model):
        return _Query(self.result)

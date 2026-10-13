"""Regression tests for the academic hierarchy's request validation."""
from datetime import date
import unittest

from fastapi import HTTPException

from app.modules.academics import schemas
from app.modules.academics.services import AcademicYearService


class _YearRepository:
    def __init__(self):
        self.created = None

    def create(self, school_id, data):
        self.created = (school_id, data)
        return data


class AcademicYearValidationTests(unittest.TestCase):
    def test_create_rejects_end_date_before_start_date(self):
        service = AcademicYearService.__new__(AcademicYearService)
        service.repository = _YearRepository()
        payload = schemas.AcademicYearCreate(
            name="2026/2027",
            start_date=date(2027, 1, 1),
            end_date=date(2026, 12, 31),
        )

        with self.assertRaises(HTTPException) as raised:
            service.create_academic_year(12, payload)

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIsNone(service.repository.created)

    def test_create_accepts_ordered_dates(self):
        service = AcademicYearService.__new__(AcademicYearService)
        service.repository = _YearRepository()
        payload = schemas.AcademicYearCreate(
            name="2026/2027",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
        )

        result = service.create_academic_year(12, payload)

        self.assertIs(result, payload)
        self.assertEqual(service.repository.created[0], 12)

    def test_bulk_stream_names_are_unique_case_insensitively(self):
        with self.assertRaises(ValueError):
            schemas.BulkStreamCreate(
                academic_year_id=1,
                level_id=1,
                grade_id=1,
                streams=[{"name": "East"}, {"name": " east "}],
            )

    def test_bulk_stream_names_cannot_be_blank(self):
        with self.assertRaises(ValueError):
            schemas.BulkStreamCreate(
                academic_year_id=1,
                level_id=1,
                grade_id=1,
                streams=[{"name": "   "}],
            )


if __name__ == "__main__":
    unittest.main()

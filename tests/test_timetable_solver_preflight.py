"""Regression tests for timetable preflight availability scope.

Run with: python -m unittest discover -s tests -p 'test_*.py'
"""
import unittest

from app.modules.scheduling.solver import (
    ClassSpec,
    RequirementSpec,
    SolverInput,
    TeacherSpec,
    preflight,
)


def solver_input(*, class_unavailable=None, teacher_unavailable=None, lessons=2):
    return SolverInput(
        days=[0],
        periods=[0, 1],
        teaching_periods=[0, 1],
        morning_periods=[0, 1],
        teachers={
            10: TeacherSpec(
                id=10,
                name="Teacher A",
                max_per_day=7,
                unavailable=set(teacher_unavailable or ()),
            )
        },
        rooms={},
        classes={
            20: ClassSpec(
                id=20,
                name="Class A",
                student_count=30,
                unavailable=set(class_unavailable or ()),
            )
        },
        subjects={30: type("Subject", (), {"id": 30, "name": "Mathematics"})()},
        requirements=[
            RequirementSpec(
                id=40,
                class_id=20,
                subject_id=30,
                teacher_id=10,
                room_id=None,
                periods_per_week=lessons,
            )
        ],
    )


class TimetablePreflightAvailabilityTests(unittest.TestCase):
    def test_class_unavailability_outside_selected_scope_does_not_reduce_capacity(self):
        data = solver_input(class_unavailable={(4, 8)})
        self.assertEqual(preflight(data), [])

    def test_teacher_unavailability_outside_selected_scope_does_not_reduce_capacity(self):
        data = solver_input(teacher_unavailable={(4, 8)})
        self.assertEqual(preflight(data), [])

    def test_class_unavailability_inside_scope_reduces_capacity(self):
        data = solver_input(class_unavailable={(0, 0)}, lessons=2)
        problems = preflight(data)
        self.assertTrue(any("Class A needs 2 lessons" in problem for problem in problems))

    def test_teacher_unavailability_inside_scope_reduces_capacity(self):
        data = solver_input(teacher_unavailable={(0, 0)}, lessons=2)
        problems = preflight(data)
        self.assertTrue(any("Teacher A is assigned 2 lessons" in problem for problem in problems))


if __name__ == "__main__":
    unittest.main()

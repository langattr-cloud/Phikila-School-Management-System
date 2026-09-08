"""Deterministic mock dataset checks for the Junior School examination flow."""
from pathlib import Path
import json

from app.modules.examinations.grading import band_for_percentage, JUNIOR

FIXTURE = Path(__file__).parents[3] / "tests" / "fixtures" / "mock_junior_exam_10_learners.json"


def load_fixture():
    return json.loads(FIXTURE.resolve().read_text())


def test_mock_exam_has_ten_learners_and_nine_learning_areas():
    data = load_fixture()
    assert len(data["learners"]) == 10
    assert len(data["scenario"]["learning_areas"]) == 9
    assert data["scenario"]["grading_structure"] == "KJSEA/CBC four-band achievement levels"


def test_all_scores_are_valid_percentages_and_cover_all_learning_areas():
    data = load_fixture()
    learning_area_keys = {area["key"] for area in data["scenario"]["learning_areas"]}
    for learner in data["learners"]:
        assert set(learner["marks"]) == learning_area_keys
        assert all(0 <= score <= 100 for score in learner["marks"].values())


def test_expected_report_cards_match_junior_kjsea_cbc_bands():
    data = load_fixture()
    expected = {r["admission_number"]: r for r in data["expected_report_cards"]}
    for learner in data["learners"]:
        marks = learner["marks"]
        total = sum(marks.values())
        average = round(total / len(marks), 1)
        band = band_for_percentage(JUNIOR, average)
        result = expected[learner["admission_number"]]
        assert result["total"] == total
        assert result["average"] == average
        assert result["percentage"] == average
        assert result["band"] == band.code
        assert result["band_label"] == band.label


def test_fixture_covers_all_four_junior_kjsea_bands():
    data = load_fixture()
    bands = {r["band"] for r in data["expected_report_cards"]}
    assert bands == {"EE", "ME", "AE", "BE"}

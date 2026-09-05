from app.modules.scheduling.calendar_router import _rank_map, _remap_json_slots


def test_calendar_index_map_preserves_existing_indexes():
    existing = {0: object(), 1: object(), 2: object(), 3: object(), 4: object()}
    incoming = {0: object(), 2: object(), 3: object(), 4: object()}

    assert _rank_map(existing, incoming) == {0: 0, 2: 2, 3: 3, 4: 4}


def test_calendar_json_slots_drop_removed_indexes_without_shifting():
    value = {"0": [0, 1], "1": [2], "2": [3]}
    day_map = {0: 0, 2: 2}
    period_map = {0: 0, 2: 2, 3: 3}

    assert _remap_json_slots(value, day_map, period_map) == {"0": [0], "2": [3]}

from app.modules.scheduling import profile_router
from app.modules.scheduling.schemas import PrintProfileIn


def test_print_profile_routes_exist():
    routes = {(getattr(route, 'path', ''), tuple(sorted(getattr(route, 'methods', set())))) for route in profile_router.router.routes}
    assert ('/print-profiles', ('GET',)) in routes
    assert ('/print-profiles', ('POST',)) in routes
    assert ('/print-profiles/{profile_id}', ('DELETE',)) in routes
    assert ('/print-profiles/{profile_id}', ('PUT',)) in routes


def test_print_profile_schema_accepts_page_and_cell_configuration():
    payload = PrintProfileIn(
        name='A4 landscape',
        is_default=True,
        config={
            'paper': 'A4',
            'orientation': 'landscape',
            'marginMm': 8,
            'kind': 'subject',
            'position': 'middle',
            'timeFormat': '24h',
            'timeLayout': 'split',
        },
    )
    assert payload.config['paper'] == 'A4'
    assert payload.config['position'] == 'middle'

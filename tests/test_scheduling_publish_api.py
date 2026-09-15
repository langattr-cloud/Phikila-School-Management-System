from app.modules.scheduling import router


def test_publish_version_route_exists():
    routes = [
        route
        for route in router.router.routes
        if getattr(route, "path", "") == "/versions/{version_id}/publish"
        and "POST" in getattr(route, "methods", set())
    ]
    assert len(routes) == 1
    assert routes[0].name == "publish_version"

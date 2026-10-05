import pytest
from fastapi.testclient import TestClient

import maps_links
from api.main import app

client = TestClient(app)


# ---- coordinates in text and full links ----

@pytest.mark.parametrize("text, expected", [
    ("32.0812, 34.8105", (32.0812, 34.8105)),
    ("32.0812,34.8105", (32.0812, 34.8105)),
    ("  32.0812 34.8105 ", (32.0812, 34.8105)),
    ("-33.8688, 151.2093", (-33.8688, 151.2093)),
    # a place link: the pin (!3d!4d) wins over the viewport center (@)
    ("https://www.google.com/maps/place/Azrieli/@32.07,34.79,17z/data="
     "!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d32.0745!4d34.7918", (32.0745, 34.7918)),
    ("https://www.google.com/maps/@32.0812,34.8105,15z", (32.0812, 34.8105)),
    ("https://maps.google.com/?q=32.0812,34.8105", (32.0812, 34.8105)),
    ("https://www.google.com/maps/search/?api=1&query=32.0812%2C34.8105", (32.0812, 34.8105)),
    ("https://www.google.co.il/maps?ll=32.0812,34.8105&z=16", (32.0812, 34.8105)),
    # the consent page wraps the real link
    ("https://consent.google.com/ml?continue="
     "https://www.google.com/maps/place/x/%4032.08,34.81,17z/data%3D!3d32.0812!4d34.8105", (32.0812, 34.8105)),
])
def test_coordinates_from_text(text, expected):
    assert maps_links.coordinates_from_text(text) == expected


@pytest.mark.parametrize("text", [
    "", "Rothschild 10, Tel Aviv", "95.1, 34.8", "32.1, 181", "https://www.google.com/maps/place/Azrieli+Center",
    "https://maps.google.com/?q=Azrieli", "32.1",
])
def test_no_coordinates(text):
    assert maps_links.coordinates_from_text(text) is None


# ---- following short links, safely ----

@pytest.fixture
def hops(monkeypatch):
    """Fake redirects: url -> next Location (None = no redirect)."""
    table = {}
    seen = []

    def fake(url):
        seen.append(url)
        if url not in table:
            raise maps_links.LinkError("network", "unreachable")
        return table[url]

    monkeypatch.setattr(maps_links, "_next_location", fake)
    return table, seen


def test_short_link_followed_to_the_coordinates(hops):
    table, seen = hops
    table["https://maps.app.goo.gl/AbC123"] = (
        "https://www.google.com/maps/place/x/@32.07,34.79,17z/data=!3d32.0812!4d34.8105"
    )
    assert maps_links.resolve("https://maps.app.goo.gl/AbC123") == (32.0812, 34.8105)
    assert seen == ["https://maps.app.goo.gl/AbC123"]  # stops as soon as it has coordinates


def test_chain_through_consent_page(hops):
    table, _ = hops
    table["https://maps.app.goo.gl/AbC123"] = "https://www.google.com/maps?share=1"
    table["https://www.google.com/maps?share=1"] = (
        "https://consent.google.com/ml?continue=https://www.google.com/maps/@32.0812,34.8105,15z"
    )
    assert maps_links.resolve("https://maps.app.goo.gl/AbC123") == (32.0812, 34.8105)


@pytest.mark.parametrize("url", [
    "http://169.254.169.254/latest/meta-data",
    "https://localhost/maps",
    "https://evil.example/maps.app.goo.gl/x",
    "file:///etc/passwd",
    "http://maps.app.goo.gl/AbC123",  # https only
    "https://maps.app.goo.gl.evil.example/x",
])
def test_only_google_maps_hosts_are_fetched(hops, url):
    _, seen = hops
    with pytest.raises(maps_links.LinkError) as e:
        maps_links.resolve(url)
    assert e.value.kind == "not_allowed"
    assert seen == []


def test_a_redirect_to_another_host_isnt_followed(hops):
    table, seen = hops
    table["https://maps.app.goo.gl/AbC123"] = "http://169.254.169.254/latest/meta-data"
    with pytest.raises(maps_links.LinkError) as e:
        maps_links.resolve("https://maps.app.goo.gl/AbC123")
    assert e.value.kind == "not_allowed"
    assert seen == ["https://maps.app.goo.gl/AbC123"]


def test_redirect_loops_stop(hops):
    table, seen = hops
    table["https://maps.app.goo.gl/a"] = "https://maps.app.goo.gl/b"
    table["https://maps.app.goo.gl/b"] = "https://maps.app.goo.gl/a"
    with pytest.raises(maps_links.LinkError) as e:
        maps_links.resolve("https://maps.app.goo.gl/a")
    assert e.value.kind == "no_coordinates"
    assert len(seen) <= maps_links.MAX_HOPS


def test_link_without_coordinates(hops):
    table, _ = hops
    table["https://maps.app.goo.gl/AbC123"] = None  # no redirect, nothing to read
    with pytest.raises(maps_links.LinkError) as e:
        maps_links.resolve("https://maps.app.goo.gl/AbC123")
    assert e.value.kind == "no_coordinates"


def test_full_link_needs_no_request(hops):
    _, seen = hops
    assert maps_links.resolve("https://www.google.com/maps/@32.0812,34.8105,15z") == (32.0812, 34.8105)
    assert seen == []


def test_request_identifies_us_and_never_follows_redirects_itself(monkeypatch):
    captured = {}

    class FakeResponse:
        status = 200
        headers = {}

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    class FakeOpener:
        def open(self, request, timeout):
            captured["ua"] = request.get_header("User-agent")
            captured["method"] = request.get_method()
            captured["timeout"] = timeout
            return FakeResponse()

    monkeypatch.setattr(maps_links, "_opener", FakeOpener())
    assert maps_links._next_location("https://maps.app.goo.gl/AbC123") is None
    assert "SmartMind" in captured["ua"]
    assert captured["method"] == "HEAD"
    assert captured["timeout"] <= 10


# ---- the endpoint ----

def test_endpoint(hops):
    table, _ = hops
    table["https://maps.app.goo.gl/AbC123"] = "https://www.google.com/maps/@32.0812,34.8105,15z"
    res = client.get("/places/resolve-link", params={"url": "https://maps.app.goo.gl/AbC123"})
    assert res.status_code == 200
    assert res.json() == {"latitude": 32.0812, "longitude": 34.8105}


@pytest.mark.parametrize("url, status, kind", [
    ("http://169.254.169.254/", 422, "not_allowed"),
    ("https://maps.app.goo.gl/missing", 504, "network"),
])
def test_endpoint_errors(hops, url, status, kind):
    res = client.get("/places/resolve-link", params={"url": url})
    assert res.status_code == status
    assert res.json()["detail"]["kind"] == kind


def test_endpoint_no_coordinates_is_422(hops):
    table, _ = hops
    table["https://maps.app.goo.gl/AbC123"] = None
    res = client.get("/places/resolve-link", params={"url": "https://maps.app.goo.gl/AbC123"})
    assert res.status_code == 422
    assert res.json()["detail"]["kind"] == "no_coordinates"


def test_endpoint_requires_sign_in(monkeypatch, hops):
    import api.main as main
    monkeypatch.setattr(main, "get_user_id", lambda authorization: None)
    assert client.get("/places/resolve-link", params={"url": "https://maps.app.goo.gl/x"}).status_code == 401

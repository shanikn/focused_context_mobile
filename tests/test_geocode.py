import io
import json
import urllib.error
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

import geocode
from api.main import app

client = TestClient(app)

REICHMAN = [{"display_name": "Reichman University, Herzliya, Israel", "lat": "32.1762529", "lon": "34.8370916"}]


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture(autouse=True)
def fresh_state():
    geocode.clear_cache()
    yield
    geocode.clear_cache()


@pytest.fixture
def upstream(monkeypatch):
    """Fake Nominatim; records every request it gets."""
    calls = []
    state = {"body": REICHMAN, "error": None}

    def fake_urlopen(request, timeout):
        calls.append(request)
        if state["error"]:
            raise state["error"]
        return FakeResponse(json.dumps(state["body"]).encode())

    monkeypatch.setattr(geocode, "urlopen", fake_urlopen)
    monkeypatch.setattr(geocode, "_sleep", lambda s: None)
    return calls, state


def test_search_parses_results(upstream):
    assert geocode.search("Reichman University") == [
        {"label": "Reichman University, Herzliya, Israel", "latitude": 32.1762529, "longitude": 34.8370916}
    ]


def test_request_matches_nominatim_policy(upstream):
    calls, _ = upstream
    geocode.search("Reichman University")
    req = calls[0]
    url = urlparse(req.full_url)
    assert url.scheme == "https" and url.netloc == "nominatim.openstreetmap.org" and url.path == "/search"
    assert parse_qs(url.query) == {"q": ["Reichman University"], "format": ["jsonv2"], "limit": ["5"]}
    assert "FocusedContext" in req.get_header("User-agent")


def test_query_is_cleaned_of_rtl_marks(upstream):
    calls, _ = upstream
    geocode.search("‏Reichman ‫University‬ ")
    assert parse_qs(urlparse(calls[0].full_url).query)["q"] == ["Reichman University"]


def test_invalid_coordinates_are_skipped(upstream):
    _, state = upstream
    state["body"] = [{"display_name": "bad", "lat": "x", "lon": "1"}, {"display_name": "ok", "lat": "1", "lon": "2"}]
    assert [r["label"] for r in geocode.search("x")] == ["ok"]


def test_repeated_query_is_served_from_cache(upstream):
    calls, _ = upstream
    geocode.search("Reichman University")
    geocode.search("  reichman   university ")
    assert len(calls) == 1


def test_at_most_one_upstream_request_per_second(monkeypatch, upstream):
    waits = []
    now = [100.0]
    monkeypatch.setattr(geocode, "_sleep", lambda s: (waits.append(s), now.__setitem__(0, now[0] + s)))
    monkeypatch.setattr(geocode, "_now", lambda: now[0])
    geocode.search("first")
    now[0] += 0.25
    geocode.search("second")
    assert waits == [pytest.approx(0.75)]


def test_empty_query_makes_no_request(upstream):
    calls, _ = upstream
    assert geocode.search("   ") == []
    assert calls == []


@pytest.mark.parametrize("code, kind", [(403, "blocked"), (429, "rate_limited"), (503, "http")])
def test_upstream_http_errors(upstream, code, kind):
    _, state = upstream
    state["error"] = urllib.error.HTTPError("u", code, "x", {}, io.BytesIO(b""))
    with pytest.raises(geocode.GeocodeError) as e:
        geocode.search("x")
    assert e.value.kind == kind and e.value.status == code


def test_upstream_unreachable(upstream):
    _, state = upstream
    state["error"] = urllib.error.URLError("timed out")
    with pytest.raises(geocode.GeocodeError) as e:
        geocode.search("x")
    assert e.value.kind == "network"


def test_errors_are_not_cached(upstream):
    calls, state = upstream
    state["error"] = urllib.error.URLError("down")
    with pytest.raises(geocode.GeocodeError):
        geocode.search("x")
    state["error"] = None
    assert geocode.search("x") == geocode.search("x")
    assert len(calls) == 2


# ---- API ----

def test_geocode_endpoint(upstream):
    res = client.get("/geocode/", params={"q": "Reichman University"})
    assert res.status_code == 200
    assert res.json()[0]["latitude"] == pytest.approx(32.1762529)


@pytest.mark.parametrize(
    "code, kind, expected", [(403, "blocked", 502), (429, "rate_limited", 429), (503, "http", 502)]
)
def test_geocode_endpoint_maps_upstream_errors(upstream, code, kind, expected):
    _, state = upstream
    state["error"] = urllib.error.HTTPError("u", code, "x", {}, io.BytesIO(b""))
    res = client.get("/geocode/", params={"q": "x"})
    assert res.status_code == expected
    assert res.json()["detail"] == {"kind": kind, "upstream_status": code}


def test_geocode_endpoint_unreachable_is_504(upstream):
    _, state = upstream
    state["error"] = urllib.error.URLError("timed out")
    res = client.get("/geocode/", params={"q": "x"})
    assert res.status_code == 504
    assert res.json()["detail"]["kind"] == "network"

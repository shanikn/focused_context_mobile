import io
import json
import socket
import urllib.error
from urllib.parse import parse_qs

import pytest
from fastapi.testclient import TestClient

import nearby
from api.main import app

client = TestClient(app)

# a node, a way with a center, an unnamed shop and one without coordinates
OVERPASS = {
    "elements": [
        {"type": "node", "id": 1, "lat": 32.1000, "lon": 34.8000, "tags": {"shop": "supermarket", "name": "Shufersal"}},
        {
            "type": "way",
            "id": 2,
            "center": {"lat": 32.1010, "lon": 34.8010},
            "tags": {"shop": "convenience", "name": "AM:PM"},
        },
        {
            "type": "node",
            "id": 3,
            "lat": 32.1200,
            "lon": 34.8000,
            "tags": {"shop": "supermarket", "brand": "Rami Levy"},
        },
        {"type": "node", "id": 4, "lat": 32.1005, "lon": 34.8005, "tags": {"shop": "convenience"}},
        {"type": "relation", "id": 5, "tags": {"shop": "supermarket", "name": "No coords"}},
    ]
}
HERE = {"lat": 32.1, "lon": 34.8}


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture(autouse=True)
def fresh_state():
    nearby.clear_cache()
    yield
    nearby.clear_cache()


@pytest.fixture
def overpass(monkeypatch):
    """Fake Overpass; records every request it gets."""
    calls = []
    state = {"body": OVERPASS, "error": None}

    def fake_urlopen(request, timeout):
        calls.append(request)
        if state["error"]:
            raise state["error"]
        return FakeResponse(json.dumps(state["body"]).encode())

    monkeypatch.setattr(nearby, "urlopen", fake_urlopen)
    monkeypatch.setattr(nearby, "_sleep", lambda s: None)
    return calls, state


def _query(request) -> str:
    return parse_qs(request.data.decode())["data"][0]


def test_parses_nodes_and_ways_nearest_first(overpass):
    stores = nearby.find("supermarket", 32.1, 34.8, 2000)
    assert [s["name"] for s in stores] == ["Shufersal", "Convenience store", "AM:PM", "Rami Levy"]
    assert stores[0] == {"id": "node/1", "name": "Shufersal", "lat": 32.1, "lon": 34.8}
    assert stores[2]["id"] == "way/2"
    assert stores[2]["lat"] == pytest.approx(32.101)


def test_supermarket_query_includes_convenience_stores(overpass):
    calls, _ = overpass
    nearby.find("supermarket", 32.1, 34.8, 2000)
    query = _query(calls[0])
    assert '"shop"~"^(supermarket|convenience)$"' in query
    assert "around:2000,32.1,34.8" in query
    assert "out center" in query


@pytest.mark.parametrize(
    "store_type, selector", [("pharmacy", '"amenity"="pharmacy"'), ("post_office", '"amenity"="post_office"')]
)
def test_other_store_types(overpass, store_type, selector):
    calls, state = overpass
    state["body"] = {"elements": [{"type": "node", "id": 9, "lat": 32.1, "lon": 34.8, "tags": {}}]}
    stores = nearby.find(store_type, 32.1, 34.8, 1000)
    assert selector in _query(calls[0])
    assert stores[0]["name"] == {"pharmacy": "Pharmacy", "post_office": "Post office"}[store_type]


def test_unknown_type_is_rejected(overpass):
    with pytest.raises(ValueError):
        nearby.find("bakery", 32.1, 34.8, 1000)


def test_at_most_20_results(overpass):
    _, state = overpass
    state["body"] = {
        "elements": [
            {"type": "node", "id": i, "lat": 32.1 + i / 10000, "lon": 34.8, "tags": {"name": f"s{i}"}}
            for i in range(30)
        ]
    }
    stores = nearby.find("supermarket", 32.1, 34.8, 2000)
    assert len(stores) == 20
    assert stores[0]["name"] == "s0"


def test_request_identifies_us(overpass):
    calls, _ = overpass
    nearby.find("supermarket", 32.1, 34.8, 2000)
    assert "SmartMind" in calls[0].get_header("User-agent")
    assert calls[0].full_url == nearby.OVERPASS_URL


def test_cached_by_area_and_type(monkeypatch, overpass):
    calls, _ = overpass
    now = [1000.0]
    monkeypatch.setattr(nearby, "_now", lambda: now[0])
    nearby.find("supermarket", 32.1, 34.8, 2000)
    nearby.find("supermarket", 32.10004, 34.80004, 2000)  # a few meters away: same area
    assert len(calls) == 1
    nearby.find("pharmacy", 32.1, 34.8, 2000)
    assert len(calls) == 2
    now[0] += nearby.CACHE_TTL_SECONDS + 1
    nearby.find("supermarket", 32.1, 34.8, 2000)
    assert len(calls) == 3


def test_timeout_without_cache_raises(overpass):
    _, state = overpass
    state["error"] = socket.timeout("timed out")
    with pytest.raises(nearby.NearbyError) as e:
        nearby.find("supermarket", 32.1, 34.8, 2000)
    assert e.value.kind == "timeout"


def test_overpass_query_timeout_remark_is_a_timeout(overpass):
    _, state = overpass
    state["body"] = {"elements": [], "remark": 'runtime error: Query timed out in "query" at line 1 after 11 seconds.'}
    with pytest.raises(nearby.NearbyError) as e:
        nearby.find("supermarket", 32.1, 34.8, 2000)
    assert e.value.kind == "timeout"


def test_upstream_failure_serves_stale_cache(monkeypatch, overpass):
    _, state = overpass
    now = [1000.0]
    monkeypatch.setattr(nearby, "_now", lambda: now[0])
    first = nearby.find("supermarket", 32.1, 34.8, 2000)
    now[0] += nearby.CACHE_TTL_SECONDS + 1
    state["error"] = urllib.error.URLError("down")
    assert nearby.find("supermarket", 32.1, 34.8, 2000) == first


# ---- the endpoint ----

def test_endpoint(overpass):
    res = client.get("/places/nearby", params={**HERE, "type": "supermarket", "radius_m": 2000})
    assert res.status_code == 200
    assert res.json()[0]["name"] == "Shufersal"


def test_endpoint_defaults_to_supermarkets_within_2km(overpass):
    calls, _ = overpass
    assert client.get("/places/nearby", params=HERE).status_code == 200
    assert "around:2000," in _query(calls[0])
    assert "supermarket" in _query(calls[0])


@pytest.mark.parametrize(
    "params",
    [
        {**HERE, "type": "bakery"},
        {"lat": 95, "lon": 34.8},
        {"lat": 32.1, "lon": 200},
        {**HERE, "radius_m": 50},
        {**HERE, "radius_m": 10000},
    ],
)
def test_endpoint_rejects_bad_input(overpass, params):
    assert client.get("/places/nearby", params=params).status_code in (400, 422)


def test_endpoint_timeout_is_504(overpass):
    _, state = overpass
    state["error"] = socket.timeout("timed out")
    res = client.get("/places/nearby", params=HERE)
    assert res.status_code == 504
    assert res.json()["detail"]["kind"] == "timeout"


def test_endpoint_rate_limited_is_429(overpass):
    _, state = overpass
    state["error"] = urllib.error.HTTPError("u", 429, "x", {}, io.BytesIO(b""))
    assert client.get("/places/nearby", params=HERE).status_code == 429


def test_endpoint_requires_sign_in(monkeypatch, overpass):
    import api.main as main
    monkeypatch.setattr(main, "get_user_id", lambda authorization: None)
    assert client.get("/places/nearby", params=HERE).status_code == 401


def test_nearby_does_not_clash_with_place_routes(overpass):
    assert isinstance(client.get("/places/").json(), list)


def test_pharmacy_includes_drugstores(overpass):
    # Super-Pharm and similar are tagged shop=chemist in OpenStreetMap
    calls, state = overpass
    state["body"] = {
        "elements": [
            {"type": "node", "id": 7, "lat": 32.1001, "lon": 34.8, "tags": {"shop": "chemist", "name": "Super-Pharm"}},
            {"type": "node", "id": 8, "lat": 32.1002, "lon": 34.8, "tags": {"amenity": "pharmacy", "name": "Be"}},
            {"type": "node", "id": 9, "lat": 32.1003, "lon": 34.8, "tags": {"shop": "chemist"}},
        ]
    }
    stores = nearby.find("pharmacy", 32.1, 34.8, 2000)
    query = _query(calls[0])
    assert '"amenity"="pharmacy"' in query
    assert '"shop"="chemist"' in query
    assert [s["name"] for s in stores] == ["Super-Pharm", "Be", "Drugstore"]

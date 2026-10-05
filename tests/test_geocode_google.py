"""/places/search through Google Places API (New) Text Search when
GOOGLE_MAPS_API_KEY is set, Nominatim otherwise or when Google fails.
Google is always mocked; the key used here is fake."""
import io
import json
import logging
import urllib.error
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient

import geocode
from api.main import app

client = TestClient(app)
FAKE_KEY = "fake-test-key-123"  # not a real key
GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText"

GOOGLE_BODY = {
    "places": [
        {
            "displayName": {"text": "Azrieli Center", "languageCode": "he"},
            "formattedAddress": "Derech Menachem Begin 132, Tel Aviv-Yafo, Israel",
            "location": {"latitude": 32.0745, "longitude": 34.7918},
        },
        {
            "displayName": {"text": "Rothschild Blvd 10"},
            "formattedAddress": "Rothschild Blvd 10, Tel Aviv-Yafo, Israel",
            "location": {"latitude": 32.0641, "longitude": 34.7748},
        },
        {"displayName": {"text": "no location"}, "formattedAddress": "somewhere"},
    ]
}
NOMINATIM_BODY = [{"display_name": "Rothschild 10, Tel Aviv, Israel", "lat": "32.064", "lon": "34.774"}]


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture(autouse=True)
def fresh():
    geocode.clear_cache()
    yield
    geocode.clear_cache()


@pytest.fixture
def upstream(monkeypatch):
    """Fake Google and Nominatim; records every request."""
    calls = []
    state = {"google": GOOGLE_BODY, "google_error": None, "nominatim": NOMINATIM_BODY}

    def fake_urlopen(request, timeout):
        calls.append(request)
        if request.full_url.startswith(GOOGLE_URL):
            if state["google_error"]:
                raise state["google_error"]
            return FakeResponse(json.dumps(state["google"]).encode())
        return FakeResponse(json.dumps(state["nominatim"]).encode())

    monkeypatch.setattr(geocode, "urlopen", fake_urlopen)
    monkeypatch.setattr(geocode, "_sleep", lambda s: None)
    return calls, state


def _google_calls(calls):
    return [c for c in calls if c.full_url.startswith(GOOGLE_URL)]


def _nominatim_calls(calls):
    return [c for c in calls if urlparse(c.full_url).netloc == "nominatim.openstreetmap.org"]


def test_tests_never_see_a_real_key():
    import os
    assert os.environ.get("GOOGLE_MAPS_API_KEY") == ""  # set empty by conftest


def test_without_a_key_nominatim_is_used(upstream, monkeypatch):
    calls, _ = upstream
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    assert geocode.search("Rothschild 10") == [
        {"label": "Rothschild 10, Tel Aviv, Israel", "latitude": 32.064, "longitude": 34.774}
    ]
    assert _google_calls(calls) == []


def test_with_a_key_google_text_search_is_used(upstream, monkeypatch):
    calls, _ = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    results = geocode.search("עזריאלי")
    assert results == [
        {
            "label": "Azrieli Center, Derech Menachem Begin 132, Tel Aviv-Yafo, Israel",
            "latitude": 32.0745,
            "longitude": 34.7918,
        },
        # the name is already the start of the address: not repeated
        {"label": "Rothschild Blvd 10, Tel Aviv-Yafo, Israel", "latitude": 32.0641, "longitude": 34.7748},
    ]
    assert _nominatim_calls(calls) == []
    req = _google_calls(calls)[0]
    assert req.get_method() == "POST"
    assert req.get_header("X-goog-api-key") == FAKE_KEY
    assert req.get_header("X-goog-fieldmask") == "places.displayName,places.formattedAddress,places.location"
    assert req.get_header("Content-type") == "application/json"
    body = json.loads(req.data)
    assert body["textQuery"] == "עזריאלי"
    assert body["languageCode"] == "he"
    assert body["regionCode"] == "IL"
    assert body["pageSize"] == 5
    assert "locationBias" not in body
    assert FAKE_KEY not in req.full_url  # the key goes in a header, never the URL


def test_location_bias_toward_the_user(upstream, monkeypatch):
    calls, _ = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    geocode.search("Rothschild 10", lat=32.1663, lon=34.8433)
    body = json.loads(_google_calls(calls)[0].data)
    assert body["locationBias"] == {
        "circle": {"center": {"latitude": 32.1663, "longitude": 34.8433}, "radius": geocode.GOOGLE_BIAS_RADIUS_M}
    }
    assert geocode.GOOGLE_BIAS_RADIUS_M <= 50000  # Google's maximum


@pytest.mark.parametrize("error", [
    urllib.error.HTTPError(GOOGLE_URL, 403, "Forbidden", {}, io.BytesIO(b'{"error": "API key not valid"}')),
    urllib.error.HTTPError(GOOGLE_URL, 500, "Server Error", {}, io.BytesIO(b"")),
    urllib.error.URLError("timed out"),
])
def test_google_failing_falls_back_to_nominatim(upstream, monkeypatch, caplog, error):
    calls, state = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    state["google_error"] = error
    caplog.set_level(logging.DEBUG)
    assert geocode.search("Rothschild 10")[0]["label"] == "Rothschild 10, Tel Aviv, Israel"
    assert len(_google_calls(calls)) == 1 and len(_nominatim_calls(calls)) == 1
    assert "Google" in caplog.text
    assert FAKE_KEY not in caplog.text


@pytest.mark.parametrize("body", [{"places": []}, {}, {"places": "nonsense"}, ["not", "an", "object"]])
def test_google_with_nothing_usable_falls_back_to_nominatim(upstream, monkeypatch, body):
    calls, state = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    state["google"] = body
    assert geocode.search("Rothschild 10")[0]["label"] == "Rothschild 10, Tel Aviv, Israel"
    assert len(_nominatim_calls(calls)) == 1


def test_coordinate_lookups_stay_on_nominatim(upstream, monkeypatch):
    # the map's reverse lookup sends "lat,lon"; Nominatim answers it with the nearest address
    calls, _ = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    geocode.search("32.166300,34.843300")
    assert _google_calls(calls) == []
    assert len(_nominatim_calls(calls)) == 1


def test_google_answers_are_cached(upstream, monkeypatch):
    calls, _ = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    geocode.search("Azrieli", lat=32.16, lon=34.84)
    geocode.search("azrieli", lat=32.1601, lon=34.8402)  # same area: same answer
    assert len(_google_calls(calls)) == 1
    geocode.search("Azrieli", lat=31.77, lon=35.21)  # another city: asked again
    assert len(_google_calls(calls)) == 2


# ---- the endpoint ----

def test_endpoint_passes_the_location_and_never_returns_the_key(upstream, monkeypatch):
    calls, _ = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    res = client.get("/places/search", params={"q": "Azrieli", "lat": 32.1663, "lon": 34.8433})
    assert res.status_code == 200
    assert res.json()[0]["label"].startswith("Azrieli Center")
    assert FAKE_KEY not in res.text
    assert set(res.headers) & {"x-goog-api-key"} == set()
    body = json.loads(_google_calls(calls)[0].data)
    assert body["locationBias"]["circle"]["center"] == {"latitude": 32.1663, "longitude": 34.8433}


def test_endpoint_without_location(upstream, monkeypatch):
    calls, _ = upstream
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", FAKE_KEY)
    assert client.get("/places/search", params={"q": "Azrieli"}).status_code == 200
    assert "locationBias" not in json.loads(_google_calls(calls)[0].data)


@pytest.mark.parametrize("params", [{"q": "x", "lat": 95, "lon": 34}, {"q": "x", "lat": 32, "lon": 190}])
def test_endpoint_rejects_bad_coordinates(upstream, params):
    assert client.get("/places/search", params=params).status_code == 422


def test_key_is_not_in_the_repository():
    import pathlib
    import re
    import subprocess
    root = pathlib.Path(__file__).resolve().parents[1]
    tracked = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True).stdout.split()
    # Firebase's client config holds the Firebase *client* key, which is public
    # by design (it ships inside the app); the server's Maps key must not be anywhere
    firebase_client_config = {"mobile/google-services.json", "mobile/src/config/firebase.ts"}
    # a Google API key: "AIza" and 35 more characters (built here so this file doesn't match itself)
    key_shape = re.compile("AI" + "za" + "[0-9A-Za-z_-]{35}")
    for name in tracked:
        if name in firebase_client_config:
            continue
        path = root / name
        if path.suffix in {".py", ".ts", ".tsx", ".json", ".md", ".yml", ".yaml", ".env", ".txt"} and path.is_file():
            text = path.read_text(encoding="utf-8", errors="ignore")
            assert not key_shape.search(text), f"something like a Google API key in {name}"

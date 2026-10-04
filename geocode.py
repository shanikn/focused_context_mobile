"""Address search proxy for the app, backed by OpenStreetMap Nominatim.

The phone asks our backend, and the backend asks Nominatim, following its
usage policy (https://operations.osmfoundation.org/policies/nominatim/):
an identifying User-Agent, at most one request per second for the whole
server, and a short cache of repeated queries.
"""
import json
import re
import threading
import time
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SEARCH_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "FocusedContext/1.0 (university project; contextmind-api.azurewebsites.net)"
MAX_RESULTS = 5
TIMEOUT_SECONDS = 10
MIN_INTERVAL_SECONDS = 1.0
CACHE_TTL_SECONDS = 10 * 60
CACHE_MAX_ENTRIES = 500

# invisible bidi control characters a Hebrew keyboard or copied RTL text adds
_BIDI_CONTROLS = re.compile("[\u200e\u200f\u202a-\u202e\u2066-\u2069]")

_lock = threading.Lock()
_last_request = float("-inf")
_cache: dict = {}  # cleaned lowercase query -> (stored_at, results)

# indirection so tests can fake time
_now = time.monotonic
_sleep = time.sleep


class GeocodeError(Exception):
    """kind: blocked (403) | rate_limited (429) | http | network | bad_response"""

    def __init__(self, kind: str, status: Optional[int] = None, detail: str = ""):
        super().__init__(f"{kind} {status or ''} {detail}".strip())
        self.kind = kind
        self.status = status
        self.detail = detail


def clean_query(query: str) -> str:
    return " ".join(_BIDI_CONTROLS.sub("", query).split())


def clear_cache():
    global _last_request
    with _lock:
        _cache.clear()
        _last_request = float("-inf")


def _parse(raw) -> list:
    results = []
    if not isinstance(raw, list):
        return results
    for item in raw:
        try:
            lat, lon = float(item["lat"]), float(item["lon"])
            label = item["display_name"]
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(label, str) and abs(lat) <= 90 and abs(lon) <= 180:
            results.append({"label": label, "latitude": lat, "longitude": lon})
    return results[:MAX_RESULTS]


def _fetch(query: str) -> list:
    url = f"{SEARCH_URL}?{urlencode({'q': query, 'format': 'jsonv2', 'limit': MAX_RESULTS})}"
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = response.read()
    except HTTPError as e:
        kind = {403: "blocked", 429: "rate_limited"}.get(e.code, "http")
        raise GeocodeError(kind, e.code)
    except (URLError, TimeoutError, OSError) as e:
        raise GeocodeError("network", detail=str(getattr(e, "reason", e)))
    try:
        return _parse(json.loads(body))
    except ValueError:
        raise GeocodeError("bad_response")


def search(query: str) -> list:
    """Up to 5 results as {label, latitude, longitude}. Raises GeocodeError."""
    global _last_request
    cleaned = clean_query(query)
    if not cleaned:
        return []
    key = cleaned.lower()
    with _lock:
        hit = _cache.get(key)
        if hit and _now() - hit[0] < CACHE_TTL_SECONDS:
            return hit[1]
        # one upstream request per second across all users
        wait = _last_request + MIN_INTERVAL_SECONDS - _now()
        if wait > 0:
            _sleep(wait)
        _last_request = _now()
        results = _fetch(cleaned)
        if len(_cache) >= CACHE_MAX_ENTRIES:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (_now(), results)
        return results

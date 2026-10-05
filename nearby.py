"""Nearby stores for the app, from OpenStreetMap via the Overpass API.

The phone sends its rough position and a store type; we ask Overpass for
matching shops around it and return the nearest ones. Following Overpass
etiquette (https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances):
an identifying User-Agent, one request at a time with at least a second
between them, a server-side query timeout, and a cache so the same area
isn't asked again for hours. If Overpass is down or slow and we've seen the
area before, the older answer is returned instead of an error.
"""
import json
import math
import socket
import threading
import time
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "SmartMind/1.0 (university project; contextmind-api.azurewebsites.net)"
QUERY_TIMEOUT_SECONDS = 10  # Overpass gives up after this
HTTP_TIMEOUT_SECONDS = 15  # we give up a little later
MIN_INTERVAL_SECONDS = 1.0
MAX_RESULTS = 20
CACHE_TTL_SECONDS = 6 * 60 * 60  # shops rarely move
CACHE_MAX_ENTRIES = 1000
# the cache key rounds the position to 3 decimals (about 100 m)
CACHE_PRECISION = 3

# store type -> Overpass tag selectors (any of them)
STORE_SELECTORS = {
    "supermarket": ['"shop"~"^(supermarket|convenience)$"'],
    # drugstores like Super-Pharm are shop=chemist
    "pharmacy": ['"amenity"="pharmacy"', '"shop"="chemist"'],
    "post_office": ['"amenity"="post_office"'],
}

# a name for shops without one
_UNNAMED = {
    "supermarket": "Supermarket",
    "convenience": "Convenience store",
    "pharmacy": "Pharmacy",
    "chemist": "Drugstore",
    "post_office": "Post office",
}

_lock = threading.Lock()
_last_request = float("-inf")
_cache: dict = {}  # (type, lat, lon, radius) -> (stored_at, stores)

# indirection so tests can fake time
_now = time.monotonic
_sleep = time.sleep


class NearbyError(Exception):
    """kind: timeout | rate_limited | http | network | bad_response"""

    def __init__(self, kind: str, status: Optional[int] = None, detail: str = ""):
        super().__init__(f"{kind} {status or ''} {detail}".strip())
        self.kind = kind
        self.status = status
        self.detail = detail


def clear_cache():
    global _last_request
    with _lock:
        _cache.clear()
        _last_request = float("-inf")


def _distance_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def build_query(store_type: str, lat: float, lon: float, radius_m: int) -> str:
    around = f"around:{radius_m},{lat},{lon}"
    parts = "".join(f"nwr[{selector}]({around});" for selector in STORE_SELECTORS[store_type])
    return f"[out:json][timeout:{QUERY_TIMEOUT_SECONDS}];({parts});out center 100;"


def _name(tags: dict, store_type: str) -> str:
    for key in ("name", "name:en", "brand"):
        if isinstance(tags.get(key), str) and tags[key].strip():
            return tags[key].strip()
    return _UNNAMED.get(tags.get("shop")) or _UNNAMED[store_type]


def _parse(raw, store_type: str, lat: float, lon: float) -> list:
    if not isinstance(raw, dict) or not isinstance(raw.get("elements"), list):
        raise NearbyError("bad_response")
    remark = raw.get("remark") or ""
    if "timed out" in remark.lower():
        raise NearbyError("timeout", detail=remark)
    stores = []
    for el in raw["elements"]:
        try:
            point = el if "lat" in el else el["center"]
            s_lat, s_lon = float(point["lat"]), float(point["lon"])
            store_id = f"{el['type']}/{el['id']}"
        except (KeyError, TypeError, ValueError):
            continue
        tags = el.get("tags") if isinstance(el.get("tags"), dict) else {}
        stores.append({"id": store_id, "name": _name(tags, store_type), "lat": s_lat, "lon": s_lon})
    stores.sort(key=lambda s: _distance_m(lat, lon, s["lat"], s["lon"]))
    return stores[:MAX_RESULTS]


def _fetch(query: str) -> dict:
    data = urlencode({"data": query}).encode()
    request = Request(
        OVERPASS_URL, data=data, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            body = response.read()
    except HTTPError as e:
        # Overpass answers 504 when it's too busy to run the query in time
        kind = {429: "rate_limited", 504: "timeout"}.get(e.code, "http")
        raise NearbyError(kind, e.code)
    except (socket.timeout, TimeoutError) as e:
        raise NearbyError("timeout", detail=str(e))
    except URLError as e:
        timed_out = isinstance(e.reason, (socket.timeout, TimeoutError)) or "timed out" in str(e.reason)
        raise NearbyError("timeout" if timed_out else "network", detail=str(e.reason))
    except OSError as e:
        raise NearbyError("network", detail=str(e))
    try:
        return json.loads(body)
    except ValueError:
        raise NearbyError("bad_response")


def find(store_type: str, lat: float, lon: float, radius_m: int = 2000) -> list:
    """Up to 20 stores as {id, name, lat, lon}, nearest first.
    Raises ValueError for an unknown type, NearbyError when Overpass fails
    and there's no earlier answer for the area."""
    global _last_request
    if store_type not in STORE_SELECTORS:
        raise ValueError(f"unknown store type: {store_type}")
    c_lat, c_lon = round(lat, CACHE_PRECISION), round(lon, CACHE_PRECISION)
    key = (store_type, c_lat, c_lon, radius_m)
    with _lock:
        hit = _cache.get(key)
        if hit and _now() - hit[0] < CACHE_TTL_SECONDS:
            return hit[1]
        wait = _last_request + MIN_INTERVAL_SECONDS - _now()
        if wait > 0:
            _sleep(wait)
        _last_request = _now()
        try:
            stores = _parse(_fetch(build_query(store_type, c_lat, c_lon, radius_m)), store_type, lat, lon)
        except NearbyError:
            if hit:
                return hit[1]  # stale, but better than nothing
            raise
        if key not in _cache and len(_cache) >= CACHE_MAX_ENTRIES:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (_now(), stores)
        return stores

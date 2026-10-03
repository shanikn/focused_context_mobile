from datetime import datetime
from typing import Optional

# context agent: figures out where and when the user is right now
# location: one of the user's places (by id), or "unknown"
# time bucket: morning(8-12), noon(12-14), afternoon(14-17),
#              evening(17-21), night(21-8)


def get_time_bucket(hour: Optional[int] = None):
    if hour is None:
        hour = datetime.now().hour
    if 8 <= hour < 12:
        return "morning"
    elif 12 <= hour < 14:
        return "noon"
    elif 14 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"


def _find_place(location: Optional[str], places: list):
    if not location:
        return None
    for p in places:
        if p.id == location:
            return p
    for p in places:
        if p.name.lower() == location.strip().lower():
            return p
    return None


def get_location_bucket(location: Optional[str], places: list) -> str:
    """The id of the user's place matching `location` (an id or a name,
    case-insensitive), or "unknown"."""
    place = _find_place(location, places)
    return place.id if place else "unknown"


def get_context(location: str, hour: Optional[int] = None, places: Optional[list] = None):
    time = get_time_bucket(hour)
    place = _find_place(location, places or [])
    return f"{place.name if place else 'unknown'} + {time}"

from datetime import datetime
from typing import Optional

# context agent: figures out where and when the user is right now
# location bucket: home, uni, errands, work
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


def get_location_bucket(location: str):
    valid = ["home", "uni", "work", "errands"]
    if location in valid:
        return location
    else:
        return "unknown"


def get_context(location: str, hour: Optional[int] = None):
    time = get_time_bucket(hour)
    place = get_location_bucket(location)
    return f"{place} + {time}"

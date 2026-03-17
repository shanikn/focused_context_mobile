import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# for UI
task = ["to do", "task"]
errand = [
    "go", "pick up", "buy", "errand",
    "shopping", "shopping list", "walk", "take",
]
idea = ["idea", "random"]
reminder = ["remind", "forget", "remember"]
scheduled = [
    "schedule", "at", "time", "date", "calendar",
    "appointment", "breakfast", "lunch", "dinner",
]

home_keywords = [
    "home", "house", "laundry", "dishes",
    "clean", "trash", "feed", "cook", "kitchen", "bedroom",
]
uni_keywords = [
    "class", "lecture", "campus", "study", "exam",
    "homework", "assignment", "professor", "course",
    "uni", "university", "probability",
]
work_keywords = [
    "work", "office", "meeting", "boss", "client",
    "deadline", "colleague", "presentation", "email",
]


def _has_word(content, keyword):
    """Match whole words only to avoid substring false positives (e.g. 'eat' matching 'at')."""
    return bool(re.search(r'\b' + re.escape(keyword) + r'\b', content))


def categorize(content: str):
    lower = content.lower()
    result = "uncategorized"
    for x in reminder:
        if _has_word(lower, x):
            result = "reminder"
            break
    else:
        for x in task:
            if _has_word(lower, x):
                result = "task"
                break
        else:
            for x in scheduled:
                if _has_word(lower, x):
                    result = "scheduled"
                    break
            else:
                for x in errand:
                    if _has_word(lower, x):
                        result = "errand"
                        break
                else:
                    for x in idea:
                        if _has_word(lower, x):
                            result = "idea"
                            break
    logger.debug("categorize(%s) -> %s", content[:30], result)
    return result


fuzzy_time_map = {
    "morning": "09:00",
    "noon": "12:00",
    "lunch": "13:00",
    "afternoon": "15:00",
    "evening": "18:00",
    "tonight": "20:00",
    "night": "20:00",
    "breakfast": "09:00",
    "dinner": "20:00",
}


def infer_time(content: str) -> Optional[str]:
    """Returns time as 'HH:MM' string, or None if not found."""
    content_lower = content.lower()

    # "at 14:30" or "at 9:05"
    match = re.search(r'\bat\s+(\d{1,2}):(\d{2})\b', content_lower)
    if match:
        h, m = int(match.group(1)), int(match.group(2))
        return f"{h:02d}:{m:02d}"

    # "at 2pm" or "at 11am"
    match = re.search(r'\bat\s+(\d{1,2})(am|pm)\b', content_lower)
    if match:
        hour = int(match.group(1))
        if match.group(2) == "pm" and hour != 12:
            hour += 12
        if match.group(2) == "am" and hour == 12:
            hour = 0
        return f"{hour:02d}:00"

    # fuzzy words
    for word, t in fuzzy_time_map.items():
        if word in content_lower:
            return t

    return None


location_time_defaults = {
    "home": "09:00",
    "uni": "09:00",
    "work": "09:00",
    "errands": "15:00",
}


def default_time_for(location: str) -> Optional[str]:
    return location_time_defaults.get(location, None)


def infer_location(content: str, category: str) -> str:
    content = content.lower()
    for kw in home_keywords:
        if _has_word(content, kw):
            return "home"
    for kw in uni_keywords:
        if _has_word(content, kw):
            return "uni"
    for kw in work_keywords:
        if _has_word(content, kw):
            return "work"
    if category == "errand":
        return "errands"
    return ""

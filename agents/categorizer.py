import re
import logging
from functools import lru_cache
from typing import Optional
from datetime import datetime, timedelta

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
    "sleep": "20:00",
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


def infer_date(content: str, now: Optional[datetime] = None) -> Optional[str]:
    content_lower = content.lower()
    reference = now or datetime.now()
    days_pat = r"\bin\s+(\d+)\s+days?(?:\s+from\s+now)?\b"
    weeks_pat = r"\bin\s+(\d+)\s+weeks?(?:\s+from\s+now)?\b"
    in_days_match = re.search(days_pat, content_lower)
    in_weeks_match = re.search(weeks_pat, content_lower)

    if "today" in content_lower:
        return reference.strftime("%Y-%m-%d")

    if "tomorrow" in content_lower:
        return (reference + timedelta(days=1)).strftime("%Y-%m-%d")

    week_phrases = ("next week", "in a week", "in one week")
    if any(p in content_lower for p in week_phrases):
        return (reference + timedelta(weeks=1)).strftime("%Y-%m-%d")

    if in_days_match:
        delta = timedelta(days=int(in_days_match.group(1)))
        return (reference + delta).strftime("%Y-%m-%d")

    if in_weeks_match:
        delta = timedelta(weeks=int(in_weeks_match.group(1)))
        return (reference + delta).strftime("%Y-%m-%d")

    return None


# default reminder time for the built-in places; custom places have none
location_time_defaults = {
    "home": "09:00",
    "uni": "09:00",
    "work": "09:00",
}

# built-in keywords for the default places, by Place.kind
kind_keywords = {
    "home": home_keywords,
    "uni": uni_keywords,
    "work": work_keywords,
}

# semantic fallback: tag a place only on a clear match (measured on
# all-MiniLM-L6-v2: real matches 0.31-0.56, unrelated notes <= 0.27)
SEMANTIC_THRESHOLD = 0.30
SEMANTIC_MARGIN = 0.08


def default_time_for(place) -> Optional[str]:
    if place is None:
        return None
    return location_time_defaults.get(place.kind)


def _place_words(place) -> list:
    return [place.name.lower(), *place.keywords]


@lru_cache(maxsize=256)
def _embed(text: str):
    from agents.embedding_model import get_embedding_model
    return get_embedding_model().encode(text, convert_to_tensor=True)


def _semantic_match(content: str, places: list):
    from sentence_transformers.util import cos_sim
    note = _embed(content)
    scored = sorted(
        ((float(cos_sim(note, _embed(", ".join(_place_words(p))))), p) for p in places),
        key=lambda x: x[0],
        reverse=True,
    )
    best_score, best = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    if best_score >= SEMANTIC_THRESHOLD and best_score - runner_up >= SEMANTIC_MARGIN:
        return best
    return None


def infer_place(content: str, places: list):
    """The user's place a note belongs to, or None.
    1. the user's own places by name or keyword (most specific first)
    2. the built-in keywords of Home / Uni / Work
    3. semantic similarity between the note and each place's name + keywords
    """
    if not places:
        return None
    text = content.lower()
    custom = [p for p in places if p.kind is None]
    for place in custom:
        if any(_has_word(text, w) for w in _place_words(place)):
            return place
    for place in places:
        words = kind_keywords.get(place.kind, []) + _place_words(place)
        if place.kind and any(_has_word(text, w) for w in words):
            return place
    return _semantic_match(content, places)

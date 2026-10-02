from datetime import datetime
import chromadb
import os
import sys
import logging
from typing import Optional

logger = logging.getLogger(__name__)

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notepad import dict_to_note, get_note_by_id, get_all_notes  # noqa: E402
from agents.context import get_location_bucket  # noqa: E402
from agents.ranking_policy import score, is_on_cooldown  # noqa: E402
from agents.embedding_model import get_embedding_model  # noqa: E402

# chromadb setup
chroma_path = os.path.abspath(
    os.getenv("CHROMA_PATH")
    or os.path.join(os.path.dirname(__file__), "..", "chroma_db")
)
os.makedirs(chroma_path, exist_ok=True)
chroma_client = chromadb.PersistentClient(path=chroma_path)
collection = chroma_client.get_or_create_collection(name="notes")


def _minutes_diff(time_str, current_hour, current_minute):
    """Return absolute difference in minutes between HH:MM string and current time."""
    try:
        h, m = map(int, time_str.split(':'))
        return abs((h * 60 + m) - (current_hour * 60 + current_minute))
    except (ValueError, AttributeError):
        return 9999


ALL_LOCATIONS = {"home", "uni", "work", "errands"}


def _is_due_today(note, today_str):
    """Notes with no date are always eligible; dated notes only surface on that date."""
    return note.remind_on_date is None or note.remind_on_date == today_str


def _has_conflicting_location(note, location_bucket):
    """True if note has a different location than requested."""
    if location_bucket == "unknown":
        return False
    note_locs = ALL_LOCATIONS.intersection(note.contexts)
    if not note_locs:
        return False  # no location = location-neutral
    return location_bucket not in note_locs


def _context_bonus(note, location_bucket, current_hour, current_minute):
    loc_bonus = 3 if location_bucket in note.contexts else 0
    time_bonus = 0
    for item in note.contexts:
        if isinstance(item, str) and ':' in item:
            if _minutes_diff(item, current_hour, current_minute) <= 60:
                time_bonus = 2
                break
    return loc_bonus + time_bonus


# return top 3 notes via direct location match or semantic search fallback
def get_relevant_notes(
    query: str, location: str = "unknown", hour: Optional[int] = None,
    minute: Optional[int] = None, user_id: Optional[str] = None
):
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_hour = hour if hour is not None else now.hour
    current_minute = minute if minute is not None else now.minute
    location_bucket = get_location_bucket(location)

    # when a specific location is selected, use direct MongoDB lookup
    if location_bucket != "unknown":
        all_docs = get_all_notes(user_id=user_id)
        candidates = [
            dict_to_note(d) for d in all_docs
            if location_bucket in d.get("contexts", [])
            and not d.get("never_show", False)
            and d.get("reminders_enabled", True)
        ]
        candidates = [
            n for n in candidates
            if not is_on_cooldown(n) and _is_due_today(n, today_str)
        ]
        if candidates:
            ranked = sorted(
                candidates,
                key=lambda x: score(x) + _context_bonus(
                    x, location_bucket, current_hour, current_minute
                ),
                reverse=True
            )
            return ranked[:3]

    # fallback: semantic search when location is unknown or no matches
    embedding = get_embedding_model().encode(query).tolist()
    n = min(5, collection.count())
    if n == 0:
        return []

    results = collection.query(
        query_embeddings=[embedding],
        n_results=n,
        include=["distances", "metadatas"],
    )
    logger.debug("ChromaDB distances: %s", results["distances"])

    notes = []
    for note_id, distance in zip(results["ids"][0], results["distances"][0]):
        if distance > 1.8:
            continue
        doc = get_note_by_id(note_id, user_id=user_id)
        if doc is not None:
            notes.append(dict_to_note(doc))

    filtered = [
        x for x in notes
        if not x.never_show
        and x.reminders_enabled
        and not is_on_cooldown(x)
        and _is_due_today(x, today_str)
    ]
    ranked = sorted(
        filtered,
        key=lambda x: score(x),
        reverse=True
    )
    return ranked[:3]


def get_context_reminders(
    location: str = "unknown", hour: Optional[int] = None,
    minute: Optional[int] = None, user_id: Optional[str] = None
):
    """Surface notes based purely on context match — no semantic search."""
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_hour = hour if hour is not None else now.hour
    current_minute = minute if minute is not None else now.minute
    location_bucket = get_location_bucket(location)

    all_docs = get_all_notes(user_id=user_id)
    notes = [dict_to_note(d) for d in all_docs]
    filtered = [
        n for n in notes
        if not n.never_show
        and n.reminders_enabled
        and not is_on_cooldown(n)
        and _is_due_today(n, today_str)
        and not _has_conflicting_location(n, location_bucket)
    ]

    with_bonus = [
        (n, _context_bonus(n, location_bucket, current_hour, current_minute))
        for n in filtered
    ]
    with_bonus = [(n, b) for n, b in with_bonus]

    ranked = sorted(with_bonus, key=lambda x: score(x[0]) + x[1], reverse=True)
    return [n for n, _ in ranked[:3]]

import logging
from datetime import datetime
from agents.ingestion import ingest_note
from agents.categorizer import categorize, infer_location, infer_time, default_time_for
from agents.relevance import get_relevant_notes, collection
from agents.ranking_policy import apply_feedback
from notepad import (
    save_note, update_note, delete_note, Note, get_all_notes, dict_to_note
)
from typing import Optional

logger = logging.getLogger(__name__)


def process_new_notes(note: Note):
    logger.info("Processing note %s: %s", note.id, note.content[:30])
    save_note(note)
    category = categorize(note.content)
    contexts = []
    location = infer_location(note.content, category)
    if location:
        contexts.append(location)
    # use manual hour override if set, otherwise infer from content or fall back to location default
    if note.remind_at_hour is not None:
        time = f"{note.remind_at_hour:02d}:00"
    else:
        time = infer_time(note.content)
        if time is None:
            time = default_time_for(location)
    if time is not None:
        contexts.append(time)
    # default remind_on_date to today so notes are only surfaced on the day they're created
    if note.remind_on_date is None:
        note.remind_on_date = datetime.now().strftime("%Y-%m-%d")
    note.category = category
    note.contexts = contexts
    logger.info("Category: %s, contexts: %s", category, contexts)
    update_note(note.id, {
        "category": category,
        "contexts": contexts,
        "remind_on_date": note.remind_on_date,
    })
    # ingest after categorization so ChromaDB gets complete metadata
    ingest_note(note)


def get_reminders(
    query: str,
    location: str = "unknown",
    hour: Optional[int] = None,
    minute: Optional[int] = None,
    user_id: Optional[str] = None,
):
    return get_relevant_notes(query, location, hour, minute, user_id)


def process_feedback(note: Note, action: str):
    apply_feedback(note, action)
    update_note(note.id, {
        "useful_count": note.useful_count,
        "dismissed_count": note.dismissed_count,
        "never_show": note.never_show,
        "cooldown_until": note.cooldown_until,
    })


def full_delete(note_id: str, user_id: Optional[str] = None) -> bool:
    try:
        collection.delete(ids=[note_id])
    except Exception:
        pass
    return delete_note(note_id, user_id=user_id) > 0


def reingest_note(note: Note):
    """Re-categorize and re-embed an existing note (no save to MongoDB)."""
    category = categorize(note.content)
    contexts = []
    location = infer_location(note.content, category)
    if location:
        contexts.append(location)
    time = infer_time(note.content)
    if time is None:
        time = default_time_for(location)
    if time is not None:
        contexts.append(time)
    note.category = category
    note.contexts = contexts
    update_note(note.id, {"category": category, "contexts": contexts})
    ingest_note(note)


def process_all_notes():
    notes = get_all_notes()
    logger.info("Re-ingesting %d notes into ChromaDB", len(notes))
    for note in notes:
        reingest_note(dict_to_note(note))
    logger.info("Re-ingestion complete")

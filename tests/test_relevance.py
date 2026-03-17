import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notepad import Note, save_note, delete_note  # noqa: E402
from agents.ingestion import ingest_note  # noqa: E402
from agents.relevance import get_relevant_notes, collection  # noqa: E402


def test_relevant_notes():
    note = Note(content="prepare for upcoming exam in Computer Networks")
    save_note(note)
    ingest_note(note)
    result = get_relevant_notes("exam", location="uni")
    ids = [x.id for x in result]
    collection.delete(ids=[note.id])
    delete_note(note.id)
    assert note.id in ids


def test_never_show_note_is_filtered():
    note = Note(
        content="prepare for upcoming exam in Computer Networks",
        never_show=True
    )
    save_note(note)
    ingest_note(note)
    result = get_relevant_notes("exam", location="uni")
    ids = [x.id for x in result]
    collection.delete(ids=[note.id])
    delete_note(note.id)
    assert note.id not in ids


def test_cooldown_note_is_filtered():
    note = Note(
        content="prepare for upcoming exam in Computer Networks",
        cooldown_until=datetime.now(timezone.utc) + timedelta(hours=7)
    )
    save_note(note)
    ingest_note(note)
    result = get_relevant_notes("exam", location="uni")
    ids = [x.id for x in result]
    collection.delete(ids=[note.id])
    delete_note(note.id)
    assert note.id not in ids


def test_semantic_synonym_retrieval():
    note = Note(content="buy some dairy")
    save_note(note)
    ingest_note(note)
    result = get_relevant_notes("milk", location="errands")
    ids = [x.id for x in result]
    collection.delete(ids=[note.id])
    delete_note(note.id)
    assert note.id in ids


def test_conflicting_location_excluded():
    note = Note(content="do the laundry", contexts=["home", "09:00"])
    save_note(note)
    ingest_note(note)
    result = get_relevant_notes("laundry", location="work")
    ids = [x.id for x in result]
    collection.delete(ids=[note.id])
    delete_note(note.id)
    assert note.id not in ids


def test_home_location_returns_home_notes():
    note = Note(content="feed the cat", contexts=["home", "08:00"])
    save_note(note)
    ingest_note(note)
    result = get_relevant_notes("home", location="home")
    ids = [x.id for x in result]
    collection.delete(ids=[note.id])
    delete_note(note.id)
    assert note.id in ids

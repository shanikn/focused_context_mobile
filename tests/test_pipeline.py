from agents.ingestion import ingest_note
from agents.pipeline import (  # noqa: E501
    process_feedback, process_new_notes, get_reminders, full_delete
)
from agents.relevance import collection
from notepad import save_note, Note, get_note_by_id


def test_processor():
    note = Note(content="walk Libby")
    process_new_notes(note)
    assert note.category == "errand"
    full_delete(note.id)


def test_get_reminders():
    # clear stale ChromaDB entries before inserting test data
    existing = collection.get()
    if existing["ids"]:
        collection.delete(ids=existing["ids"])

    note1 = Note(content="walk Libby")
    note2 = Note(content="buy groceries")
    note3 = Note(content="pick up dry cleaning")
    process_new_notes(note1)
    process_new_notes(note2)
    process_new_notes(note3)

    result = get_reminders("walk the dog", "errands", 18)
    expected_ids = {note1.id, note2.id, note3.id}
    full_delete(note1.id)
    full_delete(note2.id)
    full_delete(note3.id)
    assert all(x.id in expected_ids for x in result)


def test_process_feedback_useful():
    note = Note(content="walk Libby")
    save_note(note)
    ingest_note(note)
    process_feedback(note, "useful")
    assert note.useful_count == 1
    full_delete(note.id)


def test_process_feedback_dismiss():
    note = Note(content="walk Libby")
    save_note(note)
    ingest_note(note)
    process_feedback(note, "dismiss")
    assert note.dismissed_count == 1
    full_delete(note.id)


def test_process_feedback_never_show():
    note = Note(content="walk Libby")
    save_note(note)
    ingest_note(note)
    process_feedback(note, "never show")
    assert note.never_show is True
    full_delete(note.id)


def test_process_feedback_cooldown():
    note = Note(content="walk Libby")
    save_note(note)
    ingest_note(note)
    process_feedback(note, "show less")
    assert note.cooldown_until is not None
    full_delete(note.id)


def test_full_delete():
    note = Note(content="walk Libby")
    save_note(note)
    ingest_note(note)
    full_delete(note.id)
    assert get_note_by_id(note.id) is None

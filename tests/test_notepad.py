import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from notepad import Note, save_note  # noqa: E402
from tests.support import all_note_docs, delete_any, note_doc, update_any  # noqa: E402


def test_save_and_store_note():
    note = Note(content="Test")
    save_note(note)
    all_notes = all_note_docs()
    ids = [row["_id"] for row in all_notes]
    assert note.id in ids
    # cleanup
    delete_any(note.id)


def test_delete_note():
    note = Note(content="Note to delete")
    save_note(note)
    delete_any(note.id)
    all_notes = all_note_docs()
    ids = [row["_id"] for row in all_notes]
    assert note.id not in ids
    # cleanup
    delete_any(note.id)


def test_update_note_changes_content():
    note = Note(content="Original content")
    save_note(note)
    update_any(note.id, {"content": "Updated content"})
    all_notes = all_note_docs()
    contents = [row["content"] for row in all_notes]
    assert "Updated content" in contents
    assert "Original content" not in contents


def test_get_note_by_id():
    note = Note(content="Note to get by id")
    save_note(note)
    result = note_doc(note.id)
    assert result is not None
    assert result["content"] == "Note to get by id"
    delete_any(note.id)

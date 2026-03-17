import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from notepad import (  # noqa: E402
    Note, save_note, get_all_notes, delete_note, update_note, get_note_by_id
)


def test_save_and_store_note():
    note = Note(content="Test")
    save_note(note)
    all_notes = get_all_notes()
    ids = [row["_id"] for row in all_notes]
    assert note.id in ids
    # cleanup
    delete_note(note.id)


def test_delete_note():
    note = Note(content="Note to delete")
    save_note(note)
    delete_note(note.id)
    all_notes = get_all_notes()
    ids = [row["_id"] for row in all_notes]
    assert note.id not in ids
    # cleanup
    delete_note(note.id)


def test_update_note_changes_content():
    note = Note(content="Original content")
    save_note(note)
    update_note(note.id, {"content": "Updated content"})
    all_notes = get_all_notes()
    contents = [row["content"] for row in all_notes]
    assert "Updated content" in contents
    assert "Original content" not in contents


def test_get_note_by_id():
    note = Note(content="Note to get by id")
    save_note(note)
    result = get_note_by_id(note.id)
    assert result is not None
    assert result["content"] == "Note to get by id"
    delete_note(note.id)

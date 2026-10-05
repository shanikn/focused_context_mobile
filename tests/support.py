"""Test helpers that work on a note whatever its owner. The app's own
functions always need the owner; tests often only know the note id (notes
created through the API belong to the dev user from .env)."""
from typing import Optional

from agents.pipeline import full_delete
from notepad import notes_collection, update_note


def owner_of(note_id: str) -> Optional[str]:
    doc = notes_collection.find_one({"_id": note_id}, {"user_id": 1})
    return doc.get("user_id") if doc else None


def note_doc(note_id: str):
    return notes_collection.find_one({"_id": note_id})


def all_note_docs() -> list:
    return list(notes_collection.find({}))


def delete_any(note_id: str) -> bool:
    return full_delete(note_id, owner_of(note_id))


def update_any(note_id: str, fields: dict) -> int:
    return update_note(note_id, fields, owner_of(note_id))

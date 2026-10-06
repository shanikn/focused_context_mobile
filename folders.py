"""A user's note folders, kept on the server so they stay until the user
deletes them, even when empty, after reinstalling or on another device.

Notes refer to a folder by name (note.list_name). "General" is the built-in
folder every note without one belongs to; it's never stored.
"""
from uuid import uuid4

from notepad import db, notes_collection

folders_collection = db["folders"]

GENERAL = "General"
MAX_NAME = 50
_RESERVED = {"general", "all"}


class FolderError(ValueError):
    """kind: invalid | exists"""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def ensure_folder_indexes():
    """Idempotent: folders are always looked up by owner."""
    folders_collection.create_index("user_id")


def clean_name(name: str) -> str:
    cleaned = " ".join((name or "").split())
    if not cleaned or len(cleaned) > MAX_NAME or "/" in cleaned or cleaned.lower() in _RESERVED:
        raise FolderError("invalid", f"a folder name is 1-{MAX_NAME} characters, not General or All, without /")
    return cleaned


def _exists(user_id: str, name: str) -> bool:
    return folders_collection.count_documents({"user_id": user_id, "key": name.lower()}) > 0


def _insert(user_id: str, name: str):
    folders_collection.insert_one({"_id": str(uuid4()), "user_id": user_id, "name": name, "key": name.lower()})


def create_folder(user_id: str, name: str) -> str:
    """Store a new folder. Raises FolderError (invalid, or exists with any capitals)."""
    cleaned = clean_name(name)
    if _exists(user_id, cleaned):
        raise FolderError("exists", f'"{cleaned}" already exists')
    _insert(user_id, cleaned)
    return cleaned


def ensure_folder(user_id: str, name: str):
    """Store a folder a note uses, if it's a real folder and not stored yet."""
    try:
        cleaned = clean_name(name)
    except FolderError:
        return  # General, empty...
    if not _exists(user_id, cleaned):
        _insert(user_id, cleaned)


def list_folders(user_id: str) -> list:
    """The user's folders, sorted. Folders that so far only existed because
    a note uses them (saved by an older app or another device) are stored
    now, so they stay when their last note moves out."""
    for name in notes_collection.distinct("list_name", {"user_id": user_id}):
        if isinstance(name, str):
            ensure_folder(user_id, name)
    names = [d["name"] for d in folders_collection.find({"user_id": user_id}, {"name": 1})]
    return sorted(names, key=str.lower)


def delete_folder(user_id: str, name: str) -> dict:
    """Delete the folder and move its notes to General. Safe to repeat."""
    moved = notes_collection.update_many(
        {"user_id": user_id, "list_name": name}, {"$set": {"list_name": GENERAL}}
    ).modified_count
    deleted = folders_collection.delete_one({"user_id": user_id, "key": " ".join(name.split()).lower()}).deleted_count
    return {"deleted": deleted > 0, "moved": moved}


def delete_all_folders(user_id: str) -> int:
    """Every folder of this user (account deletion)."""
    if not user_id:
        raise ValueError("a user id is required")
    return folders_collection.delete_many({"user_id": user_id}).deleted_count

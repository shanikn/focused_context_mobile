from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import logging

logger = logging.getLogger(__name__)

# for mongodb
load_dotenv()

# mongodb connection setup
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "contextmind")

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]
notes_collection = db["notes"]


@dataclass
class Note:
    content: str
    id: str = field(default_factory=lambda: str(uuid4()))
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    category: str = "todo"
    contexts: list = field(default_factory=list)
    list_name: str = "General"
    shown_count: int = 0
    dismissed_count: int = 0
    useful_count: int = 0
    never_show: bool = False
    last_shown: Optional[datetime] = None
    cooldown_until: Optional[datetime] = None
    reminders_enabled: bool = True
    category_explicit: bool = False
    location_explicit: bool = False
    location_value: Optional[str] = None
    remind_date_explicit: bool = False
    remind_time_explicit: bool = False
    remind_at_hour: Optional[int] = None  # manual override: force reminder at this hour (0-23)
    remind_at_minute: Optional[int] = None  # manual override minute (0-59)
    remind_on_date: Optional[str] = None  # YYYY-MM-DD; set to today at save time if not provided
    user_id: Optional[str] = None


# helper functions
def note_to_dict(note: Note) -> dict:
    return {
        "_id": note.id,
        "content": note.content,
        "created_at": note.created_at,
        "category": note.category,
        "contexts": note.contexts,
        "list_name": note.list_name,
        "shown_count": note.shown_count,  # how many times shown to user
        "dismissed_count": note.dismissed_count,  # how many times dismissed
        "useful_count": note.useful_count,  # how many times marked useful
        "never_show": note.never_show,
        "last_shown": note.last_shown,  # when last resurfaced
        "cooldown_until": note.cooldown_until,  # Later=24h, Annoying=7d
        "reminders_enabled": note.reminders_enabled,
        "category_explicit": note.category_explicit,
        "location_explicit": note.location_explicit,
        "location_value": note.location_value,
        "remind_date_explicit": note.remind_date_explicit,
        "remind_time_explicit": note.remind_time_explicit,
        "remind_at_hour": note.remind_at_hour,
        "remind_at_minute": note.remind_at_minute,
        "remind_on_date": note.remind_on_date,
        "user_id": note.user_id,
    }


def dict_to_note(d: dict) -> Note:
    return Note(
        id=d["_id"],
        content=d["content"],
        created_at=d["created_at"],
        category=d["category"],
        contexts=d.get("contexts", []),
        list_name=d.get("list_name", "General"),
        shown_count=d["shown_count"],
        dismissed_count=d["dismissed_count"],
        useful_count=d["useful_count"],
        never_show=d["never_show"],
        last_shown=d["last_shown"],
        cooldown_until=d["cooldown_until"],
        reminders_enabled=d.get("reminders_enabled", True),
        category_explicit=d.get("category_explicit", False),
        location_explicit=d.get("location_explicit", False),
        location_value=d.get("location_value"),
        remind_date_explicit=d.get("remind_date_explicit", False),
        remind_time_explicit=d.get("remind_time_explicit", False),
        remind_at_hour=d.get("remind_at_hour"),
        remind_at_minute=d.get("remind_at_minute"),
        remind_on_date=d.get("remind_on_date"),
        user_id=d.get("user_id"),
    )


def save_note(note: Note):
    notes_collection.insert_one(note_to_dict(note))


def get_all_notes(user_id: Optional[str] = None) -> list[dict]:
    query = {"user_id": user_id} if user_id is not None else {}
    return list(notes_collection.find(query))


def update_note(note_id: str, fields: dict, user_id: Optional[str] = None) -> int:
    query = {"_id": note_id}
    if user_id is not None:
        query["user_id"] = user_id
    result = notes_collection.update_one(query, {"$set": fields})
    return result.matched_count


def delete_note(note_id: str, user_id: Optional[str] = None) -> int:
    query = {"_id": note_id}
    if user_id is not None:
        query["user_id"] = user_id
    result = notes_collection.delete_one(query)
    return result.deleted_count


def get_note_by_id(note_id: str, user_id: Optional[str] = None):
    query = {"_id": note_id}
    if user_id is not None:
        query["user_id"] = user_id
    return notes_collection.find_one(query)


if __name__ == "__main__":
    logger.debug(get_all_notes())

import logging
from typing import Optional
import os
from dotenv import load_dotenv
from fastapi import BackgroundTasks

load_dotenv()

from pydantic import BaseModel  # noqa: E402
from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from notepad import (  # noqa: E402
    Note, get_all_notes, update_note, note_to_dict, save_note,
    get_note_by_id, dict_to_note
)
from agents.pipeline import (  # noqa: E402
    enrich_note, full_delete, process_feedback,
    get_reminders, process_all_notes, reminder_time_source
)
from auth import get_user_id  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


class NoteRequest(BaseModel):
    content: str
    list_name: str = "General"
    reminders_enabled: bool = True
    category_explicit: bool = False
    category: Optional[str] = None
    location_explicit: bool = False
    location_value: Optional[str] = None
    remind_date_explicit: bool = False
    remind_time_explicit: bool = False
    remind_at_hour: Optional[int] = None
    remind_at_minute: Optional[int] = None
    remind_on_date: Optional[str] = None


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    reingest_on_startup = os.getenv("REINGEST_ON_STARTUP", "").lower() in {
        "1", "true", "yes", "on"
    }
    if reingest_on_startup:
        logging.info("Re-ingesting all notes into ChromaDB...")
        process_all_notes()
        logging.info("Startup ingestion complete.")
    else:
        logging.info(
            "Skipping startup re-ingestion."
            " Set REINGEST_ON_STARTUP=true to enable it."
        )


@app.get("/")
def root():
    return {"status": "ok"}


def require_user_id(authorization: Optional[str]) -> str:
    user_id = get_user_id(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


# save note, ingest it, and categorize it
@app.post("/notes/")
def create_note(
    request: NoteRequest,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    note = Note(
        content=request.content,
        list_name=request.list_name,
        reminders_enabled=request.reminders_enabled,
        category=request.category or "uncategorized",
        category_explicit=request.category_explicit,
        location_explicit=request.location_explicit,
        location_value=request.location_value,
        remind_date_explicit=request.remind_date_explicit,
        remind_time_explicit=request.remind_time_explicit,
        remind_at_hour=request.remind_at_hour,
        remind_at_minute=request.remind_at_minute,
        remind_on_date=request.remind_on_date,
        user_id=user_id,
    )
    save_note(note)
    background_tasks.add_task(enrich_note, note)
    logging.info("Note created: %s (%s)", note.id, note.content[:30])
    return {"id": note.id, "content": note.content, "category": note.category}


# get all notes
@app.get("/notes/")
def list_notes(authorization: Optional[str] = Header(None)):
    user_id = require_user_id(authorization)
    # round-trip through Note so older documents get defaults for fields
    # added later (e.g. reminders_enabled=True) instead of omitting them
    notes = [dict_to_note(d) for d in get_all_notes(user_id=user_id)]
    # tells the phone which times get an exact alarm (explicit/text) and
    # which are location defaults left to the location-aware polling
    return [
        {**note_to_dict(n), "reminder_time_source": reminder_time_source(n)}
        for n in notes
    ]


# delete note from MongoDB and ChromaDB
@app.delete("/notes/{note_id}")
def remove_note(
    note_id: str,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    deleted = full_delete(note_id, user_id=user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    logging.info("Note deleted: %s", note_id)
    return {"message": "note deleted"}


# update note fields
@app.put("/notes/{note_id}")
def change_note(
    note_id: str,
    content: Optional[str] = None,
    list_name: Optional[str] = None,
    category: Optional[str] = None,
    category_explicit: Optional[bool] = None,
    location_explicit: Optional[bool] = None,
    location_value: Optional[str] = None,
    contexts: Optional[str] = None,
    remind_date_explicit: Optional[bool] = None,
    remind_time_explicit: Optional[bool] = None,
    remind_at_hour: Optional[str] = None,
    remind_at_minute: Optional[str] = None,
    remind_on_date: Optional[str] = None,
    reminders_enabled: Optional[bool] = None,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    fields = {}
    if content is not None:
        fields["content"] = content
    if list_name is not None:
        fields["list_name"] = list_name
    if category is not None:
        fields["category"] = category
    if category_explicit is not None:
        fields["category_explicit"] = category_explicit
    if location_explicit is not None:
        fields["location_explicit"] = location_explicit
    if location_value is not None:
        fields["location_value"] = location_value if location_value else None
    if contexts is not None:
        fields["contexts"] = [c.strip() for c in contexts.split(",") if c.strip()]
    if remind_date_explicit is not None:
        fields["remind_date_explicit"] = remind_date_explicit
    if remind_time_explicit is not None:
        fields["remind_time_explicit"] = remind_time_explicit
    if remind_at_hour is not None:
        hour = int(remind_at_hour) if remind_at_hour else None
        fields["remind_at_hour"] = hour
    if remind_at_minute is not None:
        minute = int(remind_at_minute) if remind_at_minute else None
        fields["remind_at_minute"] = minute
    if remind_on_date is not None:
        fields["remind_on_date"] = remind_on_date if remind_on_date else None
    if reminders_enabled is not None:
        fields["reminders_enabled"] = reminders_enabled
    matched = update_note(note_id, fields, user_id=user_id)
    if matched == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    # re-categorize, re-infer context, and re-embed when content changes
    if (
        content is not None
        or category is not None
        or category_explicit is not None
        or location_explicit is not None
        or location_value is not None
        or remind_date_explicit is not None
        or remind_time_explicit is not None
        or remind_at_hour is not None
        or remind_at_minute is not None
        or remind_on_date is not None
    ):
        doc = get_note_by_id(note_id, user_id=user_id)
        if doc:
            note = dict_to_note(doc)
            enrich_note(note)
    return {"message": "updated note"}


# get relevant notes based on current context (via semantic pipeline)
@app.get("/reminders/")
def get_reminders_endpoint(
    location: str = "unknown", hour: Optional[int] = None,
    minute: Optional[int] = None,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    query = f"{location} {hour}" if hour is not None else location
    notes = get_reminders(query, location, hour, minute, user_id)
    return [note_to_dict(n) for n in notes]


# submit feedback on a note
@app.post("/notes/{note_id}/feedback")
def feedback(
    note_id: str,
    action: str,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    from notepad import get_note_by_id, dict_to_note
    doc = get_note_by_id(note_id, user_id=user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Note not found")
    note = dict_to_note(doc)
    process_feedback(note, action)
    logging.info("Feedback '%s' on note %s", action, note_id)
    return {"message": f"feedback '{action}' applied"}

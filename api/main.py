import logging
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel  # noqa: E402
from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from notepad import (  # noqa: E402
    Note, get_all_notes, update_note, note_to_dict,
    get_note_by_id, dict_to_note
)
from agents.ingestion import ingest_note  # noqa: E402
from agents.pipeline import (  # noqa: E402
    process_new_notes, full_delete, process_feedback,
    get_reminders, process_all_notes
)
from agents.categorizer import (  # noqa: E402
    categorize, infer_location, infer_time, default_time_for,
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
    remind_at_hour: Optional[int] = None
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
    logging.info("Re-ingesting all notes into ChromaDB...")
    process_all_notes()
    logging.info("Startup ingestion complete.")


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
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    note = Note(
        content=request.content,
        list_name=request.list_name,
        reminders_enabled=request.reminders_enabled,
        remind_at_hour=request.remind_at_hour,
        remind_on_date=request.remind_on_date,
        user_id=user_id,
    )
    process_new_notes(note)
    logging.info("Note created: %s (%s)", note.id, note.content[:30])
    return {"id": note.id, "content": note.content, "category": note.category}


# get all notes
@app.get("/notes/")
def list_notes(authorization: Optional[str] = Header(None)):
    user_id = require_user_id(authorization)
    return get_all_notes(user_id=user_id)


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
    contexts: Optional[str] = None,
    remind_at_hour: Optional[str] = None,
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
    if contexts is not None:
        fields["contexts"] = [c.strip() for c in contexts.split(",") if c.strip()]
    if remind_at_hour is not None:
        hour = int(remind_at_hour) if remind_at_hour else None
        fields["remind_at_hour"] = hour
    if remind_on_date is not None:
        fields["remind_on_date"] = remind_on_date if remind_on_date else None
    if reminders_enabled is not None:
        fields["reminders_enabled"] = reminders_enabled
    matched = update_note(note_id, fields, user_id=user_id)
    if matched == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    # re-categorize, re-infer context, and re-embed when content changes
    if content is not None:
        doc = get_note_by_id(note_id, user_id=user_id)
        if doc:
            note = dict_to_note(doc)
            new_cat = categorize(content)
            new_loc = infer_location(content, new_cat)
            if note.remind_at_hour is not None:
                new_time = f"{note.remind_at_hour:02d}:00"
            else:
                new_time = infer_time(content)
                if new_time is None:
                    new_time = default_time_for(new_loc)
            new_contexts = []
            if new_loc:
                new_contexts.append(new_loc)
            if new_time:
                new_contexts.append(new_time)
            update_note(note_id, {
                "category": new_cat,
                "contexts": new_contexts,
            }, user_id=user_id)
            note.category = new_cat
            note.contexts = new_contexts
            ingest_note(note)
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

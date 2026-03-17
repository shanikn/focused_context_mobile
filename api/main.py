import os
import json
import logging
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel  # noqa: E402
from fastapi import FastAPI, Header  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from fastapi.responses import RedirectResponse  # noqa: E402
from pywebpush import webpush, WebPushException  # noqa: E402
from notepad import (  # noqa: E402
    Note, get_all_notes, update_note, note_to_dict,
    get_note_by_id, dict_to_note
)
from agents.ingestion import ingest_note  # noqa: E402
from agents.pipeline import (  # noqa: E402
    process_new_notes, full_delete, process_feedback,
    get_reminders, process_all_notes
)
from agents.categorizer import categorize, infer_location, infer_time  # noqa: E402
from auth import get_user_id  # noqa: E402

pending_notifications = []
push_subscriptions = []  # in-memory store for Web Push subscriptions

VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CONTACT = os.getenv("VAPID_CONTACT", "mailto:admin@example.com")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


class NoteRequest(BaseModel):
    content: str
    list_name: str = "General"
    remind_at_hour: Optional[int] = None
    remind_on_date: Optional[str] = None


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")


@app.on_event("startup")
def startup():
    logging.info("Re-ingesting all notes into ChromaDB...")
    process_all_notes()
    logging.info("Startup ingestion complete.")


@app.get("/")
def root():
    return RedirectResponse(url="/frontend/index.html")


# save note, ingest it, and categorize it
@app.post("/notes/")
def create_note(
    request: NoteRequest,
    authorization: Optional[str] = Header(None),
):
    user_id = get_user_id(authorization)
    note = Note(
        content=request.content,
        list_name=request.list_name,
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
    user_id = get_user_id(authorization)
    return get_all_notes(user_id=user_id)


# delete note from MongoDB and ChromaDB
@app.delete("/notes/{note_id}")
def remove_note(
    note_id: str,
    authorization: Optional[str] = Header(None),
):
    full_delete(note_id)
    logging.info("Note deleted: %s", note_id)
    return {"message": "note deleted"}


# update note fields
@app.put("/notes/{note_id}")
def change_note(
    note_id: str,
    content: Optional[str] = None,
    category: Optional[str] = None,
    contexts: Optional[str] = None,
    remind_on_date: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    fields = {}
    if content is not None:
        fields["content"] = content
    if category is not None:
        fields["category"] = category
    if contexts is not None:
        fields["contexts"] = [c.strip() for c in contexts.split(",") if c.strip()]
    if remind_on_date is not None:
        fields["remind_on_date"] = remind_on_date if remind_on_date else None
    update_note(note_id, fields)
    # re-categorize, re-infer context, and re-embed when content changes
    if content is not None:
        doc = get_note_by_id(note_id)
        if doc:
            note = dict_to_note(doc)
            new_cat = categorize(content)
            new_loc = infer_location(content, new_cat)
            new_time = infer_time(content)
            new_contexts = []
            if new_loc:
                new_contexts.append(new_loc)
            if new_time:
                new_contexts.append(new_time)
            update_note(note_id, {
                "category": new_cat,
                "contexts": new_contexts,
            })
            note.category = new_cat
            note.contexts = new_contexts
            ingest_note(note)
    return {"message": "updated note"}


# get relevant notes based on current context (via semantic pipeline)
@app.get("/reminders/")
def get_reminders_endpoint(
    location: str = "unknown", hour: Optional[int] = None,
    minute: Optional[int] = None
):
    query = f"{location} {hour}" if hour is not None else location
    notes = get_reminders(query, location, hour)
    return [note_to_dict(n) for n in notes]


# submit feedback on a note
@app.post("/notes/{note_id}/feedback")
def feedback(
    note_id: str,
    action: str,
    authorization: Optional[str] = Header(None),
):
    from notepad import get_note_by_id, dict_to_note
    doc = get_note_by_id(note_id)
    if doc is None:
        return {"error": "note not found"}
    note = dict_to_note(doc)
    process_feedback(note, action)
    logging.info("Feedback '%s' on note %s", action, note_id)
    return {"message": f"feedback '{action}' applied"}


class NotifyRequest(BaseModel):
    content: str
    note_id: str


@app.post("/notify")
def push_notification(request: NotifyRequest):
    pending_notifications.append({
        "content": request.content,
        "note_id": request.note_id
    })
    # keep max 20 items
    while len(pending_notifications) > 20:
        pending_notifications.pop(0)
    return {"ok": True}


@app.get("/notify")
def poll_notifications():
    items = list(pending_notifications)
    pending_notifications.clear()
    return items


# ── WEB PUSH ──
@app.get("/vapid-public-key")
def get_vapid_key():
    return {"publicKey": VAPID_PUBLIC_KEY}


@app.post("/push-subscribe")
def push_subscribe(subscription: dict):
    # deduplicate by endpoint
    for sub in push_subscriptions:
        if sub.get("endpoint") == subscription.get("endpoint"):
            return {"ok": True}
    push_subscriptions.append(subscription)
    logging.info("Push subscription added (%d total)", len(push_subscriptions))
    return {"ok": True}


@app.post("/push-notify")
def push_notify_all(request: NotifyRequest):
    """Send a Web Push notification to all subscriptions."""
    if not VAPID_PRIVATE_KEY:
        return {"error": "VAPID keys not configured"}
    payload = json.dumps({
        "title": "FocusedContext",
        "body": request.content,
        "tag": "fc-" + request.note_id,
    })
    failed = []
    for sub in list(push_subscriptions):
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CONTACT},
            )
        except WebPushException as e:
            logging.warning("Push failed: %s", e)
            if "410" in str(e) or "404" in str(e):
                failed.append(sub)
    for sub in failed:
        push_subscriptions.remove(sub)
    return {"sent": len(push_subscriptions), "removed": len(failed)}

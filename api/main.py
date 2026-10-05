import logging
import threading
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel  # noqa: E402
from fastapi import FastAPI, Header, HTTPException, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from notepad import (  # noqa: E402
    Note, get_all_notes, update_note, note_to_dict, save_note,
    get_note_by_id, dict_to_note, ensure_note_indexes
)
from agents.pipeline import (  # noqa: E402
    enrich_note, full_delete, process_feedback,
    get_reminders, process_all_notes, reminder_time_source, store_type, sync_vectors,
    delete_user_data,
    reenrich_user_notes, untag_place,
)
from agents.ranking_policy import FEEDBACK_ACTIONS  # noqa: E402
from places import (  # noqa: E402
    ensure_place_indexes,
    create_place, delete_place, get_places, place_to_dict, resolve_place,
    update_place,
)
from auth import FirebaseDeleteError, delete_firebase_user, get_user_id  # noqa: E402
import geocode  # noqa: E402
import nearby  # noqa: E402
import maps_links  # noqa: E402
import ratelimit  # noqa: E402

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


class AccessLogWithoutQuery(logging.Filter):
    """PUT /notes/{id} sends note text as query parameters; uvicorn's access
    log would print the full URL. Keep only the path."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            record.args = args[:2] + (args[2].split("?", 1)[0],) + args[3:]
        return True


logging.getLogger("uvicorn.access").addFilter(AccessLogWithoutQuery())


def cors_origins() -> list[str]:
    """Browser origins allowed to call the API, from CORS_ORIGINS (comma
    separated). The only client is the mobile app, which isn't subject to
    CORS, so by default no browser origin is allowed. "*" is never accepted."""
    raw = os.getenv("CORS_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]


if cors_origins():
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )


def ensure_indexes():
    try:
        ensure_note_indexes()
        ensure_place_indexes()
    except Exception:
        logging.exception("Creating MongoDB indexes failed")


# the background startup work, so tests can wait for it
_startup_thread: Optional[threading.Thread] = None


def _startup_work(reingest: bool):
    try:
        if reingest:
            # re-runs the AI enrichment on every note (writes to MongoDB)
            logging.info("Re-ingesting all notes into ChromaDB...")
            process_all_notes()
            logging.info("Startup ingestion complete.")
        else:
            # the default: only embed what ChromaDB is missing, notes unchanged
            sync_vectors()
    except Exception:
        logging.exception("Startup vector sync failed")


@app.on_event("startup")
def startup():
    """Indexes first (quick), then the vector sync in the background, so the
    server answers requests right away. Until the sync finishes, semantic
    search may miss notes that aren't embedded yet."""
    global _startup_thread
    ensure_indexes()
    reingest_on_startup = os.getenv("REINGEST_ON_STARTUP", "").lower() in {
        "1", "true", "yes", "on"
    }
    _startup_thread = threading.Thread(
        target=_startup_work, args=(reingest_on_startup,), name="startup-sync", daemon=True
    )
    _startup_thread.start()


@app.get("/")
def root():
    return {"status": "ok"}


def require_user_id(authorization: Optional[str]) -> str:
    user_id = get_user_id(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


# ---- per-user rate limits (in memory; one server instance) ----

# search also has a daily cap: each Google Places search costs money
SEARCH_LIMIT = ratelimit.limiter("search", [(30, 60), (300, 24 * 3600)])
NEARBY_LIMIT = ratelimit.limiter("nearby", [(30, 60)])
LINK_LIMIT = ratelimit.limiter("resolve-link", [(30, 60)])
NOTE_WRITE_LIMIT = ratelimit.limiter("note-write", [(60, 60)])  # create + update together
ACCOUNT_DELETE_LIMIT = ratelimit.limiter("account-delete", [(3, 3600)])


def _limit_message(what: str, window: int) -> str:
    if window >= 24 * 3600:
        return f"Too many {what} today, try again tomorrow."
    if window >= 3600:
        return f"Too many {what}, try again in an hour."
    return f"Too many {what}, try again in a minute."


def enforce_limit(limit: ratelimit.RateLimiter, user_id: str, what: str):
    """429 with a message the app can show, e.g. "Too many searches, try
    again in a minute." Blocked calls don't do any work."""
    if not ratelimit.enabled():
        return
    blocked = limit.blocked(user_id)
    if blocked:
        retry_after, window = blocked
        message = _limit_message(what, window)
        logging.warning("Rate limited: %s", limit.name)
        raise HTTPException(
            status_code=429,
            detail={"kind": "too_many_requests", "message": message, "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


# save note, ingest it, and categorize it
@app.post("/notes/")
def create_note(
    request: NoteRequest,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    enforce_limit(NOTE_WRITE_LIMIT, user_id, "changes")
    note = Note(
        content=request.content,
        list_name=request.list_name,
        reminders_enabled=request.reminders_enabled,
        category=request.category or "todo",
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
    # inline, like PUT: the phone syncs alarms right after saving, so the
    # date/time and place must already be there
    enrich_note(note)
    logging.info("Note created: %s", note.id)
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
        {**note_to_dict(n), "reminder_time_source": reminder_time_source(n), "store_type": store_type(n)}
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
    enforce_limit(NOTE_WRITE_LIMIT, user_id, "changes")
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
    # location is a place name or id; search semantically by the name
    place = resolve_place(user_id, location)
    label = place.name if place else location
    query = f"{label} {hour}" if hour is not None else label
    notes = get_reminders(query, location, hour, minute, user_id)
    # the phone uses the source to keep timed notes out of arrival alerts
    return [
        {**note_to_dict(n), "reminder_time_source": reminder_time_source(n), "store_type": store_type(n)}
        for n in notes
    ]


# ---- address search: the phone asks us, we ask OpenStreetMap Nominatim ----

# upstream problem -> our status: 429 passes through, an unreachable or
# slow Nominatim is a gateway timeout, anything else a bad gateway
_GEOCODE_STATUS = {"rate_limited": 429, "network": 504}


@app.get("/places/search")
def search_places(
    q: str,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    authorization: Optional[str] = Header(None),
):
    """Top 5 address matches for q: Google Places when the server has a key
    (biased toward lat/lon if sent), else Nominatim. Coordinates are only
    returned to the phone, never stored here."""
    user_id = require_user_id(authorization)
    enforce_limit(SEARCH_LIMIT, user_id, "searches")
    try:
        return geocode.search(q, lat=lat, lon=lon)
    except geocode.GeocodeError as e:
        logging.warning("Geocode failed: %s", e)
        raise HTTPException(
            status_code=_GEOCODE_STATUS.get(e.kind, 502),
            detail={"kind": e.kind, "upstream_status": e.status},
        )


# ---- nearby stores: the phone asks us, we ask OpenStreetMap Overpass ----

_NEARBY_STATUS = {"rate_limited": 429, "timeout": 504, "network": 504}


@app.get("/places/nearby")
def nearby_stores(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    type: str = "supermarket",
    radius_m: int = Query(2000, ge=100, le=5000),
    authorization: Optional[str] = Header(None),
):
    """Up to 20 stores of this type ({id, name, lat, lon}, nearest first)
    around the phone, for errand alerts. Nothing is stored."""
    user_id = require_user_id(authorization)
    enforce_limit(NEARBY_LIMIT, user_id, "store lookups")
    if type not in nearby.STORE_SELECTORS:
        raise HTTPException(status_code=422, detail=f"type must be one of {sorted(nearby.STORE_SELECTORS)}")
    try:
        return nearby.find(type, lat, lon, radius_m)
    except nearby.NearbyError as e:
        logging.warning("Nearby stores failed: %s", e)
        raise HTTPException(
            status_code=_NEARBY_STATUS.get(e.kind, 502),
            detail={"kind": e.kind, "upstream_status": e.status},
        )


# ---- pasted Google Maps links: the phone asks us to follow short links ----

_LINK_STATUS = {"not_allowed": 422, "no_coordinates": 422, "network": 504}


@app.get("/places/resolve-link")
def resolve_maps_link(url: str, authorization: Optional[str] = Header(None)):
    """Coordinates of a Google Maps link (short maps.app.goo.gl links are
    followed, Google hosts only). Nothing is stored."""
    user_id = require_user_id(authorization)
    enforce_limit(LINK_LIMIT, user_id, "links")
    try:
        lat, lon = maps_links.resolve(url)
    except maps_links.LinkError as e:
        logging.warning("Maps link failed: %s", e.kind)
        raise HTTPException(status_code=_LINK_STATUS.get(e.kind, 502), detail={"kind": e.kind})
    return {"latitude": lat, "longitude": lon}


# ---- places: names (and optional keywords) only; coordinates stay on the phone ----

class PlaceRequest(BaseModel):
    name: str
    keywords: list[str] = []


class PlaceUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[list[str]] = None


@app.get("/places/")
def list_places(authorization: Optional[str] = Header(None)):
    user_id = require_user_id(authorization)
    return [place_to_dict(p) for p in get_places(user_id)]


@app.post("/places/")
def add_place(request: PlaceRequest, authorization: Optional[str] = Header(None)):
    user_id = require_user_id(authorization)
    try:
        place = create_place(user_id, request.name, request.keywords)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    # existing notes may belong to the new place
    reenrich_user_notes(user_id)
    return place_to_dict(place)


@app.put("/places/{place_id}")
def change_place(
    place_id: str, request: PlaceUpdate,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    try:
        found = update_place(user_id, place_id, request.name, request.keywords)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not found:
        raise HTTPException(status_code=404, detail="Place not found")
    # notes are tagged by id, so a rename changes nothing; new keywords may
    if request.keywords is not None:
        reenrich_user_notes(user_id)
    return place_to_dict(resolve_place(user_id, place_id))


@app.delete("/places/{place_id}")
def remove_place(place_id: str, authorization: Optional[str] = Header(None)):
    user_id = require_user_id(authorization)
    if not delete_place(user_id, place_id):
        raise HTTPException(status_code=404, detail="Place not found")
    untag_place(user_id, place_id)
    return {"message": "place deleted"}


# ---- account deletion (required by Google Play) ----

@app.delete("/account")
def delete_account(authorization: Optional[str] = Header(None)):
    """Delete everything of the signed-in user (notes with their feedback,
    places, vectors), then the Firebase user. Safe to repeat: data first, so
    if Firebase fails the data is already gone and a retry finishes the job."""
    user_id = require_user_id(authorization)
    enforce_limit(ACCOUNT_DELETE_LIMIT, user_id, "attempts")
    deleted = delete_user_data(user_id)
    try:
        firebase_user = delete_firebase_user(user_id)
    except FirebaseDeleteError as e:
        logging.warning("Deleting the Firebase user failed: %s", e)
        raise HTTPException(status_code=502, detail={"kind": "firebase", "deleted": deleted})
    logging.info("Account deleted (firebase: %s)", firebase_user)
    return {"deleted": deleted, "firebase_user": firebase_user}


# submit feedback on a note
@app.post("/notes/{note_id}/feedback")
def feedback(
    note_id: str,
    action: str,
    authorization: Optional[str] = Header(None),
):
    user_id = require_user_id(authorization)
    if action not in FEEDBACK_ACTIONS:
        raise HTTPException(status_code=422, detail=f"action must be one of {list(FEEDBACK_ACTIONS)}")
    doc = get_note_by_id(note_id, user_id=user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Note not found")
    note = dict_to_note(doc)
    process_feedback(note, action)
    logging.info("Feedback '%s' on note %s", action, note_id)
    return {"message": f"feedback '{action}' applied"}

"""Hardening before other people use the server: scoped data access, no note
text in logs, indexes, background startup, CORS, non-root Docker, feedback
validation."""
import inspect
import logging
import os
import threading

import pytest
from fastapi.testclient import TestClient

import api.main as main
import notepad
import places
from agents.pipeline import full_delete
from notepad import (
    Note, delete_note, get_all_notes, get_note_by_id, notes_collection, save_note, update_note,
)

client = TestClient(main.app)
A, B = "hard-user-a", "hard-user-b"
TOKENS = {"Bearer token-a": A, "Bearer token-b": B}
AS_A = {"Authorization": "Bearer token-a"}
SECRET = "zebra-passport-7731"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(autouse=True)
def cleanup(monkeypatch):
    monkeypatch.setattr(main, "get_user_id", lambda authorization: TOKENS.get(authorization))
    yield
    for doc in notes_collection.find({"$or": [{"user_id": {"$in": [A, B]}}, {"_id": {"$regex": "^hard-"}}]}):
        full_delete(doc["_id"], user_id=doc.get("user_id"))


# ---- #2: user_id is required; there is no "all users" by accident ----

@pytest.mark.parametrize("fn", [get_all_notes, get_note_by_id, update_note, delete_note])
def test_user_id_is_a_required_argument(fn):
    param = inspect.signature(fn).parameters["user_id"]
    assert param.default is inspect.Parameter.empty


def test_none_means_unowned_notes_only_never_everyone():
    save_note(Note(id="hard-a", content="a's note", user_id=A))
    save_note(Note(id="hard-unowned", content="old note", user_id=None))
    ids = {d["_id"] for d in get_all_notes(None)}
    assert "hard-unowned" in ids and "hard-a" not in ids
    assert get_note_by_id("hard-a", None) is None
    assert update_note("hard-a", {"content": "changed"}, None) == 0
    assert delete_note("hard-a", None) == 0
    assert get_note_by_id("hard-a", A)["content"] == "a's note"


def test_another_users_id_never_matches():
    save_note(Note(id="hard-a2", content="a's note", user_id=A))
    assert get_note_by_id("hard-a2", B) is None
    assert update_note("hard-a2", {"content": "x"}, B) == 0
    assert delete_note("hard-a2", B) == 0
    assert "hard-a2" not in {d["_id"] for d in get_all_notes(B)}


def test_every_users_notes_has_its_own_clearly_named_function():
    save_note(Note(id="hard-a3", content="a", user_id=A))
    save_note(Note(id="hard-b3", content="b", user_id=B))
    ids = {d["_id"] for d in notepad.get_every_users_notes()}
    assert {"hard-a3", "hard-b3"} <= ids


def test_place_functions_are_scoped_to_the_user():
    for name in ("get_places", "create_place", "update_place", "delete_place", "resolve_place"):
        param = inspect.signature(getattr(places, name)).parameters["user_id"]
        assert param.default is inspect.Parameter.empty, name
    gym = places.create_place(A, "Hard Gym")
    assert "Hard Gym" not in {p.name for p in places.get_places(B)}
    assert places.update_place(B, gym.id, name="Stolen") is False
    assert places.delete_place(B, gym.id) is False
    assert places.resolve_place(B, gym.id) is None
    places.delete_place(A, gym.id)


# ---- #4: note text never reaches the logs ----

def test_logs_have_note_ids_never_note_text(caplog):
    caplog.set_level(logging.DEBUG)
    note_id = client.post("/notes/", json={"content": f"buy milk {SECRET}"}, headers=AS_A).json()["id"]
    client.put(f"/notes/{note_id}", params={"content": f"buy bread {SECRET}"}, headers=AS_A)
    client.get("/reminders/", params={"location": "unknown", "hour": 9}, headers=AS_A)
    client.post(f"/notes/{note_id}/feedback", params={"action": "useful"}, headers=AS_A)
    client.delete(f"/notes/{note_id}", headers=AS_A)
    # httpx is the test client (the caller), not the server
    text = "\n".join(r.getMessage() for r in caplog.records if not r.name.startswith("httpx"))
    assert note_id in text
    assert SECRET not in text
    assert "buy milk" not in text and "buy bread" not in text


# ---- #8: indexes ----

def test_indexes_on_user_id_created_idempotently():
    main.ensure_indexes()
    main.ensure_indexes()  # a second run is harmless
    note_keys = [list(i["key"]) for i in notes_collection.index_information().values()]
    place_keys = [list(i["key"]) for i in places.places_collection.index_information().values()]
    assert any(k and k[0][0] == "user_id" for k in note_keys)
    assert any(k and k[0][0] == "user_id" for k in place_keys)


# ---- #6: startup returns right away; the vector sync runs in the background ----

def _startup_with(monkeypatch, env=None, sync=None, enrich=None):
    if env is None:
        monkeypatch.delenv("REINGEST_ON_STARTUP", raising=False)
    else:
        monkeypatch.setenv("REINGEST_ON_STARTUP", env)
    monkeypatch.setattr(main, "ensure_indexes", lambda: None)
    monkeypatch.setattr(main, "sync_vectors", sync or (lambda: None))
    monkeypatch.setattr(main, "process_all_notes", enrich or (lambda: None))
    main.startup()
    return main._startup_thread


def test_startup_doesnt_wait_for_the_vector_sync(monkeypatch):
    release = threading.Event()
    started = threading.Event()

    def slow_sync():
        started.set()
        release.wait(5)

    thread = _startup_with(monkeypatch, sync=slow_sync)
    # startup() returned while the sync is still running
    assert started.wait(5)
    assert thread.is_alive()
    assert client.get("/").json() == {"status": "ok"}
    release.set()
    thread.join(5)
    assert not thread.is_alive()


def test_startup_creates_indexes_first(monkeypatch):
    calls = []
    monkeypatch.delenv("REINGEST_ON_STARTUP", raising=False)
    monkeypatch.setattr(main, "ensure_indexes", lambda: calls.append("indexes"))
    monkeypatch.setattr(main, "sync_vectors", lambda: calls.append("sync"))
    main.startup()
    main._startup_thread.join(5)
    assert calls == ["indexes", "sync"]


def test_a_failing_background_sync_is_logged_not_fatal(monkeypatch, caplog):
    def boom():
        raise RuntimeError("chroma down")

    thread = _startup_with(monkeypatch, sync=boom)
    thread.join(5)
    assert "Startup vector sync failed" in caplog.text
    assert client.get("/").status_code == 200


def test_reingest_on_startup_still_runs_in_the_background(monkeypatch):
    calls = []
    thread = _startup_with(monkeypatch, env="true", enrich=lambda: calls.append("enrich"))
    thread.join(5)
    assert calls == ["enrich"]


# ---- CORS: the mobile app isn't a browser; no browser origin is allowed ----

def test_no_browser_origin_is_allowed_by_default():
    res = client.get("/", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers
    pre = client.options(
        "/notes/",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in pre.headers


def test_cors_origins_from_env_never_a_wildcard(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, *, https://b.example")
    assert main.cors_origins() == ["https://a.example", "https://b.example"]
    monkeypatch.delenv("CORS_ORIGINS")
    assert main.cors_origins() == []


# ---- Docker runs as a non-root user ----

def test_dockerfile_runs_as_non_root():
    lines = [ln.strip() for ln in open(os.path.join(ROOT, "Dockerfile"), encoding="utf-8")]
    users = [ln.split()[1] for ln in lines if ln.upper().startswith("USER ")]
    cmd_index = next(i for i, ln in enumerate(lines) if ln.upper().startswith("CMD"))
    last_user = [ln.split()[1] for ln in lines[:cmd_index] if ln.upper().startswith("USER ")][-1]
    assert users and last_user not in ("root", "0")


# ---- /feedback only takes known actions ----

def test_feedback_rejects_unknown_actions():
    note_id = client.post("/notes/", json={"content": "call mom"}, headers=AS_A).json()["id"]
    for bad in ("delete everything", "", "USEFUL", "never_show"):
        assert client.post(f"/notes/{note_id}/feedback", params={"action": bad}, headers=AS_A).status_code == 422
    for good in ("useful", "dismiss", "later", "annoying", "show less", "never show"):
        assert client.post(f"/notes/{note_id}/feedback", params={"action": good}, headers=AS_A).status_code == 200


def test_access_log_lines_drop_query_strings():
    # PUT /notes/{id} sends the note text as query parameters; uvicorn's
    # access log would print the full URL
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
        ("1.2.3.4:5", "PUT", f"/notes/abc?content=buy%20milk%20{SECRET}", "1.1", 200), None,
    )
    assert main.AccessLogWithoutQuery().filter(record) is True
    assert SECRET not in record.getMessage()
    assert "/notes/abc" in record.getMessage()
    assert main.AccessLogWithoutQuery in {type(f) for f in logging.getLogger("uvicorn.access").filters}


def test_database_driver_debug_logs_are_off():
    assert logging.getLogger("pymongo").getEffectiveLevel() >= logging.WARNING

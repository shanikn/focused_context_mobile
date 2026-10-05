"""One user's notes must never reach another user, through MongoDB or the
ChromaDB vectors behind semantic search."""
import pytest
from fastapi.testclient import TestClient

import api.main as main
from agents.ingestion import collection, ingest_note
from agents.pipeline import sync_vectors
from agents.relevance import get_relevant_notes
from notepad import Note, notes_collection, save_note
from tests.support import delete_any  # noqa: E402

client = TestClient(app=main.app)

A, B = "iso-user-a", "iso-user-b"
TOKENS = {"Bearer token-a": A, "Bearer token-b": B}
AS_A = {"Authorization": "Bearer token-a"}
AS_B = {"Authorization": "Bearer token-b"}


@pytest.fixture(autouse=True)
def two_users(monkeypatch):
    monkeypatch.setattr(main, "get_user_id", lambda authorization: TOKENS.get(authorization))
    yield
    for doc in notes_collection.find({"user_id": {"$in": [A, B, ""]}, "_id": {"$regex": "^iso-"}}):
        delete_any(doc["_id"])
    for doc in notes_collection.find({"user_id": {"$in": [A, B]}}):
        delete_any(doc["_id"])


def _stored(note_id: str, content: str, user_id, **fields) -> Note:
    """A note saved as-is (no AI enrichment) and embedded."""
    note = Note(id=note_id, content=content, user_id=user_id, contexts=[], **fields)
    save_note(note)
    ingest_note(note)
    return note


# ---- the vectors ----

def test_vectors_carry_the_owner():
    _stored("iso-owned", "water the plants", A)
    _stored("iso-legacy", "water the plants", None)
    meta = collection.get(ids=["iso-owned", "iso-legacy"], include=["metadatas"])
    by_id = dict(zip(meta["ids"], meta["metadatas"]))
    assert by_id["iso-owned"]["user_id"] == A
    assert by_id["iso-legacy"]["user_id"] == ""  # ChromaDB metadata can't be None


def test_semantic_search_filters_by_user(monkeypatch):
    import agents.relevance as relevance
    calls = []
    real_query = relevance.collection.query

    def spy(**kwargs):
        calls.append(kwargs)
        return real_query(**kwargs)

    monkeypatch.setattr(relevance.collection, "query", spy)
    _stored("iso-b1", "buy some milk please", B)
    get_relevant_notes("buy milk", "unknown", 9, 0, user_id=B)
    assert calls and all(c.get("where") == {"user_id": B} for c in calls)


def test_other_users_vectors_cant_crowd_out_mine():
    # A has many notes closer to the query than B's only note
    for i in range(6):
        _stored(f"iso-a{i}", "buy milk", A)
    _stored("iso-b-milk", "buy some milk please", B)
    found = [n.id for n in get_relevant_notes("buy milk", "unknown", 9, 0, user_id=B)]
    assert found == ["iso-b-milk"]


# ---- every endpoint ----

def test_user_a_cant_get_user_b_notes_through_any_endpoint():
    b_ids = [
        client.post("/notes/", json={"content": text}, headers=AS_B).json()["id"]
        for text in ("buy milk at the supermarket", "B's secret: call the bank at 9am", "dentist appointment")
    ]
    a_id = client.post("/notes/", json={"content": "buy milk"}, headers=AS_A).json()["id"]

    # listing
    listed = {n["_id"] for n in client.get("/notes/", headers=AS_A).json()}
    assert a_id in listed and not listed & set(b_ids)

    # semantic and place-based reminders, for many contexts
    for location in ("unknown", "home", "Home", "uni", "work", "supermarket", "buy milk", "bank"):
        for hour in (None, 9, 18):
            params = {"location": location} if hour is None else {"location": location, "hour": hour}
            res = client.get("/reminders/", params=params, headers=AS_A)
            assert res.status_code == 200
            assert not {n["_id"] for n in res.json()} & set(b_ids), (location, hour)

    # reading, changing, deleting or rating B's note by id
    for b_id in b_ids:
        assert client.put(f"/notes/{b_id}", params={"content": "hacked"}, headers=AS_A).status_code == 404
        assert client.post(f"/notes/{b_id}/feedback", params={"action": "never show"}, headers=AS_A).status_code == 404
        assert client.delete(f"/notes/{b_id}", headers=AS_A).status_code == 404
    still = {n["_id"]: n for n in client.get("/notes/", headers=AS_B).json()}
    assert set(b_ids) <= set(still)
    assert "hacked" not in {n["content"] for n in still.values()}
    assert all(not n["never_show"] for n in still.values())

    # places
    client.post("/places/", json={"name": "B's Gym"}, headers=AS_B)
    assert "B's Gym" not in {p["name"] for p in client.get("/places/", headers=AS_A).json()}


def test_no_token_no_notes():
    assert client.get("/notes/").status_code == 401
    assert client.get("/reminders/", params={"location": "unknown"}).status_code == 401


# ---- backfill and startup ----

def test_sync_vectors_backfills_owner_adds_missing_and_drops_orphans():
    old = Note(id="iso-old", content="feed the cat", user_id=A, contexts=[])
    save_note(old)
    # a vector written before user_id was stored
    collection.upsert(ids=["iso-old"], embeddings=[[0.0] * 383 + [1.0]], metadatas=[{"category": "todo"}])
    # a note with no vector at all (e.g. ChromaDB wasn't persisted)
    missing = Note(id="iso-missing", content="pay rent", user_id=B, contexts=[])
    save_note(missing)
    # a vector whose note is gone
    collection.upsert(ids=["iso-orphan"], embeddings=[[1.0] + [0.0] * 383], metadatas=[{"user_id": A}])

    sync_vectors()

    got = collection.get(ids=["iso-old", "iso-missing"], include=["metadatas"])
    meta = dict(zip(got["ids"], got["metadatas"]))
    assert meta["iso-old"]["user_id"] == A
    assert meta["iso-missing"]["user_id"] == B
    assert collection.get(ids=["iso-orphan"])["ids"] == []
    # no AI enrichment: the stored notes are untouched
    assert notes_collection.find_one({"_id": "iso-missing"})["category"] == "todo"


def test_startup_doesnt_rerun_enrichment_by_default(monkeypatch):
    calls = []
    monkeypatch.delenv("REINGEST_ON_STARTUP", raising=False)
    monkeypatch.setattr(main, "process_all_notes", lambda: calls.append("enrich"))
    monkeypatch.setattr(main, "sync_vectors", lambda: calls.append("sync"))
    monkeypatch.setattr(main, "ensure_indexes", lambda: None)
    main.startup()
    main._startup_thread.join(5)  # runs in the background
    assert calls == ["sync"]


def test_startup_reenriches_only_when_asked(monkeypatch):
    calls = []
    monkeypatch.setenv("REINGEST_ON_STARTUP", "true")
    monkeypatch.setattr(main, "process_all_notes", lambda: calls.append("enrich"))
    monkeypatch.setattr(main, "sync_vectors", lambda: calls.append("sync"))
    monkeypatch.setattr(main, "ensure_indexes", lambda: None)
    main.startup()
    main._startup_thread.join(5)
    assert calls == ["enrich"]

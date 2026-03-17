from datetime import datetime
from fastapi.testclient import TestClient
from api.main import app
from agents.pipeline import full_delete, process_new_notes
from agents.relevance import collection
from notepad import Note

client = TestClient(app)


def test_reminders_returns_list():
    # create a note first
    res = client.post("/notes/", json={"content": "buy milk"})
    note_id = res.json()["id"]

    res = client.get("/reminders/", params={"location": "errands", "hour": 15})
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    full_delete(note_id)


def test_edit_content_updates_embeddings():
    # create a note about errands
    res = client.post("/notes/", json={"content": "buy groceries"})
    note_id = res.json()["id"]

    # edit content
    client.put(f"/notes/{note_id}", params={"content": "buy fresh vegetables"})

    # verify content updated in MongoDB
    notes = client.get("/notes/").json()
    note = next(n for n in notes if n["_id"] == note_id)
    full_delete(note_id)
    assert note["content"] == "buy fresh vegetables"


def test_feedback_endpoint():
    res = client.post("/notes/", json={"content": "walk Libby"})
    note_id = res.json()["id"]

    res = client.post(f"/notes/{note_id}/feedback?action=useful")
    assert res.status_code == 200

    # verify useful_count increased
    notes = client.get("/notes/").json()
    note = next(n for n in notes if n["_id"] == note_id)
    full_delete(note_id)
    assert note["useful_count"] == 1


def test_never_show_note_excluded_from_reminders():
    res = client.post("/notes/", json={"content": "buy toner pads"})
    note_id = res.json()["id"]

    # mark as never show
    client.post(f"/notes/{note_id}/feedback?action=never show")

    # should not appear in reminders
    res = client.get(
        "/reminders/",
        params={"location": "errands", "hour": 15}
    )
    ids = [n["_id"] for n in res.json()]
    full_delete(note_id)
    assert note_id not in ids


def test_ingestion_stores_category_in_chroma():
    note = Note(content="study for probability exam")
    process_new_notes(note)

    result = collection.get(ids=[note.id])
    full_delete(note.id)
    assert len(result["metadatas"]) == 1
    assert result["metadatas"][0]["category"] is not None


def test_notify_queue():
    # push a notification
    res = client.post("/notify", json={
        "content": "test reminder",
        "note_id": "test-123"
    })
    assert res.status_code == 200

    # poll — should contain the item
    res = client.get("/notify")
    items = res.json()
    assert len(items) >= 1
    assert any(i["content"] == "test reminder" for i in items)

    # poll again — queue should be cleared
    res = client.get("/notify")
    assert res.json() == []


def test_manual_metadata_override():
    res = client.post("/notes/", json={"content": "random note"})
    note_id = res.json()["id"]

    # manually override category and location
    client.put(f"/notes/{note_id}", params={
        "category": "task",
        "contexts": "home"
    })

    notes = client.get("/notes/").json()
    note = next(n for n in notes if n["_id"] == note_id)
    full_delete(note_id)
    assert note["category"] == "task"
    assert "home" in note["contexts"]


def test_remind_on_date_today():
    note = Note(content="pick up laundry")
    process_new_notes(note)

    today = datetime.now().strftime("%Y-%m-%d")
    full_delete(note.id)
    assert note.remind_on_date == today


def test_edit_content_re_infers_context():
    # create a note with morning time
    res = client.post("/notes/", json={"content": "go for a morning jog"})
    note_id = res.json()["id"]

    # edit to something with evening time
    client.put(f"/notes/{note_id}", params={
        "content": "go for an evening jog"
    })

    notes = client.get("/notes/").json()
    note = next(n for n in notes if n["_id"] == note_id)
    full_delete(note_id)
    assert "18:00" in note["contexts"]

from datetime import datetime, timedelta
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


def test_manual_metadata_override():
    res = client.post("/notes/", json={"content": "random note"})
    note_id = res.json()["id"]

    # manually override category and location (explicit flags stop the
    # re-inference on update from overwriting them)
    client.put(f"/notes/{note_id}", params={
        "category": "task",
        "category_explicit": "true",
        "location_explicit": "true",
        "location_value": "home",
    })

    notes = client.get("/notes/").json()
    note = next(n for n in notes if n["_id"] == note_id)
    full_delete(note_id)
    assert note["category"] == "task"
    assert "home" in note["contexts"]


def test_remind_on_date_past_time_moves_to_tomorrow():
    # 00:00 has always passed today, so smart dating moves it to tomorrow
    note = Note(content="pick up laundry at 00:00")
    process_new_notes(note)

    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    full_delete(note.id)
    assert note.remind_on_date == tomorrow


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


def _app_edit_payload(content, hour, minute, time_explicit=True):
    # the exact query params the mobile edit screen sends on "Update"
    return {
        "content": content,
        "list_name": "General",
        "category": "uncategorized",
        "category_explicit": "false",
        "location_explicit": "false",
        "location_value": "",
        "remind_date_explicit": "false",
        "remind_time_explicit": "true" if time_explicit else "false",
        "remind_on_date": "",
        "remind_at_hour": "" if hour is None else str(hour),
        "remind_at_minute": "" if minute is None else str(minute),
        "reminders_enabled": "true",
    }


def _get_note(note_id):
    notes = client.get("/notes/").json()
    return next(n for n in notes if n["_id"] == note_id)


def test_edited_reminder_time_is_kept():
    res = client.post("/notes/", json={"content": "go for a morning jog"})
    note_id = res.json()["id"]

    client.put(f"/notes/{note_id}", params=_app_edit_payload("go for a morning jog", 14, 30))
    after_time_edit = _get_note(note_id)

    # a later edit of only the text (no time params) must not drop the time
    client.put(f"/notes/{note_id}", params={"content": "go for a morning run"})
    after_text_edit = _get_note(note_id)

    full_delete(note_id)
    for note in (after_time_edit, after_text_edit):
        assert note["remind_time_explicit"] is True
        assert note["remind_at_hour"] == 14
        assert note["remind_at_minute"] == 30
        assert "14:30" in note["contexts"]
        assert "09:00" not in note["contexts"]


def test_edited_reminder_time_midnight_is_kept():
    res = client.post("/notes/", json={"content": "take vitamins"})
    note_id = res.json()["id"]

    client.put(f"/notes/{note_id}", params=_app_edit_payload("take vitamins", 0, 0))
    note = _get_note(note_id)

    full_delete(note_id)
    assert note["remind_at_hour"] == 0
    assert "00:00" in note["contexts"]


def test_cleared_reminder_time_goes_back_to_smart_time():
    res = client.post("/notes/", json={"content": "go for a morning jog"})
    note_id = res.json()["id"]
    client.put(f"/notes/{note_id}", params=_app_edit_payload("go for a morning jog", 14, 30))

    client.put(
        f"/notes/{note_id}",
        params=_app_edit_payload("go for a morning jog", None, None, time_explicit=False),
    )
    note = _get_note(note_id)

    full_delete(note_id)
    assert note["remind_time_explicit"] is False
    assert note["remind_at_hour"] is None
    assert "14:30" not in note["contexts"]
    assert "09:00" in note["contexts"]


def test_new_note_with_inferred_time_has_alerts_on():
    res = client.post("/notes/", json={"content": "remind me at 17:53 that I'm at home"})
    note_id = res.json()["id"]
    note = _get_note(note_id)

    full_delete(note_id)
    assert "17:53" in note["contexts"]
    assert note["reminders_enabled"] is True


def test_list_notes_fills_defaults_for_older_notes():
    # notes saved before reminders_enabled / the explicit flags existed
    # have no such fields in MongoDB
    from notepad import notes_collection
    # create and delete a note just to learn the API's user id
    created = client.post("/notes/", json={"content": "placeholder"}).json()["id"]
    owner = notes_collection.find_one({"_id": created})["user_id"]
    full_delete(created)

    legacy_id = "legacy-note-17-53"
    notes_collection.insert_one({
        "_id": legacy_id,
        "content": "remind me at 17:53 that im at home",
        "created_at": datetime(2026, 3, 15, 13, 56),
        "category": "reminder",
        "contexts": ["home", "17:53"],
        "shown_count": 0,
        "dismissed_count": 0,
        "useful_count": 0,
        "never_show": False,
        "last_shown": None,
        "cooldown_until": None,
        "remind_at_hour": None,
        "remind_on_date": None,
        "user_id": owner,
    })
    note = _get_note(legacy_id)
    notes_collection.delete_one({"_id": legacy_id})

    assert note["reminders_enabled"] is True
    assert note["remind_time_explicit"] is False
    assert note["category_explicit"] is False
    assert note["contexts"] == ["home", "17:53"]

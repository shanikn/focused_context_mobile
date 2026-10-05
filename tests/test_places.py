from fastapi.testclient import TestClient

from api.main import app
from agents.pipeline import process_new_notes
from notepad import Note
from places import (
    create_place, delete_place, get_places, places_collection,
    resolve_place, update_place,
)
from tests.support import delete_any, note_doc  # noqa: E402

client = TestClient(app)


def _clear(user_id):
    places_collection.delete_many({"user_id": user_id})


# ---- places.py ----

def test_new_user_gets_home_uni_work():
    _clear("u-defaults")
    places = get_places("u-defaults")
    assert [(p.name, p.kind) for p in places] == [
        ("Home", "home"), ("Uni", "uni"), ("Work", "work"),
    ]
    # seeding is idempotent
    assert [p.id for p in get_places("u-defaults")] == [p.id for p in places]
    _clear("u-defaults")


def test_no_errands_place_by_default():
    _clear("u-errands")
    assert "errands" not in {p.name.lower() for p in get_places("u-errands")}
    _clear("u-errands")


def test_add_several_custom_places():
    _clear("u-custom")
    gym = create_place("u-custom", "Gym", ["workout"])
    pharmacy = create_place("u-custom", "Pharmacy")
    names = [p.name for p in get_places("u-custom")]
    assert names == ["Home", "Uni", "Work", "Gym", "Pharmacy"]
    assert gym.keywords == ["workout"] and gym.kind is None
    assert pharmacy.id != gym.id
    _clear("u-custom")


def test_place_names_are_unique_per_user_ignoring_case():
    _clear("u-unique")
    create_place("u-unique", "Gym")
    try:
        create_place("u-unique", "gym")
        assert False, "expected ValueError"
    except ValueError:
        pass
    _clear("u-unique")


def test_places_are_per_user():
    _clear("u-a")
    _clear("u-b")
    create_place("u-a", "Gym")
    assert "Gym" not in [p.name for p in get_places("u-b")]
    _clear("u-a")
    _clear("u-b")


def test_resolve_place_by_id_or_name():
    _clear("u-resolve")
    gym = create_place("u-resolve", "Gym")
    assert resolve_place("u-resolve", gym.id).id == gym.id
    assert resolve_place("u-resolve", "gym").id == gym.id
    assert resolve_place("u-resolve", "HOME").kind == "home"
    assert resolve_place("u-resolve", "errands") is None
    assert resolve_place("u-resolve", "unknown") is None
    _clear("u-resolve")


def test_rename_place_keeps_id():
    _clear("u-rename")
    gym = create_place("u-rename", "Gym")
    assert update_place("u-rename", gym.id, name="Fitness")
    assert resolve_place("u-rename", gym.id).name == "Fitness"
    _clear("u-rename")


def test_delete_place():
    _clear("u-del")
    gym = create_place("u-del", "Gym")
    assert delete_place("u-del", gym.id)
    assert resolve_place("u-del", gym.id) is None
    assert not delete_place("u-del", gym.id)
    _clear("u-del")


# ---- notes are tagged with place ids ----

def test_note_is_tagged_with_place_id():
    home = resolve_place(None, "home")
    note = Note(content="do the laundry")
    process_new_notes(note)
    delete_any(note.id)
    assert home.id in note.contexts
    assert "home" not in note.contexts


def test_custom_place_tagged_by_name_keyword_and_meaning():
    gym = create_place(None, "Gym", ["squats"])
    by_name = Note(content="go to the gym")
    by_keyword = Note(content="do some squats")
    by_meaning = Note(content="leg day workout")  # no keyword, semantic match
    unrelated = Note(content="call mom")
    for n in (by_name, by_keyword, by_meaning, unrelated):
        process_new_notes(n)
        delete_any(n.id)
    delete_place(None, gym.id)
    assert gym.id in by_name.contexts
    assert gym.id in by_keyword.contexts
    assert gym.id in by_meaning.contexts
    assert gym.id not in unrelated.contexts


def test_errand_notes_get_no_location_and_no_default_time():
    note = Note(content="buy milk")
    process_new_notes(note)
    delete_any(note.id)
    assert note.category == "errand"
    assert note.contexts == []


# ---- API ----

def test_places_api_crud():
    res = client.get("/places/")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert names[:3] == ["Home", "Uni", "Work"]

    created = client.post("/places/", json={"name": "Pharmacy", "keywords": ["medicine"]})
    assert created.status_code == 200
    place = created.json()
    assert place["name"] == "Pharmacy" and place["keywords"] == ["medicine"]
    assert set(place) == {"id", "name", "keywords", "kind"}  # no coordinates

    dup = client.post("/places/", json={"name": "pharmacy"})
    assert dup.status_code == 409

    renamed = client.put(f"/places/{place['id']}", json={"name": "Drugstore"})
    assert renamed.status_code == 200
    assert "Drugstore" in [p["name"] for p in client.get("/places/").json()]

    assert client.delete(f"/places/{place['id']}").status_code == 200
    assert client.delete(f"/places/{place['id']}").status_code == 404


def test_adding_a_place_retags_existing_notes():
    note_id = client.post("/notes/", json={"content": "refill my prescription"}).json()["id"]
    place = client.post("/places/", json={"name": "Pharmacy"}).json()
    note = note_doc(note_id)
    client.delete(f"/places/{place['id']}")
    delete_any(note_id)
    assert place["id"] in note["contexts"]


def test_deleting_a_place_untags_notes():
    place = client.post("/places/", json={"name": "Gym"}).json()
    note_id = client.post("/notes/", json={"content": "leg day workout"}).json()["id"]
    assert place["id"] in note_doc(note_id)["contexts"]

    client.delete(f"/places/{place['id']}")
    note = note_doc(note_id)
    delete_any(note_id)
    assert place["id"] not in note["contexts"]


def test_renaming_a_place_keeps_note_tags():
    place = client.post("/places/", json={"name": "Gym"}).json()
    note_id = client.post("/notes/", json={"content": "leg day workout"}).json()["id"]
    client.put(f"/places/{place['id']}", json={"name": "Fitness"})
    note = note_doc(note_id)
    client.delete(f"/places/{place['id']}")
    delete_any(note_id)
    assert place["id"] in note["contexts"]


def test_reminders_accept_place_name_or_id():
    place = client.post("/places/", json={"name": "Gym"}).json()
    note_id = client.post("/notes/", json={"content": "leg day workout"}).json()["id"]

    by_name = [n["_id"] for n in client.get("/reminders/", params={"location": "Gym"}).json()]
    by_id = [n["_id"] for n in client.get("/reminders/", params={"location": place["id"]}).json()]

    client.delete(f"/places/{place['id']}")
    delete_any(note_id)
    assert note_id in by_name
    assert note_id in by_id


def test_location_override_by_name_is_stored_as_id():
    note_id = client.post("/notes/", json={
        "content": "random note", "location_explicit": True, "location_value": "work",
    }).json()["id"]
    work = client.get("/places/").json()[2]
    note = note_doc(note_id)
    delete_any(note_id)
    assert note["location_value"] == work["id"]
    assert work["id"] in note["contexts"]

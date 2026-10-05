from datetime import datetime

from notepad import notes_collection
from places import places_collection, resolve_place
from scripts.migrate_places import apply_migration, plan_migration
from tests.support import note_doc  # noqa: E402

USER = "u-migrate"


def _legacy(note_id, content, contexts, **extra):
    doc = {
        "_id": note_id, "content": content, "created_at": datetime(2026, 3, 1),
        "category": extra.pop("category", "task"), "contexts": contexts,
        "shown_count": 0, "dismissed_count": 0, "useful_count": 0,
        "never_show": False, "last_shown": None, "cooldown_until": None,
        "user_id": USER,
    }
    doc.update(extra)
    notes_collection.insert_one(doc)


def setup_function():
    notes_collection.delete_many({"user_id": USER})
    places_collection.delete_many({"user_id": USER})
    _legacy("m-home", "do the laundry", ["home", "09:00"])
    _legacy("m-uni-explicit", "random note", ["uni", "09:00"],
            location_explicit=True, location_value="uni")
    _legacy("m-errands", "buy milk", ["errands", "15:00"], category="errand")
    _legacy("m-errands-explicit", "random errand", ["errands", "15:00"],
            location_explicit=True, location_value="errands")
    _legacy("m-errands-timed", "buy bread at 18:30", ["errands", "18:30"], category="errand")
    _legacy("m-already", "nothing legacy here", ["12:00"])


def teardown_function():
    notes_collection.delete_many({"user_id": USER})
    places_collection.delete_many({"user_id": USER})


def _ids():
    return {kind: resolve_place(USER, kind).id for kind in ("home", "uni", "work")}


def test_dry_run_plans_changes_without_writing():
    changes = plan_migration(user_ids=[USER])
    by_id = {c["note_id"]: c for c in changes}

    assert set(by_id) == {"m-home", "m-uni-explicit", "m-errands", "m-errands-explicit", "m-errands-timed"}
    assert note_doc("m-home")["contexts"] == ["home", "09:00"]  # nothing written
    assert note_doc("m-errands")["contexts"] == ["errands", "15:00"]


def test_home_uni_work_tags_become_place_ids():
    changes = {c["note_id"]: c for c in plan_migration(user_ids=[USER])}
    ids = _ids()
    assert changes["m-home"]["after"]["contexts"] == [ids["home"], "09:00"]
    assert changes["m-uni-explicit"]["after"]["contexts"] == [ids["uni"], "09:00"]
    assert changes["m-uni-explicit"]["after"]["location_value"] == ids["uni"]
    assert changes["m-uni-explicit"]["after"]["location_explicit"] is True


def test_errands_tag_and_default_time_are_dropped():
    changes = {c["note_id"]: c for c in plan_migration(user_ids=[USER])}
    assert changes["m-errands"]["after"]["contexts"] == []
    assert changes["m-errands-explicit"]["after"] == {
        "contexts": [], "location_explicit": False, "location_value": None,
    }


def test_errands_note_keeps_a_time_written_in_the_text():
    changes = {c["note_id"]: c for c in plan_migration(user_ids=[USER])}
    assert changes["m-errands-timed"]["after"]["contexts"] == ["18:30"]


def test_apply_writes_and_is_idempotent():
    apply_migration(plan_migration(user_ids=[USER]))
    ids = _ids()
    assert note_doc("m-home")["contexts"] == [ids["home"], "09:00"]
    assert note_doc("m-errands")["contexts"] == []
    errand = note_doc("m-errands")
    assert errand["category"] == "errand"  # category is not touched
    assert plan_migration(user_ids=[USER]) == []

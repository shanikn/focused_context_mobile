import json
from datetime import datetime

from notepad import MONGO_DB_NAME, notes_collection
from scripts.migrate_categories import (
    OLD_TO_NEW, apply_changes, backup_notes, plan_changes, summarize,
)
from tests.support import note_doc  # noqa: E402

USER = "u-migrate-cat"
OTHER = "u-someone-else"


def _note(note_id, category, user=USER, **extra):
    doc = {
        "_id": note_id, "content": f"note {note_id}", "created_at": datetime(2026, 3, 1),
        "category": category, "contexts": [], "shown_count": 0, "dismissed_count": 0,
        "useful_count": 0, "never_show": False, "last_shown": None, "cooldown_until": None,
        "user_id": user,
    }
    doc.update(extra)
    notes_collection.insert_one(doc)


def setup_function():
    notes_collection.delete_many({"user_id": {"$in": [USER, OTHER]}})
    _note("c-sched", "scheduled")
    _note("c-rem", "reminder", category_explicit=True)
    _note("c-unc", "uncategorized")
    _note("c-task", "task")
    _note("c-errand", "errand")
    _note("c-idea", "idea")
    _note("c-event", "event")
    _note("c-todo", "todo")
    _note("c-other", "scheduled", user=OTHER)


def teardown_function():
    notes_collection.delete_many({"user_id": {"$in": [USER, OTHER]}})


def test_runs_on_the_test_database():
    assert MONGO_DB_NAME == "contextmind_test"


def test_mapping():
    assert OLD_TO_NEW == {"scheduled": "todo", "reminder": "todo", "uncategorized": "todo", "task": "todo"}


def test_plan_only_touches_old_kinds_of_that_user():
    changes = plan_changes(USER)
    assert sorted(c["note_id"] for c in changes) == ["c-rem", "c-sched", "c-task", "c-unc"]
    assert all(c["after"] == "todo" for c in changes)
    # nothing written yet
    assert note_doc("c-sched")["category"] == "scheduled"
    assert note_doc("c-other")["category"] == "scheduled"


def test_summary_counts_and_sample():
    text = summarize(plan_changes(USER), sample_size=2)
    assert "4 note(s)" in text
    assert "scheduled -> todo: 1" in text
    assert "reminder -> todo: 1" in text
    assert "uncategorized -> todo: 1" in text
    assert "task -> todo: 1" in text
    assert text.count("note c-") == 2  # the sample


def test_backup_writes_the_full_affected_notes(tmp_path):
    changes = plan_changes(USER)
    path = backup_notes(changes, tmp_path / "backup.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    assert sorted(d["_id"] for d in data["notes"]) == ["c-rem", "c-sched", "c-task", "c-unc"]
    assert data["database"] == "contextmind_test"
    assert {d["_id"]: d["category"] for d in data["notes"]}["c-rem"] == "reminder"


def test_apply_changes_only_the_category_and_is_idempotent():
    applied = apply_changes(plan_changes(USER))
    assert applied == 4
    assert note_doc("c-sched")["category"] == "todo"
    assert note_doc("c-rem")["category"] == "todo"
    assert note_doc("c-rem")["category_explicit"] is True  # untouched
    assert note_doc("c-errand")["category"] == "errand"
    assert note_doc("c-other")["category"] == "scheduled"  # other users untouched
    assert plan_changes(USER) == []

"""One-off migration to per-user places, notes tagged by place id.

For every note that still has the old string tags:
  - "home" / "uni" / "work" -> that user's Home / Uni / Work place id
    (in contexts and in location_value)
  - "errands" -> removed; a hand-picked "errands" location is cleared, and
    the note is re-tagged with the user's places (dropping the old 15:00
    errands default time; a time written in the text or set by the user stays)
Category, dates and everything else are left as they are.

Usage (from the repo root):
  python scripts/migrate_places.py            # dry run: prints the plan
  python scripts/migrate_places.py --apply    # writes it

The dry run writes nothing to notes. It does create the default
Home / Uni / Work places for users who don't have them yet (the new backend
does the same on first use), so the ids it prints are the real ones.
"""
import argparse
import copy
import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from notepad import MONGO_DB_NAME, dict_to_note, notes_collection, update_note  # noqa: E402
from places import get_places  # noqa: E402
from agents.pipeline import compute_enrichment  # noqa: E402

LEGACY = {"home", "uni", "work"}
ERRANDS = "errands"


def _plan_note(doc: dict, places: list, by_kind: dict, now: datetime):
    contexts = doc.get("contexts", [])
    location_value = doc.get("location_value")
    explicit = bool(doc.get("location_explicit", False))
    has_errands = ERRANDS in contexts or location_value == ERRANDS
    has_legacy = any(c in LEGACY for c in contexts) or location_value in LEGACY
    if not (has_errands or has_legacy):
        return None

    if has_errands:
        note = dict_to_note(doc)
        if location_value == ERRANDS:
            note.location_explicit = False
            note.location_value = None
        note.contexts = [c for c in contexts if c != ERRANDS]
        fields = compute_enrichment(note, places, now)
        after = {
            "contexts": fields["contexts"],
            "location_explicit": fields["location_explicit"],
            "location_value": fields["location_value"],
        }
    else:
        after = {
            "contexts": [by_kind[c].id if c in LEGACY else c for c in contexts],
            "location_explicit": explicit,
            "location_value": by_kind[location_value].id if location_value in LEGACY else location_value,
        }
    return {
        "note_id": doc["_id"],
        "user_id": doc.get("user_id"),
        "content": doc.get("content", ""),
        "before": {
            "contexts": contexts,
            "location_explicit": explicit,
            "location_value": location_value,
        },
        "after": after,
    }


def plan_migration(user_ids=None) -> list:
    """The changes the migration would make. Writes nothing to notes."""
    if user_ids is None:
        user_ids = sorted(set(notes_collection.distinct("user_id")) | {None}, key=lambda u: (u is not None, u or ""))
    now = datetime.now()
    changes = []
    for user_id in user_ids:
        places = get_places(user_id)
        by_kind = {p.kind: p for p in places if p.kind}
        for doc in notes_collection.find({"user_id": user_id}).sort("created_at", 1):
            change = _plan_note(copy.deepcopy(doc), places, by_kind, now)
            if change:
                changes.append(change)
    return changes


def apply_migration(changes: list) -> int:
    for change in changes:
        update_note(change["note_id"], change["after"])
    return len(changes)


def _label(value, names):
    return names.get(value, value)


def print_plan(changes: list):
    print(f"Database: {MONGO_DB_NAME}")
    if not changes:
        print("Nothing to migrate.")
        return
    names = {}
    for user_id in {c["user_id"] for c in changes}:
        for p in get_places(user_id):
            names[p.id] = f"{p.name}<{p.id[:8]}>"
    current_user = object()
    for c in changes:
        if c["user_id"] != current_user:
            current_user = c["user_id"]
            count = sum(1 for x in changes if x["user_id"] == current_user)
            print(f"\nuser {current_user!r}: {count} note(s)")
        before = [_label(v, names) for v in c["before"]["contexts"]]
        after = [_label(v, names) for v in c["after"]["contexts"]]
        line = f"  {c['note_id'][:8]}  {c['content'][:45]!r:48} {before} -> {after}"
        if c["before"]["location_value"] or c["after"]["location_value"]:
            line += (
                f"  override: {_label(c['before']['location_value'], names)}"
                f" -> {_label(c['after']['location_value'], names)}"
            )
        print(line)
    errands = sum(1 for c in changes if ERRANDS in c["before"]["contexts"])
    print(f"\n{len(changes)} note(s) to change, {errands} of them had \"errands\".")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()

    changes = plan_migration()
    print_plan(changes)
    if args.apply:
        applied = apply_migration(changes)
        print(f"\nApplied {applied} change(s) to {MONGO_DB_NAME}.")
    else:
        print("\nDry run: no notes were changed. Re-run with --apply to write.")


if __name__ == "__main__":
    main()

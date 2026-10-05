"""Move one user's notes from the old categories to the four kinds.

Old "scheduled", "reminder", "uncategorized" and "task" become "todo".
"errand", "idea" and "event" (and anything already "todo") are left alone.
Only the category changes; category_explicit and everything else stay.

Usage (from the repo root):
  python scripts/migrate_categories.py --user-id <uid> --dry-run
  python scripts/migrate_categories.py --user-id <uid>
      [--backup-file ~/backups/categories-<uid>-<time>.json]

The dry run prints counts and a sample and writes nothing. A real run first
writes the affected notes (full documents) to a JSON backup file and stops
if that fails; only then does it update the notes.
"""
import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bson import json_util  # noqa: E402

from notepad import MONGO_DB_NAME, notes_collection  # noqa: E402

OLD_TO_NEW = {"scheduled": "todo", "reminder": "todo", "uncategorized": "todo", "task": "todo"}


def plan_changes(user_id: str) -> list:
    """The notes of this user that still have an old category. Writes nothing."""
    docs = notes_collection.find(
        {"user_id": user_id, "category": {"$in": list(OLD_TO_NEW)}}
    ).sort("created_at", 1)
    return [
        {
            "note_id": d["_id"],
            "content": d.get("content", ""),
            "before": d["category"],
            "after": OLD_TO_NEW[d["category"]],
        }
        for d in docs
    ]


def summarize(changes: list, sample_size: int = 5) -> str:
    lines = [f"Database: {MONGO_DB_NAME}", f"{len(changes)} note(s) to change"]
    counts: dict = {}
    for c in changes:
        key = f"{c['before']} -> {c['after']}"
        counts[key] = counts.get(key, 0) + 1
    for key in sorted(counts):
        lines.append(f"  {key}: {counts[key]}")
    if changes:
        lines.append(f"Sample (first {min(sample_size, len(changes))}):")
        for c in changes[:sample_size]:
            lines.append(f"  {c['note_id'][:8]}  {c['before']:>13} -> {c['after']}  {c['content'][:50]!r}")
    return "\n".join(lines)


def backup_notes(changes: list, path) -> Path:
    """Write the full affected notes to a JSON file (MongoDB extended JSON)."""
    path = Path(path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    ids = [c["note_id"] for c in changes]
    notes = list(notes_collection.find({"_id": {"$in": ids}}))
    data = {
        "database": MONGO_DB_NAME,
        "created": datetime.now().isoformat(timespec="seconds"),
        "note_count": len(notes),
        "notes": notes,
    }
    path.write_text(json_util.dumps(data, indent=1), encoding="utf-8")
    # make sure it reads back before anything is changed
    back = json_util.loads(path.read_text(encoding="utf-8"))
    if len(back["notes"]) != len(ids):
        raise RuntimeError(f"backup {path} has {len(back['notes'])} notes, expected {len(ids)}")
    return path


def apply_changes(changes: list) -> int:
    for c in changes:
        notes_collection.update_one(
            {"_id": c["note_id"], "category": c["before"]},
            {"$set": {"category": c["after"]}},
        )
    return len(changes)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--user-id", required=True, help="Firebase uid whose notes to migrate")
    parser.add_argument("--dry-run", action="store_true", help="print counts and a sample, change nothing")
    parser.add_argument("--backup-file", help="where to write the backup (default ~/backups/...)")
    args = parser.parse_args()

    changes = plan_changes(args.user_id)
    print(summarize(changes))
    if args.dry_run:
        print("\nDry run: nothing was changed.")
        return
    if not changes:
        print("\nNothing to migrate.")
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = args.backup_file or f"~/backups/categories-{args.user_id[:8]}-{stamp}.json"
    path = backup_notes(changes, backup)
    print(f"\nBacked up {len(changes)} note(s) to {path}")
    applied = apply_changes(changes)
    print(f"Changed {applied} note(s) in {MONGO_DB_NAME}.")


if __name__ == "__main__":
    main()

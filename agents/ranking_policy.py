import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notepad import Note  # noqa: E402
from datetime import datetime, timezone, timedelta  # noqa: E402


def score(note: Note):
    score = note.useful_count - note.dismissed_count * 0.5
    return score


def is_on_cooldown(note: Note):
    if note.cooldown_until is None:
        return False
    cooldown = note.cooldown_until
    if cooldown.tzinfo is None:
        cooldown = cooldown.replace(tzinfo=timezone.utc)
    return cooldown > datetime.now(timezone.utc)


# what the phone (or a test) may send to /notes/{id}/feedback
FEEDBACK_ACTIONS = ("useful", "dismiss", "later", "annoying", "show less", "never show")


def apply_feedback(note: Note, content: str):
    if content not in FEEDBACK_ACTIONS:
        raise ValueError(f"unknown feedback action: {content!r}")
    if content == "useful":
        note.useful_count += 1
    elif content == "dismiss":
        note.dismissed_count += 1
    elif content == "never show":
        note.never_show = True
    elif content == "show less":
        note.cooldown_until = (
            datetime.now(timezone.utc) + timedelta(days=7)
        )
    elif content == "annoying":
        note.cooldown_until = (
            datetime.now(timezone.utc) + timedelta(days=7)
        )
    elif content == "later":
        note.cooldown_until = (
            datetime.now(timezone.utc) + timedelta(hours=24)
        )

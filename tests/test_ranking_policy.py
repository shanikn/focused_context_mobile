from datetime import datetime, timezone, timedelta

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notepad import Note  # noqa: E402

from agents.ranking_policy import (  # noqa: E402
    score, is_on_cooldown, apply_feedback
)


# score = useful_count - dismissed_count*0.5 + context_match + forgotten_boost
def test_useful_scores_higher_than_dismissed():
    note_1 = Note(content="Buy milk")
    note_1.useful_count = 3

    note_2 = Note(content="Walk the dog")
    note_2.dismissed_count = 3

    assert score(note_1) > score(note_2)


def test_note_on_cooldown():
    note = Note(
        content="Buy milk",
        cooldown_until=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    assert is_on_cooldown(note) is True


def test_note_not_on_cooldown():
    note = Note(content="Walk Libby")
    assert is_on_cooldown(note) is False


def test_apply_feedback_useful():
    note = Note(content="walk Libby")
    count = note.useful_count
    apply_feedback(note, "useful")
    assert note.useful_count == count + 1


def test_apply_feedback_dismiss():
    note = Note(content="walk Libby")
    count = note.dismissed_count
    apply_feedback(note, "dismiss")
    assert note.dismissed_count == count + 1


# is it more than 6 days from now?
def test_apply_feedback_show_less():
    note = Note(content="walk Libby")
    apply_feedback(note, "show less")
    assert note.cooldown_until is not None
    assert note.cooldown_until > datetime.now(timezone.utc) + timedelta(days=6)


def test_apply_feedback_never_show():
    note = Note(content="walk Libby")
    apply_feedback(note, "never show")
    assert note.never_show is True


def test_apply_feedback_annoying():
    note = Note(content="walk Libby")
    apply_feedback(note, "annoying")
    assert note.cooldown_until is not None
    assert note.cooldown_until > datetime.now(timezone.utc) + timedelta(days=6)


# is the cooldown more than 23 hours?
def test_feedback_later():
    note = Note(content="Walk Libby")
    apply_feedback(note, "later")
    assert note.cooldown_until is not None
    threshold = datetime.now(timezone.utc) + timedelta(hours=23)
    assert note.cooldown_until > threshold
